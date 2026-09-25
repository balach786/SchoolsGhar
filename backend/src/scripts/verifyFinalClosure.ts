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
import { Result } from '../models/Result';
import { StudentExamFee } from '../models/StudentExamFee';
import { StudentAttendance } from '../models/StudentAttendance';
import { AcademicSession } from '../models/AcademicSession';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { Subject } from '../models/Subject';
import { StudentHistory } from '../models/StudentHistory';
import { GradeScale } from '../models/GradeScale';
import { Teacher } from '../models/Teacher';
import { PERMISSION_CATALOG } from '../config/permissions';
import {
  SCHOOL_TIMEZONE,
  getSchoolTodayISO,
  getSchoolCurrentMonthISO,
  getSchoolDayRange,
  getSchoolMonthRange,
  getSchoolCustomRange,
  schoolLocalToUtc,
} from '../utils/schoolDate';
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
} from '../controllers/examReports.controller';
import { examReport, attendanceReport, sessionReport, teacherReport } from '../controllers/reports.controller';
import { computeExamResults } from '../services/exam.service';

async function invoke(controller: any, req: any, res: any): Promise<any> {
  if (!req.tenant && req.tenantId) {
    req.tenant = { _id: req.tenantId };
  }
  if (!req.user && req.tenantId) {
    req.user = { role: 'admin', tenantId: String(req.tenantId) };
  }
  return new Promise((resolve, reject) => {
    const mockRes: any = {
      statusCode: 200,
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json(d: any) {
        this.body = d;
        resolve(d);
        return this;
      },
      send(d: any) {
        this.body = d;
        resolve(d);
        return this;
      },
      setHeader() {},
      write() {},
      end() {
        resolve(this.body);
      },
    };
    const next = (err?: any) => {
      if (err) reject(err);
    };
    Promise.resolve(controller(req, mockRes, next)).catch(reject);
  });
}

async function runVerification() {
  console.log('=== FINAL REPORTS MANAGEMENT CLOSURE VERIFICATION ===');
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to DB');

  // ==========================================
  // ITEM 1, 2: Real Asia/Karachi UTC Boundaries & Month Transition Record Test
  // ==========================================
  console.log('\n--- Item 1 & 2: Month Boundary Tests ---');
  const sepRange = getSchoolMonthRange('2026-09');
  console.log('Exact September Range:', {
    startUtc: sepRange.start.toISOString(),
    endExclusiveUtc: sepRange.endExclusive.toISOString(),
  });
  assert.strictEqual(sepRange.start.toISOString(), '2026-08-31T19:00:00.000Z', 'Sep start must be 2026-08-31T19:00:00.000Z');
  assert.strictEqual(sepRange.endExclusive.toISOString(), '2026-09-30T19:00:00.000Z', 'Sep endExclusive must be 2026-09-30T19:00:00.000Z');

  // Isolated tenant for boundary test
  const tId = new mongoose.Types.ObjectId();

  // Records A, B, C, D
  // A: 2026-08-31 23:59 PKT -> 2026-08-31T18:59:00.000Z
  // B: 2026-09-01 00:01 PKT -> 2026-08-31T19:01:00.000Z
  // C: 2026-09-30 23:59 PKT -> 2026-09-30T18:59:00.000Z
  // D: 2026-10-01 00:01 PKT -> 2026-09-30T19:01:00.000Z
  const dateA = schoolLocalToUtc(2026, 8, 31, 23, 59, 0);
  const dateB = schoolLocalToUtc(2026, 9, 1, 0, 1, 0);
  const dateC = schoolLocalToUtc(2026, 9, 30, 23, 59, 0);
  const dateD = schoolLocalToUtc(2026, 10, 1, 0, 1, 0);

  console.log('Instants A, B, C, D:', {
    A: dateA.toISOString(),
    B: dateB.toISOString(),
    C: dateC.toISOString(),
    D: dateD.toISOString(),
  });

  // Test Payments
  const dummyStudentId = new mongoose.Types.ObjectId();
  const dummySessionId = new mongoose.Types.ObjectId();
  const dummyClassId = new mongoose.Types.ObjectId();
  await Payment.create([
    { tenantId: tId, studentId: dummyStudentId, studentFeeId: new mongoose.Types.ObjectId(), sessionId: dummySessionId, collectedBy: dummyStudentId, refundableAmount: 10000, amount: 10000, paymentMethod: 'cash', paymentDate: dateA, receiptNumber: 'REC-A' },
    { tenantId: tId, studentId: dummyStudentId, studentFeeId: new mongoose.Types.ObjectId(), sessionId: dummySessionId, collectedBy: dummyStudentId, refundableAmount: 20000, amount: 20000, paymentMethod: 'cash', paymentDate: dateB, receiptNumber: 'REC-B' },
    { tenantId: tId, studentId: dummyStudentId, studentFeeId: new mongoose.Types.ObjectId(), sessionId: dummySessionId, collectedBy: dummyStudentId, refundableAmount: 30000, amount: 30000, paymentMethod: 'cash', paymentDate: dateC, receiptNumber: 'REC-C' },
    { tenantId: tId, studentId: dummyStudentId, studentFeeId: new mongoose.Types.ObjectId(), sessionId: dummySessionId, collectedBy: dummyStudentId, refundableAmount: 40000, amount: 40000, paymentMethod: 'cash', paymentDate: dateD, receiptNumber: 'REC-D' },
  ]);

  // Test PaymentReversals
  await PaymentReversal.create([
    { tenantId: tId, sourceType: 'regular_fee', paymentId: new mongoose.Types.ObjectId(), obligationId: new mongoose.Types.ObjectId(), studentId: dummyStudentId, originalReceiptNumber: 'REC-A', reversalReceiptNumber: 'REV-A', reversalType: 'full_reversal', initiatedBy: dummyStudentId, amount: 1000, reason: 'Rev A', createdAt: dateA },
    { tenantId: tId, sourceType: 'regular_fee', paymentId: new mongoose.Types.ObjectId(), obligationId: new mongoose.Types.ObjectId(), studentId: dummyStudentId, originalReceiptNumber: 'REC-B', reversalReceiptNumber: 'REV-B', reversalType: 'full_reversal', initiatedBy: dummyStudentId, amount: 2000, reason: 'Rev B', createdAt: dateB },
    { tenantId: tId, sourceType: 'regular_fee', paymentId: new mongoose.Types.ObjectId(), obligationId: new mongoose.Types.ObjectId(), studentId: dummyStudentId, originalReceiptNumber: 'REC-C', reversalReceiptNumber: 'REV-C', reversalType: 'full_reversal', initiatedBy: dummyStudentId, amount: 3000, reason: 'Rev C', createdAt: dateC },
    { tenantId: tId, sourceType: 'regular_fee', paymentId: new mongoose.Types.ObjectId(), obligationId: new mongoose.Types.ObjectId(), studentId: dummyStudentId, originalReceiptNumber: 'REC-D', reversalReceiptNumber: 'REV-D', reversalType: 'full_reversal', initiatedBy: dummyStudentId, amount: 4000, reason: 'Rev D', createdAt: dateD },
  ]);

  // Test StudentAttendance
  await StudentAttendance.create([
    { tenantId: tId, studentId: dummyStudentId, classId: dummyClassId, sessionId: dummySessionId, attendanceDate: dateA, status: 'present' },
    { tenantId: tId, studentId: dummyStudentId, classId: dummyClassId, sessionId: dummySessionId, attendanceDate: dateB, status: 'present' },
    { tenantId: tId, studentId: dummyStudentId, classId: dummyClassId, sessionId: dummySessionId, attendanceDate: dateC, status: 'present' },
    { tenantId: tId, studentId: dummyStudentId, classId: dummyClassId, sessionId: dummySessionId, attendanceDate: dateD, status: 'present' },
  ]);

  // Query September Monthly Collection
  const reqMonth: any = { query: { month: '2026-09' }, tenantId: tId, user: { role: 'admin', tenantId: String(tId) } };
  const resMonth = await invoke(monthlyCollection, reqMonth, {});
  console.log('September monthlyCollection result:', resMonth?.data);
  // September MUST include B (200.00 PKR = 20000 paisa) and C (300.00 PKR = 30000 paisa) -> Gross = 50000 paisa (500.00 PKR)
  // Reversals MUST include B (2000 paisa) and C (3000 paisa) -> 5000 paisa (50.00 PKR)
  // Net = 45000 paisa (450.00 PKR)
  // MUST EXCLUDE A and D
  assert.strictEqual(resMonth.data.grossTotal, 50000, 'Gross must include only B + C (50000)');
  assert.strictEqual(resMonth.data.reversalsTotal, 5000, 'Reversed must include only B + C (5000)');
  assert.strictEqual(resMonth.data.netTotal, 45000, 'Net must be 45000');

  // Query September Attendance Report
  const reqAtt: any = { query: { month: '2026-09', classId: String(dummyClassId) }, tenantId: tId, user: { role: 'admin', tenantId: String(tId) } };
  const resAtt = await invoke(attendanceReport, reqAtt, {});
  console.log('September attendanceReport rows:', resAtt?.data?.rows);
  // Attendance must include B and C (total 2 present records), excluding A and D
  const attRow = resAtt.data.rows[0];
  assert.strictEqual(attRow?.present, 2, 'Attendance must include exactly 2 present records (B and C)');

  console.log('✓ Item 1 & 2 Passed: Records A & D excluded, B & C included across Payment, Reversal, Attendance.');

  // ==========================================
  // ITEM 3: Day Boundary Test (2026-09-14)
  // ==========================================
  console.log('\n--- Item 3: Day Boundary Test ---');
  const sep14Range = getSchoolDayRange('2026-09-14');
  console.log('Exact Sep 14 Range:', {
    startUtc: sep14Range.start.toISOString(),
    endExclusiveUtc: sep14Range.endExclusive.toISOString(),
  });
  assert.strictEqual(sep14Range.start.toISOString(), '2026-09-13T19:00:00.000Z');
  assert.strictEqual(sep14Range.endExclusive.toISOString(), '2026-09-14T19:00:00.000Z');

  const dayRec1 = schoolLocalToUtc(2026, 9, 13, 23, 59, 0); // Excluded
  const dayRec2 = schoolLocalToUtc(2026, 9, 14, 0, 1, 0);   // Included
  const dayRec3 = schoolLocalToUtc(2026, 9, 14, 23, 59, 0);  // Included
  const dayRec4 = schoolLocalToUtc(2026, 9, 15, 0, 1, 0);   // Excluded

  await Payment.create([
    { tenantId: tId, studentId: dummyStudentId, studentFeeId: new mongoose.Types.ObjectId(), sessionId: dummySessionId, collectedBy: dummyStudentId, refundableAmount: 11111, amount: 11111, paymentMethod: 'cash', paymentDate: dayRec1, receiptNumber: 'DAY-1' },
    { tenantId: tId, studentId: dummyStudentId, studentFeeId: new mongoose.Types.ObjectId(), sessionId: dummySessionId, collectedBy: dummyStudentId, refundableAmount: 22222, amount: 22222, paymentMethod: 'cash', paymentDate: dayRec2, receiptNumber: 'DAY-2' },
    { tenantId: tId, studentId: dummyStudentId, studentFeeId: new mongoose.Types.ObjectId(), sessionId: dummySessionId, collectedBy: dummyStudentId, refundableAmount: 33333, amount: 33333, paymentMethod: 'cash', paymentDate: dayRec3, receiptNumber: 'DAY-3' },
    { tenantId: tId, studentId: dummyStudentId, studentFeeId: new mongoose.Types.ObjectId(), sessionId: dummySessionId, collectedBy: dummyStudentId, refundableAmount: 44444, amount: 44444, paymentMethod: 'cash', paymentDate: dayRec4, receiptNumber: 'DAY-4' },
  ]);

  const reqDay: any = { query: { date: '2026-09-14' }, tenantId: tId, user: { role: 'admin', tenantId: String(tId) } };
  const resDay = await invoke(dailyCollection, reqDay, {});
  console.log('Sep 14 dailyCollection result:', resDay?.data);
  // Total must be dayRec2 + dayRec3 = 22222 + 33333 = 55555 paisa
  assert.strictEqual(resDay.data.grossCollected, 55555, 'Daily collection must include only 2 records inside Sep 14');
  assert.strictEqual(resDay.data.count, 2, 'Daily collection count must be 2');
  console.log('✓ Item 3 Passed: Day boundary includes only records 2 & 3.');

  // ==========================================
  // ITEM 7, 8, 9: Isolated Cross-Month Reversal Test & Monthly Trend Attribution & Year Scope
  // ==========================================
  console.log('\n--- Item 7, 8, 9: Isolated Cross-Month Reversal & Monthly Trend ---');
  const isoId = new mongoose.Types.ObjectId();

  // August Payment = 1,500 PKR (150,000 paisa)
  const augDate = schoolLocalToUtc(2026, 8, 15, 12, 0, 0);
  const payAug = await Payment.create({
    tenantId: isoId,
    studentId: dummyStudentId,
    studentFeeId: new mongoose.Types.ObjectId(),
    sessionId: dummySessionId,
    collectedBy: dummyStudentId,
    refundableAmount: 150000,
    amount: 150000,
    paymentMethod: 'bank_transfer',
    paymentDate: augDate,
    receiptNumber: 'ISO-AUG-01',
  });

  // September Reversal = 1,500 PKR (150,000 paisa)
  const sepDate = schoolLocalToUtc(2026, 9, 10, 10, 0, 0);
  await PaymentReversal.create({
    tenantId: isoId,
    sourceType: 'regular_fee',
    paymentId: payAug._id,
    obligationId: payAug.studentFeeId,
    studentId: dummyStudentId,
    originalReceiptNumber: payAug.receiptNumber,
    reversalReceiptNumber: 'REV-ISO-01',
    reversalType: 'full_reversal',
    initiatedBy: dummyStudentId,
    amount: 150000,
    reason: 'Isolated cross month refund',
    createdAt: sepDate,
  });

  // 1. August Monthly Collection
  const reqAug: any = { query: { month: '2026-08' }, tenantId: isoId, user: { role: 'admin', tenantId: String(isoId) } };
  const resAugMonth = await invoke(monthlyCollection, reqAug, {});
  console.log('August Monthly Collection:', resAugMonth.data);
  assert.strictEqual(resAugMonth.data.grossTotal, 150000, 'Aug gross must be 150000');
  assert.strictEqual(resAugMonth.data.reversalsTotal, 0, 'Aug reversals must be 0');
  assert.strictEqual(resAugMonth.data.netTotal, 150000, 'Aug net must be 150000');

  // 2. September Monthly Collection
  const reqSep: any = { query: { month: '2026-09' }, tenantId: isoId, user: { role: 'admin', tenantId: String(isoId) } };
  const resSepMonth = await invoke(monthlyCollection, reqSep, {});
  console.log('September Monthly Collection:', resSepMonth.data);
  assert.strictEqual(resSepMonth.data.grossTotal, 0, 'Sep gross must be 0');
  assert.strictEqual(resSepMonth.data.reversalsTotal, 150000, 'Sep reversals must be 150000');
  assert.strictEqual(resSepMonth.data.netTotal, -150000, 'Sep net must be -150000');

  // 3. Fees Summary Report with year = 2026
  const reqFeeSum: any = { query: { year: '2026' }, tenantId: isoId, user: { role: 'admin', tenantId: String(isoId) } };
  const resFeeSum = await invoke(feesSummaryReport, reqFeeSum, {});
  console.log('feesSummaryReport year & canonical response keys:', Object.keys(resFeeSum.data));
  // Verify flat legacy fields removed
  assert.strictEqual(resFeeSum.data.totalExpectedFee, undefined, 'Legacy flat field totalExpectedFee must be removed');
  assert.strictEqual(resFeeSum.data.grossCollected, undefined, 'Legacy flat field grossCollected must be removed');
  assert.strictEqual(resFeeSum.data.totalReversed, undefined, 'Legacy flat field totalReversed must be removed');
  assert.strictEqual(resFeeSum.data.admissionFeeCollection, undefined, 'Legacy flat field admissionFeeCollection must be removed');
  assert.ok(resFeeSum.data.summary, 'Canonical summary must exist');
  assert.ok(resFeeSum.data.monthlyTrend, 'Canonical monthlyTrend must exist');
  assert.ok(resFeeSum.data.methodBreakdown, 'Canonical methodBreakdown must exist');
  assert.strictEqual(resFeeSum.data.year, 2026, 'Parent year must be 2026');

  // Monthly trend entries for August (month 8) and September (month 9)
  const augTrend = resFeeSum.data.monthlyTrend.find((t: any) => t.month === 8);
  const sepTrend = resFeeSum.data.monthlyTrend.find((t: any) => t.month === 9);
  console.log('Monthly Trend August (month 8):', augTrend);
  console.log('Monthly Trend September (month 9):', sepTrend);

  assert.strictEqual(augTrend.year, 2026, 'August trend year must be 2026');
  assert.strictEqual(augTrend.collected, 150000, 'August trend collected must be +150000');
  assert.strictEqual(sepTrend.year, 2026, 'September trend year must be 2026');
  assert.strictEqual(sepTrend.collected, -150000, 'September trend collected must be -150000');

  console.log('✓ Item 7, 8, 9 Passed: August net = +1,500 PKR, September net = -1,500 PKR, trend obeys reversal policy, explicit year 2026 scoped.');

  // ==========================================
  // ITEM 11: Pagination Contract Test
  // ==========================================
  console.log('\n--- Item 11: Pagination Contract Test ---');
  // Create 25 student fee records in isoId
  // All required schema fields: tenantId, studentId, sessionId, classId, sectionId, feeStructureId,
  //   feeType, originalAmount, netPayable, remainingBalance
  const dummySectionId = new mongoose.Types.ObjectId();
  const dummyFeeStructureId = new mongoose.Types.ObjectId();
  const sampleFees = [];
  for (let i = 1; i <= 25; i++) {
    sampleFees.push({
      tenantId: isoId,
      studentId: dummyStudentId,
      sessionId: dummySessionId,
      classId: dummyClassId,
      sectionId: dummySectionId,
      feeStructureId: dummyFeeStructureId,
      feeType: 'monthly_tuition',
      month: (i % 12) + 1, // 1-12 as required by schema
      billingMonth: (i % 12) + 1,
      billingYear: 2000 + i, // unique per record to avoid unique-index collision
      originalAmount: 5000,
      netPayable: 5000,
      amountPaid: 0,
      remainingBalance: 5000,
      status: 'unpaid',
    });
  }
  await StudentFee.insertMany(sampleFees);

  // Test page 1 vs page 20 on pendingFees
  const reqP1: any = { query: { limit: '5', page: '1' }, tenantId: isoId, user: { role: 'admin', tenantId: String(isoId) } };
  const resP1 = await invoke(pendingFees, reqP1, {});

  const reqP20: any = { query: { limit: '5', page: '20' }, tenantId: isoId, user: { role: 'admin', tenantId: String(isoId) } };
  const resP20 = await invoke(pendingFees, reqP20, {});

  console.log('pendingFees Page 1:', {
    rowsCount: resP1.data.rows.length,
    totalOutstanding: resP1.data.totalOutstanding,
    totalRecords: resP1.data.totalRecords,
    totalPages: resP1.data.totalPages,
    page: resP1.data.page,
  });
  console.log('pendingFees Page 20:', {
    rowsCount: resP20.data.rows.length,
    totalOutstanding: resP20.data.totalOutstanding,
    totalRecords: resP20.data.totalRecords,
    totalPages: resP20.data.totalPages,
    page: resP20.data.page,
  });

  assert.strictEqual(resP1.data.rows.length, 5, 'Page 1 rows count must be 5');
  assert.strictEqual(resP20.data.rows.length, 0, 'Page 20 rows count must be 0');
  assert.strictEqual(resP1.data.totalOutstanding, resP20.data.totalOutstanding, 'Summary totalOutstanding MUST be identical between page 1 and page 20');
  assert.strictEqual(resP1.data.totalRecords, resP20.data.totalRecords, 'Summary totalRecords MUST be identical between page 1 and page 20');
  assert.strictEqual(resP1.data.totalRecords, 25, 'Total records must be 25');

  console.log('✓ Item 11 Passed: Server pagination returns limit, page, totalRecords, totalPages; summary is independent of page.');

  // ==========================================
  // ITEM 12: Published Exam Grade Snapshot Test
  // ==========================================
  console.log('\n--- Item 12: Published Exam Grade Snapshot Test ---');
  // Create GradeScale V1
  const scaleV1 = await GradeScale.create({
    tenantId: isoId,
    name: 'Original Scale',
    isDefault: true,
    boundaries: [
      { grade: 'A', minPercentage: 80 },
      { grade: 'B', minPercentage: 60 },
      { grade: 'C', minPercentage: 40 },
      { grade: 'F', minPercentage: 0 },
    ],
  });

  const sessionDoc = await AcademicSession.create({
    tenantId: isoId,
    name: '2026-2027',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    isActive: true,
  });

  const classDoc = await Class.create({
    tenantId: isoId,
    name: 'Grade 10',
    sessionId: sessionDoc._id,
  });

  const studentDoc = await Student.create({
    tenantId: isoId,
    admissionNumber: `TEST-ADM-${Date.now()}`,
    rollNumber: 'R-01',
    fullName: 'Snapshot Test Student',
    sessionId: sessionDoc._id,
    classId: classDoc._id,
    gender: 'male',
    dateOfBirth: new Date('2010-01-01'),
    guardianName: 'Parent',
    admissionDate: new Date('2026-01-01'),
    isActive: true,
    isArchived: false,
  });

  const subjectDoc = await Subject.create({
    tenantId: isoId,
    name: 'Physics',
    code: 'PHY-101',
    sessionId: sessionDoc._id,
    classId: classDoc._id,
  });

  const examDoc = await Exam.create({
    tenantId: isoId,
    name: 'Midterm Physics',
    sessionId: sessionDoc._id,
    classId: classDoc._id,
    gradeScaleId: scaleV1._id,
    subjects: [{ subjectId: subjectDoc._id, maxMarks: 100, passMarks: 40 }],
    isPublished: false,
    status: 'Results Pending',
  });

  // Student scores 70% -> In V1 this is grade 'B' (>= 60 and < 80)
  await Mark.create({
    tenantId: isoId,
    examId: examDoc._id,
    sessionId: sessionDoc._id, // required by Mark schema
    studentId: studentDoc._id,
    subjectId: subjectDoc._id,
    marksObtained: 70,
    isAbsent: false,
  });

  // 1. Compute before publishing (draft mode)
  const draftResults = await computeExamResults(mongoose.connection, examDoc as any);
  console.log('Draft Result:', draftResults[0]);
  assert.strictEqual(draftResults[0].grade, 'B', 'Draft exam with 70% must produce grade B under V1');

  // 2. Publish the exam and store Result snapshot
  await Result.create({
    tenantId: isoId,
    examId: examDoc._id,
    studentId: studentDoc._id,
    sessionId: sessionDoc._id,
    classId: classDoc._id,
    version: 1,
    studentSnapshot: {
      fullName: studentDoc.fullName,
      admissionNumber: studentDoc.admissionNumber,
      className: classDoc.name,
      sessionName: sessionDoc.name,
    },
    examSnapshot: {
      examName: examDoc.name,
      gradeScaleName: scaleV1.name,
      gradeScaleBoundaries: scaleV1.boundaries,
    },
    subjects: [
      {
        subjectId: subjectDoc._id,
        subjectName: subjectDoc.name,
        subjectCode: subjectDoc.code,
        marksObtained: 70,
        maximumMarks: 100,
        passMarks: 40,
        attendanceStatus: 'present',
        passed: true,
        percentage: 70,
      },
    ],
    totalObtained: 70,
    totalMaximum: 100,
    percentage: 70,
    overallGrade: 'B',
    passed: true,
    // Required fields per Result schema
    failedSubjectCount: 0,
    sourceChecksum: 'verify-test-checksum-v1',
    calculationVersion: 1,
    publishedAt: new Date(),
  });

  examDoc.isPublished = true;
  examDoc.status = 'Published';
  await examDoc.save();

  // 3. Mutate the GradeScale: change 'B' minPercentage to 75% (so 70% would now be 'C' under current scale!)
  scaleV1.boundaries = [
    { grade: 'A', minPercentage: 80 },
    { grade: 'B', minPercentage: 75 }, // Higher threshold!
    { grade: 'C', minPercentage: 40 },
    { grade: 'F', minPercentage: 0 },
  ];
  await scaleV1.save();

  // 4. Re-run historical Exam Report on the published exam
  const publishedResults = await computeExamResults(mongoose.connection, examDoc as any);
  console.log('Published Result after GradeScale update:', publishedResults[0]);
  assert.strictEqual(publishedResults[0].grade, 'B', 'Published historical grade MUST remain unchanged as B!');

  // 5. Test an unpublished/live exam with the updated scale (should follow new scale -> 70% becomes 'C')
  const examDraft = await Exam.create({
    tenantId: isoId,
    name: 'Draft Physics',
    sessionId: sessionDoc._id,
    classId: classDoc._id,
    gradeScaleId: scaleV1._id,
    subjects: [{ subjectId: subjectDoc._id, maxMarks: 100, passMarks: 40 }],
    isPublished: false,
  });
  // Must insert marks for the draft exam — different examId, so no unique index conflict
  await Mark.create({
    tenantId: isoId,
    examId: examDraft._id,
    sessionId: sessionDoc._id,
    studentId: studentDoc._id,
    subjectId: subjectDoc._id,
    marksObtained: 70,
    isAbsent: false,
  });
  const liveResults = await computeExamResults(mongoose.connection, examDraft as any);
  console.log('Live Unpublished Result with new scale:', liveResults[0]);
  assert.strictEqual(liveResults[0].grade, 'C', 'Live unpublished result must follow current GradeScale (70% -> C)');

  console.log('✓ Item 12 Passed: Published historical grade snapshot preserved as B, while live exam follows updated scale C.');

  // ==========================================
  // ITEM 13: Session History with Archived Student
  // ==========================================
  console.log('\n--- Item 13: Session History with Archived Student ---');
  const sess2025 = await AcademicSession.create({
    tenantId: isoId,
    name: 'Session 2025',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
    isActive: false,
  });

  const sess2026 = await AcademicSession.create({
    tenantId: isoId,
    name: 'Session 2026',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    isActive: true,
  });

  const class5 = await Class.create({
    tenantId: isoId,
    name: 'Class 5',
    sessionId: sess2025._id,
  });

  const class6 = await Class.create({
    tenantId: isoId,
    name: 'Class 6',
    sessionId: sess2026._id,
  });

  const controlledStudent = await Student.create({
    tenantId: isoId,
    admissionNumber: `HIST-STU-${Date.now()}`,
    rollNumber: 'R-02',
    fullName: 'History Test Student',
    sessionId: sess2026._id,
    classId: class6._id,
    gender: 'female',
    dateOfBirth: new Date('2011-01-01'),
    guardianName: 'Guardian',
    admissionDate: new Date('2025-01-01'),
    isActive: true,
    isArchived: false,
  });

  // Record 2025 placement in StudentHistory
  await StudentHistory.create({
    tenantId: isoId,
    studentId: controlledStudent._id,
    sessionId: sess2025._id,
    classId: class5._id,
    eventType: 'promotion',
    remarks: 'Enrolled in 2025',
  });

  // Record 2026 placement in StudentHistory
  await StudentHistory.create({
    tenantId: isoId,
    studentId: controlledStudent._id,
    sessionId: sess2026._id,
    classId: class6._id,
    eventType: 'promotion',
    remarks: 'Promoted to 2026',
  });

  // Archive the student
  controlledStudent.isArchived = true;
  controlledStudent.isActive = false;
  await controlledStudent.save();

  // Run Session Report
  const reqSess: any = { query: {}, tenantId: isoId, user: { role: 'admin', tenantId: String(isoId) } };
  const resSess = await invoke(sessionReport, reqSess, {});
  console.log('Session report rows:', resSess.data.rows);

  const row2025 = resSess.data.rows.find((r: any) => r.session === 'Session 2025');
  const row2026 = resSess.data.rows.find((r: any) => r.session === 'Session 2026');
  console.log('2025 Session Report:', row2025);
  console.log('2026 Session Report:', row2026);

  assert.ok(row2025 && row2025.students >= 1, '2025 Session report must include student from history');
  assert.ok(row2026 && row2026.students >= 1, '2026 Session report must include student from history');

  // Verify StudentHistory records were not deleted by archiving
  const histRecords = await StudentHistory.find({ studentId: controlledStudent._id });
  assert.strictEqual(histRecords.length, 2, 'Archiving student must not delete historical records');

  console.log('✓ Item 13 Passed: Both 2025 and 2026 session records preserved after archiving.');

  // Clean up test tenants
  // NOTE: Result has an immutability pre-hook on deleteMany; bypass via raw collection driver.
  await Promise.all([
    Payment.deleteMany({ tenantId: tId }),
    PaymentReversal.deleteMany({ tenantId: tId }),
    StudentAttendance.deleteMany({ tenantId: tId }),
    Payment.deleteMany({ tenantId: isoId }),
    PaymentReversal.deleteMany({ tenantId: isoId }),
    StudentFee.deleteMany({ tenantId: isoId }),
    Student.deleteMany({ tenantId: isoId }),
    Class.deleteMany({ tenantId: isoId }),
    AcademicSession.deleteMany({ tenantId: isoId }),
    Subject.deleteMany({ tenantId: isoId }),
    Exam.deleteMany({ tenantId: isoId }),
    Mark.deleteMany({ tenantId: isoId }),
    Result.collection.deleteMany({ tenantId: isoId }), // raw driver — bypasses immutability hook
    GradeScale.deleteMany({ tenantId: isoId }),
    StudentHistory.collection.deleteMany({ tenantId: isoId }), // raw driver — bypasses append-only hook
  ]);

  console.log('\n=== ALL TARGETED TESTS PASSED PERFECTLY ===\n');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
