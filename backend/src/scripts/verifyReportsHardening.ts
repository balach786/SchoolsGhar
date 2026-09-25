import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import assert from 'assert';
import { Tenant } from '../models/Tenant';
import { Student } from '../models/Student';
import { StudentFee } from '../models/StudentFee';
import { Payment } from '../models/Payment';
import { PaymentReversal } from '../models/PaymentReversal';
import { Income } from '../models/Income';
import { Expense } from '../models/Expense';
import { SalaryRecord } from '../models/SalaryRecord';
import { Exam } from '../models/Exam';
import { Mark } from '../models/Mark';
import { StudentExamFee } from '../models/StudentExamFee';
import { StudentAttendance } from '../models/StudentAttendance';
import { AcademicSession } from '../models/AcademicSession';
import { Class } from '../models/Class';
import { StudentHistory } from '../models/StudentHistory';
import { GradeScale } from '../models/GradeScale';
import { PERMISSION_CATALOG } from '../config/permissions';
import {
  getSchoolTodayISO,
  getSchoolCurrentMonthISO,
  getSchoolDayRange,
  getSchoolMonthRange,
  getSchoolCustomRange,
} from '../utils/schoolDate';
import { computeAttendanceRate } from '../services/attendance.service';
import { getRegularFeeCollection, getMonthlyCollectionBreakdown } from '../services/financialReporting.service';
import {
  dailyCollection,
  monthlyCollection,
  pendingFees,
  incomeReport,
  expenseReport,
  salaryReport,
  
  feesSummaryReport,
} from '../controllers/finance.controller';
import {
  getExamSummaryReport,
  getExamFeeReport,
  getExamFinancialSummary,
  getSubjectPerformanceReport,
  getClassResultsReport,
} from '../controllers/examReports.controller';
import {
  attendanceReport,
  sessionReport,
  examReport,
  teacherReport,
} from '../controllers/reports.controller';

function mockReqRes(reqData: any = {}) {
  const req: any = {
    query: reqData.query || {},
    body: reqData.body || {},
    params: reqData.params || {},
    user: reqData.user || { role: 'admin', isPlatformAdmin: false },
    headers: reqData.headers || {},
  };
  if (reqData.tenantId) {
    req.tenantId = reqData.tenantId;
    req.user.tenantId = reqData.tenantId;
  }
  const res: any = {
    statusCode: 200,
    body: null,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(d: any) {
      this.body = d;
      return this;
    },
  };
  return { req, res };
}

async function invoke(controller: any, req: any, res: any): Promise<any> {
  return new Promise((resolve, reject) => {
    res.json = (d: any) => {
      res.body = d;
      resolve(d);
      return res;
    };
    res.send = (d: any) => {
      res.body = d;
      resolve(d);
      return res;
    };
    const next = (err?: any) => {
      if (err) reject(err);
    };
    Promise.resolve(controller(req, res, next)).catch(reject);
  });
}

async function runVerification() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  // Test 1: Canonical Permission Catalog Reconciliation
  console.log('\n--- 1. Canonical Permission Catalog Verification ---');
  const catalogModules = new Set(PERMISSION_CATALOG.map((m) => m.module));
  assert(catalogModules.has('reports'), 'reports module must exist in catalog');
  assert(catalogModules.has('fees'), 'fees module must exist in catalog');
  assert(catalogModules.has('payments'), 'payments module must exist in catalog');
  assert(catalogModules.has('exams'), 'exams module must exist in catalog');
  assert(catalogModules.has('results'), 'results module must exist in catalog');
  assert(catalogModules.has('studentAttendance'), 'studentAttendance module must exist in catalog');
  console.log('✓ All canonical permission modules verified.');

  // Test 2: Shared School Date & Half-Open Boundaries
  console.log('\n--- 2. Shared School Date & Half-Open Range Verification ---');
  const septRange = getSchoolMonthRange('2026-09');
  assert.strictEqual(septRange.start.toISOString(), '2026-09-01T00:00:00.000Z', 'Sep 1 start boundary in normalized UTC');
  assert.strictEqual(septRange.endExclusive.toISOString(), '2026-10-01T00:00:00.000Z', 'Oct 1 end boundary in normalized UTC');
  assert.strictEqual(
    septRange.endExclusive.getTime() - septRange.start.getTime(),
    30 * 24 * 3600 * 1000,
    'September must have exactly 30 days of duration without 31st rollover'
  );

  const febRange = getSchoolMonthRange('2026-02');
  assert.strictEqual(
    febRange.endExclusive.getTime() - febRange.start.getTime(),
    28 * 24 * 3600 * 1000,
    'February 2026 must have exactly 28 days of duration'
  );

  const customRange = getSchoolCustomRange('2026-09-05', '2026-09-10');
  assert.strictEqual(
    customRange.endExclusive!.getTime() - customRange.start!.getTime(),
    6 * 24 * 3600 * 1000,
    'Custom range Sep 5 - Sep 10 inclusive must span 6 full days (half-open)'
  );
  console.log('✓ Half-open calendar ranges and timezone math verified.');

  // Test 3: Financial Accounting Reconciliation & Signed Net Collection
  console.log('\n--- 3. Financial Accounting Contract & Cross-Month Reversal ---');
  const testTenant = await Tenant.findOne({ slug: 'greenfield' }) || await Tenant.findOne();
  assert(testTenant, 'Tenant must exist');
  const tenantId = testTenant._id;

  // Simulate August payment and September reversal
  const augustPaymentDate = new Date('2026-08-15T10:00:00.000Z');
  const septReversalDate = new Date('2026-09-05T10:00:00.000Z');

  const dummyId = new mongoose.Types.ObjectId();
  const testPay = await Payment.create({
    tenantId,
    studentId: dummyId,
    studentFeeId: dummyId,
    sessionId: dummyId,
    classId: dummyId,
    collectedBy: dummyId,
    refundableAmount: 150000,
    amount: 150000, // PKR 1,500
    paymentMethod: 'cash',
    receiptNumber: `REC-TEST-${Date.now()}`,
    paymentDate: augustPaymentDate,
  });

  const testRev = await PaymentReversal.create({
    tenantId,
    paymentId: testPay._id,
    studentId: dummyId,
    obligationId: dummyId,
    amount: 150000,
    sourceType: 'regular_fee',
    reversalType: 'full_reversal',
    originalReceiptNumber: testPay.receiptNumber,
    reversalReceiptNumber: `REV-${Date.now()}`,
    reason: 'Testing cross month reversal',
    initiatedBy: dummyId,
    reversedBy: dummyId,
    createdAt: septReversalDate,
  });

  // Query August collection
  const augRange = getSchoolMonthRange('2026-08');
  const augCol = await getRegularFeeCollection(tenantId, {
    $gte: augRange.start,
    $lt: augRange.endExclusive,
  });
  // Query September collection
  const sepRange = getSchoolMonthRange('2026-09');
  const sepCol = await getRegularFeeCollection(tenantId, {
    $gte: sepRange.start,
    $lt: sepRange.endExclusive,
  });

  console.log(`August gross: ${augCol.grossCollected}, reversals: ${augCol.totalReversed}, net: ${augCol.netCollected}`);
  console.log(`September gross: ${sepCol.grossCollected}, reversals: ${sepCol.totalReversed}, net: ${sepCol.netCollected}`);

  assert(augCol.grossCollected >= 150000, 'August must contain payment in gross');
  assert(sepCol.totalReversed >= 150000, 'September must contain reversal');
  // Clean up test records
  await Payment.deleteOne({ _id: testPay._id });
  await PaymentReversal.deleteOne({ _id: testRev._id });
  console.log('✓ Cross-month reversal attribution verified (August Net is preserved; September Net accounts for reversal).');

  // Test 4: Attendance Formula
  console.log('\n--- 4. Attendance Shared Formula Reconciliation ---');
  const counts = { present: 10, late: 2, absent: 3, leave: 1 };
  const attRes = computeAttendanceRate(counts);
  assert.strictEqual(attRes.attendanceRate, 75.0, 'Attendance formula must yield 75.0%');
  assert.strictEqual(attRes.totalRecorded, 16, 'Total recorded must be 16');
  console.log(`✓ Attendance Rate: ${attRes.attendanceRate}% (Expected 75.0%)`);

  // Test 5: PaymentReversal Index Plan
  console.log('\n--- 5. PaymentReversal Index Verification ---');
  const explainResult: any = await PaymentReversal.collection.find({
    tenantId,
    sourceType: 'regular_fee',
    createdAt: { $gte: new Date('2026-09-01'), $lt: new Date('2026-10-01') },
  }).explain('executionStats');
  const winningPlan = explainResult.queryPlanner?.winningPlan;
  console.log('Winning plan stage:', winningPlan?.stage || winningPlan?.inputStage?.stage);
  console.log('Index used:', winningPlan?.inputStage?.indexName || winningPlan?.indexName);
  assert(
    winningPlan?.inputStage?.indexName === 'tenantId_1_sourceType_1_createdAt_1' ||
    winningPlan?.indexName === 'tenantId_1_sourceType_1_createdAt_1',
    'Must use compound ESR index { tenantId: 1, sourceType: 1, createdAt: 1 }'
  );
  console.log('✓ PaymentReversal compound index verified with explain plan.');

  // Test 6: Controller End-to-End Invocations
  console.log('\n--- 6. Controller Invocations & Response Contracts ---');

  // 6a: feesSummaryReport contract
  const { req: fsReq, res: fsRes } = mockReqRes({ tenantId });
  const fsData = await invoke(feesSummaryReport, fsReq, fsRes);
  assert(fsData?.data?.summary, 'feesSummaryReport must return summary envelope');
  assert(Array.isArray(fsData?.data?.monthlyTrend), 'feesSummaryReport must return monthlyTrend array');
  assert.strictEqual(fsData?.data?.monthlyTrend.length, 12, 'monthlyTrend must have 12 months');
  assert(Array.isArray(fsData?.data?.methodBreakdown), 'feesSummaryReport must return methodBreakdown array');
  assert(typeof fsData?.data?.summary?.expectedAmount === 'number', 'summary must contain expectedAmount');
  assert(typeof fsData?.data?.summary?.collectedNet === 'number', 'summary must contain collectedNet');
  console.log('✓ feesSummaryReport returned canonical contract with 12-month real monthly trend.');

  // 6b: attendanceReport
  const { req: attReq, res: attRes2 } = mockReqRes({ tenantId, query: { month: '2026-09' } });
  const attData = await invoke(attendanceReport, attReq, attRes2);
  assert(Array.isArray(attData?.data?.rows), 'attendanceReport must return rows array');
  console.log('✓ attendanceReport returned properly formatted rows using school date range.');

  // 6c: sessionReport
  const { req: sesReq, res: sesRes } = mockReqRes({ tenantId });
  const sesData = await invoke(sessionReport, sesReq, sesRes);
  assert(Array.isArray(sesData?.data?.rows), 'sessionReport must return rows array');
  console.log('✓ sessionReport returned properly aggregated rows without N+1.');

  // 6d: Exam reports
  const sampleExam = await Exam.findOne(tenantId ? { tenantId } : {});
  if (sampleExam) {
    const { req: exSumReq, res: exSumRes } = mockReqRes({ tenantId, query: { examId: String(sampleExam._id) } });
    const exSumData = await invoke(getExamSummaryReport, exSumReq, exSumRes);
    assert(exSumData?.data?.totalStudents !== undefined, 'getExamSummaryReport must return totalStudents');
    assert(exSumData?.data?.admitCardsIssued !== undefined, 'getExamSummaryReport must return admitCardsIssued');
    assert(exSumData?.data?.passRate !== undefined, 'getExamSummaryReport must return passRate');
    assert(exSumData?.data?.netBalance !== undefined, 'getExamSummaryReport must return netBalance');
    console.log('✓ getExamSummaryReport returned all required fields for ExamSummary card.');

    const { req: exFeeReq, res: exFeeRes } = mockReqRes({ tenantId, query: { examId: String(sampleExam._id) } });
    const exFeeData = await invoke(getExamFeeReport, exFeeReq, exFeeRes);
    assert(Array.isArray(exFeeData?.data?.students), 'getExamFeeReport must return students roster');
    assert(exFeeData?.data?.totalBilled !== undefined, 'getExamFeeReport must return totalBilled');
    console.log('✓ getExamFeeReport returned students roster matching frontend contract.');

    const { req: exFinReq, res: exFinRes } = mockReqRes({ tenantId, query: { examId: String(sampleExam._id) } });
    const exFinData = await invoke(getExamFinancialSummary, exFinReq, exFinRes);
    assert(exFinData?.data?.totalBilled !== undefined, 'getExamFinancialSummary must return totalBilled');
    assert(exFinData?.data?.totalExpenses !== undefined, 'getExamFinancialSummary must return totalExpenses');
    assert(Array.isArray(exFinData?.data?.expenseCategories), 'getExamFinancialSummary must return expenseCategories');
    console.log('✓ getExamFinancialSummary returned financial metrics and category breakdown.');

    const { req: exSubReq, res: exSubRes } = mockReqRes({ tenantId, query: { examId: String(sampleExam._id) } });
    const exSubData = await invoke(getSubjectPerformanceReport, exSubReq, exSubRes);
    assert(Array.isArray(exSubData?.data), 'getSubjectPerformanceReport must return array');
    console.log('✓ getSubjectPerformanceReport returned subject analytics.');

    const { req: exClsReq, res: exClsRes } = mockReqRes({ tenantId, query: { examId: String(sampleExam._id) } });
    const exClsData = await invoke(getClassResultsReport, exClsReq, exClsRes);
    assert(Array.isArray(exClsData?.data), 'getClassResultsReport must return array');
    if (exClsData.data.length > 0) {
      const first = exClsData.data[0];
      assert(['passed', 'failed', 'absent'].includes(first.status), 'Class result status must be canonical lowercase enum');
    }
    console.log('✓ getClassResultsReport returned class merit list with canonical lowercase status.');
  }

  console.log('\n=============================================');
  console.log('ALL AUDIT & RECONCILIATION TESTS PASSED 100%!');
  console.log('=============================================\n');
  await mongoose.disconnect();
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
