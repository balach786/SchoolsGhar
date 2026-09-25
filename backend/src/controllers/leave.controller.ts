import { Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, paginated } from '../utils/apiResponse';
import { AuthRequest } from '../types';
import { resolveLeaveScope, publicLeave, notifyLeaveReviewed } from '../services/prompt7.service';
import { getOwnStudent, getOwnTeacher, type AuthedUser } from '../services/attendance.service';
import { recordAudit } from '../services/audit.service';
import { requireTenantId, scopeQuery } from '../utils/tenantScope';
import { getTenantModels } from '../services/TenantModelRegistry';

const OWNER_ROLES = ['super_admin', 'admin'];

/** POST /api/leave-requests — students and teachers submit for their own profile. */
export const createLeave = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { LeaveRequest } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const tenantId = requireTenantId(req);
  let requesterType: 'student' | 'teacher';
  let requesterId: unknown;
  if (user.role === 'teacher') {
    requesterType = 'teacher';
    requesterId = (await getOwnTeacher(user, tenantDb))._id;
  } else if (user.role === 'student') {
    requesterType = 'student';
    requesterId = (await getOwnStudent(user, tenantDb))._id;
  } else {
    throw ApiError.forbidden('Only students and teachers can submit leave requests', 'LEAVE_FORBIDDEN');
  }

  const doc = await LeaveRequest.create({
    tenantId,
    requesterType,
    requesterId,
    fromDate: new Date(req.body.fromDate),
    toDate: new Date(req.body.toDate),
    reason: req.body.reason,
  });
  recordAudit('leaveRequests', 'LEAVE_CREATED', req.user!, String(doc._id), {
    requesterType,
    fromDate: req.body.fromDate,
    toDate: req.body.toDate,
  });
  ok(res, publicLeave(doc), 201, { message: 'Leave request submitted' });
});

/** GET /api/leave-requests — admins see all (filters); others only their own. */
export const listLeaves = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { LeaveRequest, Student, Teacher } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const tenantId = requireTenantId(req);
  const filter = await resolveLeaveScope(user, req.query.requesterId as string | undefined, tenantDb);
  filter.tenantId = tenantId;
  if (req.query.status) filter.status = req.query.status;
  if (OWNER_ROLES.includes(user.role) && req.query.requesterType) filter.requesterType = req.query.requesterType;
  if (req.query.from || req.query.to) {
    filter.fromDate = {};
    if (req.query.from) filter.fromDate.$gte = new Date(String(req.query.from));
    if (req.query.to) filter.fromDate.$lte = new Date(new Date(String(req.query.to)).getTime() + 24 * 3600 * 1000 - 1);
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    LeaveRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    LeaveRequest.countDocuments(filter),
  ]);

  const studentIds = docs.filter((d) => d.requesterType === 'student').map((d) => d.requesterId);
  const teacherIds = docs.filter((d) => d.requesterType === 'teacher').map((d) => d.requesterId);
  const [students, teachers] = await Promise.all([
    Student.find({ tenantId, _id: { $in: studentIds } }).select('fullName admissionNumber').lean(),
    Teacher.find({ tenantId, _id: { $in: teacherIds } }).select('fullName employeeId').lean(),
  ]);
  const nameMap = new Map<string, string>([
    ...students.map((s) => [String(s._id), `${s.fullName} (${s.admissionNumber})`] as const),
    ...teachers.map((t) => [String(t._id), `${t.fullName} (${t.employeeId})`] as const),
  ]);

  paginated(res, {
    data: docs.map((d) => publicLeave(d, { requesterName: nameMap.get(String(d.requesterId)) })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

/** PATCH /api/leave-requests/:id/review — admin approval/rejection (leaveRequests.approve). */
export const reviewLeave = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { LeaveRequest, Teacher, Student } = getTenantModels(tenantDb);

  const doc = await LeaveRequest.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Leave request not found');
  if (doc.status !== 'pending') {
    throw ApiError.badRequest('This leave request was already reviewed', 'LEAVE_ALREADY_REVIEWED');
  }

  // Prevent self-approval if reviewer's linked profile matches the requester
  if (doc.requesterType === 'teacher') {
    const ownTeacher = await Teacher.findOne({ userId: req.user!._id }).select('_id').lean();
    if (ownTeacher && String(ownTeacher._id) === String(doc.requesterId)) {
      throw ApiError.forbidden('You cannot approve your own leave request', 'SELF_APPROVAL_FORBIDDEN');
    }
  } else if (doc.requesterType === 'student') {
    const ownStudent = await Student.findOne({ userId: req.user!._id }).select('_id').lean();
    if (ownStudent && String(ownStudent._id) === String(doc.requesterId)) {
      throw ApiError.forbidden('You cannot approve your own leave request', 'SELF_APPROVAL_FORBIDDEN');
    }
  }

  const approve = req.body.decision === 'approve';
  doc.status = approve ? 'approved' : 'rejected';
  doc.reviewedBy = req.user!._id as never;
  doc.reviewNote = req.body.reviewNote;
  doc.reviewedAt = new Date();
  await doc.save();
  notifyLeaveReviewed(doc, req.tenantDb as mongoose.Connection);
  recordAudit('leaveRequests', approve ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED', req.user!, String(doc._id));
  ok(res, publicLeave(doc), 200, { message: approve ? 'Leave approved' : 'Leave rejected' });
});
