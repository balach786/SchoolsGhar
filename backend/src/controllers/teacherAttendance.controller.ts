import { getTenantModels } from '../services/TenantModelRegistry';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { paginated } from '../utils/apiResponse';
import { sendCsv, wantsCsv } from '../utils/csv';
import { SalaryRecord } from '../models/SalaryRecord';
import { AcademicSession } from '../models/AcademicSession';
import { getOwnTeacher, normalizeDate, dayStart, dayEnd, type AuthedUser } from '../services/attendance.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

const PAGE_MAX = 100;
const PAGE_DEFAULT = 20;
const STATUS_LABELS: Record<string, string> = { present: 'Present', absent: 'Absent', late: 'Late', leave: 'Leave' };

type ReqUser = AuthedUser & { _id: string; role: string };

/** Only office staff (admin, super_admin, receptionist) may mark teacher attendance. */
function assertStaff(user: ReqUser) {
  if (!['super_admin', 'admin', 'receptionist'].includes(user.role)) {
    throw ApiError.forbidden('Only administrative staff can mark teacher attendance', 'ATTENDANCE_FORBIDDEN');
  }
}

function publicRecord(r: any, tMap: Map<string, any>) {
  const t = tMap.get(String(r.teacherId));
  return {
    _id: String(r._id),
    teacherId: String(r.teacherId),
    teacherName: t?.fullName ?? '—',
    employeeId: t?.employeeId ?? '—',
    attendanceDate: new Date(r.attendanceDate).toISOString().slice(0, 10),
    status: r.status,
    markedBy: r.markedBy ? String(r.markedBy) : null,
  };
}

/** POST /api/teacher-attendance/bulk */
export const bulkMark = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { TeacherAttendance, Teacher, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  assertStaff(user);

  const { attendanceDate, overwrite, records } = req.body;
  const tenantId = getTenantObjectId(req);
  const date = normalizeDate(attendanceDate);
  if (date.getTime() > dayStart(new Date()).getTime()) {
    throw ApiError.badRequest('Attendance cannot be marked for a future date', 'FUTURE_DATE');
  }

  const ids = records.map((r: any) => r.teacherId);
  if (new Set(ids).size !== ids.length) {
    throw ApiError.badRequest('Duplicate teacher in the same request', 'DUPLICATE_TEACHER_IN_REQUEST');
  }

  const teachers = await Teacher.find(scopeQuery(req, { _id: { $in: ids }, isArchived: false, isActive: true })).select('_id').lean();
  const foundIds = new Set(teachers.map((t) => String(t._id)));
  const missing = ids.filter((id: string) => !foundIds.has(String(id)));
  if (missing.length) {
    throw ApiError.badRequest(`One or more teachers do not exist, are inactive, or are archived: ${missing.join(', ')}`, 'INVALID_TEACHER_LIST');
  }

  const existing = await TeacherAttendance.find(scopeQuery(req, { attendanceDate: date, teacherId: { $in: ids } })).select('teacherId').lean();
  if (existing.length && !overwrite) {
    throw ApiError.conflict(
      `Attendance already marked for ${existing.length} teacher(s) on this date`,
      'ATTENDANCE_ALREADY_MARKED',
      { teacherIds: existing.map((e) => String(e.teacherId)) }
    );
  }

  // Resolve applicable academic session for attendanceDate
  const matchingSessions = await AcademicSession.find(
    scopeQuery(req, {
      startDate: { $lte: date },
      endDate: { $gte: date },
      isArchived: false,
    })
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
      filter: scopeQuery(req, { teacherId: new mongoose.Types.ObjectId(r.teacherId), attendanceDate: date }),
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
  await TeacherAttendance.bulkWrite(ops);

  res.status(200).json({
    success: true,
    message: `Attendance ${overwrite ? 'updated' : 'marked'} for ${records.length} teacher(s)`,
    data: { marked: records.length, attendanceDate: date.toISOString().slice(0, 10) },
  });
});

/** PATCH /api/teacher-attendance/records/:id */
export const updateRecord = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { TeacherAttendance, Teacher, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  assertStaff(user);

  const record = await TeacherAttendance.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!record) throw ApiError.notFound('Attendance record not found');
  record.status = req.body.status;
  record.markedBy = new mongoose.Types.ObjectId(user._id);
  await record.save();

  const teacher = await Teacher.findOne(scopeQuery(req, { _id: record.teacherId })).select('fullName employeeId').lean();
  const tMap = new Map([[String(record.teacherId), teacher]]);
  res.json({ success: true, data: publicRecord(record.toObject(), tMap) });
});

/** GET /api/teacher-attendance/records/:id */
export const getRecord = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { TeacherAttendance, Teacher, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const record = await TeacherAttendance.findOne(scopeQuery(req, { _id: req.params.id })).lean();
  if (!record) throw ApiError.notFound('Attendance record not found');

  if (user.role === 'student') {
    throw ApiError.forbidden('Students cannot view teacher attendance', 'ATTENDANCE_FORBIDDEN');
  }

  const teacher = await Teacher.findOne(scopeQuery(req, { _id: record.teacherId })).select('fullName employeeId').lean();
  const tMap = new Map([[String(record.teacherId), teacher]]);
  res.json({ success: true, data: publicRecord(record, tMap) });
});

/** GET /api/teacher-attendance */
export const listAttendance = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { TeacherAttendance, Teacher, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const teacherId = (req.query.teacherId as string) || undefined;
  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;

  let filter: Record<string, any> = {};
  if (user.role === 'teacher') {
    const own = await getOwnTeacher(user, tenantDb);
    filter.teacherId = own._id;
  } else if (user.role === 'student') {
    throw ApiError.forbidden('Students cannot view teacher attendance', 'ATTENDANCE_FORBIDDEN');
  } else if (teacherId) {
    filter.teacherId = teacherId;
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
    TeacherAttendance.find(filter).sort({ attendanceDate: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    TeacherAttendance.countDocuments(filter),
    TeacherAttendance.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ]);
  const teacherIds = Array.from(new Set(docs.map((d) => String(d.teacherId))));
  const teachers = await Teacher.find(scopeQuery(req, { _id: { $in: teacherIds } })).select('fullName employeeId').lean();
  const tMap = new Map(teachers.map((t) => [String(t._id), t]));

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

/** GET /api/teacher-attendance/summary — per-teacher totals in range. */
export const summary = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { TeacherAttendance, Teacher, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;

  const filter: Record<string, any> = {};
  if (user.role === 'teacher') {
    const own = await getOwnTeacher(user, tenantDb);
    filter.teacherId = own._id;
  } else if (user.role === 'student') {
    throw ApiError.forbidden('Students cannot view teacher attendance', 'ATTENDANCE_FORBIDDEN');
  }
  if (from || to) {
    filter.attendanceDate = {};
    if (from) filter.attendanceDate.$gte = dayStart(from);
    if (to) filter.attendanceDate.$lte = dayEnd(to);
  }

  const tenantId = getTenantObjectId(req);
  if (tenantId) filter.tenantId = tenantId;

  const [grouped, teachers] = await Promise.all([
    TeacherAttendance.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$teacherId',
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
          leave: { $sum: { $cond: [{ $eq: ['$status', 'leave'] }, 1, 0] } },
        },
      },
    ]),
    Teacher.find(scopeQuery(req, {})).select('fullName employeeId').lean(),
  ]);
  const tMap = new Map(teachers.map((t) => [String(t._id), t]));

  const data = grouped.map((g) => {
    const total = g.present + g.absent + g.late + g.leave;
    return {
      teacherId: String(g._id),
      teacherName: tMap.get(String(g._id))?.fullName ?? '—',
      employeeId: tMap.get(String(g._id))?.employeeId ?? '—',
      present: g.present,
      absent: g.absent,
      late: g.late,
      leave: g.leave,
      total,
      attendanceRate: total ? Math.round(((g.present + g.late) / total) * 1000) / 10 : 0,
    };
  });
  res.json({ success: true, data });
});

/** GET /api/teacher-attendance/download — CSV export (streamed, never stored). */
export const downloadCsv = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { TeacherAttendance, Teacher, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const teacherId = (req.query.teacherId as string) || undefined;
  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;

  let filter: Record<string, any> = {};
  if (user.role === 'teacher') {
    const own = await getOwnTeacher(user, tenantDb);
    filter.teacherId = own._id;
  } else if (teacherId) {
    filter.teacherId = teacherId;
  }
  if (from || to) {
    filter.attendanceDate = {};
    if (from) filter.attendanceDate.$gte = dayStart(from);
    if (to) filter.attendanceDate.$lte = dayEnd(to);
  }

  filter = scopeQuery(req, filter);

  const docs = await TeacherAttendance.find(filter).sort({ attendanceDate: -1 }).lean();
  const teacherIds = Array.from(new Set(docs.map((d) => String(d.teacherId))));
  const teachers = await Teacher.find(scopeQuery(req, { _id: { $in: teacherIds } })).select('fullName employeeId').lean();
  const tMap = new Map(teachers.map((t) => [String(t._id), t]));

  const header = 'Date,Teacher,EmployeeId,Status';
  const lines = docs.map((d) => {
    const p = publicRecord(d, tMap);
    return [
      p.attendanceDate,
      `"${String(p.teacherName).replace(/"/g, '""')}"`,
      `"${String(p.employeeId).replace(/"/g, '""')}"`,
      STATUS_LABELS[p.status] ?? p.status,
    ].join(',');
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="teacher-attendance.csv"');
  res.send(`\uFEFF${[header, ...lines].join('\n')}`);
});

/** GET /api/teacher-attendance/monthly-summary?month=YYYY-MM */
export const monthlySummary = asyncHandler(async (req: Request & { tenantDb?: mongoose.Connection }, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { TeacherAttendance, Teacher, SchoolClosure } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  if (user.role === 'student') throw ApiError.forbidden('Students cannot view teacher attendance', 'ATTENDANCE_FORBIDDEN');

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

  // Find historical teachers with attendance records in the target month (Requirement 13)
  const historicalTeacherIds = await TeacherAttendance.distinct(
    'teacherId',
    scopeQuery(req, {
      attendanceDate: { $gte: startDate, $lte: endDate },
    })
  );

  let teacherFilter: Record<string, any> = {
    $or: [
      { isArchived: false, isActive: true },
      { _id: { $in: historicalTeacherIds } },
    ],
  };
  if (user.role === 'teacher') {
    const own = await getOwnTeacher(user, tenantDb);
    teacherFilter = { _id: own._id };
  }

  const teachers = await Teacher.find(scopeQuery(req, teacherFilter))
    .select('fullName employeeId salary department designation phone email')
    .sort({ employeeId: 1, fullName: 1 })
    .lean();

  const teacherIds = teachers.map((t) => t._id);

  // Fetch school closures / official holidays for this month
  const closures = await SchoolClosure.find(
    scopeQuery(req, {
      dateString: { $regex: `^${month}-` },
      applicableTo: { $in: ['all', 'staff'] },
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

  // Fetch attendance records for this month
  const attFilter: Record<string, any> = {
    teacherId: { $in: teacherIds },
    attendanceDate: { $gte: startDate, $lte: endDate },
  };
  const attRecords = await TeacherAttendance.find(scopeQuery(req, attFilter)).lean();

  // Fast map: `teacherId:dateString` -> status
  const recordMap = new Map<string, string>();
  for (const r of attRecords) {
    const dStr = new Date(r.attendanceDate).toISOString().slice(0, 10);
    recordMap.set(`${String(r.teacherId)}:${dStr}`, r.status);
  }

  // Fetch any existing salary records for these teachers in this month
  const salaryRecords = await SalaryRecord.find(scopeQuery(req, {
    staffId: { $in: teacherIds },
    salaryMonth: month,
  })).select('staffId baseAmount adjustmentAmount netAmount status paymentDate').lean();

  const salaryMap = new Map(salaryRecords.map((s) => [String(s.staffId), s]));

  let totalPresentAcross = 0;
  let totalAbsentAcross = 0;
  let totalLateAcross = 0;
  let totalLeaveAcross = 0;
  let totalDeductionsAcross = 0;
  let totalProjectedNetAcross = 0;

  // Track day-by-day totals across whole faculty
  const dailyTotals: Record<number, { present: number; absent: number; late: number; leave: number }> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    dailyTotals[d] = { present: 0, absent: 0, late: 0, leave: 0 };
  }

  const rows = teachers.map((t) => {
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let leaveCount = 0;
    let officialLeaveCount = 0;
    let schoolClosedCount = 0;

    const dailyMarks: Record<number, { status: string; code: string; label: string; reason?: string }> = {};

    for (const cal of calendarDays) {
      const d = cal.day;
      if (cal.closure) {
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
        const rawStatus = recordMap.get(`${String(t._id)}:${cal.dateString}`);
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
        } else {
          dailyMarks[d] = { status: 'unmarked', code: '—', label: 'Unmarked' };
        }
      }
    }

    const totalRecorded = presentCount + absentCount + lateCount + leaveCount;
    const baseDays = netWorkingDays > 0 ? netWorkingDays : (totalRecorded || 1);
    const attendanceRate = Math.round(((presentCount + lateCount) / baseDays) * 1000) / 10;

    totalPresentAcross += presentCount;
    totalAbsentAcross += absentCount;
    totalLateAcross += lateCount;
    totalLeaveAcross += leaveCount;

    const baseSalary = (t as any).salary ?? 0;
    // Daily rate computed on net working days (or default 30 if 0)
    const workingDaysDivisor = netWorkingDays > 0 ? netWorkingDays : 30;
    const dailyRate = Math.round(baseSalary / workingDaysDivisor);

    // Dedication strictly only for absent days!
    const absentDeduction = absentCount * dailyRate;
    const projectedNet = Math.max(0, baseSalary - absentDeduction);

    totalDeductionsAcross += absentDeduction;
    totalProjectedNetAcross += projectedNet;

    const existingSalary = salaryMap.get(String(t._id));

    return {
      teacherId: String(t._id),
      teacherName: t.fullName,
      employeeId: t.employeeId,
      department: (t as any).department || '—',
      designation: (t as any).designation || '—',
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      leave: leaveCount,
      officialLeave: officialLeaveCount,
      schoolClosed: schoolClosedCount,
      totalRecorded,
      workingDays: netWorkingDays,
      attendanceRate,
      baseSalary,
      dailyRate,
      absentDeduction,
      projectedNet,
      dailyMarks,
      salaryRecord: existingSalary ? {
        status: existingSalary.status,
        baseAmount: existingSalary.baseAmount,
        adjustmentAmount: existingSalary.adjustmentAmount,
        netAmount: existingSalary.netAmount,
        paymentDate: existingSalary.paymentDate ? new Date(existingSalary.paymentDate).toISOString().slice(0, 10) : null,
      } : null,
    };
  });

  const totalPossible = teachers.length * (netWorkingDays || 1);
  const staffAverageRate = totalPossible > 0
    ? Math.round(((totalPresentAcross + totalLateAcross) / totalPossible) * 1000) / 10
    : 0;

  if (wantsCsv(req) || req.query.format === 'csv') {
    const dayHeaders = calendarDays.map((c) => `Day ${c.day} (${c.dayOfWeek})`);
    return sendCsv(
      res,
      `staff-manual-register-${month}.csv`,
      ['Employee ID', 'Teacher Name', ...dayHeaders, 'Present (P)', 'Absent (A)', 'Late (L)', 'Leave (LV)', 'Holidays (H)', 'Working Days', 'Attendance Rate (%)', 'Base Salary (PKR)', 'Absent Deduction (PKR)', 'Projected Net Pay (PKR)', 'Salary Status'],
      rows.map((r) => [
        r.employeeId,
        r.teacherName,
        ...calendarDays.map((c) => r.dailyMarks[c.day]?.code || '—'),
        r.present,
        r.absent,
        r.late,
        r.leave,
        r.officialLeave + r.schoolClosed,
        r.workingDays,
        `${r.attendanceRate}%`,
        (r.baseSalary / 100).toFixed(2),
        (r.absentDeduction / 100).toFixed(2),
        (r.projectedNet / 100).toFixed(2),
        r.salaryRecord ? r.salaryRecord.status : 'not_generated',
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
      totalTeachers: teachers.length,
      staffAverageRate,
      totals: {
        present: totalPresentAcross,
        absent: totalAbsentAcross,
        late: totalLateAcross,
        leave: totalLeaveAcross,
        officialLeaves: totalOfficialLeaves,
        schoolClosed: totalSchoolClosed,
        totalDeductions: totalDeductionsAcross,
        totalProjectedNet: totalProjectedNetAcross,
      },
      calendarDays,
      dailyTotals,
      rows,
    },
  });
});

