import { Response } from 'express';
import { AuthRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok } from '../utils/apiResponse';
import { getTenantModels } from '../services/TenantModelRegistry';
import mongoose from 'mongoose';
import { publicGradeScale } from '../models/GradeScale';
import { computeExamResults, findResult, type AuthedUser } from '../services/exam.service';
import { getOwnStudent } from '../services/attendance.service';
import { scopeQuery } from '../utils/tenantScope';

export type ReqUser = AuthedUser;

/** Load an exam and enforce the publish flow for result viewing. */
async function loadExamForResults(req: AuthRequest, tenantDb: mongoose.Connection, user: ReqUser, examId: string) {
  const { Exam } = getTenantModels(tenantDb);
  const exam = await Exam.findOne(scopeQuery(req, { _id: examId }));
  if (!exam) throw ApiError.notFound('Exam not found');

  // Students: own class only + published only.
  if (user.role === 'student') {
    const own = await getOwnStudent(user, tenantDb);
    const examClassIds = (exam.classIds && exam.classIds.length > 0)
      ? exam.classIds.map(String)
      : (exam.classId ? [String(exam.classId)] : []);

    if (!examClassIds.includes(String(own.classId)) || String(own.sessionId) !== String(exam.sessionId)) {
      throw ApiError.forbidden('You can only view your own results', 'RESULTS_FORBIDDEN');
    }
    if (!exam.isPublished) {
      throw ApiError.forbidden('Results have not been published yet', 'RESULTS_NOT_PUBLISHED');
    }
    return exam;
  }

  // Route-level permission middleware already authorized staff.
  return exam;
}

/** GET /api/results/exam-summary?examId= — class-wide result table with ranks. */
export const examSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Student, Subject, GradeScale, ExamRollNumber } = getTenantModels(tenantDb);
  const user = req.user as unknown as ReqUser;
  const examId = String(req.query.examId || '');
  if (!examId) throw ApiError.badRequest('examId is required', 'EXAM_REQUIRED');

  const exam = await loadExamForResults(req, tenantDb, user, examId);
  const results = await computeExamResults(tenantDb, exam);

  const [students, subjects, scale, rollNumbers] = await Promise.all([
    Student.find(scopeQuery(req, { _id: { $in: results.map((r) => r.studentId) } }))
      .select('admissionNumber rollNumber fullName fatherName guardianName gender caste sectionId')
      .lean(),
    Subject.find(scopeQuery(req, { _id: { $in: exam.subjects.map((s) => s.subjectId) } })).select('name code').lean(),
    GradeScale.findOne(scopeQuery(req, { _id: exam.gradeScaleId })).lean(),
    ExamRollNumber.find(scopeQuery(req, { examId })).lean()
  ]);

  const studentMap = new Map(students.map((s) => [String(s._id), s]));
  const subjectMap = new Map(subjects.map((s) => [String(s._id), s]));
  const rollMap = new Map(rollNumbers.map((r) => [String(r.studentId), r.examRollNumber]));

  ok(res, {
    exam: {
      _id: String(exam._id),
      name: exam.name,
      isPublished: exam.isPublished,
      examDate: exam.examDate ? new Date(exam.examDate).toISOString() : null,
    },
    gradeScale: scale ? publicGradeScale(scale as never) : null,
    classStrength: results.length,
    subjects: exam.subjects.map((s) => ({
      subjectId: String(s.subjectId),
      name: subjectMap.get(String(s.subjectId))?.name ?? '—',
      code: subjectMap.get(String(s.subjectId))?.code ?? '—',
      maxMarks: s.maxMarks,
      passMarks: s.passMarks ?? null,
    })),
    // Ranked list — ties share the same rank.
    students: [...results]
      .sort((a, b) => a.rank - b.rank)
      .map((r) => {
        const s = studentMap.get(r.studentId);
        return {
          studentId: r.studentId,
          admissionNumber: s?.admissionNumber ?? '—',
          rollNumber: s?.rollNumber ?? '—',
          examRollNumber: rollMap.get(r.studentId) ?? null,
          fullName: s?.fullName ?? '—',
          fatherName: s?.fatherName ?? null,
          guardianName: s?.guardianName ?? null,
          gender: s?.gender ?? null,
          caste: s?.caste ?? null,
          sectionId: s ? String(s.sectionId) : null,
          totalObtained: r.totalObtained,
          totalMax: r.totalMax,
          percentage: r.percentage,
          grade: r.grade,
          rank: r.rank,
        };
      }),
  });
});

/** GET /api/results/student?examId=&studentId= — printable result card data. */
export const studentResult = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Result, ExamRollNumber, Student, Class, Section, AcademicSession, Subject, GradeScale } = getTenantModels(tenantDb);
  const user = req.user as unknown as ReqUser;
  const examId = String(req.query.examId || '');
  const studentId = String(req.query.studentId || '');
  if (!examId) throw ApiError.badRequest('examId is required', 'EXAM_REQUIRED');
  if (!studentId) throw ApiError.badRequest('studentId is required', 'STUDENT_REQUIRED');

  const exam = await loadExamForResults(req, tenantDb, user, examId);

  if (user.role === 'student') {
    const own = await getOwnStudent(user, tenantDb);
    if (String(own._id) !== String(studentId)) {
      throw ApiError.forbidden('You can only view your own result card', 'RESULTS_FORBIDDEN');
    }
  }

  // If exam is published, serve from immutable Result snapshot (Step 4C.15)
  if (exam.isPublished) {
    const latestSnapshot = await Result.findOne(scopeQuery(req, {
      examId: exam._id,
      studentId,
    }))
      .sort({ version: -1 })
      .lean();

    if (latestSnapshot) {
      const rollNumberDoc = await ExamRollNumber.findOne(scopeQuery(req, { examId, studentId })).lean();

      return ok(res, {
        isDraft: false,
        version: latestSnapshot.version,
        publishedAt: latestSnapshot.publishedAt,
        sourceChecksum: latestSnapshot.sourceChecksum,
        exam: {
          _id: String(exam._id),
          name: latestSnapshot.examSnapshot.examName,
          examDate: exam.examDate ? new Date(exam.examDate).toISOString() : null,
          isPublished: true,
        },
        student: {
          _id: String(latestSnapshot.studentId),
          admissionNumber: latestSnapshot.studentSnapshot.admissionNumber,
          rollNumber: latestSnapshot.studentSnapshot.rollNumber,
          examRollNumber: rollNumberDoc?.examRollNumber ?? null,
          fullName: latestSnapshot.studentSnapshot.fullName,
          fatherName: latestSnapshot.studentSnapshot.fatherName ?? null,
          guardianName: latestSnapshot.studentSnapshot.guardianName ?? null,
          gender: latestSnapshot.studentSnapshot.gender ?? null,
          caste: latestSnapshot.studentSnapshot.caste ?? null,
          classId: String(latestSnapshot.classId),
          className: latestSnapshot.studentSnapshot.className,
          sectionName: latestSnapshot.studentSnapshot.sectionName ?? '—',
          sessionName: latestSnapshot.studentSnapshot.sessionName,
        },
        gradeScale: {
          name: latestSnapshot.examSnapshot.gradeScaleName,
          boundaries: latestSnapshot.examSnapshot.gradeScaleBoundaries,
        },
        subjects: latestSnapshot.subjects.map((s: any) => ({
          subjectId: String(s.subjectId),
          name: s.subjectName,
          code: s.subjectCode,
          maxMarks: s.maximumMarks,
          passMarks: s.passMarks,
          marksObtained: s.marksObtained,
          status: s.attendanceStatus === 'present' ? (s.passed ? 'pass' : 'fail') : s.attendanceStatus,
        })),
        total: { obtained: latestSnapshot.totalObtained, max: latestSnapshot.totalMaximum },
        percentage: latestSnapshot.percentage,
        grade: latestSnapshot.overallGrade,
        passed: latestSnapshot.passed,
        failedSubjectCount: latestSnapshot.failedSubjectCount,
      });
    }
  }

  const results = await computeExamResults(tenantDb, exam);
  const row = findResult(results, studentId);
  if (!row) throw ApiError.notFound('No result found for this student in this exam');

  const student = await Student.findOne(scopeQuery(req, { _id: studentId })).select('admissionNumber rollNumber fullName fatherName guardianName gender caste classId sectionId sessionId').lean();
  if (!student) throw ApiError.notFound('Student not found');

  const [cls, section, session, subjects, scale, rollNumberDoc] = await Promise.all([
    Class.findOne(scopeQuery(req, { _id: student.classId })).select('name').lean(),
    Section.findOne(scopeQuery(req, { _id: student.sectionId })).select('name').lean(),
    AcademicSession.findOne(scopeQuery(req, { _id: exam.sessionId })).select('name').lean(),
    Subject.find(scopeQuery(req, { _id: { $in: exam.subjects.map((s) => s.subjectId) } })).select('name code').lean(),
    GradeScale.findOne(scopeQuery(req, { _id: exam.gradeScaleId })).lean(),
    ExamRollNumber.findOne(scopeQuery(req, { examId, studentId })).lean()
  ]);

  const subjectMap = new Map(subjects.map((s) => [String(s._id), s]));

  ok(res, {
    isDraft: true,
    exam: {
      _id: String(exam._id),
      name: exam.name,
      examDate: exam.examDate ? new Date(exam.examDate).toISOString() : null,
      isPublished: exam.isPublished,
    },
    student: {
      _id: String(student._id),
      admissionNumber: student.admissionNumber,
      rollNumber: student.rollNumber,
      examRollNumber: rollNumberDoc?.examRollNumber ?? null,
      fullName: student.fullName,
      fatherName: student.fatherName ?? null,
      guardianName: student.guardianName ?? null,
      gender: student.gender ?? null,
      caste: student.caste ?? null,
      classId: String(student.classId),
      className: cls?.name ?? '—',
      sectionName: section?.name ?? '—',
      sessionName: session?.name ?? '—',
    },
    gradeScale: scale ? publicGradeScale(scale as never) : null,
    subjects: row.rows.map((r) => ({
      subjectId: r.subjectId,
      name: subjectMap.get(r.subjectId)?.name ?? '—',
      code: subjectMap.get(r.subjectId)?.code ?? '—',
      maxMarks: r.maxMarks,
      passMarks: r.passMarks,
      marksObtained: r.marksObtained,
      status: r.status,
    })),
    total: { obtained: row.totalObtained, max: row.totalMax },
    percentage: row.percentage,
    grade: row.grade,
    rank: row.rank,
    classStrength: results.length,
  });
});

/** GET /api/results/print — same card data, marked for the print view. */
export const printResult = studentResult;
