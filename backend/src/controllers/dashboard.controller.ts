import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/apiResponse';
import { Student } from '../models/Student';
import { Teacher } from '../models/Teacher';
import { Class } from '../models/Class';
import { FeeStructure } from '../models/FeeStructure';
import { StudentAttendance } from '../models/StudentAttendance';
import { TeacherAttendance } from '../models/TeacherAttendance';
import { Payment } from '../models/Payment';
import { PaymentReversal } from '../models/PaymentReversal';
import { StudentFee } from '../models/StudentFee';

import { getTenantModels } from '../services/TenantModelRegistry';
import { Exam } from '../models/Exam';
import { Mark } from '../models/Mark';
import { Notice } from '../models/Notice';
import { Assignment } from '../models/Assignment';
import { Subject } from '../models/Subject';
import { StudentExamFee } from '../models/StudentExamFee';
import { ExamFeePayment } from '../models/ExamFeePayment';
import { computeExamResults, findResult } from '../services/exam.service';
import { AuthRequest } from '../types';
import { getOwnStudent, getOwnTeacher, type AuthedUser } from '../services/attendance.service';
import { resolveNoticeScope } from '../services/prompt7.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';
import {
  getSchoolDayRange,
  getSchoolMonthRange,
  getSchoolTodayISO,
  getSchoolCurrentMonthISO,
  SCHOOL_TIMEZONE,
} from '../utils/schoolDate';

/**
 * Dashboard analytics (Prompt 8) — compact aggregates computed in MongoDB.
 * No raw record dumps to the frontend; every number comes from real data.
 */

function dayBounds(date?: Date) {
  if (date) {
    const dateISO = new Intl.DateTimeFormat('en-CA', {
      timeZone: SCHOOL_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    const { start, endExclusive } = getSchoolDayRange(dateISO);
    return { start, end: endExclusive };
  }
  const todayISO = getSchoolTodayISO();
  const { start, endExclusive } = getSchoolDayRange(todayISO);
  return { start, end: endExclusive };
}

function monthBounds(offset = 0) {
  const currentMonthISO = getSchoolCurrentMonthISO();
  const [y, m] = currentMonthISO.split('-').map(Number);
  const totalMonths = y * 12 + (m - 1) + offset;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const targetMonthISO = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
  const { start, endExclusive } = getSchoolMonthRange(targetMonthISO);
  return { start, end: endExclusive, monthISO: targetMonthISO };
}

export const analytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user as unknown as AuthedUser;
  const tenantId = getTenantObjectId(req);
  const tMatch = (extra: Record<string, any>) => (tenantId ? { ...extra, tenantId } : extra);
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new Error('TENANT_DB_MISSING');
  const tenantModels = getTenantModels(tenantDb);

  // ── Student portal analytics ─────────────────
  if (user.role === 'student') {
    try {
      const student = await getOwnStudent(user, tenantDb);
      const today = dayBounds();
      const [attendanceSummary, upcomingFees, pendingAssignments, publishedExams, stuClass] = await Promise.all([
        StudentAttendance.aggregate([
          { $match: tMatch({ studentId: student._id }) },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        tenantModels.StudentFee.find(scopeQuery(req, { studentId: student._id, status: { $in: ['unpaid', 'partial'] } }))
          .sort({ createdAt: -1 })
          .select('feeStructureId feeType netPayable amountPaid status dueDate')
          .limit(5)
          .lean(),
        tenantModels.Assignment.find(scopeQuery(req, { classId: student.classId, isArchived: false, dueDate: { $gte: today.start } }))
          .select('title dueDate subjectId maxMarks')
          .sort({ dueDate: 1 })
          .limit(5)
          .lean(),
        Exam.find(scopeQuery(req, { classId: student.classId, isPublished: true }))
          .sort({ examDate: -1, createdAt: -1 })
          .limit(5),
        Class.findOne(scopeQuery(req, { _id: student.classId })).select('name').lean(),
      ]);
      const counts: Record<string, number> = {};
      for (const row of attendanceSummary) counts[String(row._id)] = row.count;
      const total = (counts.present ?? 0) + (counts.absent ?? 0) + (counts.late ?? 0) + (counts.leave ?? 0);
      const presentDays = (counts.present ?? 0) + (counts.late ?? 0);
      const feeStructures = await FeeStructure.find(scopeQuery(req, { _id: { $in: upcomingFees.map((f: any) => f.feeStructureId) } })).select('title').lean();
      const feeTitleMap = new Map(feeStructures.map((s: any) => [String(s._id), s.title]));

      const subIds = pendingAssignments.map((a: any) => String(a.subjectId)).filter(Boolean);
      const subjects = await Subject.find(scopeQuery(req, { _id: { $in: subIds } })).select('name').lean();
      const subjectMap = new Map(subjects.map((s: any) => [String(s._id), s.name]));

      const className = stuClass?.name ?? '—';
      const computedResults: { examName: string; className: string; percentage: number; grade: string; position: string | null }[] = [];
      for (const exam of publishedExams) {
        try {
          const results = await computeExamResults(tenantDb, exam);
          const studentRes = findResult(results, String(student._id));
          if (studentRes) {
            computedResults.push({
              examName: exam.name,
              className,
              percentage: studentRes.percentage,
              grade: studentRes.grade ?? '—',
              position: studentRes.rank ? String(studentRes.rank) : null,
            });
          }
        } catch {
          // Skip exams where grade scale or results cannot be computed
        }
      }

      return ok(res, {
        role: 'student',
        missingProfile: false,
        attendance: {
          total,
          present: counts.present ?? 0,
          absent: counts.absent ?? 0,
          late: counts.late ?? 0,
          leave: counts.leave ?? 0,
          percentage: total > 0 ? Math.round((presentDays / total) * 1000) / 10 : 0,
        },
        upcomingFees: upcomingFees.map((f: any) => ({
          _id: String(f._id),
          title: feeTitleMap.get(String(f.feeStructureId)) ?? 'Fee',
          feeType: f.feeType,
          netPayable: f.netPayable,
          amountPaid: f.amountPaid,
          remaining: (f.netPayable ?? 0) - (f.amountPaid ?? 0),
          status: f.status,
          dueDate: f.dueDate ?? null,
        })),
        pendingAssignments: pendingAssignments.map((a: any) => ({
          _id: String(a._id),
          title: a.title,
          subjectName: subjectMap.get(String(a.subjectId)) ?? null,
          dueDate: a.dueDate ?? null,
          maxMarks: a.maxMarks ?? null,
        })),
        latestResults: computedResults,
      });
    } catch (e) {
      // Fallback if the student profile is missing (e.g. user created via Users page without a profile)
      return ok(res, {
        role: 'student',
        missingProfile: true,
        attendance: { total: 0, present: 0, absent: 0, late: 0, leave: 0, percentage: 0 },
        upcomingFees: [],
        pendingAssignments: [],
        latestResults: [],
      });
    }
  }

  // ── Teacher analytics: my classes + today's own attendance ──
  if (user.role === 'teacher') {
    try {
      const today = dayBounds();

      const teacher = await getOwnTeacher(user, tenantDb);
      const allClassesDocs = await Class.find(scopeQuery(req, { isArchived: false })).select('_id name').lean();
      const classIds = allClassesDocs.map((c: any) => String(c._id));

      const [classStrengths, myAttendanceToday, recentAssignments] = await Promise.all([
        Promise.resolve(allClassesDocs),
        getTenantModels((req as any).tenantDb as mongoose.Connection).TeacherAttendance.find(scopeQuery(req, { teacherId: teacher._id, attendanceDate: { $gte: today.start, $lt: today.end } }))
          .select('status')
          .lean(),
        tenantModels.Assignment.find(scopeQuery(req, { teacherId: teacher._id, isArchived: false }))
          .select('title dueDate classId')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
      ]);
      const assignClassIds = recentAssignments.map((a: any) => String(a.classId)).filter(Boolean);
      const allClasses = await Class.find(scopeQuery(req, { _id: { $in: Array.from(new Set([...classIds, ...assignClassIds])) } })).select('name').lean();
      const classNameMap = new Map(allClasses.map((c: any) => [String(c._id), c.name]));

      return ok(res, {
        role: 'teacher',
        missingProfile: false,
        myAttendanceToday: myAttendanceToday[0]?.status ?? 'none',
        recentAssignments: recentAssignments.map((a: any) => ({
          _id: String(a._id),
          title: a.title,
          className: classNameMap.get(String(a.classId)) ?? '—',
          dueDate: a.dueDate ?? null,
        })),
      });
    } catch (e) {
      // Fallback if the teacher profile is missing
      return ok(res, {
        role: 'teacher',
        missingProfile: true,
        myAttendanceToday: 'none',
        recentAssignments: [],
      });
    }
  }

  // ── Staff analytics (admin/accountant/receptionist/super_admin) ──
  const can = (mod: string, act = 'view') => {
    const authUser = req.user as any;
    return authUser.isPlatformAdmin || (authUser.permissions?.[mod] && authUser.permissions[mod].includes(act));
  };

  const { start: todayStart, end: todayEnd } = dayBounds();
  const currentMonthISO = getSchoolCurrentMonthISO();
  const { start: thisMonthStart, endExclusive: thisMonthEnd } = getSchoolMonthRange(currentMonthISO);
  const lastSix = Array.from({ length: 6 }, (_, i) => monthBounds(i - 5));
  const sixStart = lastSix[0].start;

  const [
    studentTotal,
    teacherTotal,
    classesTotal,
    studentsByClass,
    genderSplit,
    attendanceToday,
    teacherAttendanceToday,
    paymentsToday,
    paymentReversalsToday,
    paymentsThisMonth,
    paymentReversalsThisMonth,
    feeStatusSplit,
    incomeThisMonth,
    expensesThisMonth,
    monthlyCollections,
    monthlyPaymentReversals,
    monthlyIncome,
    monthlyExpenses,
    recentNotices,
    upcomingExamsTotal,
    upcomingExamsList,
    upcomingAssignmentsList,
    examFeesAgg,
    examFeePaymentsThisMonth,
    newAdmissionsThisMonth,
  ] = await Promise.all([
    can('students') ? Student.countDocuments(scopeQuery(req, { isArchived: false })) : Promise.resolve(0),
    can('teachers') ? Teacher.countDocuments(scopeQuery(req, { isArchived: false })) : Promise.resolve(0),
    can('classes') ? Class.countDocuments(scopeQuery(req, { isArchived: false })) : Promise.resolve(0),
    can('students') ? Student.aggregate([
      { $match: tMatch({ isArchived: false }) },
      { $group: { _id: '$classId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]) : Promise.resolve([]),
    can('students') ? Student.aggregate([
      { $match: tMatch({ isArchived: false }) },
      { $group: { _id: '$gender', count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    can('studentAttendance') ? getTenantModels((req as any).tenantDb as mongoose.Connection).StudentAttendance.aggregate([
      { $match: tMatch({ attendanceDate: { $gte: todayStart, $lt: todayEnd } }) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    can('teacherAttendance') ? getTenantModels((req as any).tenantDb as mongoose.Connection).TeacherAttendance.aggregate([
      { $match: tMatch({ attendanceDate: { $gte: todayStart, $lt: todayEnd } }) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    can('payments') ? tenantModels.Payment.aggregate([
      { $match: tMatch({ paymentDate: { $gte: todayStart, $lt: todayEnd } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    can('payments') ? tenantModels.PaymentReversal.aggregate([
      { $match: tMatch({ sourceType: 'regular_fee', createdAt: { $gte: todayStart, $lt: todayEnd } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    can('payments') ? tenantModels.Payment.aggregate([
      { $match: tMatch({ paymentDate: { $gte: thisMonthStart, $lt: thisMonthEnd } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    can('payments') ? tenantModels.PaymentReversal.aggregate([
      { $match: tMatch({ sourceType: 'regular_fee', createdAt: { $gte: thisMonthStart, $lt: thisMonthEnd } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    can('fees') ? tenantModels.StudentFee.aggregate([
      { $match: tMatch({ status: { $in: ['unpaid', 'partial', 'paid'] } }) },
      { $group: { _id: '$status', amount: { $sum: '$remainingBalance' }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    can('income') ? tenantModels.Income.aggregate([
      { $match: tMatch({ isArchived: false, date: { $gte: thisMonthStart, $lt: thisMonthEnd } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    can('expenses') ? tenantModels.Expense.aggregate([
      { $match: tMatch({ isArchived: false, date: { $gte: thisMonthStart, $lt: thisMonthEnd } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    can('reports') ? tenantModels.Payment.aggregate([
      { $match: tMatch({ paymentDate: { $gte: sixStart } }) },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paymentDate', timezone: SCHOOL_TIMEZONE } }, amount: { $sum: '$amount' } } },
    ]) : Promise.resolve([]),
    can('reports') ? tenantModels.PaymentReversal.aggregate([
      { $match: tMatch({ sourceType: 'regular_fee', createdAt: { $gte: sixStart } }) },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: SCHOOL_TIMEZONE } }, amount: { $sum: '$amount' } } },
    ]) : Promise.resolve([]),
    can('reports') ? tenantModels.Income.aggregate([
      { $match: tMatch({ isArchived: false, date: { $gte: sixStart } }) },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: SCHOOL_TIMEZONE } }, amount: { $sum: '$amount' } } },
    ]) : Promise.resolve([]),
    can('reports') ? tenantModels.Expense.aggregate([
      { $match: tMatch({ isArchived: false, date: { $gte: sixStart } }) },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: SCHOOL_TIMEZONE } }, amount: { $sum: '$amount' } } },
    ]) : Promise.resolve([]),
    can('notices') ? tenantModels.Notice.find(scopeQuery(req, await resolveNoticeScope(user, req.tenantDb as mongoose.Connection))).select('title audienceType isPinned isImportant createdAt').sort({ createdAt: -1 }).limit(6).lean() : Promise.resolve([]),
    can('exams') ? Exam.countDocuments(scopeQuery(req, { isArchived: false, $or: [{ startDate: { $gte: todayStart } }, { examDate: { $gte: todayStart } }, { status: { $in: ['Scheduled', 'Ongoing'] } }] })) : Promise.resolve(0),
    can('exams') ? Exam.find(scopeQuery(req, { isArchived: false, $or: [{ startDate: { $gte: todayStart } }, { examDate: { $gte: todayStart } }, { status: { $in: ['Scheduled', 'Ongoing'] } }] }))
      .select('name startDate endDate examDate status classId')
      .sort({ startDate: 1, examDate: 1 })
      .limit(5)
      .lean() : Promise.resolve([]),
    can('assignments') ? tenantModels.Assignment.find(scopeQuery(req, { isArchived: false, dueDate: { $gte: todayStart } }))
      .select('title dueDate classId subjectId')
      .sort({ dueDate: 1 })
      .limit(5)
      .lean() : Promise.resolve([]),
    can('examFees') ? StudentExamFee.aggregate([
      { $match: tMatch({}) },
      { $group: { _id: null, expected: { $sum: '$netPayable' }, collected: { $sum: '$amountPaid' }, pending: { $sum: '$remainingBalance' }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    can('examFees') ? ExamFeePayment.aggregate([
      { $match: tMatch({ paymentDate: { $gte: thisMonthStart, $lt: thisMonthEnd } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]) : Promise.resolve([]),
    can('students') ? Student.countDocuments(
      scopeQuery(req, {
        isArchived: false,
        $or: [
          { admissionDate: { $gte: thisMonthStart, $lt: thisMonthEnd } },
          { admissionDate: { $exists: false }, createdAt: { $gte: thisMonthStart, $lt: thisMonthEnd } },
        ],
      })
    ) : Promise.resolve(0),
  ]);

  const classIds = studentsByClass.map((c: any) => c._id);
  const classNames = await Class.find(scopeQuery(req, { _id: { $in: classIds } })).select('name').lean();
  const classMap = new Map(classNames.map((c: any) => [String(c._id), c.name]));

  // Class performance from published exams (last 8) — computed per exam, per student within tenant.
  const publishedExams = await Exam.find(scopeQuery(req, { isPublished: true })).select('name classId subjects').sort({ examDate: -1 }).limit(8).lean();
  const examPerf: { exam: string; class: string; students: number; avgPercentage: number; passRate: number }[] = [];
  for (const exam of publishedExams) {
    const marks = await Mark.find(scopeQuery(req, { examId: exam._id })).select('studentId subjectId marksObtained').lean();
    if (marks.length === 0) continue;
    const perStudent = new Map<string, { obtained: number; max: number; failed: number }>();
    const subjectMax = new Map(exam.subjects.map((s: any) => [String(s.subjectId), { max: s.maxMarks, pass: s.passMarks ?? 0 }]));
    for (const m of marks) {
      const key = String(m.studentId);
      const agg = perStudent.get(key) ?? { obtained: 0, max: 0, failed: 0 };
      const sub = subjectMax.get(String(m.subjectId)) ?? { max: 100, pass: 0 };
      agg.obtained += m.marksObtained;
      agg.max += sub.max;
      if (sub.pass > 0 && m.marksObtained < sub.pass) agg.failed += 1;
      perStudent.set(key, agg);
    }
    const students = [...perStudent.values()];
    const avgPercentage = students.length
      ? Math.round((students.reduce((s, v) => s + (v.max > 0 ? (v.obtained / v.max) * 100 : 0), 0) / students.length) * 100) / 100
      : 0;
    const passRate = students.length ? Math.round((students.filter((v) => v.failed === 0).length / students.length) * 1000) / 10 : 0;
    examPerf.push({
      exam: exam.name,
      class: exam.classIds && exam.classIds.length > 0 
        ? exam.classIds.map(id => classMap.get(String(id)) ?? '—').join(', ') 
        : (classMap.get(String(exam.classId)) ?? '—'),
      students: students.length,
      avgPercentage,
      passRate,
    });
  }

  const attendanceTodayCounts: Record<string, number> = {};
  for (const r of attendanceToday) attendanceTodayCounts[String(r._id)] = r.count;
  const teacherAttCounts: Record<string, number> = {};
  for (const r of teacherAttendanceToday) teacherAttCounts[String(r._id)] = r.count;

  const feeSplit: Record<string, { amount: number; count: number }> = {};
  for (const r of feeStatusSplit as any[]) feeSplit[String(r._id)] = { amount: r.amount, count: r.count };
  const pendingFeesAmount = (feeSplit.unpaid?.amount ?? 0) + (feeSplit.partial?.amount ?? 0);

  const rawPaymentsThisMonth = paymentsThisMonth[0]?.amount ?? 0;
  const reversalsThisMonthAmount = paymentReversalsThisMonth[0]?.amount ?? 0;
  const netCollectionThisMonth = rawPaymentsThisMonth - reversalsThisMonthAmount;

  const rawPaymentsToday = paymentsToday[0]?.amount ?? 0;
  const reversalsTodayAmount = paymentReversalsToday[0]?.amount ?? 0;
  const netCollectionToday = rawPaymentsToday - reversalsTodayAmount;

  const revMonthMap = new Map(monthlyPaymentReversals.map((r: any) => [r._id, r.amount]));
  const monthly = lastSix.map(({ monthISO }) => {
    const rawCol = monthlyCollections.find((m: any) => m._id === monthISO)?.amount ?? 0;
    const revCol = revMonthMap.get(monthISO) ?? 0;
    return {
      month: monthISO,
      collection: rawCol - revCol,
      income: monthlyIncome.find((m: any) => m._id === monthISO)?.amount ?? 0,
      expenses: monthlyExpenses.find((m: any) => m._id === monthISO)?.amount ?? 0,
    };
  });

  const genderCounts: Record<string, number> = {};
  for (const g of genderSplit) genderCounts[String(g._id)] = g.count;

  const upcomingActivities: Array<{ id: string; type: 'exam' | 'assignment' | 'notice'; title: string; subtitle?: string; date: Date | string; status?: string }> = [];
  for (const ex of upcomingExamsList) {
    const examDt = ex.startDate || ex.examDate;
    upcomingActivities.push({
      id: String(ex._id),
      type: 'exam',
      title: ex.name,
      subtitle: examDt ? `Starts ${new Date(examDt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Scheduled',
      date: examDt || new Date(),
      status: ex.status,
    });
  }
  for (const a of upcomingAssignmentsList) {
    upcomingActivities.push({
      id: String(a._id),
      type: 'assignment',
      title: a.title,
      subtitle: a.dueDate ? `Due ${new Date(a.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Pending',
      date: a.dueDate || new Date(),
      status: 'Due Soon',
    });
  }
  for (const n of recentNotices.slice(0, 3)) {
    upcomingActivities.push({
      id: String(n._id),
      type: 'notice',
      title: n.title,
      subtitle: n.audienceType ? `${n.audienceType} Notice` : 'Notice',
      date: n.createdAt,
      status: n.isImportant ? 'Important' : 'General',
    });
  }

  const calendarEvents = [
    ...upcomingExamsList.map((e: any) => ({
      id: String(e._id),
      title: e.name,
      date: e.startDate || e.examDate,
      type: 'exam',
    })),
    ...upcomingAssignmentsList.map((a: any) => ({
      id: String(a._id),
      title: a.title,
      date: a.dueDate,
      type: 'assignment',
    })),
    ...recentNotices.map((n) => ({
      id: String(n._id),
      title: n.title,
      date: n.createdAt,
      type: 'notice',
    })),
  ].filter((ev) => Boolean(ev.date));

  ok(res, {
    role: 'staff',
    totals: {
      students: studentTotal,
      teachers: teacherTotal,
      classes: classesTotal,
      upcomingExams: upcomingExamsTotal,
      newAdmissionsThisMonth,
    },
    genderSplit: genderCounts,
    studentsByClass: studentsByClass.slice(0, 10).map((c: any) => ({
      classId: String(c._id),
      className: classMap.get(String(c._id)) ?? '—',
      count: c.count,
    })),
    attendanceToday: {
      total: Object.values(attendanceTodayCounts).reduce((sum, count) => sum + count, 0),
      present: attendanceTodayCounts.present ?? 0,
      absent: attendanceTodayCounts.absent ?? 0,
      late: attendanceTodayCounts.late ?? 0,
      leave: attendanceTodayCounts.leave ?? 0,
    },
    teacherAttendanceToday: {
      present: teacherAttCounts.present ?? 0,
      absent: teacherAttCounts.absent ?? 0,
      late: teacherAttCounts.late ?? 0,
      leave: teacherAttCounts.leave ?? 0,
    },
    finance: {
      todayGrossCollection: rawPaymentsToday,
      todayReversals: reversalsTodayAmount,
      todayNetCollection: netCollectionToday,
      todayCollection: netCollectionToday,
      monthGrossCollection: rawPaymentsThisMonth,
      monthReversals: reversalsThisMonthAmount,
      monthNetCollection: netCollectionThisMonth,
      collectionThisMonth: netCollectionThisMonth,
      paymentsThisMonth: paymentsThisMonth[0]?.count ?? 0,
      paymentsToday: paymentsToday[0]?.count ?? 0,
      pendingFees: feeSplit.unpaid?.count ?? 0,
      pendingFeesAmount,
      partialFees: feeSplit.partial?.count ?? 0,
      paidFees: feeSplit.paid?.count ?? 0,
      incomeThisMonth: incomeThisMonth[0]?.amount ?? 0,
      expensesThisMonth: expensesThisMonth[0]?.amount ?? 0,
      monthlyFeeCollected: netCollectionThisMonth,
      monthlyFeePending: pendingFeesAmount,
      examFeeCollected: examFeesAgg[0]?.collected ?? 0,
      examFeePending: examFeesAgg[0]?.pending ?? 0,
      examFeeCollectedThisMonth: examFeePaymentsThisMonth[0]?.amount ?? 0,
    },
    monthly,
    classPerformance: examPerf.slice(0, 10),
    recentNotices: recentNotices.map((n) => ({
      _id: String(n._id),
      title: n.title,
      audienceType: n.audienceType,
      isPinned: n.isPinned,
      isImportant: n.isImportant,
      createdAt: n.createdAt,
    })),
    upcomingActivities,
    calendarEvents,
  });
});


