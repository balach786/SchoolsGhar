import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import { getTenantModels } from '../services/TenantModelRegistry';
import { getSchoolCustomRange, SCHOOL_TIMEZONE } from '../utils/schoolDate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok } from '../utils/apiResponse';
import { Payment } from '../models/Payment';
import { StudentFee } from '../models/StudentFee';

import { SalaryRecord } from '../models/SalaryRecord';
import { Student } from '../models/Student';
import { Teacher } from '../models/Teacher';
import { sendCsv, wantsCsv } from '../utils/csv';
import { buildLedger } from '../services/finance.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

/** Midnight-UTC boundaries (same convention as attendance). */
function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

import { ExamFeePayment } from '../models/ExamFeePayment';
import { PaymentReversal } from '../models/PaymentReversal';

/** GET /api/finance/dashboard — compact real-time aggregations. */
export const dashboard = asyncHandler(async (req: AuthRequest, res: Response) => {
  const isProvisioned = (req as any).tenant?.isDatabaseProvisioned === true;
  const now = new Date();
  const { start: todayStart, end: todayEnd } = dayBounds(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const tenantId = getTenantObjectId(req);

  const tMatch = (extra: Record<string, any>) => (tenantId ? { ...extra, tenantId } : extra);

  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Expense, Income, SalaryRecord, Payment, StudentFee, ExamFeePayment, PaymentReversal, Student } = getTenantModels(tenantDb);

  const [
    todayPay,
    monthPay,
    pendingAgg,
    paidAgg,
    partialAgg,
    incomeMonth,
    expenseMonth,
    salaryMonth,
    examFeeMonthAgg,
    examExpenseMonthAgg,
    reversalMonthAgg,
    recent,
  ] = await Promise.all([
    Payment.aggregate([
      { $match: tMatch({ paymentDate: { $gte: todayStart, $lt: todayEnd } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: tMatch({ paymentDate: { $gte: monthStart } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    StudentFee.aggregate([
      { $match: tMatch({ status: { $in: ['unpaid', 'partial'] } }) },
      { $group: { _id: null, amount: { $sum: '$remainingBalance' }, count: { $sum: 1 } } },
    ]),
    StudentFee.aggregate([
      { $match: tMatch({ status: 'paid' }) },
      { $group: { _id: null, amount: { $sum: '$netPayable' }, count: { $sum: 1 } } },
    ]),
    StudentFee.aggregate([
      { $match: tMatch({ status: 'partial' }) },
      { $group: { _id: null, amount: { $sum: '$remainingBalance' }, count: { $sum: 1 } } },
    ]),
    Income.aggregate([
      { $match: tMatch({ isArchived: false, date: { $gte: monthStart } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: tMatch({ isArchived: false, date: { $gte: monthStart } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    SalaryRecord.aggregate([
      { $match: tMatch({ salaryMonth: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}` }) },
      {
        $group: {
          _id: null,
          amount: { $sum: '$netAmount' },
          paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
          paidAmount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$netAmount', 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
    ExamFeePayment.aggregate([
      { $match: tMatch({ paymentDate: { $gte: monthStart } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: tMatch({ isArchived: false, category: 'Exam Expense', date: { $gte: monthStart } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    PaymentReversal.aggregate([
      { $match: tMatch({ createdAt: { $gte: monthStart } }) },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.find(scopeQuery(req, {})).sort({ createdAt: -1 }).limit(8).select('amount receiptNumber studentId paymentMethod paymentDate').lean(),
  ]);

  const studentIds = Array.from(new Set(recent.map((p: any) => String(p.studentId))));
  const students = await Student.find(scopeQuery(req, { _id: { $in: studentIds } })).select('fullName admissionNumber').lean();
  const studentMap = new Map(students.map((s) => [String(s._id), s]));

  const g = (arr: any[]) => (arr.length ? arr[0] : { amount: 0, count: 0, paid: 0, paidAmount: 0 });
  const today = g(todayPay);
  const month = g(monthPay);
  const pending = g(pendingAgg);
  const paid = g(paidAgg);
  const partial = g(partialAgg);
  const income = g(incomeMonth);
  const expense = g(expenseMonth);
  const salary = g(salaryMonth);
  const examFeeMonth = g(examFeeMonthAgg);
  const examExpenseMonth = g(examExpenseMonthAgg);
  const reversalMonth = g(reversalMonthAgg);

  // Semantics:
  // outstandingBalance counts each pending obligation (unpaid or partial remaining balance) once.
  // pending.amount already matches { status: { $in: ['unpaid', 'partial'] } }, so adding partial.amount double counted.
  const outstandingBalance = pending.amount;

  // Revenue / Outflow Semantics:
  const regularFeeCollected = month.amount;
  const examFeeCollected = examFeeMonth.amount;
  const miscellaneousIncome = income.amount;
  const operatingExpenses = expense.amount + examExpenseMonth.amount;
  const salaryPaid = salary.paidAmount ?? 0;
  const refundsThisMonth = reversalMonth.amount;

  const totalRevenue = regularFeeCollected + examFeeCollected + miscellaneousIncome;
  const totalOutflow = operatingExpenses + salaryPaid + refundsThisMonth;
  const netCashFlow = totalRevenue - totalOutflow;

  ok(res, {
    todayCollection: { amount: today.amount, count: today.count },
    monthCollection: { amount: month.amount, count: month.count },
    pendingFees: { amount: pending.amount, count: pending.count },
    paidFees: { amount: paid.amount, count: paid.count },
    partialFees: { amount: partial.amount, count: partial.count },
    outstandingBalance,
    incomeThisMonth: { amount: income.amount, count: income.count },
    expensesThisMonth: { amount: expense.amount, count: expense.count },
    salariesThisMonth: { amount: salary.amount, count: salary.count, paid: salary.paid ?? 0, paidAmount: salaryPaid },
    netIncomeThisMonth: income.amount - expense.amount, // Preserved for backwards compatibility
    examFeeCollectionThisMonth: { amount: examFeeMonth.amount, count: examFeeMonth.count },
    examExpensesThisMonth: { amount: examExpenseMonth.amount, count: examExpenseMonth.count },
    netExamBalanceThisMonth: examFeeMonth.amount - examExpenseMonth.amount,
    // Step 4E.16 Distinct Financial Cash Flow Semantics
    financialSummary: {
      regularFeeCollected: { amount: regularFeeCollected, count: month.count },
      examFeeCollected: { amount: examFeeCollected, count: examFeeMonth.count },
      miscellaneousIncome: { amount: miscellaneousIncome, count: income.count },
      operatingExpenses: { amount: operatingExpenses, count: expense.count + examExpenseMonth.count },
      salaryPaid: { amount: salaryPaid, count: salary.paid ?? 0 },
      refundsThisMonth: { amount: refundsThisMonth, count: reversalMonth.count },
      totalRevenue,
      totalOutflow,
      netCashFlow,
    },
    recentPayments: recent.map((p: any) => ({
      _id: String(p._id),
      amount: p.amount,
      receiptNumber: p.receiptNumber,
      paymentMethod: p.paymentMethod,
      paymentDate: new Date(p.paymentDate).toISOString(),
      studentName: studentMap.get(String(p.studentId))?.fullName ?? '—',
      admissionNumber: studentMap.get(String(p.studentId))?.admissionNumber ?? '—',
    })),
  });
});

function reportTotals(rows: any[]): number {
  return rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
}

/** GET /api/finance/reports/daily-collection?date=YYYY-MM-DD */
export const dailyCollection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Payment, Student } = getTenantModels(tenantDb);
  const dateStr = String(req.query.date || '');
  if (!dateStr) throw ApiError.badRequest('date is required (YYYY-MM-DD)', 'DATE_REQUIRED');
  const { start, end } = dayBounds(new Date(dateStr));

  const payments = await Payment.find(scopeQuery(req, { paymentDate: { $gte: start, $lt: end } }))
    .sort({ paymentDate: 1 })
    .select('amount receiptNumber paymentMethod paymentDate studentId')
    .lean();
  const students = await Student.find(scopeQuery(req, { _id: { $in: payments.map((p: any) => p.studentId) } })).select('fullName admissionNumber').lean();
  const map = new Map(students.map((s) => [String(s._id), s]));
  const rows = payments.map((p: any) => ({
    receiptNumber: p.receiptNumber,
    studentName: map.get(String(p.studentId))?.fullName ?? '—',
    admissionNumber: map.get(String(p.studentId))?.admissionNumber ?? '—',
    method: p.paymentMethod,
    amount: p.amount,
    date: new Date(p.paymentDate).toISOString().slice(0, 10),
  }));

  if (wantsCsv(req)) {
    return sendCsv(res, `daily-collection-${dateStr}.csv`, ['Receipt', 'Student', 'Admission', 'Method', 'Amount (PKR)', 'Date'], rows.map((r: any) => [r.receiptNumber, r.studentName, r.admissionNumber, r.method, (r.amount / 100).toFixed(2), r.date]));
  }
  ok(res, { date: dateStr, rows, total: reportTotals(rows), count: rows.length });
});

/** GET /api/finance/reports/monthly-collection?month=YYYY-MM */
export const monthlyCollection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Payment } = getTenantModels(tenantDb);
  const month = String(req.query.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw ApiError.badRequest('month is required (YYYY-MM)', 'MONTH_REQUIRED');
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  const tenantId = getTenantObjectId(req);

  const match: Record<string, any> = { paymentDate: { $gte: start, $lt: end } };
  if (tenantId) match.tenantId = tenantId;

  const byDay = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' } },
        amount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const rows = byDay.map((b) => ({ date: b._id, amount: b.amount, count: b.count }));

  if (wantsCsv(req)) {
    return sendCsv(res, `monthly-collection-${month}.csv`, ['Date', 'Amount (PKR)', 'Payments'], rows.map((r: any) => [r.date, (r.amount / 100).toFixed(2), r.count]));
  }
  ok(res, { month, rows, total: reportTotals(rows), count: rows.reduce((s, r) => s + r.count, 0) });
});

/** GET /api/finance/reports/pending-fees */
export const pendingFees = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { StudentFee, Student } = getTenantModels(tenantDb);
  const filter: Record<string, any> = { status: req.query.status === 'paid' ? 'paid' : req.query.status || { $in: ['unpaid', 'partial'] } };
  if (req.query.sessionId) filter.sessionId = req.query.sessionId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.sectionId) filter.sectionId = req.query.sectionId;

  const fees = await StudentFee.find(scopeQuery(req, filter))
    .sort({ createdAt: 1 })
    .select('studentId feeType month netPayable amountPaid remainingBalance status createdAt')
    .limit(2000)
    .lean();
  const students = await Student.find(scopeQuery(req, { _id: { $in: fees.map((f: any) => f.studentId) } })).select('fullName admissionNumber').lean();
  const map = new Map(students.map((s) => [String(s._id), s]));
  const rows = fees.map((f: any) => ({
    studentName: map.get(String(f.studentId))?.fullName ?? '—',
    admissionNumber: map.get(String(f.studentId))?.admissionNumber ?? '—',
    feeType: f.feeType,
    month: f.month ?? null,
    netPayable: f.netPayable,
    amountPaid: f.amountPaid ?? 0,
    remainingBalance: f.remainingBalance,
    status: f.status,
  }));

  if (wantsCsv(req)) {
    return sendCsv(res, `pending-fees-${new Date().toISOString().slice(0, 10)}.csv`, ['Student', 'Admission', 'Fee Type', 'Month', 'Net (PKR)', 'Paid (PKR)', 'Remaining (PKR)', 'Status'], rows.map((r: any) => [r.studentName, r.admissionNumber, r.feeType, r.month ?? '', (r.netPayable / 100).toFixed(2), (r.amountPaid / 100).toFixed(2), (r.remainingBalance / 100).toFixed(2), r.status]));
  }
  ok(res, { rows, totalOutstanding: rows.reduce((s, r) => s + r.remainingBalance, 0), count: rows.length });
});

/** GET /api/finance/reports/income */
export const incomeReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Income } = getTenantModels(tenantDb);
  const filter: Record<string, any> = { isArchived: false };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(String(req.query.from));
    if (req.query.to) filter.date.$lte = new Date(new Date(String(req.query.to)).getTime() + 24 * 3600 * 1000 - 1);
  }
  const docs = await Income.find(scopeQuery(req, filter)).sort({ date: 1 }).select('date category title amount reference').limit(2000).lean();
  const rows = docs.map((d) => ({ date: new Date(d.date).toISOString().slice(0, 10), category: d.category, title: d.title, amount: d.amount, reference: d.reference ?? null }));
  if (wantsCsv(req)) {
    return sendCsv(res, `income-report-${new Date().toISOString().slice(0, 10)}.csv`, ['Date', 'Category', 'Title', 'Amount (PKR)', 'Reference'], rows.map((r: any) => [r.date, r.category, r.title, (r.amount / 100).toFixed(2), r.reference ?? '']));
  }
  ok(res, { rows, total: reportTotals(rows), count: rows.length });
});

/** GET /api/finance/reports/expenses */
export const expenseReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Expense } = getTenantModels(tenantDb);
  const filter: Record<string, any> = { isArchived: false };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(String(req.query.from));
    if (req.query.to) filter.date.$lte = new Date(new Date(String(req.query.to)).getTime() + 24 * 3600 * 1000 - 1);
  }
  const docs = await Expense.find(scopeQuery(req, filter)).sort({ date: 1 }).select('date category title amount reference').limit(2000).lean();
  const rows = docs.map((d) => ({ date: new Date(d.date).toISOString().slice(0, 10), category: d.category, title: d.title, amount: d.amount, reference: d.reference ?? null }));
  if (wantsCsv(req)) {
    return sendCsv(res, `expense-report-${new Date().toISOString().slice(0, 10)}.csv`, ['Date', 'Category', 'Title', 'Amount (PKR)', 'Reference'], rows.map((r: any) => [r.date, r.category, r.title, (r.amount / 100).toFixed(2), r.reference ?? '']));
  }
  ok(res, { rows, total: reportTotals(rows), count: rows.length });
});

/** GET /api/finance/reports/salaries */
export const salaryReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const isProvisioned = (req as any).tenant?.isDatabaseProvisioned === true;
  const filter: Record<string, any> = {};
  if (req.query.sessionId) filter.sessionId = req.query.sessionId;
  if (req.query.month) filter.salaryMonth = req.query.month;
  if (req.query.status) filter.status = req.query.status;

  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const tenantModels = getTenantModels(tenantDb);

  const docs = await tenantModels.SalaryRecord.find(scopeQuery(req, filter)).sort({ salaryMonth: 1 }).select('staffId salaryMonth baseAmount adjustmentAmount netAmount status paymentDate').limit(2000).lean();
  const teachers = await tenantModels.Teacher.find(scopeQuery(req, { _id: { $in: docs.map((d: any) => d.staffId) } })).select('fullName employeeId').lean();
  const map = new Map(teachers.map((t) => [String(t._id), t]));
  const rows = docs.map((d) => ({
    month: d.salaryMonth,
    teacherName: map.get(String(d.staffId))?.fullName ?? '—',
    employeeId: map.get(String(d.staffId))?.employeeId ?? '—',
    baseAmount: d.baseAmount,
    adjustmentAmount: d.adjustmentAmount ?? 0,
    netAmount: d.netAmount,
    status: d.status,
    paymentDate: d.paymentDate ? new Date(d.paymentDate).toISOString().slice(0, 10) : null,
  }));
  if (wantsCsv(req)) {
    return sendCsv(res, `salary-report-${new Date().toISOString().slice(0, 7)}.csv`, ['Month', 'Teacher', 'Employee ID', 'Base (PKR)', 'Adjustment (PKR)', 'Net (PKR)', 'Status', 'Paid On'], rows.map((r: any) => [r.month, r.teacherName, r.employeeId, (r.baseAmount / 100).toFixed(2), (r.adjustmentAmount / 100).toFixed(2), (r.netAmount / 100).toFixed(2), r.status, r.paymentDate ?? '']));
  }
  ok(res, { rows, totalNet: rows.reduce((s, r) => s + r.netAmount, 0), count: rows.length });
});

/** GET /api/finance/reports/income-vs-expense?from=&to= */
export const incomeVsExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  const isProvisioned = (req as any).tenant?.isDatabaseProvisioned === true;
  const now = new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const to = req.query.to ? new Date(new Date(String(req.query.to)).getTime() + 24 * 3600 * 1000 - 1) : new Date();
  const tenantId = getTenantObjectId(req);

  const incMatch: Record<string, any> = { isArchived: false, date: { $gte: from, $lte: to } };
  const expMatch: Record<string, any> = { isArchived: false, date: { $gte: from, $lte: to } };
  if (tenantId) {
    incMatch.tenantId = tenantId;
    expMatch.tenantId = tenantId;
  }

  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Income, Expense } = getTenantModels(tenantDb);

  const [incomes, expenses] = await Promise.all([
    Income.aggregate([
      { $match: incMatch },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, income: { $sum: '$amount' } } },
    ]),
    Expense.aggregate([
      { $match: expMatch },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, expense: { $sum: '$amount' } } },
    ]),
  ]);

  const buckets = new Map<string, { month: string; income: number; expense: number }>();
  for (const i of incomes) buckets.set(i._id, { month: i._id, income: i.income, expense: 0 });
  for (const e of expenses) {
    const b = buckets.get(e._id);
    if (b) b.expense = e.expense;
    else buckets.set(e._id, { month: e._id, income: 0, expense: e.expense });
  }
  const rows = [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));

  if (wantsCsv(req)) {
    return sendCsv(res, `income-vs-expense-${new Date().toISOString().slice(0, 10)}.csv`, ['Month', 'Income (PKR)', 'Expense (PKR)', 'Net (PKR)'], rows.map((r: any) => [r.month, (r.income / 100).toFixed(2), (r.expense / 100).toFixed(2), ((r.income - r.expense) / 100).toFixed(2)]));
  }
  ok(res, { rows, totalIncome: rows.reduce((s, r) => s + r.income, 0), totalExpense: rows.reduce((s, r) => s + r.expense, 0) });
});

/** GET /api/finance/reports/student-ledger */
export const ledgerReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = String(req.query.studentId || '');
  if (!studentId) throw ApiError.badRequest('studentId is required', 'STUDENT_REQUIRED');
  const tenantDb = req.tenantDb as mongoose.Connection;
  const tenantId = getTenantObjectId(req);
  const rows = await buildLedger(studentId, {
    sessionId: req.query.sessionId as string | undefined,
    feeType: req.query.feeType as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
  }, tenantId, tenantDb);
  const { Student } = getTenantModels(tenantDb);
  const student = await Student.findOne(scopeQuery(req, { _id: studentId })).select('fullName admissionNumber').lean();
  if (!student) throw ApiError.notFound('Student not found');

  if (wantsCsv(req)) {
    return sendCsv(res, `ledger-${student.admissionNumber}.csv`, ['Date', 'Kind', 'Fee Type', 'Title', 'Charge (PKR)', 'Payment (PKR)', 'Receipt', 'Balance (PKR)'], rows.map((r: any) => [new Date(r.date).toISOString().slice(0, 10), r.kind, r.feeType, r.title, (r.charge / 100).toFixed(2), (r.payment / 100).toFixed(2), r.receipt ?? '', (r.balance / 100).toFixed(2)]));
  }
  ok(res, { student: { studentId, fullName: student.fullName, admissionNumber: student.admissionNumber }, rows, closingBalance: rows.length ? rows[rows.length - 1].balance : 0 });
});


export const feesSummaryReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const tenantModels = getTenantModels(tenantDb);
  const tenantId = getTenantObjectId(req);
  const { getOrCreateFeeSettings } = await import('../services/feeManagement.service');
  const settings = tenantId ? await getOrCreateFeeSettings(tenantId, tenantDb) : null;

  const tMatch = (extra: Record<string, any>) => (tenantId ? { ...extra, tenantId } : extra);

  const filter: Record<string, any> = {};
  if (req.query.sessionId && mongoose.Types.ObjectId.isValid(String(req.query.sessionId))) {
    filter.sessionId = new mongoose.Types.ObjectId(String(req.query.sessionId));
  }
  if (req.query.classId && mongoose.Types.ObjectId.isValid(String(req.query.classId))) {
    filter.classId = new mongoose.Types.ObjectId(String(req.query.classId));
  }
  if (req.query.sectionId && mongoose.Types.ObjectId.isValid(String(req.query.sectionId))) {
    filter.sectionId = new mongoose.Types.ObjectId(String(req.query.sectionId));
  }

  const dateFilter: Record<string, any> = {};
  if (req.query.from || req.query.to) {
    const { start, endExclusive } = getSchoolCustomRange(
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined
    );
    if (start) dateFilter.$gte = start;
    if (endExclusive) dateFilter.$lt = endExclusive;
  }

  const feeMatch = tMatch({ ...filter, ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}) });
  const paymentMatch = tMatch({ ...(Object.keys(dateFilter).length ? { paymentDate: dateFilter } : {}) });

  const [
    feeAgg,
    admissionFeeAgg,
    paymentAgg,
    methodAgg,
    reversalAgg,
    classAgg,
    trendFeeAgg,
    trendPayAgg,
    trendRevAgg,
  ] = await Promise.all([
    tenantModels.StudentFee.aggregate([
      { $match: feeMatch },
      {
        $group: {
          _id: null,
          totalExpected: { $sum: '$netPayable' },
          totalPending: { $sum: '$remainingBalance' },
          totalDiscount: { $sum: '$discountAmount' },
          totalLateFeeAssessed: { $sum: '$fineAmount' },
          totalOtherFee: { $sum: '$otherFeeAmount' },
          invoiceCount: { $sum: 1 },
          paidInvoices: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
          partialInvoices: { $sum: { $cond: [{ $eq: ['$status', 'partial'] }, 1, 0] } },
          unpaidInvoices: { $sum: { $cond: [{ $eq: ['$status', 'unpaid'] }, 1, 0] } },
        },
      },
    ]),
    tenantModels.StudentFee.aggregate([
      { $match: { ...feeMatch, feeType: 'admission_fee' } },
      {
        $group: {
          _id: null,
          totalExpected: { $sum: '$netPayable' },
          totalCollected: { $sum: '$amountPaid' },
          totalPending: { $sum: '$remainingBalance' },
          count: { $sum: 1 },
        },
      },
    ]),
    tenantModels.Payment.aggregate([
      { $match: paymentMatch },
      {
        $group: {
          _id: null,
          totalCollected: { $sum: '$amount' },
          paymentCount: { $sum: 1 },
        },
      },
    ]),
    tenantModels.Payment.aggregate([
      { $match: paymentMatch },
      {
        $group: {
          _id: '$paymentMethod',
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]),
    tenantModels.PaymentReversal.aggregate([
      { $match: tMatch({ sourceType: 'regular_fee', ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}) }) },
      {
        $group: {
          _id: null,
          totalReversed: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]),
    tenantModels.StudentFee.aggregate([
      { $match: feeMatch },
      {
        $group: {
          _id: '$classId',
          totalExpected: { $sum: '$netPayable' },
          totalPaid: { $sum: '$amountPaid' },
          totalPending: { $sum: '$remainingBalance' },
          invoices: { $sum: 1 },
        },
      },
    ]),
    tenantModels.StudentFee.aggregate([
      { $match: feeMatch },
      {
        $group: {
          _id: { $month: { date: '$createdAt', timezone: SCHOOL_TIMEZONE } },
          expected: { $sum: '$netPayable' },
          pending: { $sum: '$remainingBalance' },
        },
      },
    ]),
    tenantModels.Payment.aggregate([
      { $match: paymentMatch },
      {
        $group: {
          _id: { $month: { date: '$paymentDate', timezone: SCHOOL_TIMEZONE } },
          gross: { $sum: '$amount' },
        },
      },
    ]),
    tenantModels.PaymentReversal.aggregate([
      { $match: tMatch({ sourceType: 'regular_fee', ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}) }) },
      {
        $group: {
          _id: { $month: { date: '$createdAt', timezone: SCHOOL_TIMEZONE } },
          reversals: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  const fG = feeAgg[0] || {
    totalExpected: 0,
    totalPending: 0,
    totalDiscount: 0,
    totalLateFeeAssessed: 0,
    totalOtherFee: 0,
    invoiceCount: 0,
    paidInvoices: 0,
    partialInvoices: 0,
    unpaidInvoices: 0,
  };
  const admG = admissionFeeAgg[0] || { totalExpected: 0, totalCollected: 0, totalPending: 0, count: 0 };
  const pG = paymentAgg[0] || { totalCollected: 0, paymentCount: 0 };
  const rG = reversalAgg[0] || { totalReversed: 0, count: 0 };

  const netCollected = Number(pG.totalCollected) - Number(rG.totalReversed);

  // Resolve class names
  const { Class } = await import('../models/Class');
  const classIds = classAgg.map((c: any) => c._id).filter(Boolean);
  const classDocs = await tenantModels.Class.find(scopeQuery(req, { _id: { $in: classIds } })).select('name').lean();
  const classMap = new Map(classDocs.map((c: any) => [String(c._id), c.name]));

  const classSummary = classAgg.map((c: any) => ({
    classId: String(c._id),
    className: classMap.get(String(c._id)) || '—',
    totalExpected: c.totalExpected,
    totalPaid: c.totalPaid,
    totalPending: c.totalPending,
    invoiceCount: c.invoices,
  }));

  const paymentMethods: Record<string, { amount: number; count: number }> = {};
  const methodBreakdown = methodAgg.map((m: any) => {
    const methodKey = String(m._id || 'Unknown');
    paymentMethods[methodKey] = { amount: m.amount, count: m.count };
    return {
      _id: methodKey,
      totalAmount: m.amount,
      count: m.count,
    };
  });

  const feeByMonth = new Map(trendFeeAgg.map((m: any) => [m._id, m]));
  const payByMonth = new Map(trendPayAgg.map((m: any) => [m._id, m.gross]));
  const revByMonth = new Map(trendRevAgg.map((m: any) => [m._id, m.reversals]));

  const targetYear = req.query.from
    ? parseInt(String(req.query.from).slice(0, 4), 10)
    : (req.query.year ? parseInt(String(req.query.year), 10) : new Date().getFullYear());

  const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
    const monthNum = i + 1;
    const fM = feeByMonth.get(monthNum);
    const gross = payByMonth.get(monthNum) || 0;
    const rev = revByMonth.get(monthNum) || 0;
    const net = gross - rev;
    return {
      year: targetYear,
      month: monthNum,
      expected: fM?.expected || 0,
      collected: net,
      pending: fM?.pending || 0,
    };
  });

  const collectionRate = Number(fG.totalExpected) > 0 ? (netCollected / Number(fG.totalExpected)) * 100 : 0;

  const summary = {
    expectedAmount: fG.totalExpected,
    collectedGross: pG.totalCollected,
    reversalsAmount: rG.totalReversed,
    collectedNet: netCollected,
    pendingAmount: fG.totalPending,
    discountAmount: settings?.discount.enabled ? fG.totalDiscount : 0,
    fineAmount: settings?.lateFee.enabled ? fG.totalLateFeeAssessed : 0,
    otherFeeAmount: settings?.otherFee.enabled ? fG.totalOtherFee : 0,
    admissionFeeAmount: admG.totalCollected,
    totalInvoices: fG.invoiceCount,
    paidInvoices: fG.paidInvoices,
    partialInvoices: fG.partialInvoices,
    unpaidInvoices: fG.unpaidInvoices,
    collectionRate,
  };

  ok(res, {
    year: targetYear,
    summary,
    monthlyTrend,
    methodBreakdown,
  });
});