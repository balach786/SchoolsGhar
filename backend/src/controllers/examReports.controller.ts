import { Response } from 'express';
import { AuthRequest } from '../types';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok } from '../utils/apiResponse';
import { getTenantModels } from '../services/TenantModelRegistry';
import { computeExamResults, round2 } from '../services/exam.service';
import { sendCsv, wantsCsv } from '../utils/csv';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

/** GET /api/exam-reports/dashboard — metrics for Exam Management Dashboard */
export const getExamDashboardMetrics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { sessionId, examId, classId } = req.query;
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Exam, StudentExamFee, ExamFeePayment, Expense, Student, Class, Section, Subject, Mark, GradeScale } = getTenantModels(tenantDb);
  const tenantId = getTenantObjectId(req);
  const now = new Date();

  const examFilter: Record<string, any> = { isArchived: false };
  if (sessionId) examFilter.sessionId = sessionId;
  if (classId) examFilter.classId = classId;
  if (examId) examFilter._id = examId;

  const exams = await Exam.find(scopeQuery(req, examFilter)).lean();
  const examIds = exams.map((e) => e._id);

  let upcomingCount = 0;
  let ongoingCount = 0;
  let completedCount = 0;
  let resultsPendingCount = 0;
  let resultsPublishedCount = 0;

  for (const e of exams) {
    if (e.isPublished) resultsPublishedCount++;
    else if (e.status === 'Results Pending') resultsPendingCount++;

    if (e.startDate && new Date(e.startDate) > now) {
      upcomingCount++;
    } else if (e.startDate && e.endDate && new Date(e.startDate) <= now && new Date(e.endDate) >= now) {
      ongoingCount++;
    } else if ((e.endDate && new Date(e.endDate) < now) || ['Completed', 'Results Pending', 'Published'].includes(e.status)) {
      completedCount++;
    } else {
      upcomingCount++;
    }
  }

  // Fees aggregation
  const feeMatch: Record<string, any> = { examId: { $in: examIds } };
  if (tenantId) feeMatch.tenantId = tenantId;
  if (classId) feeMatch.classId = classId;

  const feeAgg = await StudentExamFee.aggregate([
    { $match: feeMatch },
    {
      $group: {
        _id: null,
        expected: { $sum: '$netPayable' },
        collected: { $sum: '$amountPaid' },
        pending: { $sum: '$remainingBalance' },
      },
    },
  ]);

  const f = feeAgg[0] || { expected: 0, collected: 0, pending: 0 };

  // Canonical Eligible Students (Decoupled from Fees)
  const targetMatches: any[] = [];
  for (const e of exams) {
    const cids = (e.classIds && e.classIds.length > 0) ? e.classIds : (e.classId ? [e.classId] : []);
    let finalCids = cids;
    if (classId) {
      finalCids = cids.filter((cid: any) => String(cid) === String(classId));
    }
    if (finalCids.length > 0) {
      targetMatches.push({
        classId: { $in: finalCids },
        sessionId: e.sessionId,
      });
    }
  }

  let eligibleStudentsCount = 0;
  if (targetMatches.length > 0) {
    const studentFilter = scopeQuery(req, {
      $or: targetMatches,
      isActive: true,
      isArchived: false,
    });
    eligibleStudentsCount = await Student.countDocuments(studentFilter);
  }


  // Expenses aggregation
  const expenseMatch: Record<string, any> = { isArchived: false, category: 'Exam Expense', examId: { $in: examIds } };
  if (tenantId) expenseMatch.tenantId = tenantId;

  const [expenseAgg, expenseByCategory] = await Promise.all([
    Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: null, totalExpense: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: '$category', totalAmount: { $sum: '$amount' } } },
      { $sort: { totalAmount: -1 } },
    ]),
  ]);

  const totalExpenses = expenseAgg[0]?.totalExpense || 0;
  // Net Exam Balance = Exam Fees Collected - Exam Expenses (never mixing monthly fees!)
  const netExamBalance = f.collected - totalExpenses;

  // Pass percentage for target exam or recent published exam
  let passPercentage = 0;
  let targetExam = examId ? exams.find((e) => String(e._id) === String(examId)) : exams[0];
  if (targetExam) {
    const results = await computeExamResults(tenantDb, targetExam as any);
    if (results.length > 0) {
      const passedCount = results.filter((r) => {
        // Passed if not absent and all subjects pass
        const hasFail = r.rows.some((row) => row.status === 'fail' || row.status === 'absent');
        return !hasFail;
      }).length;
      passPercentage = round2((passedCount / results.length) * 100);
    }
  }

  ok(res, {
    totalExams: exams.length,
    upcomingExams: upcomingCount,
    ongoingExams: ongoingCount,
    completedExams: completedCount,
    studentsInExam: eligibleStudentsCount,
    expectedExamFees: f.expected,
    collectedExamFees: f.collected,
    pendingExamFees: f.pending,
    totalExamExpenses: totalExpenses,
    netExamBalance,
    resultsPending: resultsPendingCount,
    resultsPublished: resultsPublishedCount,
    passPercentage,
    expenseBreakdown: expenseByCategory.map((c) => ({
      category: c._id,
      amount: c.totalAmount,
    })),
  });
});

/** GET /api/exam-reports/summary?examId= */
export const getExamSummaryReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { examId } = req.query;
  if (!examId) throw ApiError.badRequest('examId is required', 'EXAM_REQUIRED');
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Exam, StudentExamFee, ExamFeePayment, Expense, Student, Class, Section, Subject, Mark, GradeScale } = getTenantModels(tenantDb);
  const tenantId = getTenantObjectId(req);

  const exam = await Exam.findOne(scopeQuery(req, { _id: examId }));
  if (!exam) throw ApiError.notFound('Exam not found');

  const results = await computeExamResults(tenantDb, exam);
  const totalStudents = results.length;

  let appeared = 0;
  let absent = 0;
  let passed = 0;
  let failed = 0;
  let totalPct = 0;

  for (const r of results) {
    const isAllAbsent = r.rows.every((row) => row.status === 'absent');
    if (isAllAbsent) {
      absent++;
    } else {
      appeared++;
      totalPct += r.percentage;
      const hasFailedSubject = r.rows.some((row) => row.status === 'fail');
      if (hasFailedSubject) failed++;
      else passed++;
    }
  }

  const passPercentage = appeared > 0 ? round2((passed / appeared) * 100) : 0;
  const classAverage = appeared > 0 ? round2(totalPct / appeared) : 0;

  // Admit Cards Issued calculation based on authoritative logic
  let admitCardsIssued = totalStudents;
  if (exam.requireExamFeeForAdmitCard) {
    const { AdmitCardOverride } = getTenantModels(tenantDb);
    const [paidFeeStudents, overrides] = await Promise.all([
      StudentExamFee.find(scopeQuery(req, { examId: exam._id, status: 'paid' })).select('studentId').lean(),
      AdmitCardOverride.find(scopeQuery(req, { examId: exam._id })).select('studentId').lean(),
    ]);
    const eligibleStudentIds = new Set<string>();
    for (const f of paidFeeStudents) eligibleStudentIds.add(String(f.studentId));
    for (const o of overrides) eligibleStudentIds.add(String(o.studentId));
    admitCardsIssued = eligibleStudentIds.size;
  }

  // Net Exam Balance calculation (Exam Fees Collected - Exam Expenses)
  const feeMatch: Record<string, any> = { examId: exam._id };
  if (tenantId) feeMatch.tenantId = tenantId;
  const expenseMatch: Record<string, any> = { isArchived: false, category: 'Exam Expense', examId: exam._id };
  if (tenantId) expenseMatch.tenantId = tenantId;

  const [feeAgg, expenseAgg] = await Promise.all([
    StudentExamFee.aggregate([
      { $match: feeMatch },
      { $group: { _id: null, collected: { $sum: '$amountPaid' } } },
    ]),
    Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: null, totalExpense: { $sum: '$amount' } } },
    ]),
  ]);
  const collectedExamFees = feeAgg[0]?.collected || 0;
  const totalExamExpenses = expenseAgg[0]?.totalExpense || 0;
  const netBalance = collectedExamFees - totalExamExpenses;

  ok(res, {
    examName: exam.name,
    totalStudents,
    admitCardsIssued,
    appeared,
    absent,
    passed,
    failed,
    passedCount: passed,
    failedCount: failed,
    passPercentage,
    passRate: passPercentage,
    classAverage,
    netBalance,
    exam: {
      status: exam.status,
      requireExamFeeForAdmitCard: exam.requireExamFeeForAdmitCard,
      name: exam.name,
    },
    subjectCount: exam.subjects?.length || 0,
    classCount: exam.classIds?.length || 1,
  });
});

/** GET /api/exam-reports/fees?examId=&classId= */
export const getExamFeeReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Exam, StudentExamFee, ExamFeePayment, Expense, Student, Class, Section, Subject, Mark, GradeScale } = getTenantModels(tenantDb);
  const { examId, classId, sectionId, status } = req.query;
  const filter: Record<string, any> = {};
  if (examId) filter.examId = examId;
  if (classId) filter.classId = classId;
  if (sectionId) filter.sectionId = sectionId;
  if (status) filter.status = status;

  const fees = await StudentExamFee.find(scopeQuery(req, filter)).lean();
  const studentIds = Array.from(new Set(fees.map((f) => String(f.studentId))));
  const classIds = Array.from(new Set(fees.map((f) => String(f.classId)).filter(Boolean)));

  const [students, classes] = await Promise.all([
    Student.find(scopeQuery(req, { _id: { $in: studentIds } })).select('fullName admissionNumber rollNumber classId').lean(),
    Class.find(scopeQuery(req, { _id: { $in: classIds } })).select('name').lean(),
  ]);
  const studentMap = new Map(students.map((s) => [String(s._id), s]));
  const classMap = new Map(classes.map((c) => [String(c._id), c.name]));

  let expected = 0;
  let collected = 0;
  let pending = 0;
  let paidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;
  let waivedCount = 0;

  const studentsRoster = fees.map((f) => {
    expected += f.netPayable;
    collected += f.amountPaid;
    pending += f.remainingBalance;

    if (f.status === 'paid') paidCount++;
    else if (f.status === 'partial') partialCount++;
    else if (f.status === 'unpaid') unpaidCount++;
    else if (f.status === 'waived') waivedCount++;

    const st = studentMap.get(String(f.studentId));
    const className = classMap.get(String(f.classId)) || classMap.get(String(st?.classId)) || '—';

    return {
      name: st?.fullName ?? '—',
      studentName: st?.fullName ?? '—',
      admissionNumber: st?.admissionNumber ?? '—',
      rollNumber: st?.rollNumber ?? '—',
      className,
      totalFee: f.netPayable,
      netPayable: f.netPayable,
      paidAmount: f.amountPaid,
      amountPaid: f.amountPaid,
      dueAmount: f.remainingBalance,
      remainingBalance: f.remainingBalance,
      originalAmount: f.originalAmount,
      discountAmount: f.discountAmount,
      fineAmount: f.fineAmount,
      status: f.status,
    };
  });

  const collectionRate = expected > 0 ? (collected / expected) * 100 : 0;

  if (wantsCsv(req)) {
    return sendCsv(res, `exam-fee-report-${new Date().toISOString().slice(0, 10)}.csv`, [
      'Student',
      'Admission No',
      'Roll No',
      'Class',
      'Net Payable (PKR)',
      'Paid (PKR)',
      'Remaining (PKR)',
      'Status',
    ], studentsRoster.map((r) => [
      r.studentName,
      r.admissionNumber,
      r.rollNumber,
      r.className,
      (r.netPayable / 100).toFixed(2),
      (r.amountPaid / 100).toFixed(2),
      (r.remainingBalance / 100).toFixed(2),
      r.status,
    ]));
  }

  ok(res, {
    totalBilled: expected,
    totalExpected: expected,
    totalCollected: collected,
    totalPending: pending,
    collectionRate,
    expected,
    collected,
    pending,
    paidCount,
    partialCount,
    unpaidCount,
    waivedCount,
    totalStudents: fees.length,
    summary: {
      expected,
      collected,
      pending,
      paidCount,
      partialCount,
      unpaidCount,
      waivedCount,
      totalStudents: fees.length,
    },
    students: studentsRoster,
    rows: studentsRoster,
  });
});

/** GET /api/exam-reports/financial-summary?examId= */
export const getExamFinancialSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { examId } = req.query;
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Exam, StudentExamFee, ExamFeePayment, Expense, Student, Class, Section, Subject, Mark, GradeScale } = getTenantModels(tenantDb);
  const tenantId = getTenantObjectId(req);

  const feeMatch: Record<string, any> = {};
  if (examId) feeMatch.examId = new mongoose.Types.ObjectId(examId as string);
  if (tenantId) feeMatch.tenantId = tenantId;

  const expenseMatch: Record<string, any> = { isArchived: false, category: 'Exam Expense' };
  if (examId) expenseMatch.examId = new mongoose.Types.ObjectId(examId as string);
  if (tenantId) expenseMatch.tenantId = tenantId;

  const [feeAgg, expenseAgg, categoryAgg] = await Promise.all([
    StudentExamFee.aggregate([
      { $match: feeMatch },
      {
        $group: {
          _id: null,
          totalBilled: { $sum: '$netPayable' },
          totalCollected: { $sum: '$amountPaid' },
          totalPending: { $sum: '$remainingBalance' },
        },
      },
    ]),
    Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: null, totalExpense: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: '$category', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
  ]);

  const f = feeAgg[0] || { totalBilled: 0, totalCollected: 0, totalPending: 0 };
  const totalExpense = expenseAgg[0]?.totalExpense || 0;
  const expenseCount = expenseAgg[0]?.count || 0;
  const netExamBalance = f.totalCollected - totalExpense;
  const margin = f.totalCollected > 0 ? (netExamBalance / f.totalCollected) * 100 : 0;
  const expenseCategories = categoryAgg.map((c) => ({
    category: c._id || 'General',
    count: c.count,
    amount: c.amount,
  }));

  if (wantsCsv(req)) {
    return sendCsv(res, `exam-financial-summary-${new Date().toISOString().slice(0, 10)}.csv`, [
      'Metric',
      'Amount (PKR)',
    ], [
      ['Expected Exam Fees Billed', (f.totalBilled / 100).toFixed(2)],
      ['Collected Exam Fees', (f.totalCollected / 100).toFixed(2)],
      ['Pending Exam Fees', (f.totalPending / 100).toFixed(2)],
      ['Total Exam Expenses', (totalExpense / 100).toFixed(2)],
      ['Net Exam Balance (Collected - Expenses)', (netExamBalance / 100).toFixed(2)],
      ['Profit Margin (%)', `${margin.toFixed(1)}%`],
    ]);
  }

  ok(res, {
    totalBilled: f.totalBilled,
    totalCollected: f.totalCollected,
    totalPending: f.totalPending,
    totalExpenses: totalExpense,
    expenseCount,
    margin,
    netBalance: netExamBalance,
    expenseCategories,
    // legacy compatibility
    expectedFees: f.totalBilled,
    collectedFees: f.totalCollected,
    pendingFees: f.totalPending,
    netExamBalance,
  });
});

/** GET /api/exam-reports/net-balance?examId= */
export const getNetExamBalance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { examId } = req.query;
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Exam, StudentExamFee, ExamFeePayment, Expense, Student, Class, Section, Subject, Mark, GradeScale } = getTenantModels(tenantDb);
  const tenantId = getTenantObjectId(req);

  const feeMatch: Record<string, any> = {};
  if (examId) feeMatch.examId = new mongoose.Types.ObjectId(examId as string);
  if (tenantId) feeMatch.tenantId = tenantId;

  const expenseMatch: Record<string, any> = { isArchived: false, category: 'Exam Expense' };
  if (examId) expenseMatch.examId = new mongoose.Types.ObjectId(examId as string);
  if (tenantId) expenseMatch.tenantId = tenantId;

  const [feeAgg, expenseAgg, examDoc] = await Promise.all([
    StudentExamFee.aggregate([
      { $match: feeMatch },
      {
        $group: {
          _id: null,
          collected: { $sum: '$amountPaid' },
        },
      },
    ]),
    Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: null, totalExpense: { $sum: '$amount' } } },
    ]),
    examId ? Exam.findOne(scopeQuery(req, { _id: examId })).select('name').lean() : null,
  ]);

  const collected = feeAgg[0]?.collected || 0;
  const totalExpense = expenseAgg[0]?.totalExpense || 0;
  const netBalance = collected - totalExpense;

  ok(res, {
    examId: examId ? String(examId) : 'all',
    examName: examDoc?.name ?? 'All Examinations',
    collectedFees: collected,
    totalExpenses: totalExpense,
    netBalance,
    status: netBalance > 0 ? 'surplus' : netBalance < 0 ? 'deficit' : 'break-even',
  });
});

/** GET /api/exam-reports/subject-performance?examId= */
export const getSubjectPerformanceReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Exam, StudentExamFee, ExamFeePayment, Expense, Student, Class, Section, Subject, Mark, GradeScale } = getTenantModels(tenantDb);
  const { examId, classId } = req.query;
  if (!examId) throw ApiError.badRequest('examId is required', 'EXAM_REQUIRED');

  const exam = await Exam.findOne(scopeQuery(req, { _id: examId }));
  if (!exam) throw ApiError.notFound('Exam not found');

  const markFilter: Record<string, any> = { examId: exam._id };
  if (classId && classId !== 'all') markFilter.classId = classId;

  const marks = await Mark.find(scopeQuery(req, markFilter)).lean();
  const subjectIds = Array.from(new Set(marks.map((m) => String(m.subjectId))));
  const subjects = await Subject.find(scopeQuery(req, { _id: { $in: subjectIds } })).select('name code').lean();
  const subMap = new Map(subjects.map((s) => [String(s._id), s]));

  const examSubjectMap = new Map(exam.subjects.map((s) => [String(s.subjectId), s]));

  const bySubject = new Map<
    string,
    { total: number; count: number; absent: number; highest: number; lowest: number; passed: number; failed: number }
  >();

  for (const m of marks) {
    const subId = String(m.subjectId);
    let stat = bySubject.get(subId);
    if (!stat) {
      stat = { total: 0, count: 0, absent: 0, highest: 0, lowest: 0, passed: 0, failed: 0 };
      bySubject.set(subId, stat);
    }
    if (m.isAbsent) {
      stat.absent++;
      continue;
    }
    stat.total += m.marksObtained;
    if (stat.count === 0) {
      stat.highest = m.marksObtained;
      stat.lowest = m.marksObtained;
    } else {
      if (m.marksObtained > stat.highest) stat.highest = m.marksObtained;
      if (m.marksObtained < stat.lowest) stat.lowest = m.marksObtained;
    }
    stat.count++;

    const passMarks = examSubjectMap.get(subId)?.passMarks ?? 0;
    if (m.marksObtained >= passMarks) stat.passed++;
    else stat.failed++;
  }

  const rows = [...bySubject.entries()].map(([subId, stat]) => {
    const sub = subMap.get(subId);
    const examSub = examSubjectMap.get(subId);
    const passRate = stat.count > 0 ? round2((stat.passed / stat.count) * 100) : 0;
    const average = stat.count > 0 ? round2(stat.total / stat.count) : 0;
    return {
      subjectId: subId,
      subjectName: sub?.name ?? '—',
      subjectCode: sub?.code ?? '—',
      appearedCount: stat.count,
      absentCount: stat.absent,
      maxMarks: examSub?.maxMarks ?? 100,
      highestMarks: stat.highest,
      lowestMarks: stat.lowest,
      averageMarks: average,
      passPercentage: passRate,
      // aliases for backwards compatibility
      highest: stat.highest,
      lowest: stat.lowest,
      average,
      passed: stat.passed,
      failed: stat.failed,
      passRate,
    };
  });

  if (wantsCsv(req)) {
    return sendCsv(res, `subject-performance-${new Date().toISOString().slice(0, 10)}.csv`, [
      'Subject',
      'Code',
      'Appeared',
      'Absent',
      'Max Marks',
      'Highest',
      'Lowest',
      'Average',
      'Pass %',
    ], rows.map((r) => [
      r.subjectName,
      r.subjectCode,
      String(r.appearedCount),
      String(r.absentCount),
      String(r.maxMarks),
      String(r.highestMarks),
      String(r.lowestMarks),
      r.averageMarks.toFixed(1),
      `${r.passPercentage}%`,
    ]));
  }

  ok(res, rows);
});

/** GET /api/exam-reports/class-results?examId= */
export const getClassResultsReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Exam, StudentExamFee, ExamFeePayment, Expense, Student, Class, Section, Subject, Mark, GradeScale } = getTenantModels(tenantDb);
  const { examId, classId } = req.query;
  if (!examId) throw ApiError.badRequest('examId is required', 'EXAM_REQUIRED');

  const exam = await Exam.findOne(scopeQuery(req, { _id: examId }));
  if (!exam) throw ApiError.notFound('Exam not found');

  const results = await computeExamResults(tenantDb, exam);
  const studentIds = results.map((r) => r.studentId);
  const students = await Student.find(scopeQuery(req, { _id: { $in: studentIds } }))
    .select('fullName admissionNumber rollNumber classId')
    .lean();
  const examClassIds = exam.classIds && exam.classIds.length > 0 ? exam.classIds.map(String) : (exam.classId ? [String(exam.classId)] : []);
  const classIds = Array.from(new Set(students.map((s) => String(s.classId)).concat(examClassIds)));
  const classes = await Class.find(scopeQuery(req, { _id: { $in: classIds } })).select('name').lean();
  const studentMap = new Map(students.map((s) => [String(s._id), s]));
  const classMap = new Map(classes.map((c) => [String(c._id), c.name]));

  const rows = results
    .filter((r) => {
      if (!classId || classId === 'all') return true;
      const st = studentMap.get(r.studentId);
      return String(st?.classId) === String(classId);
    })
    .map((r) => {
      const st = studentMap.get(r.studentId);
      const isAllAbsent = r.rows.every((row) => row.status === 'absent');
      const hasFail = r.rows.some((row) => row.status === 'fail' || row.status === 'absent');
      const status = isAllAbsent ? 'absent' : (hasFail ? 'failed' : 'passed');
      const examClassIds = exam.classIds && exam.classIds.length > 0 ? exam.classIds.map(String) : (exam.classId ? [String(exam.classId)] : []);
      const fallbackClassId = examClassIds.length > 0 ? examClassIds[0] : '—';
      const className = classMap.get(String(st?.classId)) || classMap.get(fallbackClassId) || '—';

      return {
        studentName: st?.fullName ?? '—',
        admissionNumber: st?.admissionNumber ?? '—',
        rollNumber: st?.rollNumber ?? '—',
        className,
        obtainedMarks: r.totalObtained,
        totalMarks: r.totalMax,
        totalObtained: r.totalObtained,
        totalMax: r.totalMax,
        percentage: r.percentage,
        grade: r.grade ?? '—',
        status, // canonical 'passed' | 'failed' | 'absent'
        rank: r.rank,
      };
    });

  if (wantsCsv(req)) {
    return sendCsv(res, `class-results-${new Date().toISOString().slice(0, 10)}.csv`, [
      'Rank',
      'Student',
      'Admission No',
      'Roll No',
      'Class',
      'Total Marks',
      'Obtained Marks',
      'Percentage',
      'Grade',
      'Status',
    ], rows.map((r) => [
      String(r.rank),
      r.studentName,
      r.admissionNumber,
      r.rollNumber,
      r.className,
      String(r.totalMarks),
      String(r.obtainedMarks),
      `${r.percentage}%`,
      r.grade,
      r.status,
    ]));
  }

  ok(res, rows);
});
