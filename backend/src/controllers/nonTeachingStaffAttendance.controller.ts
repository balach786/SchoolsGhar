import { getTenantModels } from '../services/TenantModelRegistry';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { paginated } from '../utils/apiResponse';
import { sendCsv, wantsCsv } from '../utils/csv';
import { AcademicSession } from '../models/AcademicSession';
import { normalizeDate, dayStart, dayEnd, type AuthedUser } from '../services/attendance.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

const PAGE_MAX = 100;
const PAGE_DEFAULT = 20;

type ReqUser = AuthedUser & { _id: string; role: string };

function assertStaff(user: ReqUser) {
  if (!['super_admin', 'admin', 'receptionist'].includes(user.role)) {
    throw ApiError.forbidden('Only administrative staff can mark non-teaching staff attendance', 'ATTENDANCE_FORBIDDEN');
  }
}

function publicRecord(r: any, tMap: Map<string, any>) {
  const t = tMap.get(String(r.staffId));
  return {
    _id: String(r._id),
    staffId: String(r.staffId),
    staffName: t?.fullName ?? '—',
    employeeId: t?.employeeId ?? '—',
    designation: t?.designation ?? '—',
    attendanceDate: new Date(r.attendanceDate).toISOString().slice(0, 10),
    status: r.status,
    markedBy: r.markedBy ? String(r.markedBy) : null,
  };
}

/** POST /api/non-teaching-attendance/bulk */
export const bulkMark = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { NonTeachingStaffAttendance, Staff, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  assertStaff(user);

  const { attendanceDate, overwrite, records } = req.body;
  const tenantId = getTenantObjectId(req);
  const date = normalizeDate(attendanceDate);
  if (date.getTime() > dayStart(new Date()).getTime()) {
    throw ApiError.badRequest('Attendance cannot be marked for a future date', 'FUTURE_DATE');
  }

  const ids = records.map((r: any) => r.staffId);
  if (new Set(ids).size !== ids.length) {
    throw ApiError.badRequest('Duplicate staff in the same request', 'DUPLICATE_STAFF_IN_REQUEST');
  }

  const staffs = await Staff.find(
    scopeQuery(req, { _id: { $in: ids }, staffType: 'non_teaching', isArchived: false, isActive: true })
  ).select('_id').lean();
  
  const foundIds = new Set(staffs.map((t) => String(t._id)));
  const missing = ids.filter((id: string) => !foundIds.has(String(id)));
  if (missing.length) {
    throw ApiError.badRequest(`One or more staff do not exist, are inactive, are archived, or are not non-teaching: ${missing.join(', ')}`, 'INVALID_STAFF_LIST');
  }

  const existing = await NonTeachingStaffAttendance.find(scopeQuery(req, { attendanceDate: date, staffId: { $in: ids } })).select('staffId').lean();
  if (existing.length && !overwrite) {
    throw ApiError.conflict(
      `Attendance already marked for ${existing.length} staff on this date`,
      'ATTENDANCE_ALREADY_MARKED',
      { staffIds: existing.map((e) => String(e.staffId)) }
    );
  }

  const matchingSessions = await AcademicSession.find(
    scopeQuery(req, { startDate: { $lte: date }, endDate: { $gte: date }, isArchived: false })
  ).select('_id').lean();

  if (matchingSessions.length === 0) {
    throw ApiError.badRequest('No active academic session covers this attendance date', 'NO_ACADEMIC_SESSION_FOR_DATE');
  }
  if (matchingSessions.length > 1) {
    throw ApiError.conflict('Multiple overlapping active academic sessions cover this attendance date', 'AMBIGUOUS_OVERLAPPING_ACADEMIC_SESSIONS');
  }
  const session = matchingSessions[0];

  const ops = records.map((r: any) => ({
    updateOne: {
      filter: scopeQuery(req, { staffId: new mongoose.Types.ObjectId(r.staffId), attendanceDate: date }),
      update: {
        $set: {
          tenantId,
          sessionId: session?._id || undefined,
          status: r.status,
          markedBy: new mongoose.Types.ObjectId(user._id),
        },
      },
      upsert: true,
    },
  }));
  await NonTeachingStaffAttendance.bulkWrite(ops);

  res.status(200).json({
    success: true,
    message: `Attendance ${overwrite ? 'updated' : 'marked'} for ${records.length} staff`,
    data: { marked: records.length, attendanceDate: date.toISOString().slice(0, 10) },
  });
});

/** PATCH /api/non-teaching-attendance/records/:id */
export const updateRecord = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { NonTeachingStaffAttendance, Staff, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  assertStaff(user);

  const record = await NonTeachingStaffAttendance.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!record) throw ApiError.notFound('Attendance record not found');
  record.status = req.body.status;
  record.markedBy = new mongoose.Types.ObjectId(user._id);
  await record.save();

  const staff = await Staff.findOne(scopeQuery(req, { _id: record.staffId })).select('fullName employeeId designation').lean();
  const tMap = new Map([[String(record.staffId), staff]]);
  res.json({ success: true, data: publicRecord(record.toObject(), tMap) });
});

/** GET /api/non-teaching-attendance/records/:id */
export const getRecord = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { NonTeachingStaffAttendance, Staff, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const record = await NonTeachingStaffAttendance.findOne(scopeQuery(req, { _id: req.params.id })).lean();
  if (!record) throw ApiError.notFound('Attendance record not found');

  if (user.role === 'student' || user.role === 'teacher') {
    throw ApiError.forbidden('Students and teachers cannot view non-teaching staff attendance', 'ATTENDANCE_FORBIDDEN');
  }

  const staff = await Staff.findOne(scopeQuery(req, { _id: record.staffId })).select('fullName employeeId designation').lean();
  const tMap = new Map([[String(record.staffId), staff]]);
  res.json({ success: true, data: publicRecord(record, tMap) });
});

/** GET /api/non-teaching-attendance */
export const listAttendance = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { NonTeachingStaffAttendance, Staff, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const staffId = (req.query.staffId as string) || undefined;
  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;

  let filter: Record<string, any> = {};
  if (user.role === 'student' || user.role === 'teacher') {
    throw ApiError.forbidden('Students and teachers cannot view non-teaching staff attendance', 'ATTENDANCE_FORBIDDEN');
  } else if (staffId) {
    filter.staffId = staffId;
  }
  
  if (from || to) {
    filter.attendanceDate = {};
    if (from) filter.attendanceDate.$gte = dayStart(from);
    if (to) filter.attendanceDate.$lte = dayEnd(to);
  }

  filter = scopeQuery(req, filter);

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;

  const [docs, total, stats] = await Promise.all([
    NonTeachingStaffAttendance.find(filter).sort({ attendanceDate: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    NonTeachingStaffAttendance.countDocuments(filter),
    NonTeachingStaffAttendance.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ]);
  const staffIds = Array.from(new Set(docs.map((d) => String(d.staffId))));
  const staffs = await Staff.find(scopeQuery(req, { _id: { $in: staffIds }, staffType: 'non_teaching' })).select('fullName employeeId designation').lean();
  const tMap = new Map(staffs.map((t) => [String(t._id), t]));

  const summary = { present: 0, absent: 0, leave: 0, late: 0 };
  for (const s of stats) {
    if (s._id in summary) summary[s._id as keyof typeof summary] = s.count;
  }

  paginated(res, {
    data: docs.map((d) => publicRecord(d, tMap)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    summary,
  });
});

/** GET /api/non-teaching-attendance/download — CSV export (streamed, never stored). */
export const downloadCsv = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { NonTeachingStaffAttendance, Staff, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  if (user.role === 'student' || user.role === 'teacher') {
    throw ApiError.forbidden('Forbidden', 'FORBIDDEN');
  }

  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;

  let filter: Record<string, any> = {};
  if (from || to) {
    filter.attendanceDate = {};
    if (from) filter.attendanceDate.$gte = dayStart(from);
    if (to) filter.attendanceDate.$lte = dayEnd(to);
  }

  filter = scopeQuery(req, filter);

  const docs = await NonTeachingStaffAttendance.find(filter).sort({ attendanceDate: -1 }).lean();
  const staffIds = Array.from(new Set(docs.map((d) => String(d.staffId))));
  const staffs = await Staff.find(scopeQuery(req, { _id: { $in: staffIds }, staffType: 'non_teaching' })).select('fullName employeeId designation').lean();
  const tMap = new Map(staffs.map((t) => [String(t._id), t]));

  const records = docs.map((d) => {
    const pub = publicRecord(d, tMap);
    return [pub.attendanceDate, pub.staffName, pub.employeeId, pub.designation, pub.status];
  });

  sendCsv(res, `non-teaching-staff-attendance-${new Date().toISOString().slice(0, 10)}.csv`, ['Date', 'Staff Name', 'Employee ID', 'Designation', 'Status'], records);
});
