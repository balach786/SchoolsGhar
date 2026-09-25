import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, paginated } from '../utils/apiResponse';
import { AuthRequest } from '../types';
import { getTenantModels } from '../services/TenantModelRegistry';
import {

  resolveAssignmentScope,
  resolveAssignmentNames,
  publicAssignment,
  notifyAssignmentCreated,
} from '../services/prompt7.service';
import { getOwnStudent, getOwnTeacher, type AuthedUser } from '../services/attendance.service';
import { recordAudit } from '../services/audit.service';
import { requireTenantId, scopeQuery } from '../utils/tenantScope';

const OWNER_ROLES = ['super_admin', 'admin'];
const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

async function requireAssignmentVisible(user: AuthedUser, assignment: any) {
  const scope = await resolveAssignmentScope(user);
  if (scope.classId) {
    if (typeof scope.classId === 'string' && String(assignment.classId) !== scope.classId) {
      throw ApiError.notFound('Assignment not found');
    }
    if (typeof scope.classId === 'object' && !scope.classId.$in.map(String).includes(String(assignment.classId))) {
      throw ApiError.notFound('Assignment not found');
    }
  }
  return assignment;
}

export const listAssignments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Assignment, Submission } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;

  const scope = await resolveAssignmentScope(user);
  const filter: Record<string, any> = scopeQuery(req, { ...scope });
  if (req.query.status === 'archived' && OWNER_ROLES.includes(user.role)) filter.isArchived = true;
  else if (req.query.status === 'all' && OWNER_ROLES.includes(user.role)) delete filter.isArchived;
  else filter.isArchived = false;
  if (req.query.subjectId) filter.subjectId = req.query.subjectId;
  if (OWNER_ROLES.includes(user.role) && req.query.classId) filter.classId = req.query.classId;

  const [docs, total] = await Promise.all([
    Assignment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Assignment.countDocuments(filter),
  ]);

  // Students additionally get their own submission status per assignment.
  let mySubmissions: any[] = [];
  if (user.role === 'student') {
    mySubmissions = await Submission.find({ assignmentId: { $in: docs.map((d) => d._id) }, studentId: (await getOwnStudent(user))._id })
      .select('assignmentId submittedAt isLate marksObtained feedback')
      .lean();
  }
  const subMap = new Map(mySubmissions.map((s) => [String(s.assignmentId), s]));
  const names = await resolveAssignmentNames(docs);

  paginated(res, {
    data: docs.map((d) => {
      const base: any = publicAssignment(d, names);
      if (user.role === 'student') {
        const mine = subMap.get(String(d._id));
        base.submissionStatus = mine ? (mine.isLate ? 'late' : 'submitted') : d.dueDate && new Date(d.dueDate) < new Date() ? 'late' : 'pending';
        base.mySubmissionId = mine ? String(mine._id) : null;
        base.marksObtained = mine?.marksObtained ?? null;
        base.feedback = mine?.feedback ?? null;
      }
      return base;
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

/** POST /api/assignments — teachers (assigned class+subject) and admins. */
export const createAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Assignment, Class, Section, Subject } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const tenantId = requireTenantId(req);
  const cls = await Class.findOne({ _id: req.body.classId, tenantId });
  if (!cls) throw ApiError.notFound('Class not found');
  if (req.body.sectionId) {
    const section = await Section.findOne({ _id: req.body.sectionId, tenantId });
    if (!section || String(section.classId) !== String(cls._id)) {
      throw ApiError.badRequest('Section does not belong to this class', 'INVALID_SECTION');
    }
  }
  if (req.body.subjectId) {
    const subject = await Subject.findOne({ _id: req.body.subjectId, tenantId });
    if (!subject) throw ApiError.notFound('Subject not found');
  }


  if (req.body.sessionId && String(req.body.sessionId) !== String(cls.sessionId)) {
    throw ApiError.badRequest('Provided sessionId does not match class academic session', 'SESSION_CLASS_MISMATCH');
  }

  const teacher = user.role === 'teacher' ? await getOwnTeacher(user) : null;
  const doc = await Assignment.create({
    ...req.body,
    tenantId,
    sessionId: cls.sessionId,
    teacherId: teacher?._id ?? undefined,
    createdBy: user._id,
  });
  notifyAssignmentCreated(doc, req.tenantDb as mongoose.Connection);
  recordAudit('assignments', 'ASSIGNMENT_CREATED', req.user, String(doc._id), { title: doc.title, classId: String(doc.classId) });
  ok(res, publicAssignment(doc), 201, { message: 'Assignment created' });
});

/** GET /api/assignments/:id */
export const getAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Assignment } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const doc = await Assignment.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Assignment not found');
  await requireAssignmentVisible(user, doc);
  const names = await resolveAssignmentNames([doc]);
  ok(res, publicAssignment(doc, names));
});

/** PATCH /api/assignments/:id — creator teacher or admin. */
export const updateAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Assignment } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const doc = await Assignment.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Assignment not found');
  if (doc.isArchived) throw ApiError.badRequest('Assignment is archived; restore it first', 'ASSIGNMENT_ARCHIVED');

  if (!OWNER_ROLES.includes(user.role)) {
    const teacher = await getOwnTeacher(user);
    if (String(doc.teacherId) !== String(teacher._id)) {
      throw ApiError.forbidden('Only the authoring teacher can edit this assignment', 'ASSIGNMENT_FORBIDDEN');
    }
  }

  const allowed = ['title', 'description', 'dueDate', 'maxMarks', 'attachments'] as const;
  for (const key of allowed) {
    if (req.body[key] !== undefined) (doc as any)[key] = req.body[key];
  }
  await doc.save();
  recordAudit('assignments', 'ASSIGNMENT_UPDATED', req.user, String(doc._id), { title: doc.title });
  ok(res, publicAssignment(doc));
});

/** POST /api/assignments/:id/archive | /restore */
export const archiveAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Assignment } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const doc = await Assignment.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Assignment not found');
  if (!OWNER_ROLES.includes(user.role)) {
    const teacher = await getOwnTeacher(user);
    if (String(doc.teacherId) !== String(teacher._id)) {
      throw ApiError.forbidden('Only the authoring teacher can archive this assignment', 'ASSIGNMENT_FORBIDDEN');
    }
  }
  const restore = req.path.endsWith('/restore');
  doc.isArchived = !restore;
  await doc.save();
  recordAudit('assignments', restore ? 'ASSIGNMENT_RESTORED' : 'ASSIGNMENT_ARCHIVED', req.user, String(doc._id));
  ok(res, publicAssignment(doc), 200, { message: restore ? 'Assignment restored' : 'Assignment archived' });
});
