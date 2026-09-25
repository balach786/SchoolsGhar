import { validateSnapshotConsistency } from '../utils/snapshotValidator';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { Exam, type IExam } from '../models/Exam';
import { ExamSchedule, type IExamSchedule } from '../models/ExamSchedule';
import { Mark, type IMark } from '../models/Mark';
import { ExamAttendance, type IExamAttendance } from '../models/ExamAttendance';
import { GradeScale, gradeForPercentage, type IGradeScale } from '../models/GradeScale';
import { Student, type IStudent } from '../models/Student';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { Subject } from '../models/Subject';
import { AcademicSession } from '../models/AcademicSession';
import { Result, type IResult, type ResultAttendanceStatus, type ISubjectResultSnapshot } from '../models/Result';
import { getTenantModels } from './TenantModelRegistry';

export const RESULT_CALCULATION_VERSION = 1;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CalculatedSubjectRow {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  examScheduleId?: string;
  maxMarks: number;
  passMarks: number | null;
  marksObtained: number | null; // null if absent or leave or pending
  attendanceStatus: 'present' | 'absent' | 'leave' | 'pending';
  isAbsent: boolean;
  passed: boolean;
  percentage: number;
}

export interface CalculatedStudentResult {
  studentId: string;
  totalObtained: number;
  totalMaximum: number;
  percentage: number;
  overallGrade: string | null;
  passed: boolean;
  failedSubjectCount: number;
  rank?: number; // Calculated dynamically for draft/cohort views; NOT persisted in snapshot
  rows: CalculatedSubjectRow[];
}

/**
 * Deterministic source checksum generator (Step 4C.7)
 * Hashes canonical sorted inputs that materially affect academic calculation.
 */
export function computeResultSourceChecksum(data: {
  calculationVersion: number;
  examId: string;
  studentId: string;
  sessionId: string;
  classId: string;
  gradeScaleBoundaries: { grade: string; minPercentage: number }[];
  subjects: {
    subjectId: string;
    maxMarks: number;
    passMarks: number | null;
    marksObtained: number | null;
    attendanceStatus: string;
  }[];
}): string {
  // Sort subjects stably by subjectId string
  const sortedSubjects = [...data.subjects].sort((a, b) => a.subjectId.localeCompare(b.subjectId));

  const canonicalPayload = {
    calculationVersion: data.calculationVersion,
    examId: data.examId,
    studentId: data.studentId,
    sessionId: data.sessionId,
    classId: data.classId,
    gradeScaleBoundaries: data.gradeScaleBoundaries.map((b) => ({
      grade: b.grade,
      minPercentage: b.minPercentage,
    })),
    subjects: sortedSubjects.map((s) => ({
      subjectId: s.subjectId,
      maxMarks: s.maxMarks,
      passMarks: s.passMarks,
      marksObtained: s.marksObtained,
      attendanceStatus: s.attendanceStatus,
    })),
  };

  // Deterministic JSON stringify helper that recursively sorts keys
  function deterministicStringify(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return `[${obj.map((item) => deterministicStringify(item)).join(',')}]`;
    }
    const keys = Object.keys(obj).sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${deterministicStringify(obj[k])}`);
    return `{${entries.join(',')}}`;
  }

  const serialized = deterministicStringify(canonicalPayload);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Reconcile Exam and ExamSchedule configurations (Correction 3)
 */
export async function reconcileExamConfigurations(
  tenantDb: mongoose.Connection,
  exam: any,
  tenantId: string | mongoose.Types.ObjectId,
  isPublicationPreflight?: boolean
): Promise<Map<string, any>> {
  const { ExamSchedule } = getTenantModels(tenantDb);
  const schedules = await ExamSchedule.find({
    tenantId,
    examId: exam._id,
  }).lean();

  const scheduleMap = new Map<string, IExamSchedule>();
  for (const s of schedules) {
    const key = `${String(s.classId)}|${String(s.subjectId)}`;
    scheduleMap.set(key, s as any);
  }

  // Determine all classes applicable to the exam
  const classIds = (exam.classIds && exam.classIds.length > 0)
    ? exam.classIds
    : [exam.classId];

  for (const cId of classIds) {
    for (const sub of exam.subjects) {
      const key = `${String(cId)}|${String(sub.subjectId)}`;
      const schedule = scheduleMap.get(key);

      if (!schedule) {
        if (isPublicationPreflight) {
          throw ApiError.badRequest(
            `Exam schedule missing for class ${cId} and subject ${sub.subjectId}`,
            'EXAM_CONFIGURATION_MISMATCH'
          );
        }
        continue;
      }

      if (schedule.totalMarks !== sub.maxMarks) {
        throw ApiError.badRequest(
          `Exam subject max marks (${sub.maxMarks}) contradicts schedule total marks (${schedule.totalMarks})`,
          'EXAM_CONFIGURATION_MISMATCH'
        );
      }

      if (sub.passMarks !== undefined && sub.passMarks !== null) {
        if (schedule.passingMarks !== sub.passMarks) {
          throw ApiError.badRequest(
            `Exam subject pass marks (${sub.passMarks}) contradicts schedule passing marks (${schedule.passingMarks})`,
            'EXAM_CONFIGURATION_MISMATCH'
          );
        }
      }
    }
  }

  return scheduleMap;
}

/**
 * Canonical Result Calculation Engine (Step 4C.1, Corrections 1-7)
 */
export async function computeCanonicalResults(
  tenantDb: mongoose.Connection,
  exam: any,
  options?: {
    isPublicationPreflight?: boolean;
    studentIds?: string[];
  }
): Promise<{
  results: CalculatedStudentResult[];
  scale: IGradeScale;
  studentMap: Map<string, any>;
  subjectMap: Map<string, any>;
  scheduleMap: Map<string, any>;
}> {
  const tenantId = exam.tenantId;
  const { GradeScale, Student, Subject, Mark, ExamAttendance } = getTenantModels(tenantDb);

  // 1. Resolve GradeScale
  const scale = await GradeScale.findOne({ _id: exam.gradeScaleId, tenantId }).lean();
  if (!scale || !scale.boundaries || scale.boundaries.length === 0) {
    throw ApiError.badRequest('The exam references a missing or invalid grade scale', 'GRADE_SCALE_NOT_FOUND');
  }

  // 2. Validate configuration consistency with ExamSchedule (Correction 3)
  const scheduleMap = await reconcileExamConfigurations(tenantDb, exam, tenantId, options?.isPublicationPreflight);

  // 3. Resolve applicable students
  const classIds = (exam.classIds && exam.classIds.length > 0)
    ? exam.classIds
    : [exam.classId];

  const studentQuery: Record<string, any> = {
    tenantId,
    sessionId: exam.sessionId,
    classId: { $in: classIds },
    isArchived: false,
  };

  if (options?.studentIds && options.studentIds.length > 0) {
    studentQuery._id = { $in: options.studentIds };
  }

  const students = await Student.find(studentQuery).lean();
  if (students.length === 0 && options?.isPublicationPreflight) {
    throw ApiError.badRequest('No active students found for this exam', 'INVALID_STUDENT_CLASS');
  }

  const studentMap = new Map(students.map((s) => [String(s._id), s]));

  // 4. Fetch all subjects
  const subjectIds = exam.subjects.map((s: any) => s.subjectId);
  const subjects = await Subject.find({ _id: { $in: subjectIds }, tenantId }).select('name code').lean();
  const subjectMap = new Map(subjects.map((s) => [String(s._id), s]));

  // 5. Fetch Marks and ExamAttendance
  const marks = await Mark.find({ tenantId, examId: exam._id }).lean();
  const attendances = await ExamAttendance.find({ tenantId, examId: exam._id }).lean();

  const markMap = new Map<string, IMark>();
  for (const m of marks) {
    markMap.set(`${String(m.studentId)}|${String(m.subjectId)}`, m as any);
  }

  const attendanceMap = new Map<string, IExamAttendance>();
  for (const a of attendances) {
    attendanceMap.set(`${String(a.studentId)}|${String(a.examScheduleId)}`, a as any);
  }

  // 6. Compute per-student results
  const results: CalculatedStudentResult[] = [];

  for (const student of students) {
    const sId = String(student._id);
    let totalObtained = 0;
    let totalMaximum = 0;
    let failedCount = 0;
    let studentHasIncomplete = false;

    const rows: CalculatedSubjectRow[] = [];

    for (const sub of exam.subjects) {
      const subId = String(sub.subjectId);
      const subDoc = subjectMap.get(subId);
      const scheduleKey = `${String(student.classId)}|${subId}`;
      const schedule = scheduleMap.get(scheduleKey);
      const schedId = schedule ? String(schedule._id) : undefined;

      const m = markMap.get(`${sId}|${subId}`);
      const a = schedId ? attendanceMap.get(`${sId}|${schedId}`) : undefined;

      const maxMarks = sub.maxMarks;
      const passMarks = sub.passMarks ?? null;
      totalMaximum += maxMarks;

      let marksObtained: number | null = null;
      let attendanceStatus: 'present' | 'absent' | 'leave' | 'pending' = 'pending';
      let isAbsent = false;
      let passed = false;

      // ── ATTENDANCE CONFLICT & RESOLUTION POLICY (Correction 4) ──
      const attStatus = a?.status;
      const markAbsent = m?.isAbsent;
      const markScore = m?.marksObtained;

      if (!m && !a) {
        // Missing / Pending
        if (options?.isPublicationPreflight) {
          throw ApiError.badRequest(
            `Mark not entered for student ${student.admissionNumber || sId} in subject ${subDoc?.name || subId}`,
            'MARK_NOT_ENTERED'
          );
        }
        attendanceStatus = 'pending';
      } else if (attStatus === 'absent' && m && !markAbsent && (markScore ?? 0) > 0) {
        // Contradiction: ExamAttendance says absent, but Mark has positive score and is not absent
        throw ApiError.badRequest(
          `Contradictory records for student ${student.admissionNumber || sId} in subject ${subDoc?.name || subId}: marked absent in attendance but scored ${markScore} marks`,
          'MARK_ATTENDANCE_CONFLICT'
        );
      } else if (attStatus === 'present' && markAbsent) {
        // Contradiction: ExamAttendance says present, but Mark says absent
        throw ApiError.badRequest(
          `Contradictory records for student ${student.admissionNumber || sId} in subject ${subDoc?.name || subId}: attendance is present but mark record is marked absent`,
          'MARK_ATTENDANCE_CONFLICT'
        );
      } else if (attStatus === 'leave' || (!attStatus && markAbsent && m?.marksObtained === null)) {
        // Leave
        attendanceStatus = 'leave';
        isAbsent = true;
        marksObtained = null;
        passed = false;
        failedCount++;
      } else if (attStatus === 'absent' || markAbsent) {
        // Explicit Absent
        attendanceStatus = 'absent';
        isAbsent = true;
        marksObtained = null;
        passed = false;
        failedCount++;
      } else if (m && !markAbsent) {
        // Present + Marks (including valid 0 marks)
        if (m.marksObtained > maxMarks) {
          throw ApiError.badRequest(
            `Marks obtained (${m.marksObtained}) exceeds maximum marks (${maxMarks}) for student ${student.admissionNumber || sId}`,
            'MARKS_EXCEED_MAX'
          );
        }
        attendanceStatus = 'present';
        marksObtained = m.marksObtained;
        totalObtained += m.marksObtained;
        passed = passMarks !== null ? m.marksObtained >= passMarks : true;
        if (!passed) failedCount++;
      } else if (a && !m) {
        if (options?.isPublicationPreflight) {
          throw ApiError.badRequest(
            `Attendance recorded but mark not entered for student ${student.admissionNumber || sId} in subject ${subDoc?.name || subId}`,
            'MARK_NOT_ENTERED'
          );
        }
        attendanceStatus = 'pending';
      }

      const subjectPercentage = maxMarks > 0 && marksObtained !== null
        ? round2((marksObtained / maxMarks) * 100)
        : 0;

      rows.push({
        subjectId: subId,
        subjectName: subDoc?.name ?? '—',
        subjectCode: subDoc?.code ?? '—',
        examScheduleId: schedId,
        maxMarks,
        passMarks,
        marksObtained,
        attendanceStatus,
        isAbsent,
        passed,
        percentage: subjectPercentage,
      });
    }

    const percentage = totalMaximum > 0 ? round2((totalObtained / totalMaximum) * 100) : 0;
    const overallGrade = gradeForPercentage(scale.boundaries, percentage);
    const overallPassed = failedCount === 0 && rows.every((r) => r.attendanceStatus === 'present' && r.passed);

    results.push({
      studentId: sId,
      totalObtained,
      totalMaximum,
      percentage,
      overallGrade,
      passed: overallPassed,
      failedSubjectCount: failedCount,
      rows,
    });
  }

  // 7. Dynamic Ranking with ties (for draft / reporting only; NOT persisted in snapshot)
  results.sort((a, b) => b.percentage - a.percentage || b.totalObtained - a.totalObtained);
  for (let i = 0; i < results.length; i++) {
    if (i > 0 && results[i].percentage === results[i - 1].percentage && results[i].totalObtained === results[i - 1].totalObtained) {
      results[i].rank = results[i - 1].rank;
    } else {
      results[i].rank = i + 1;
    }
  }

  return {
    results,
    scale: scale as any,
    studentMap,
    subjectMap,
    scheduleMap,
  };
}

/**
 * Publish / Snapshot Execution Service (Step 4C.8, 4C.9)
 */
export class ResultPublicationService {
  /**
   * Initial Publication of full Exam cohort (Correction 8, Step 4C.8)
   */
  static async publishExamResults(tenantDb: mongoose.Connection, 
    examId: string,
    publishedBy: string | mongoose.Types.ObjectId,
    tenantId: string | mongoose.Types.ObjectId
  ): Promise<{ publishedCount: number; version: number }> {
    const { Exam, Class, Section, AcademicSession, Result } = getTenantModels(tenantDb);
    const exam = await Exam.findOne({ _id: examId, tenantId });
    if (!exam) throw ApiError.notFound('Exam not found');
    if (exam.isArchived) throw ApiError.badRequest('Archived exams cannot be published', 'EXAM_ARCHIVED');
    if (exam.isPublished || exam.status === 'Published') {
      throw ApiError.conflict('Exam results are already published. Use re-publish workflow for corrections.', 'EXAM_ALREADY_PUBLISHED');
    }

    // Run full cohort preflight
    const { results, scale, studentMap, scheduleMap } = await computeCanonicalResults(tenantDb, exam, {
      isPublicationPreflight: true,
    });

    const [classes, sections, session] = await Promise.all([
      Class.find({ tenantId }).select('name').lean(),
      Section.find({ tenantId }).select('name').lean(),
      AcademicSession.findOne({ _id: exam.sessionId, tenantId }).select('name').lean(),
    ]);

    const classMap = new Map(classes.map((c) => [String(c._id), c.name]));
    const sectionMap = new Map(sections.map((s) => [String(s._id), s.name]));
    const sessionName = session?.name ?? 'Academic Session';

    const now = new Date();
    const snapshotsToInsert: any[] = [];

    for (const r of results) {
      const student = studentMap.get(r.studentId);
      const studentSnapshot = {
        fullName: student.fullName,
        fatherName: student.fatherName,
        guardianName: student.guardianName,
        gender: student.gender,
        caste: student.caste,
        admissionNumber: student.admissionNumber,
        rollNumber: student.rollNumber,
        className: classMap.get(String(student.classId)) ?? '—',
        sectionName: student.sectionId ? sectionMap.get(String(student.sectionId)) : undefined,
        sessionName,
      };

      const examSnapshot = {
          examName: exam.name,
          examDate: exam.examDate ? new Date(exam.examDate).toISOString() : null,
          gradeScaleName: scale.name,
        gradeScaleBoundaries: scale.boundaries.map((b) => ({
          grade: b.grade,
          minPercentage: b.minPercentage,
        })),
      };

      const subjectSnapshots: ISubjectResultSnapshot[] = r.rows.map((row) => ({
        subjectId: new mongoose.Types.ObjectId(row.subjectId),
        subjectName: row.subjectName,
        subjectCode: row.subjectCode,
        examScheduleId: row.examScheduleId ? new mongoose.Types.ObjectId(row.examScheduleId) : undefined,
        marksObtained: row.marksObtained,
        maximumMarks: row.maxMarks,
        passMarks: row.passMarks,
        attendanceStatus: row.attendanceStatus as ResultAttendanceStatus,
        passed: row.passed,
        percentage: row.percentage,
      }));

      const sourceChecksum = computeResultSourceChecksum({
        calculationVersion: RESULT_CALCULATION_VERSION,
        examId: String(exam._id),
        studentId: r.studentId,
        sessionId: String(exam.sessionId),
        classId: String(student.classId),
        gradeScaleBoundaries: scale.boundaries,
        subjects: r.rows.map((row) => ({
          subjectId: row.subjectId,
          maxMarks: row.maxMarks,
          passMarks: row.passMarks,
          marksObtained: row.marksObtained,
          attendanceStatus: row.attendanceStatus,
        })),
      });

      snapshotsToInsert.push({
        tenantId,
        examId: exam._id,
        studentId: new mongoose.Types.ObjectId(r.studentId),
        sessionId: exam.sessionId,
        classId: student.classId,
        sectionId: student.sectionId,
        version: 1, // Initial publication is always Version 1
        studentSnapshot,
        examSnapshot,
        subjects: subjectSnapshots,
        totalObtained: r.totalObtained,
        totalMaximum: r.totalMaximum,
        percentage: r.percentage,
        overallGrade: r.overallGrade,
        passed: r.passed,
        failedSubjectCount: r.failedSubjectCount,
        sourceChecksum,
        calculationVersion: RESULT_CALCULATION_VERSION,
        publishedAt: now,
        publishedBy: new mongoose.Types.ObjectId(publishedBy),
      });
    }

    // Atomic transaction execution (Correction 2: Concurrency & Transaction Safe)
    const dbSession = await mongoose.startSession();
    try {
      dbSession.startTransaction();

      // Ensure no existing results exist for Version 1
      const existingCount = await Result.countDocuments({
        tenantId,
        examId: exam._id,
      }).session(dbSession);

      if (existingCount > 0) {
        throw ApiError.conflict(
          'Exam results have already been published. Use re-publish to apply corrections.',
          'ALREADY_PUBLISHED'
        );
      }

      await Result.insertMany(snapshotsToInsert, { session: dbSession });

      // Mark exam as published
      exam.isPublished = true;
      exam.status = 'Published';
      await exam.save({ session: dbSession });

      await dbSession.commitTransaction();
      return { publishedCount: snapshotsToInsert.length, version: 1 };
    } catch (err) {
      await dbSession.abortTransaction();
      throw err;
    } finally {
      await dbSession.endSession();
    }
  }

  /**
   * Authorized Re-Publication of a single student (Correction 2, 8, Step 4C.9)
   * Creates Version N+1 without mutating Version N.
   */
  static async republishStudentResult(tenantDb: mongoose.Connection, 
    examId: string,
    studentId: string,
    publishedBy: string | mongoose.Types.ObjectId,
    tenantId: string | mongoose.Types.ObjectId
  ): Promise<{ version: number; sourceChecksum: string }> {
    const { Exam, Class, Section, AcademicSession, Result } = getTenantModels(tenantDb);
    const exam = await Exam.findOne({ _id: examId, tenantId });
    if (!exam) throw ApiError.notFound('Exam not found');
    if (!exam.isPublished) {
      throw ApiError.badRequest('Exam must be officially published before re-publishing individual student corrections', 'EXAM_NOT_PUBLISHED');
    }

    // Preflight calculation for target student
    const { results, scale, studentMap } = await computeCanonicalResults(tenantDb, exam, {
      isPublicationPreflight: true,
      studentIds: [studentId],
    });

    const r = results[0];
    if (!r) throw ApiError.notFound('Student not found in exam class');

    const [classes, sections, session] = await Promise.all([
      Class.find({ tenantId }).select('name').lean(),
      Section.find({ tenantId }).select('name').lean(),
      AcademicSession.findOne({ _id: exam.sessionId, tenantId }).select('name').lean(),
    ]);

    const classMap = new Map(classes.map((c) => [String(c._id), c.name]));
    const sectionMap = new Map(sections.map((s) => [String(s._id), s.name]));
    const sessionName = session?.name ?? 'Academic Session';

    const student = studentMap.get(r.studentId);
    const newChecksum = computeResultSourceChecksum({
      calculationVersion: RESULT_CALCULATION_VERSION,
      examId: String(exam._id),
      studentId: r.studentId,
      sessionId: String(exam.sessionId),
      classId: String(student.classId),
      gradeScaleBoundaries: scale.boundaries,
      subjects: r.rows.map((row) => ({
        subjectId: row.subjectId,
        maxMarks: row.maxMarks,
        passMarks: row.passMarks,
        marksObtained: row.marksObtained,
        attendanceStatus: row.attendanceStatus,
      })),
    });

    // Concurrency retry loop (Correction 2)
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // Load entire latest cohort to ensure global config consistency
        const publishedDocs = await Result.find({ tenantId, examId: exam._id }).sort({ version: -1 }).lean();
        const latestMap = new Map<string, any>();
        for (const doc of publishedDocs) {
          const sKey = String(doc.studentId);
          if (!latestMap.has(sKey)) {
            latestMap.set(sKey, doc);
          }
        }
        const cohort = Array.from(latestMap.values());
        
        // Ensure the cohort is not already mixed before we republish
        validateSnapshotConsistency(cohort);
        const canonicalConfigDoc = cohort[0]; // Guaranteed safe by validator
        
        const latest = latestMap.get(String(studentId));
        if (!latest) {
          throw ApiError.badRequest('No prior published result exists for this student. Initial publish required.', 'NO_PRIOR_RESULT');
        }

      if (latest.sourceChecksum === newChecksum) {
        throw ApiError.conflict('No academic changes detected. Current marks match latest published result.', 'SOURCE_UNCHANGED');
      }

      const nextVersion = latest.version + 1;

      const studentSnapshot = {
        fullName: student.fullName,
        fatherName: student.fatherName,
        guardianName: student.guardianName,
        gender: student.gender,
        caste: student.caste,
        admissionNumber: student.admissionNumber,
        rollNumber: student.rollNumber,
        className: classMap.get(String(student.classId)) ?? '—',
        sectionName: student.sectionId ? sectionMap.get(String(student.sectionId)) : undefined,
        sessionName,
      };

      const examSnapshot = canonicalConfigDoc.examSnapshot;

      const subjectSnapshots: ISubjectResultSnapshot[] = r.rows.map((row) => {
        const historicalSubject = canonicalConfigDoc.subjects.find((s: any) => String(s.subjectId) === String(row.subjectId));
        return {
          subjectId: new mongoose.Types.ObjectId(row.subjectId),
          subjectName: historicalSubject ? historicalSubject.subjectName : row.subjectName,
          subjectCode: historicalSubject ? historicalSubject.subjectCode : row.subjectCode,
          examScheduleId: row.examScheduleId ? new mongoose.Types.ObjectId(row.examScheduleId) : undefined,
          marksObtained: row.marksObtained,
          maximumMarks: historicalSubject ? historicalSubject.maximumMarks : row.maxMarks,
          passMarks: historicalSubject ? historicalSubject.passMarks : row.passMarks,
          attendanceStatus: row.attendanceStatus as ResultAttendanceStatus,
          passed: row.passed,
          percentage: row.percentage,
        };
      });

      const newSnapshot = new Result({
        tenantId,
        examId: exam._id,
        studentId: new mongoose.Types.ObjectId(r.studentId),
        sessionId: exam.sessionId,
        classId: student.classId,
        sectionId: student.sectionId,
        version: nextVersion,
        studentSnapshot,
        examSnapshot,
        subjects: subjectSnapshots,
        totalObtained: r.totalObtained,
        totalMaximum: r.totalMaximum,
        percentage: r.percentage,
        overallGrade: r.overallGrade,
        passed: r.passed,
        failedSubjectCount: r.failedSubjectCount,
        sourceChecksum: newChecksum,
        calculationVersion: RESULT_CALCULATION_VERSION,
        publishedAt: new Date(),
        publishedBy: new mongoose.Types.ObjectId(publishedBy),
      });

      try {
        await newSnapshot.save();
        return { version: nextVersion, sourceChecksum: newChecksum };
      } catch (err: any) {
        if (err.code === 11000 && attempt < MAX_RETRIES - 1) {
          // Version collision due to concurrent publish, retry
          continue;
        }
        throw err;
      }
    }

    throw ApiError.conflict('Concurrent publication collision. Please retry.', 'CONCURRENT_PUBLICATION_RACE');
  }
}