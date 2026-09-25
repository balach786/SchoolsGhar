import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { getOwnStudent, type AuthedUser } from './attendance.service';
import { ensureSubjectsInSession } from './academic.service';
import { getTenantModels } from './TenantModelRegistry';

export type { AuthedUser };

/**
 * Phase 5 (exams / marks / results) helpers:
 * exam context validation, role scoping, publish flow guards and the
 * backend-computed result engine (percentage, configurable grades,
 * ranking with ties). NO GPA anywhere by design.
 */

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function requireGradeScale(tenantDb: mongoose.Connection, id: string, tenantId?: string | mongoose.Types.ObjectId) {
  const { GradeScale } = getTenantModels(tenantDb);
  const query: Record<string, unknown> = { _id: id };
  if (tenantId) query.tenantId = tenantId;
  const scale = await GradeScale.findOne(query);
  if (!scale) throw ApiError.notFound('Grade scale not found');
  return scale;
}

export async function getDefaultGradeScale(tenantDb: mongoose.Connection, tenantId?: string | mongoose.Types.ObjectId): Promise<any> {
  const { GradeScale } = getTenantModels(tenantDb);
  const query: Record<string, unknown> = { isDefault: true };
  if (tenantId) query.tenantId = tenantId;
  let scale = await GradeScale.findOne(query);
  if (!scale) {
    scale = await GradeScale.findOne(tenantId ? { tenantId } : {});
  }
  if (!scale && tenantId) {
    // Safely bootstrap a standard 7-tier default grade scale for this tenant (P1)
    scale = await GradeScale.create({
      tenantId,
      name: 'Standard Grading (A+ to F)',
      isDefault: true,
      boundaries: [
        { grade: 'A+', minPercentage: 90 },
        { grade: 'A', minPercentage: 80 },
        { grade: 'B', minPercentage: 70 },
        { grade: 'C', minPercentage: 60 },
        { grade: 'D', minPercentage: 50 },
        { grade: 'E', minPercentage: 40 },
        { grade: 'F', minPercentage: 0 },
      ],
    });
  }
  if (!scale) throw ApiError.notFound('No default grade scale configured', 'GRADE_SCALE_NOT_FOUND');
  return scale;
}

/**
 * Validate the session → class → subjects chain for an exam.
 * Returns the resolved docs for the caller to reuse.
 */
export async function resolveExamContext(
  tenantDb: mongoose.Connection,
  sessionId: string,
  classId: string,
  subjectIds: string[],
  tenantId?: string | mongoose.Types.ObjectId
) {
  const { AcademicSession, Class } = getTenantModels(tenantDb);
  const qSession: Record<string, unknown> = { _id: sessionId };
  if (tenantId) qSession.tenantId = tenantId;
  const session = await AcademicSession.findOne(qSession);
  if (!session) throw ApiError.notFound('Academic session not found');
  if (session.isArchived) throw ApiError.badRequest('Academic session is archived', 'SESSION_ARCHIVED');
  if (!session.isActive) throw ApiError.badRequest('Exams can only be created for the active academic session', 'SESSION_INACTIVE');

  const qClass: Record<string, unknown> = { _id: classId };
  if (tenantId) qClass.tenantId = tenantId;
  const cls = await Class.findOne(qClass);
  if (!cls) throw ApiError.notFound('Class not found');
  if (cls.isArchived) throw ApiError.badRequest('Class is archived', 'CLASS_ARCHIVED');
  if (String(cls.sessionId) !== String(session._id)) {
    throw ApiError.badRequest('Class does not belong to the selected session', 'INVALID_CLASS_SESSION');
  }

  // Subjects must exist, belong to the session and be assigned to the class.
  await ensureSubjectsInSession(subjectIds, sessionId, classId, tenantDb);
  return { session, cls };
}

export async function assertExamVisible(tenantDb: mongoose.Connection, user: AuthedUser, exam: any): Promise<void> {
  if (user.role !== 'student') return;

  if (user.role === 'student') {
    const own = await getOwnStudent(user, tenantDb);
    const examClassIds = (exam.classIds && exam.classIds.length > 0)
      ? exam.classIds.map(String)
      : (exam.classId ? [String(exam.classId)] : []);
    
    if (!examClassIds.includes(String(own.classId)) || String(own.sessionId) !== String(exam.sessionId)) {
      throw ApiError.forbidden('You can only view your own class exams', 'EXAM_FORBIDDEN');
    }
    if (!exam.isPublished) {
      throw ApiError.forbidden('Results have not been published yet', 'RESULTS_NOT_PUBLISHED');
    }
    return;
  }

  throw ApiError.forbidden('You do not have permission to view this exam', 'EXAM_FORBIDDEN');
}

/** Whether the user may enter or change marks for an exam. */
export async function assertCanEnterMarks(tenantDb: mongoose.Connection, user: AuthedUser, exam: any): Promise<void> {
  await assertExamVisible(tenantDb, user, exam);
  if (exam.isArchived) throw ApiError.badRequest('Exam is archived', 'EXAM_ARCHIVED');

  // Marks lock once an exam is published. We let the controller handle bypass logic via a flag or throw here.
  // Actually, we'll just remove this check from the service and let the controller enforce the `exams: publish` check.
  // if (exam.isPublished && !user.isPlatformAdmin) {
  //   throw ApiError.conflict('Marks are locked after the exam is published', 'MARKS_LOCKED');
  // }
  if (user.role === 'student' || user.role === 'receptionist') {
    throw ApiError.forbidden('You do not have permission to enter marks', 'MARKS_FORBIDDEN');
  }
}

export interface SubjectRow {
  subjectId: string;
  maxMarks: number;
  passMarks: number | null;
  marksObtained: number | null; // null = absent (no mark recorded)
  status: 'pass' | 'fail' | 'absent';
}

export interface StudentResult {
  studentId: string;
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string | null;
  rank: number; // 1-based, ties share the same rank and the next rank skips
  rows: SubjectRow[];
}

/**
 * Compute results for every student of an exam's class.
 * Marks are aggregated in JS (class-sized data) — no pipeline casts needed.
 */
export async function computeExamResults(tenantDb: mongoose.Connection, exam: any): Promise<StudentResult[]> {
  const { Result, GradeScale, Student, Mark } = getTenantModels(tenantDb);
  if (exam.isPublished) {
    const publishedDocs = await Result.find({ examId: exam._id }).sort({ version: -1 }).lean();
    if (publishedDocs.length > 0) {
      const latestMap = new Map<string, any>();
      for (const doc of publishedDocs) {
        const sKey = String(doc.studentId);
        if (!latestMap.has(sKey)) {
          latestMap.set(sKey, doc);
        }
      }
      const results: StudentResult[] = Array.from(latestMap.values()).map((doc) => {
        const rows: SubjectRow[] = (doc.subjects || []).map((sub: any) => ({
          subjectId: String(sub.subjectId),
          maxMarks: sub.maximumMarks,
          passMarks: sub.passMarks ?? null,
          marksObtained: sub.marksObtained,
          status: sub.attendanceStatus === 'absent' ? 'absent' : (sub.passed ? 'pass' : 'fail'),
        }));
        return {
          studentId: String(doc.studentId),
          totalObtained: doc.totalObtained,
          totalMax: doc.totalMaximum,
          percentage: doc.percentage,
          grade: doc.overallGrade || 'F',
          rank: 0,
          rows,
        };
      });

      results.sort((a, b) => b.percentage - a.percentage || b.totalObtained - a.totalObtained);
      for (let i = 0; i < results.length; i++) {
        if (i > 0 && results[i].percentage === results[i - 1].percentage && results[i].totalObtained === results[i - 1].totalObtained) {
          results[i].rank = results[i - 1].rank;
        } else {
          results[i].rank = i + 1;
        }
      }
      return results;
    }
  }

  const scale = await GradeScale.findById(exam.gradeScaleId);
  if (!scale) throw ApiError.badRequest('The exam references a missing grade scale', 'GRADE_SCALE_NOT_FOUND');

  const examClassIds = (exam.classIds && exam.classIds.length > 0)
    ? exam.classIds
    : (exam.classId ? [exam.classId] : []);

  const students = await Student.find({ sessionId: exam.sessionId, classId: { $in: examClassIds }, isArchived: false })
    .select('_id')
    .lean();
  const marks = await Mark.find({ examId: exam._id }).lean();

  const byStudentSubject = new Map<string, { marks: number; isAbsent: boolean }>();
  for (const m of marks) {
    byStudentSubject.set(`${String(m.studentId)}|${String(m.subjectId)}`, {
      marks: m.marksObtained,
      isAbsent: Boolean(m.isAbsent),
    });
  }

  const { gradeForPercentage } = await import('../models/GradeScale');
  const results: StudentResult[] = students.map((s) => {
    let totalObtained = 0;
    let totalMax = 0;
    const rows: SubjectRow[] = exam.subjects.map((sub: any) => {
      const rec = byStudentSubject.get(`${String(s._id)}|${String(sub.subjectId)}`);
      const isRecorded = rec !== undefined;
      const isAbsent = !isRecorded || rec.isAbsent;
      if (isRecorded && !rec.isAbsent) {
        totalObtained += rec.marks;
        totalMax += sub.maxMarks;
      } else if (isAbsent) {
        totalMax += sub.maxMarks;
      }
      const passMarks = sub.passMarks ?? null;
      let status: 'pass' | 'fail' | 'absent' = 'absent';
      if (isRecorded && !rec.isAbsent) {
        status = passMarks !== null && rec.marks < passMarks ? 'fail' : 'pass';
      }

      return {
        subjectId: String(sub.subjectId),
        maxMarks: sub.maxMarks,
        passMarks,
        marksObtained: isRecorded && !rec.isAbsent ? rec.marks : null,
        status,
      };
    });

    const percentage = totalMax > 0 ? round2((totalObtained / totalMax) * 100) : 0;
    return {
      studentId: String(s._id),
      totalObtained,
      totalMax,
      percentage,
      grade: gradeForPercentage(scale.boundaries, percentage),
      rank: 0,
      rows,
    };
  });

  // Ranking with ties: equal percentage → same rank; next distinct rank skips.
  results.sort((a, b) => b.percentage - a.percentage || b.totalObtained - a.totalObtained);
  for (let i = 0; i < results.length; i++) {
    if (i > 0 && results[i].percentage === results[i - 1].percentage && results[i].totalObtained === results[i - 1].totalObtained) {
      results[i].rank = results[i - 1].rank;
    } else {
      results[i].rank = i + 1;
    }
  }
  return results;
}

/** Look up one student's result row by id (keeps the shared ranking). */
export function findResult(results: StudentResult[], studentId: string): StudentResult | undefined {
  return results.find((r) => r.studentId === String(studentId));
}
