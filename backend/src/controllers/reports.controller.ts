import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/apiResponse';
import { getTenantModels } from '../services/TenantModelRegistry';
import { sendCsv, wantsCsv } from '../utils/csv';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';
import { getSchoolMonthRange, getSchoolCurrentMonthISO } from '../utils/schoolDate';
import { computeAttendanceRate } from '../services/attendance.service';
import { ApiError } from '../utils/ApiError';

/**
 * Report center (Prompt 8) — compact, filterable report endpoints.
 * Each supports ?format=csv with the same filters as the JSON response.
 * All queries use tenant-specific models via getTenantModels().
 */

function getTenantDb(req: Request): mongoose.Connection {
  const tenantDb = (req as AuthRequest).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  return tenantDb;
}

/** GET /api/reports/exams — published exam performance (participants, avg %, pass rate). */
export const examReport = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = getTenantDb(req);
  const { Exam, Mark, Class } = getTenantModels(tenantDb);

  let filter: Record<string, any> = { isPublished: true };
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.sessionId) filter.sessionId = req.query.sessionId;
  filter = scopeQuery(req, filter);

  const isExport = wantsCsv(req) || req.query.format === 'csv';
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
  const limit = isExport ? 10000 : Math.min(2000, Math.max(1, parseInt(String(req.query.limit || '500'), 10)));
  const skip = (page - 1) * limit;

  const totalRecords = await Exam.countDocuments(filter);
  const totalPages = Math.ceil(totalRecords / limit) || 1;

  const exams = await Exam.find(filter)
    .select('name classId classIds sessionId subjects examDate')
    .sort({ examDate: -1 })
    .skip(isExport ? 0 : skip)
    .limit(limit)
    .lean();

  const classIds = [...new Set(exams.map((e) => String(e.classId)))];
  const classes = await Class.find(scopeQuery(req, { _id: { $in: classIds } })).select('name').lean();
  const classMap = new Map(classes.map((c) => [String(c._id), c.name]));

  const rows: { exam: string; className: string; examDate: string | null; students: number; avgPercentage: number; passRate: number }[] = [];
  const examIds = exams.map((e) => e._id);
  const allMarks = examIds.length
    ? await Mark.find(scopeQuery(req, { examId: { $in: examIds } }))
        .select('examId studentId subjectId marksObtained')
        .lean()
    : [];

  const marksByExam = new Map<string, typeof allMarks>();
  for (const m of allMarks) {
    const eId = String((m as any).examId);
    let list = marksByExam.get(eId);
    if (!list) {
      list = [];
      marksByExam.set(eId, list);
    }
    list.push(m);
  }

  for (const exam of exams) {
    const marks = marksByExam.get(String(exam._id)) ?? [];
    const perStudent = new Map<string, { obtained: number; max: number; failed: number }>();
    const subjectDefs = new Map(exam.subjects.map((s: any) => [String(s.subjectId), { max: s.maxMarks, pass: s.passMarks ?? 0 }]));
    for (const m of marks) {
      const key = String(m.studentId);
      const agg = perStudent.get(key) ?? { obtained: 0, max: 0, failed: 0 };
      const sub = subjectDefs.get(String(m.subjectId)) ?? { max: 100, pass: 0 };
      agg.obtained += m.marksObtained;
      agg.max += sub.max;
      if (sub.pass > 0 && m.marksObtained < sub.pass) agg.failed += 1;
      perStudent.set(key, agg);
    }
    const students = [...perStudent.values()];
    rows.push({
      exam: exam.name,
      className: (exam as any).classIds && (exam as any).classIds.length > 0
        ? (exam as any).classIds.map((id: any) => classMap.get(String(id)) ?? '—').join(', ')
        : (classMap.get(String(exam.classId)) ?? '—'),
      examDate: exam.examDate ? new Date(exam.examDate).toISOString().slice(0, 10) : null,
      students: students.length,
      avgPercentage: students.length
        ? Math.round((students.reduce((s, v) => s + (v.max > 0 ? (v.obtained / v.max) * 100 : 0), 0) / students.length) * 100) / 100
        : 0,
      passRate: students.length ? Math.round((students.filter((v) => v.failed === 0).length / students.length) * 1000) / 10 : 0,
    });
  }

  if (isExport) {
    return sendCsv(res, 'exam-report.csv', ['Exam', 'Class', 'Date', 'Students', 'Avg %', 'Pass %'], rows.map((r) => [r.exam, r.className, r.examDate ?? '', String(r.students), r.avgPercentage.toFixed(2), r.passRate.toFixed(1)]));
  }
  ok(res, { rows, count: rows.length, totalRecords, totalPages, page, limit });
});

/** GET /api/reports/attendance?month=YYYY-MM&classId= — monthly attendance per class. */
export const attendanceReport = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = getTenantDb(req);
  const { StudentAttendance, Class } = getTenantModels(tenantDb);

  const month = typeof req.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)
    ? req.query.month
    : getSchoolCurrentMonthISO();

  const { start, endExclusive } = getSchoolMonthRange(month);
  const tenantId = getTenantObjectId(req);

  const match: Record<string, any> = {
    attendanceDate: { $gte: start, $lt: endExclusive },
    status: { $in: ['present', 'late', 'absent', 'leave'] },
  };
  if (tenantId) match.tenantId = tenantId;
  if (req.query.classId) {
    match.classId = new mongoose.Types.ObjectId(String(req.query.classId));
  }

  const perClass = await StudentAttendance.aggregate([
    { $match: match },
    { $group: { _id: { classId: '$classId', status: '$status' }, count: { $sum: 1 } } },
  ]);

  const classIds = [...new Set(perClass.map((r) => String(r._id.classId)))];
  const classes = await Class.find(scopeQuery(req, { _id: { $in: classIds } })).select('name').lean();
  const classMap = new Map(classes.map((c) => [String(c._id), c.name]));

  const byClass = new Map<string, { className: string; present: number; absent: number; late: number; leave: number }>();
  for (const r of perClass) {
    const key = String(r._id.classId);
    const agg = byClass.get(key) ?? { className: classMap.get(key) ?? '—', present: 0, absent: 0, late: 0, leave: 0 };
    const status = String(r._id.status);
    if (status in agg) (agg as any)[status] += r.count;
    byClass.set(key, agg);
  }

  const rows = [...byClass.values()].map((r) => {
    const rate = computeAttendanceRate({
      present: r.present,
      late: r.late,
      absent: r.absent,
      leave: r.leave,
    });
    return {
      className: r.className,
      present: r.present,
      absent: r.absent,
      late: r.late,
      leave: r.leave,
      total: rate.totalRecorded,
      percentage: rate.attendanceRate,
    };
  });

  if (wantsCsv(req)) {
    return sendCsv(res, `attendance-report-${month}.csv`, ['Class', 'Present', 'Absent', 'Late', 'Leave', 'Total', 'Present %'], rows.map((r) => [r.className, String(r.present), String(r.absent), String(r.late), String(r.leave), String(r.total), r.percentage.toFixed(1)]));
  }
  ok(res, { month, rows, count: rows.length });
});

/** GET /api/reports/session-overview — one row per session: classes, students, teachers, fee collection. */
export const sessionReport = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = getTenantDb(req);
  const { AcademicSession, Class, Payment, Student, StudentHistory } = getTenantModels(tenantDb);

  let sessionFilter: Record<string, any> = {};
  if (req.query.sessionId) {
    sessionFilter._id = req.query.sessionId;
  }
  sessionFilter = scopeQuery(req, sessionFilter);

  const tenantId = getTenantObjectId(req);
  const tMatch = (extra: Record<string, any>) => (tenantId ? { ...extra, tenantId } : extra);

  const sessions = await AcademicSession.find(sessionFilter).select('name isActive startDate endDate').sort({ startDate: 1 }).lean();
  const sessionIds = sessions.map((s) => s._id);

  // Grouped queries to completely eliminate sequential N+1 loops
  const [classAgg, paymentAgg, currentStudentAgg, historyStudentAgg] = await Promise.all([
    Class.aggregate([
      { $match: tMatch({ sessionId: { $in: sessionIds } }) },
      { $group: { _id: '$sessionId', count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: tMatch({ sessionId: { $in: sessionIds } }) },
      { $group: { _id: '$sessionId', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
    ]),
    Student.aggregate([
      { $match: tMatch({ sessionId: { $in: sessionIds } }) },
      { $group: { _id: '$sessionId', studentIds: { $addToSet: '$_id' } } },
    ]),
    StudentHistory.aggregate([
      { $match: tMatch({ sessionId: { $in: sessionIds } }) },
      { $group: { _id: '$sessionId', studentIds: { $addToSet: '$studentId' } } },
    ]),
  ]);

  const classCountMap = new Map(classAgg.map((c) => [String(c._id), c.count]));
  const paymentMap = new Map(paymentAgg.map((p) => [String(p._id), p]));
  const currentStudentMap = new Map(currentStudentAgg.map((s) => [String(s._id), s.studentIds]));
  const historyStudentMap = new Map(historyStudentAgg.map((s) => [String(s._id), s.studentIds]));

  const rows = sessions.map((s) => {
    const sId = String(s._id);
    const classes = classCountMap.get(sId) || 0;
    const pay = paymentMap.get(sId) || { count: 0, totalAmount: 0 };

    const cStudents = currentStudentMap.get(sId) || [];
    const hStudents = historyStudentMap.get(sId) || [];
    const allStudents = new Set([...cStudents.map(String), ...hStudents.map(String)]);

    return {
      session: s.name,
      isActive: Boolean(s.isActive),
      startDate: s.startDate ? new Date(s.startDate).toISOString().slice(0, 10) : null,
      endDate: s.endDate ? new Date(s.endDate).toISOString().slice(0, 10) : null,
      classes,
      students: allStudents.size,
      payments: pay.count,
      collectionAmount: pay.totalAmount,
    };
  });

  if (wantsCsv(req)) {
    return sendCsv(res, 'session-report.csv', ['Session', 'Active', 'Start', 'End', 'Classes', 'Students', 'Payments', 'Collection (PKR)'], rows.map((r) => [r.session, r.isActive ? 'yes' : 'no', r.startDate ?? '', r.endDate ?? '', String(r.classes), String(r.students), String(r.payments), (r.collectionAmount / 100).toFixed(2)]));
  }
  ok(res, { rows, count: rows.length });
});

/** GET /api/reports/teacher-workload — teachers, assigned classes/subjects, recent attendance %. */
export const teacherReport = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = getTenantDb(req);
  const { Teacher, TeacherAttendance } = getTenantModels(tenantDb);

  const isExport = wantsCsv(req) || req.query.format === 'csv';
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
  const limit = isExport ? 10000 : Math.min(2000, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
  const skip = (page - 1) * limit;

  const totalRecords = await Teacher.countDocuments(scopeQuery(req, { isArchived: false }));
  const totalPages = Math.ceil(totalRecords / limit) || 1;

  const teachers = await Teacher.find(scopeQuery(req, { isArchived: false }))
    .select('fullName employeeId')
    .sort({ fullName: 1 })
    .skip(isExport ? 0 : skip)
    .limit(limit)
    .lean();

  const { start: monthStart } = getSchoolMonthRange(getSchoolCurrentMonthISO());
  const teacherIds = teachers.map((t) => t._id);
  const tenantId = getTenantObjectId(req);
  const attMatch: Record<string, any> = { teacherId: { $in: teacherIds }, attendanceDate: { $gte: monthStart } };
  if (tenantId) attMatch.tenantId = tenantId;

  const [attendance] = await Promise.all([
    TeacherAttendance.aggregate([
      { $match: attMatch },
      { $group: { _id: '$teacherId', present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } }, total: { $sum: 1 } } },
    ]),
  ]);
  const attMap = new Map(attendance.map((a) => [String(a._id), a]));

  const rows = teachers.map((t) => {
    const att = attMap.get(String(t._id));
    const id = String(t._id);
    return {
      teacherId: id,
      fullName: t.fullName,
      employeeId: t.employeeId,
      attendanceThisMonth: att && att.total > 0 ? Math.round((att.present / att.total) * 1000) / 10 : null,
    };
  });
  if (wantsCsv(req)) {
    return sendCsv(res, 'teacher-report.csv', ['Teacher', 'Employee ID', 'Attendance % (month)'], rows.map((r) => [r.fullName, r.employeeId, r.attendanceThisMonth !== null ? r.attendanceThisMonth.toFixed(1) : '']));
  }
  ok(res, { rows, count: rows.length, totalRecords, totalPages, page, limit });
});
