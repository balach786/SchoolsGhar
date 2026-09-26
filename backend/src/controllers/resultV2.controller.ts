import { validateSnapshotConsistency } from '../utils/snapshotValidator';
import { Response } from 'express';
import { AuthRequest } from '../types';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, created } from '../utils/apiResponse';
import { Exam } from '../models/Exam';
import { Student } from '../models/Student';
import { Result, publicResult } from '../models/Result';
import {
  computeCanonicalResults,
  ResultPublicationService,
} from '../services/resultCalculation.service';
import { getOwnStudent, type AuthedUser } from '../services/attendance.service';
import { recordAudit } from '../services/audit.service';
import { scopeQuery, requireTenantId, getTenantObjectId } from '../utils/tenantScope';

/**
 * Ensure user has permission to access an exam's results.
 */
async function loadExamForResults(req: AuthRequest, user: AuthedUser, examId: string) {
  const exam = await Exam.findOne(scopeQuery(req, { _id: examId }));
  if (!exam) throw ApiError.notFound('Exam not found');

  // Students: own class only + published only
  if (user.role === 'student') {
    const own = await getOwnStudent(user, req.tenantDb as mongoose.Connection);
    const examClassIds = (exam.classIds && exam.classIds.length > 0)
      ? exam.classIds.map(String)
      : [String(exam.classId)];

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

/**
 * GET /api/results/draft?examId=&classId=
 * Dynamic draft calculation — never persisted (Step 4C.2)
 */
export const getDraftResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const user = req.user as unknown as AuthedUser;
  const examId = String(req.query.examId || '');
  if (!examId) throw ApiError.badRequest('examId is required', 'EXAM_REQUIRED');

  const exam = await loadExamForResults(req, user, examId);
  const { results, scale, studentMap, subjectMap } = await computeCanonicalResults(tenantDb, exam, {
    isPublicationPreflight: false,
  });

  ok(res, {
    isDraft: true,
    exam: {
      _id: String(exam._id),
      name: exam.name,
      isPublished: exam.isPublished,
    },
    gradeScale: {
      name: scale.name,
      boundaries: scale.boundaries,
    },
    classStrength: results.length,
    students: results.map((r) => {
      const s = studentMap.get(r.studentId);
      return {
        studentId: r.studentId,
        admissionNumber: s?.admissionNumber ?? '—',
        rollNumber: s?.rollNumber ?? '—',
        fullName: s?.fullName ?? '—',
        totalObtained: r.totalObtained,
        totalMaximum: r.totalMaximum,
        percentage: r.percentage,
        overallGrade: r.overallGrade,
        passed: r.passed,
        failedSubjectCount: r.failedSubjectCount,
        rank: r.rank,
        subjects: r.rows.map((row) => ({
          subjectId: row.subjectId,
          subjectName: row.subjectName,
          subjectCode: row.subjectCode,
          marksObtained: row.marksObtained,
          maximumMarks: row.maxMarks,
          passMarks: row.passMarks,
          attendanceStatus: row.attendanceStatus,
          passed: row.passed,
          percentage: row.percentage,
        })),
      };
    }),
  });
});

/**
 * GET /api/results/:examId/students/:studentId/history
 * Complete historical versions of a student's published results
 */
export const getStudentResultHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user as unknown as AuthedUser;
  const { examId, studentId } = req.params;
  const tenantId = getTenantObjectId(req);

  if (user.role === 'student') {
    const own = await getOwnStudent(user, req.tenantDb as mongoose.Connection);
    if (String(own._id) !== String(studentId)) {
      throw ApiError.forbidden('You can only view your own result history', 'RESULTS_FORBIDDEN');
    }
  }

  const history = await Result.find({
    tenantId,
    examId,
    studentId,
  })
    .sort({ version: -1 })
    .lean();

  ok(res, {
    examId,
    studentId,
    totalVersions: history.length,
    versions: history.map((h) => publicResult(h as never)),
  });
});

/**
 * POST /api/results/publish
 * Initial official publication of the full applicable exam cohort (Step 4C.8)
 */
export const publishExam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { examId } = req.body;
  if (!examId) throw ApiError.badRequest('examId is required', 'EXAM_REQUIRED');
  const tenantId = requireTenantId(req);
  const userId = (req.user as any)?._id;

  const outcome = await ResultPublicationService.publishExamResults(tenantDb, examId, userId, tenantId);

  recordAudit('exams', 'EXAM_PUBLISHED', req.user as any, String(examId), {
    publishedCount: outcome.publishedCount,
    version: outcome.version,
  });

  created(res, {
    success: true,
    message: `Exam results successfully published for ${outcome.publishedCount} students (Version 1).`,
    ...outcome,
  });
});

/**
 * POST /api/results/republish
 * Authorized correction re-publish creating Version N+1 (Step 4C.9)
 */
export const republishStudentResult = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { examId, studentId } = req.body;
  if (!examId) throw ApiError.badRequest('examId is required', 'EXAM_REQUIRED');
  if (!studentId) throw ApiError.badRequest('studentId is required', 'STUDENT_REQUIRED');
  const tenantId = requireTenantId(req);
  const userId = (req.user as any)?._id;

  const outcome = await ResultPublicationService.republishStudentResult(tenantDb, 
    examId,
    studentId,
    userId,
    tenantId
  );

  recordAudit('results', 'RESULT_REPUBLISHED', req.user as any, String(studentId), {
    examId,
    newVersion: outcome.version,
    sourceChecksum: outcome.sourceChecksum,
  });

  ok(res, {
    success: true,
    message: `Student result successfully re-published as Version ${outcome.version}.`,
    ...outcome,
  });
});

function buildCohortResults(publishedDocs: any[]) {
  const latestMap = new Map<string, any>();
  for (const doc of publishedDocs) {
    const sKey = String(doc.studentId);
    if (!latestMap.has(sKey)) {
      latestMap.set(sKey, doc);
    }
  }
  const results = Array.from(latestMap.values());
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

function formatResultCard(doc: any, classStrength: number) {
  return {
    exam: {
      _id: String(doc.examId),
      name: doc.examSnapshot?.examName || '-',
      examDate: doc.examSnapshot?.examDate ?? null, // LEGACY FALLBACK handled at frontend if needed
      isPublished: true,
    },
    student: {
      _id: String(doc.studentId),
      admissionNumber: doc.studentSnapshot?.admissionNumber ?? '-',
      rollNumber: doc.studentSnapshot?.rollNumber ?? '-',
      examRollNumber: doc.studentSnapshot?.examRollNumber ?? null,
      fullName: doc.studentSnapshot?.fullName ?? '-',
      fatherName: doc.studentSnapshot?.fatherName ?? null,
      guardianName: doc.studentSnapshot?.guardianName ?? null,
      gender: doc.studentSnapshot?.gender ?? '-',
      caste: doc.studentSnapshot?.caste ?? null,
      className: doc.studentSnapshot?.className ?? '-',
      sectionName: doc.studentSnapshot?.sectionName ?? '-',
      sessionName: doc.studentSnapshot?.sessionName ?? '-',
    },
    gradeScale: {
      name: doc.examSnapshot?.gradeScaleName || '-',
      boundaries: doc.examSnapshot?.gradeScaleBoundaries || [],
    },
    subjects: (doc.subjects || []).map((s: any) => ({
      subjectId: String(s.subjectId),
      name: s.subjectName,
      code: s.subjectCode,
      maxMarks: s.maximumMarks,
      passMarks: s.passMarks ?? 0,
      marksObtained: s.marksObtained ?? 0,
      status: s.attendanceStatus === 'absent' ? 'absent' : (s.passed ? 'pass' : 'fail'),
    })),
    total: { obtained: doc.totalObtained, max: doc.totalMaximum },
    percentage: doc.percentage,
    grade: doc.overallGrade || 'F',
    rank: doc.rank || 0,
    classStrength,
  };
}

export const getLatestPublishedResult = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user as unknown as AuthedUser;
  const { examId, studentId } = req.params;
  const tenantId = getTenantObjectId(req);

  if (user.role === 'student') {
    const own = await getOwnStudent(user, req.tenantDb as mongoose.Connection);
    if (String(own._id) !== String(studentId)) {
      throw ApiError.forbidden('You can only view your own result card', 'RESULTS_FORBIDDEN');
    }
  }

  // Fetch the full cohort to calculate rank and class strength accurately
  const publishedDocs = await Result.find({ examId, tenantId }).sort({ version: -1 }).lean();
  if (!publishedDocs.length) {
    throw ApiError.notFound('No published result found for this exam');
  }

  const cohort = buildCohortResults(publishedDocs);
  validateSnapshotConsistency(cohort);

  const studentDoc = cohort.find((d) => String(d.studentId) === String(studentId));

  if (!studentDoc) {
    throw ApiError.notFound('No published result found for this student in this exam');
  }

  ok(res, formatResultCard(studentDoc, cohort.length));
});

export const getPublishedSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user as unknown as AuthedUser;
  const examId = String(req.query.examId || '');
  if (!examId) throw ApiError.badRequest('examId is required', 'EXAM_REQUIRED');
  const tenantId = getTenantObjectId(req);

  const exam = await Exam.findOne(scopeQuery(req, { _id: examId })).lean();
  if (!exam) throw ApiError.notFound('Exam not found');
  if (!exam.isPublished) throw ApiError.badRequest('Exam is not published', 'EXAM_NOT_PUBLISHED');

  const publishedDocs = await Result.find({ examId: exam._id, tenantId }).sort({ version: -1 }).lean();
  const cohort = buildCohortResults(publishedDocs);

  // Rebuild subjects array solely from snapshot configurations, prioritizing highest versions
  const subjectsMap = new Map();
  // Iterate over publishedDocs (which is sorted by version: -1) to guarantee highest-version deterministic resolution
  for (const doc of publishedDocs) {
    for (const s of (doc.subjects || [])) {
      if (!subjectsMap.has(String(s.subjectId))) {
        subjectsMap.set(String(s.subjectId), {
          subjectId: String(s.subjectId),
          name: s.subjectName,
          code: s.subjectCode,
          maxMarks: s.maximumMarks,
          passMarks: s.passMarks ?? null,
        });
      }
    }
  }

  const students = cohort.map(doc => ({
    studentId: String(doc.studentId),
    admissionNumber: doc.studentSnapshot?.admissionNumber ?? '-',
    rollNumber: doc.studentSnapshot?.rollNumber ?? '-',
    examRollNumber: doc.studentSnapshot?.examRollNumber ?? null,
    fullName: doc.studentSnapshot?.fullName ?? '-',
    fatherName: doc.studentSnapshot?.fatherName ?? null,
    guardianName: doc.studentSnapshot?.guardianName ?? null,
    gender: doc.studentSnapshot?.gender ?? '-',
    caste: doc.studentSnapshot?.caste ?? null,
    totalObtained: doc.totalObtained,
    totalMax: doc.totalMaximum,
    percentage: doc.percentage,
    grade: doc.overallGrade || 'F',
    rank: doc.rank || 0,
  }));

  const canonicalConfigDoc = publishedDocs[0];

  ok(res, {
    exam: {
      _id: String(exam._id),
      name: canonicalConfigDoc?.examSnapshot?.examName || exam.name,
      isPublished: true,
      examDate: canonicalConfigDoc?.examSnapshot?.examDate ?? (exam.examDate ? new Date(exam.examDate).toISOString() : null), // LEGACY FALLBACK to exam.examDate
    },
    gradeScale: canonicalConfigDoc?.examSnapshot ? {
      name: canonicalConfigDoc.examSnapshot.gradeScaleName,
      boundaries: canonicalConfigDoc.examSnapshot.gradeScaleBoundaries
    } : null,
    classStrength: cohort.length,
    subjects: Array.from(subjectsMap.values()),
    students
  });
});
