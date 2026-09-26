import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, paginated } from '../utils/apiResponse';
import { AuthRequest } from '../types';
import { resolveAssignmentScope } from '../services/prompt7.service';
import { getOwnStudent, getOwnTeacher, type AuthedUser } from '../services/attendance.service';
import { recordAudit } from '../services/audit.service';
import { requireTenantId, scopeQuery } from '../utils/tenantScope';
import mongoose from 'mongoose';
import { getTenantModels } from '../services/TenantModelRegistry';

const OWNER_ROLES = ['super_admin', 'admin'];

async function requireAssignmentForSubmission(user: AuthedUser, assignmentId: string, tenantId: any, tenantDb: mongoose.Connection) {
  const { Assignment } = getTenantModels(tenantDb);
  const assignment = await Assignment.findOne({ _id: assignmentId, tenantId });
  if (!assignment) throw ApiError.notFound('Assignment not found');
  if (assignment.isArchived) throw ApiError.badRequest('Assignment is archived', 'ASSIGNMENT_ARCHIVED');
  const scope = await resolveAssignmentScope(user, tenantDb);
  const scopedClassIds = typeof scope.classId === 'object'
    ? (scope.classId.$in ?? []).map(String)
    : scope.classId ? [scope.classId] : null;
  if (scopedClassIds && !scopedClassIds.includes(String(assignment.classId))) {
    throw ApiError.notFound('Assignment not found');
  }
  return assignment;
}

/** POST /api/submissions — students submit (content and/or external file reference). */
export const createSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Submission } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  if (user.role !== 'student') {
    throw ApiError.forbidden('Only students can submit assignments', 'SUBMISSION_FORBIDDEN');
  }
  const tenantId = requireTenantId(req);
  const student = await getOwnStudent(user, tenantDb);
  const assignment = await requireAssignmentForSubmission(user, req.body.assignmentId, tenantId, tenantDb);

  const existing = await Submission.findOne({ tenantId, assignmentId: assignment._id, studentId: student._id }).select('_id').lean();
  if (existing) throw ApiError.conflict('You have already submitted this assignment', 'SUBMISSION_EXISTS');

  const now = new Date();
  const isLate = Boolean(assignment.dueDate && now > new Date(assignment.dueDate));

  const doc = await Submission.create({
    tenantId,
    assignmentId: assignment._id,
    studentId: student._id,
    content: req.body.content,
    fileUrl: req.body.fileUrl,
    fileMeta: req.body.fileMeta,
    submittedAt: now,
    isLate,
  });
  recordAudit('submissions', 'SUBMISSION_CREATED', req.user, String(doc._id), {
    assignmentId: String(assignment._id),
    isLate,
  });
  ok(res, {
    _id: String(doc._id),
    assignmentId: String(doc.assignmentId),
    studentId: String(doc.studentId),
    submittedAt: doc.submittedAt,
    isLate: doc.isLate,
  }, 201, { message: isLate ? 'Submitted (late)' : 'Submission received' });
});

/** GET /api/submissions?assignmentId= — teachers/admins review; students see only their own. */
export const listSubmissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Submission, Student } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const tenantId = requireTenantId(req);
  const assignmentId = String(req.query.assignmentId || '');
  if (!assignmentId) throw ApiError.badRequest('assignmentId is required', 'ASSIGNMENT_REQUIRED');
  await requireAssignmentForSubmission(user, assignmentId, tenantId, tenantDb);

  const filter: Record<string, any> = { tenantId, assignmentId };
  if (user.role === 'student') {
    const student = await getOwnStudent(user, tenantDb);
    filter.studentId = student._id;
  } else if (req.query.studentId) {
    filter.studentId = req.query.studentId;
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    Submission.find(filter).sort({ submittedAt: 1 }).skip(skip).limit(limit).lean(),
    Submission.countDocuments(filter),
  ]);
  const students = await Student.find({ tenantId, _id: { $in: docs.map((d) => d.studentId) } })
    .select('fullName admissionNumber rollNumber')
    .lean();
  const studentMap = new Map(students.map((s) => [String(s._id), s]));

  paginated(res, {
    data: docs.map((d) => {
      const s = studentMap.get(String(d.studentId));
      return {
        _id: String(d._id),
        assignmentId: String(d.assignmentId),
        studentId: String(d.studentId),
        studentName: s?.fullName ?? '—',
        admissionNumber: s?.admissionNumber ?? '—',
        rollNumber: s?.rollNumber ?? '—',
        content: user.role === 'student' ? (d.content ?? null) : null,
        fileUrl: d.fileUrl ?? null,
        fileMeta: d.fileMeta ?? null,
        submittedAt: d.submittedAt,
        isLate: d.isLate,
        marksObtained: d.marksObtained ?? null,
        feedback: d.feedback ?? null,
      };
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

/** PATCH /api/submissions/:id — teacher review (marks + feedback). Students cannot review. */
export const reviewSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Assignment, Submission } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  if (user.role === 'student') throw ApiError.forbidden('Students cannot review submissions', 'SUBMISSION_FORBIDDEN');
  const tenantId = requireTenantId(req);

  const doc = await Submission.findOne({ _id: req.params.id, tenantId });
  if (!doc) throw ApiError.notFound('Submission not found');
  const assignment = await Assignment.findOne({ _id: doc.assignmentId, tenantId });
  if (!assignment) throw ApiError.notFound('Assignment not found');

  if (!OWNER_ROLES.includes(user.role)) {
    const teacher = await getOwnTeacher(user, tenantDb);
    if (assignment.teacherId && String(assignment.teacherId) !== String(teacher._id)) {
      throw ApiError.forbidden('Only the authoring teacher can review this submission', 'SUBMISSION_FORBIDDEN');
    }
  }
  if (assignment.maxMarks !== undefined && req.body.marksObtained > assignment.maxMarks) {
    throw ApiError.badRequest(`Marks cannot exceed the assignment maximum (${assignment.maxMarks})`, 'MARKS_EXCEED_MAX');
  }

  doc.marksObtained = req.body.marksObtained as number;
  doc.feedback = req.body.feedback;
  doc.reviewedBy = req.user!._id as never;
  doc.reviewedAt = new Date();
  await doc.save();
  recordAudit('submissions', 'SUBMISSION_REVIEWED', req.user, String(doc._id), {
    marksObtained: doc.marksObtained,
  });
  ok(res, {
    _id: String(doc._id),
    marksObtained: doc.marksObtained,
    feedback: doc.feedback ?? null,
    reviewedAt: doc.reviewedAt,
  }, 200, { message: 'Submission reviewed' });
});
