import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { paginated } from '../utils/apiResponse';
import { sendCsv, wantsCsv } from '../utils/csv';
import { getTenantModels } from '../services/TenantModelRegistry';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import {
  resolveAttendanceContext,

  getOwnStudent,
  normalizeDate,
  dayStart,
  dayEnd,
  computeAttendanceRate,
  getSchoolTodayISO,
  type AuthedUser,
} from '../services/attendance.service';
import { recordAudit } from '../services/audit.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

const PAGE_MAX = 100;
const PAGE_DEFAULT = 20;

const STATUS_LABELS: Record<string, string> = { present: 'Present', absent: 'Absent', late: 'Late', leave: 'Leave' };

type ReqUser = AuthedUser & { _id: string; role: string };

async function resolveNames(req: Request & { tenantDb?: mongoose.Connection }, records: any[]) {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { StudentAttendance, Student, Class, Section, AcademicSession, SchoolClosure } = getTenantModels(tenantDb);

      
  const studentIds = Array.from(new Set(records.map((r) => String(r.studentId)).filter(Boolean)));
  const classIds = Array.from(new Set(records.map((r) => String(r.classId)).filter(Boolean)));
  const sectionIds = Array.from(new Set(records.map((r) => (r.sectionId ? String(r.sectionId) : null)).filter(Boolean)));
  const [students, classes, sections] = await Promise.all([
    Student.find(scopeQuery(req, { _id: { $in: studentIds } })).select('fullName admissionNumber rollNumber fatherName guardianName gender caste').lean(),
    Class.find(scopeQuery(req, { _id: { $in: classIds } })).select('name').lean(),
    sectionIds.length ? Section.find(scopeQuery(req, { _id: { $in: sectionIds } })).select('name').lean() : Promise.resolve([]),
  ]);
  const sMap = new Map(students.map((s) => [String(s._id), s]));
  const cMap = new Map(classes.map((c) => [String(c._id), c]));
  const secMap = new Map(sections.map((s) => [String(s._id), s]));
  return { sMap, cMap, secMap };
}

function publicRecord(r: any, maps: { sMap: Map<string, any>; cMap: Map<string, any>; secMap: Map<string, any> }) {
  const stu = maps.sMap.get(String(r.studentId));
  const cls = maps.cMap.get(String(r.classId));
  const sec = r.sectionId ? maps.secMap.get(String(r.sectionId)) : null;
  return {
    _id: String(r._id),
    studentId: String(r.studentId),
    studentName: stu?.fullName ?? '—',
    fatherName: stu?.fatherName,
    guardianName: stu?.guardianName,
    gender: stu?.gender,
    caste: stu?.caste,
    admissionNumber: stu?.admissionNumber ?? '—',
    rollNumber: stu?.rollNumber ?? '—',
    sessionId: String(r.sessionId),
    classId: String(r.classId),
    className: cls?.name ?? '—',
    sectionId: r.sectionId ? String(r.sectionId) : null,
    sectionName: sec?.name ?? '',
    attendanceDate: new Date(r.attendanceDate).toISOString().slice(0, 10),
    status: r.status,
    markedBy: r.markedBy ? String(r.markedBy) : null,
  };
}

/** Restrict a list query to what the current user may see. */
async function scopeStudentQuery(req: Request & { tenantDb?: mongoose.Connection }, user: ReqUser, q: { sessionId?: string; classId?: string; sectionId?: string; studentId?: string }) {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { StudentAttendance, Student, Class, Section, AcademicSession, SchoolClosure } = getTenantModels(tenantDb);

    
  if (user.role === 'student') {
    const own = await getOwnStudent(user, tenantDb);
    q.studentId = String(own._id);
    return;
  }
  if (['super_admin', 'admin', 'receptionist'].includes(user.role)) return;


}

/** POST /api/student-attendance/bulk */
export const bulkMark = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { StudentAttendance, Student, Class, Section, AcademicSession, SchoolClosure } = getTenantModels(tenantDb);

      
  const user = req.user as unknown as ReqUser;
  const { sessionId, classId, sectionId, attendanceDate, overwrite, records } = req.body;
  const tenantId = getTenantObjectId(req);

  await resolveAttendanceContext(sessionId, classId, sectionId, (tenantId as any), tenantDb);
  if (user.role === 'student') {
    throw ApiError.forbidden('Students cannot mark attendance', 'ATTENDANCE_FORBIDDEN');
  }

  const schoolToday = getSchoolTodayISO();
  const inputDateStr = typeof attendanceDate === 'string'
    ? attendanceDate.slice(0, 10)
    : normalizeDate(attendanceDate).toISOString().slice(0, 10);
  if (inputDateStr > schoolToday) {
    throw ApiError.badRequest('Attendance cannot be marked for a future date', 'FUTURE_DATE');
  }
  const date = normalizeDate(attendanceDate);

  const { authorizeAttendanceModification } = await import('../services/attendance.service');
  await authorizeAttendanceModification(user, classId, date, (tenantId as any), tenantDb);

  const ids = records.map((r: any) => r.studentId);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw ApiError.badRequest('Duplicate student in the same request', 'DUPLICATE_STUDENT_IN_REQUEST');
  }

  // Active, non-archived students only
  const studentQuery: Record<string, any> = {
    _id: { $in: ids },
    sessionId,
    classId,
    isArchived: false,
    isActive: true,
  };
  if (sectionId) {
    studentQuery.sectionId = sectionId;
  }

  const students = await Student.find(scopeQuery(req, studentQuery))
    .select('_id')
    .lean();
  const foundIds = new Set(students.map((s) => String(s._id)));
  const missing = ids.filter((id: string) => !foundIds.has(String(id)));
  if (missing.length) {
    throw ApiError.badRequest(
      `The following active students do not belong to this class/section/session: ${missing.join(', ')}`,
      'INVALID_STUDENT_LIST'
    );
  }

  const existing = await StudentAttendance.find(scopeQuery(req, {
    sessionId,
    attendanceDate: date,
    studentId: { $in: ids },
  }))
    .select('studentId status')
    .lean();
  if (existing.length && !overwrite) {
    throw ApiError.conflict(
      `Attendance already marked for ${existing.length} student(s) on this date`,
      'ATTENDANCE_ALREADY_MARKED',
      { studentIds: existing.map((e) => String(e.studentId)) }
    );
  }

  const tenantObjId = new mongoose.Types.ObjectId(String(tenantId));
  const sessionObjId = new mongoose.Types.ObjectId(String(sessionId));
  const classObjId = new mongoose.Types.ObjectId(String(classId));
  const sectionObjId = sectionId ? new mongoose.Types.ObjectId(String(sectionId)) : null;
  const userObjId = new mongoose.Types.ObjectId(String(user._id));

  const ops = records.map((r: any) => {
    const updateDoc: Record<string, any> = {
      $set: {
        tenantId: tenantObjId,
        status: r.status,
        classId: classObjId,
        markedBy: userObjId,
      },
    };
    if (sectionObjId) {
      updateDoc.$set.sectionId = sectionObjId;
    } else {
      updateDoc.$unset = { sectionId: 1 };
    }

    return {
      updateOne: {
        filter: {
          tenantId: tenantObjId,
          studentId: new mongoose.Types.ObjectId(String(r.studentId)),
          sessionId: sessionObjId,
          attendanceDate: date,
        },
        update: updateDoc,
        upsert: true,
      },
    };
  });
  await StudentAttendance.bulkWrite(ops);

  // Traceability & AuditLog
  recordAudit(
    'studentAttendance',
    existing.length > 0 ? 'ATTENDANCE_OVERWRITTEN' : 'ATTENDANCE_RECORDED',
    req.user as any,
    String(classId),
    {
      sessionId: String(sessionId),
      classId: String(classId),
      ...(sectionId ? { sectionId: String(sectionId) } : {}),
      attendanceDate: inputDateStr,
      totalRecords: records.length,
      overwrittenRecords: existing.length,
    }
  );

  res.status(200).json({
    success: true,
    message: `Attendance ${existing.length > 0 ? 'updated' : 'marked'} for ${records.length} student(s)`,
    data: { marked: records.length, attendanceDate: inputDateStr },
  });
});

/** PATCH /api/student-attendance/records/:id */
export const updateRecord = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { StudentAttendance, Student, Class, Section, AcademicSession, SchoolClosure } = getTenantModels(tenantDb);

      
  const user = req.user as unknown as ReqUser;
  const record = await StudentAttendance.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!record) throw ApiError.notFound('Attendance record not found');

  if (user.role === 'student') {
    throw ApiError.forbidden('Students cannot edit attendance', 'ATTENDANCE_FORBIDDEN');
  }

  const { authorizeAttendanceModification } = await import('../services/attendance.service');
  await authorizeAttendanceModification(user, String(record.classId), record.attendanceDate, getTenantObjectId(req) as any, tenantDb);

  const previousStatus = record.status;
  record.status = req.body.status;
  record.markedBy = new mongoose.Types.ObjectId(user._id);
  await record.save();

  recordAudit(
    'studentAttendance',
    'ATTENDANCE_RECORD_UPDATED',
    req.user as any,
    String(record._id),
    {
      studentId: String(record.studentId),
      sessionId: String(record.sessionId),
      classId: String(record.classId),
      ...(record.sectionId ? { sectionId: String(record.sectionId) } : {}),
      attendanceDate: new Date(record.attendanceDate).toISOString().slice(0, 10),
      previousStatus,
      newStatus: req.body.status,
    }
  );

  const maps = await resolveNames(req, [record.toObject()]);
  res.json({ success: true, data: publicRecord(record.toObject(), maps) });
});

/** GET /api/student-attendance/records/:id */
export const getRecord = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { StudentAttendance, Student, Class, Section, AcademicSession, SchoolClosure } = getTenantModels(tenantDb);
  const user = req.user as unknown as ReqUser;
  const record = await StudentAttendance.findOne(scopeQuery(req, { _id: req.params.id })).lean();
  if (!record) throw ApiError.notFound('Attendance record not found');

  if (user.role === 'student') {
    const own = await getOwnStudent(user, tenantDb);
    if (String(record.studentId) !== String(own._id)) {
      throw ApiError.forbidden('You can only view your own attendance', 'ATTENDANCE_FORBIDDEN');
    }
  }

  const maps = await resolveNames(req, [record]);
  res.json({ success: true, data: publicRecord(record, maps) });
});

/** GET /api/student-attendance */
export const listAttendance = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { StudentAttendance, Student, Class, Section, AcademicSession, SchoolClosure } = getTenantModels(tenantDb);
  const user = req.user as unknown as ReqUser;
  const q = {
    sessionId: (req.query.sessionId as string) || undefined,
    classId: (req.query.classId as string) || undefined,
    sectionId: (req.query.sectionId as string) || undefined,
    studentId: (req.query.studentId as string) || undefined,
    from: (req.query.from as string) || undefined,
    to: (req.query.to as string) || undefined,
  };

  await scopeStudentQuery(req, user, q);

  let filter: Record<string, any> = {};
  if (q.sessionId) filter.sessionId = q.sessionId;
  if (q.classId) filter.classId = q.classId;
  if (q.sectionId) filter.sectionId = q.sectionId;
  if (q.studentId) filter.studentId = q.studentId;
  if (q.from || q.to) {
    filter.attendanceDate = {};
    if (q.from) filter.attendanceDate.$gte = dayStart(q.from);
    if (q.to) filter.attendanceDate.$lte = dayEnd(q.to);
  }

  filter = scopeQuery(req, filter);

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;

  const [docs, total, stats] = await Promise.all([
    StudentAttendance.find(filter).sort({ attendanceDate: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    StudentAttendance.countDocuments(filter),
    StudentAttendance.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ]);
  const maps = await resolveNames(req, docs);

  const summary = { present: 0, absent: 0, leave: 0, late: 0 };
  for (const s of stats) {
    if (s._id in summary) summary[s._id as keyof typeof summary] = s.count;
  }

  paginated(res, {
    data: docs.map((d) => publicRecord(d, maps)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    summary,
  });
});

/** GET /api/student-attendance/summary — per class+section totals in range. */
export const summary = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { StudentAttendance, Student, Class, Section, AcademicSession, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  if (user.role === 'student') throw ApiError.forbidden('Students cannot view attendance summaries', 'ATTENDANCE_FORBIDDEN');

  const sessionId = (req.query.sessionId as string) || undefined;
  const classId = (req.query.classId as string) || undefined;
  const sectionId = (req.query.sectionId as string) || undefined;
  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;

  const filter: Record<string, any> = {};
  if (sessionId) filter.sessionId = sessionId;
  if (classId) filter.classId = classId;
  if (sectionId) filter.sectionId = sectionId;
  if (from || to) {
    filter.attendanceDate = {};
    if (from) filter.attendanceDate.$gte = dayStart(from);
    if (to) filter.attendanceDate.$lte = dayEnd(to);
  }



  const tenantId = getTenantObjectId(req);
  const match: Record<string, any> = {};
  if (tenantId) match.tenantId = tenantId;
  if (sessionId) match.sessionId = new mongoose.Types.ObjectId(sessionId);
  if (classId) match.classId = new mongoose.Types.ObjectId(classId);
  if (sectionId) match.sectionId = new mongoose.Types.ObjectId(sectionId);
  if (filter.classId?.$in) match.classId = { $in: filter.classId.$in.map((id: string) => new mongoose.Types.ObjectId(id)) };
  if (from || to) {
    match.attendanceDate = {};
    if (from) match.attendanceDate.$gte = dayStart(from);
    if (to) match.attendanceDate.$lte = dayEnd(to);
  }

  const [grouped, classes, sections] = await Promise.all([
    StudentAttendance.aggregate([
      { $match: match },
      {
        $group: {
          _id: { classId: '$classId', sectionId: '$sectionId' },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
          leave: { $sum: { $cond: [{ $eq: ['$status', 'leave'] }, 1, 0] } },
        },
      },
      { $sort: { '_id.classId': 1, '_id.sectionId': 1 } },
    ]),
    Class.find(scopeQuery(req, {})).select('name').lean(),
    Section.find(scopeQuery(req, {})).select('name').lean(),
  ]);

  const cMap = new Map(classes.map((c) => [String(c._id), c.name]));
  const sMap = new Map(sections.map((s) => [String(s._id), s.name]));

  const data = grouped.map((g) => {
    const counts = {
      present: g.present as number,
      absent: g.absent as number,
      late: g.late as number,
      leave: g.leave as number,
    };
    const { totalRecorded, attendanceRate } = computeAttendanceRate(counts);
    return {
      classId: String(g._id.classId),
      className: cMap.get(String(g._id.classId)) ?? '—',
      sectionId: g._id.sectionId ? String(g._id.sectionId) : null,
      sectionName: g._id.sectionId ? (sMap.get(String(g._id.sectionId)) ?? '') : '',
      present: g.present,
      absent: g.absent,
      late: g.late,
      leave: g.leave,
      total: totalRecorded,
      attendanceRate,
    };
  });
  res.json({ success: true, data });
});

/** GET /api/student-attendance/student-summary?studentId&from&to */
export const studentSummary = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { StudentAttendance, Student, Class, Section, AcademicSession, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const studentId = (req.query.studentId as string) || undefined;
  if (!studentId) throw ApiError.badRequest('studentId is required', 'STUDENT_REQUIRED');

  const student = await Student.findOne(scopeQuery(req, { _id: studentId })).lean();
  if (!student) throw ApiError.notFound('Student not found');

  if (user.role === 'student') {
    const own = await getOwnStudent(user, tenantDb);
    if (String(own._id) !== String(student._id)) {
      throw ApiError.forbidden('You can only view your own attendance', 'ATTENDANCE_FORBIDDEN');
    }
  }
  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;

  const tenantId = getTenantObjectId(req);
  const match: Record<string, any> = { studentId: student._id };
  if (tenantId) match.tenantId = tenantId;
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = dayStart(from);
    if (to) range.$lte = dayEnd(to);
    (match as Record<string, unknown>).attendanceDate = range;
  }

  const grouped = await StudentAttendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        leave: { $sum: { $cond: [{ $eq: ['$status', 'leave'] }, 1, 0] } },
      },
    },
  ]);
  const g = grouped[0] ?? { present: 0, absent: 0, late: 0, leave: 0 };
  const { totalRecorded, attendanceRate } = computeAttendanceRate(g);
  res.json({
    success: true,
    data: {
      studentId: String(student._id),
      studentName: student.fullName,
      present: g.present,
      absent: g.absent,
      late: g.late,
      leave: g.leave,
      total: totalRecorded,
      attendanceRate,
    },
  });
});

/** GET /api/student-attendance/download — CSV export (streamed, never stored). */
export const downloadCsv = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { StudentAttendance, Student, Class, Section, AcademicSession, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const q = {
    sessionId: (req.query.sessionId as string) || undefined,
    classId: (req.query.classId as string) || undefined,
    sectionId: (req.query.sectionId as string) || undefined,
    studentId: (req.query.studentId as string) || undefined,
    from: (req.query.from as string) || undefined,
    to: (req.query.to as string) || undefined,
  };
  await scopeStudentQuery(req, user, q);

  let filter: Record<string, any> = {};
  if (q.sessionId) filter.sessionId = q.sessionId;
  if (q.classId) filter.classId = q.classId;
  if (q.sectionId) filter.sectionId = q.sectionId;
  if (q.studentId) filter.studentId = q.studentId;
  if (q.from || q.to) {
    filter.attendanceDate = {};
    if (q.from) filter.attendanceDate.$gte = dayStart(q.from);
    if (q.to) filter.attendanceDate.$lte = dayEnd(q.to);
  }

  filter = scopeQuery(req, filter);

  const docs = await StudentAttendance.find(filter).sort({ attendanceDate: -1 }).lean();
  const maps = await resolveNames(req, docs);

  const header = 'Date,Student,AdmissionNo,RollNo,Class,Section,Status';
  const lines = docs.map((d) => {
    const p = publicRecord(d, maps);
    return [
      p.attendanceDate,
      `"${String(p.studentName).replace(/"/g, '""')}"`,
      `"${String(p.admissionNumber).replace(/"/g, '""')}"`,
      `"${String(p.rollNumber).replace(/"/g, '""')}"`,
      `"${String(p.className).replace(/"/g, '""')}"`,
      `"${String(p.sectionName).replace(/"/g, '""')}"`,
      STATUS_LABELS[p.status] ?? p.status,
    ].join(',');
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="student-attendance.csv"');
  res.send(`\uFEFF${[header, ...lines].join('\n')}`);
});

/** GET /api/student-attendance/monthly-summary?sessionId&classId&sectionId&month=YYYY-MM */
export const monthlySummary = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { StudentAttendance, Student, Class, Section, AcademicSession, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  if (user.role === 'student') throw ApiError.forbidden('Students cannot view attendance summaries', 'ATTENDANCE_FORBIDDEN');

  const sessionId = (req.query.sessionId as string) || undefined;
  const classId = (req.query.classId as string) || undefined;
  const sectionId = (req.query.sectionId as string) || undefined;
  const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);

  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    throw ApiError.badRequest('Invalid month format, expected YYYY-MM');
  }

  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const startDate = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, monthNum - 1, daysInMonth, 23, 59, 59, 999));

  const studentFilter: Record<string, any> = { isArchived: false, isActive: true };
  if (sessionId) studentFilter.sessionId = sessionId;
  if (classId) studentFilter.classId = classId;
  if (sectionId) studentFilter.sectionId = sectionId;



  const matchingStudentCount = await Student.countDocuments(scopeQuery(req, studentFilter));

  const SAFE_UNSCOPED_THRESHOLD = 300;
  if (!classId && matchingStudentCount > SAFE_UNSCOPED_THRESHOLD) {
    throw ApiError.badRequest(
      'Please select a class to view the monthly attendance register.',
      'MONTHLY_REPORT_SCOPE_REQUIRED'
    );
  }

  const students = await Student.find(scopeQuery(req, studentFilter))
    .select('fullName admissionNumber rollNumber classId sectionId profilePhotoUrl fatherName guardianName gender caste')
    .sort({ rollNumber: 1, fullName: 1 })
    .lean();

  const studentIds = students.map((s) => s._id);

  // Fetch school closures / official holidays for this month
  const closures = await SchoolClosure.find(
    scopeQuery(req, {
      dateString: { $regex: `^${month}-` },
      applicableTo: { $in: ['all', 'students'] },
    })
  ).lean();
  const closureMap = new Map(closures.map((c) => [c.dateString, c]));

  // Build full month calendar days
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  interface CalendarDayItem {
    day: number;
    dateString: string;
    dayOfWeek: string;
    isSunday: boolean;
    isWeekend: boolean;
    closure: {
      id: string;
      type: string;
      reason: string;
      reasonCategory?: string;
      notes?: string;
    } | null;
    isWorkingDay: boolean;
  }
  const calendarDays: CalendarDayItem[] = [];
  let totalSundays = 0;
  let totalOfficialLeaves = 0;
  let totalSchoolClosed = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateString = `${month}-${String(d).padStart(2, '0')}`;
    const dayDate = new Date(Date.UTC(year, monthNum - 1, d, 12, 0, 0));
    const dayOfWeek = dayNames[dayDate.getUTCDay()];
    const isSunday = dayOfWeek === 'Sun';
    if (isSunday) totalSundays++;

    const closure = closureMap.get(dateString);
    const isOfficialLeave = closure?.type === 'official_leave';
    const isSchoolClosed = closure?.type === 'school_closed';

    if (isOfficialLeave && !isSunday) totalOfficialLeaves++;
    if (isSchoolClosed && !isSunday) totalSchoolClosed++;

    calendarDays.push({
      day: d,
      dateString,
      dayOfWeek,
      isSunday,
      isWeekend: isSunday,
      closure: closure
        ? {
            id: String(closure._id),
            type: closure.type,
            reason: closure.reason,
            reasonCategory: closure.reasonCategory,
            notes: closure.notes,
          }
        : null,
      isWorkingDay: !isSunday && !isOfficialLeave && !isSchoolClosed,
    });
  }

  const netWorkingDays = Math.max(0, daysInMonth - totalSundays - totalOfficialLeaves - totalSchoolClosed);

  // Fetch all attendance records for these students in this month
  const attFilter: Record<string, any> = {
    studentId: { $in: studentIds },
    attendanceDate: { $gte: startDate, $lte: endDate },
  };

  const attRecords = await StudentAttendance.find(scopeQuery(req, attFilter)).lean();

  // Fast map: `studentId:dateString` -> status
  const recordMap = new Map<string, string>();
  for (const r of attRecords) {
    const dStr = new Date(r.attendanceDate).toISOString().slice(0, 10);
    recordMap.set(`${String(r.studentId)}:${dStr}`, r.status);
  }

  const [classes, sections] = await Promise.all([
    Class.find(scopeQuery(req, {})).select('name').lean(),
    Section.find(scopeQuery(req, {})).select('name').lean(),
  ]);
  const cMap = new Map(classes.map((c) => [String(c._id), c.name]));
  const sMap = new Map(sections.map((s) => [String(s._id), s.name]));

  let totalPresentAcross = 0;
  let totalAbsentAcross = 0;
  let totalLateAcross = 0;
  let totalLeaveAcross = 0;

  // Track day-by-day totals across whole class
  const dailyTotals: Record<number, { present: number; absent: number; late: number; leave: number }> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    dailyTotals[d] = { present: 0, absent: 0, late: 0, leave: 0 };
  }

  const rows = students.map((s) => {
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let leaveCount = 0;
    let officialLeaveCount = 0;
    let schoolClosedCount = 0;

    const dailyMarks: Record<number, { status: string; code: string; label: string; reason?: string }> = {};

    for (const cal of calendarDays) {
      const d = cal.day;
      const rawStatus = recordMap.get(`${String(s._id)}:${cal.dateString}`);
      if (rawStatus === 'present') {
        presentCount++;
        dailyTotals[d].present++;
        dailyMarks[d] = { status: 'present', code: 'P', label: 'Present' };
      } else if (rawStatus === 'absent') {
        absentCount++;
        dailyTotals[d].absent++;
        dailyMarks[d] = { status: 'absent', code: 'A', label: 'Absent' };
      } else if (rawStatus === 'late') {
        lateCount++;
        dailyTotals[d].late++;
        dailyMarks[d] = { status: 'late', code: 'L', label: 'Late' };
      } else if (rawStatus === 'leave') {
        leaveCount++;
        dailyTotals[d].leave++;
        dailyMarks[d] = { status: 'leave', code: 'LV', label: 'Leave' };
      } else if (cal.closure) {
        if (cal.closure.type === 'official_leave') {
          officialLeaveCount++;
          dailyMarks[d] = {
            status: 'official_leave',
            code: 'H',
            label: 'Official Holiday',
            reason: cal.closure.reason,
          };
        } else {
          schoolClosedCount++;
          dailyMarks[d] = {
            status: 'school_closed',
            code: 'C',
            label: 'School Closed',
            reason: cal.closure.reason,
          };
        }
      } else if (cal.isSunday) {
        dailyMarks[d] = {
          status: 'weekend',
          code: 'OFF',
          label: 'Sunday',
        };
      } else {
        dailyMarks[d] = { status: 'unmarked', code: '—', label: 'Unmarked' };
      }
    }

    const { totalRecorded, attendanceRate } = computeAttendanceRate({
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      leave: leaveCount,
    });

    totalPresentAcross += presentCount;
    totalAbsentAcross += absentCount;
    totalLateAcross += lateCount;
    totalLeaveAcross += leaveCount;

    return {
      studentId: String(s._id),
      studentName: s.fullName,
      fatherName: s.fatherName,
      guardianName: s.guardianName,
      gender: s.gender,
      caste: s.caste,
      admissionNumber: s.admissionNumber || '—',
      rollNumber: s.rollNumber || '—',
      className: cMap.get(String(s.classId)) ?? '—',
      sectionName: s.sectionId ? (sMap.get(String(s.sectionId)) ?? '') : '',
      profilePhotoUrl: s.profilePhotoUrl || null,
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      leave: leaveCount,
      officialLeave: officialLeaveCount,
      schoolClosed: schoolClosedCount,
      totalRecorded,
      workingDays: netWorkingDays,
      attendanceRate,
      dailyMarks,
    };
  });

  const totalAttendedAcross = totalPresentAcross + totalLateAcross;
  const totalRecordedAcross = totalPresentAcross + totalLateAcross + totalAbsentAcross + totalLeaveAcross;
  const classAverageRate = totalRecordedAcross > 0
    ? Math.round((totalAttendedAcross / totalRecordedAcross) * 1000) / 10
    : 0;

  if (wantsCsv(req) || req.query.format === 'csv') {
    const dayHeaders = calendarDays.map((c) => `Day ${c.day} (${c.dayOfWeek})`);
    return sendCsv(
      res,
      `student-manual-register-${month}.csv`,
      ['Roll No', 'Admission No', 'Student Name', 'Class', 'Section', ...dayHeaders, 'Present (P)', 'Absent (A)', 'Late (L)', 'Leave (LV)', 'Holidays (H)', 'Working Days', 'Attendance Rate (%)'],
      rows.map((r) => [
        r.rollNumber,
        r.admissionNumber,
        r.studentName,
        r.className,
        r.sectionName,
        ...calendarDays.map((c) => r.dailyMarks[c.day]?.code || '—'),
        r.present,
        r.absent,
        r.late,
        r.leave,
        r.officialLeave + r.schoolClosed,
        r.workingDays,
        `${r.attendanceRate}%`,
      ])
    );
  }

  res.json({
    success: true,
    data: {
      month,
      daysInMonth,
      totalSundays,
      totalOfficialLeaves,
      totalSchoolClosed,
      totalWorkingDays: netWorkingDays,
      netWorkingDays,
      totalStudents: students.length,
      classAverageRate,
      totals: {
        present: totalPresentAcross,
        absent: totalAbsentAcross,
        late: totalLateAcross,
        leave: totalLeaveAcross,
        officialLeaves: totalOfficialLeaves,
        schoolClosed: totalSchoolClosed,
      },
      calendarDays,
      dailyTotals,
      rows,
    },
  });
});



/** GET /api/student-attendance/check-auth */
export const checkAuth = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { StudentAttendance, Student, Class, Section, AcademicSession, SchoolClosure } = getTenantModels(tenantDb);

    
  const user = req.user as unknown as ReqUser;
  const { classId, date } = req.query;
  const tenantId = getTenantObjectId(req);
  
  if (!classId || !date) throw ApiError.badRequest('classId and date are required');
  
  const { authorizeAttendanceModification } = await import('../services/attendance.service');
  try {
    await authorizeAttendanceModification(user, String(classId), new Date(String(date)), (tenantId as any), tenantDb);
    res.json({ success: true, canEdit: true });
  } catch (err: any) {
    if (err.status === 403) {
      res.json({ success: true, canEdit: false });
    } else {
      throw err;
    }
  }
});
