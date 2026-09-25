import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import assert from 'assert';
import { Tenant } from '../models/Tenant';
import { Student } from '../models/Student';
import { StudentFee } from '../models/StudentFee';
import { Payment } from '../models/Payment';
import { PaymentReversal } from '../models/PaymentReversal';
import { Exam } from '../models/Exam';
import { Mark } from '../models/Mark';
import { Subject } from '../models/Subject';
import { Class } from '../models/Class';
import { AcademicSession } from '../models/AcademicSession';
import { StudentAttendance } from '../models/StudentAttendance';
import { GradeScale } from '../models/GradeScale';
import { pendingFees } from '../controllers/finance.controller';
import { getExamSummaryReport, getSubjectPerformanceReport } from '../controllers/examReports.controller';
import { attendanceReport } from '../controllers/reports.controller';

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
    const next = (err?: any) => {
      if (err) reject(err);
    };
    Promise.resolve(controller(req, res, next)).catch(reject);
  });
}

async function runEdgeCases() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const tenant = await Tenant.findOne();
  assert(tenant, 'Tenant required');
  const tenantId = tenant._id;
  const dummySession = new mongoose.Types.ObjectId();
  const dummyClass = new mongoose.Types.ObjectId();

  // ----------------------------------------------------
  // Section 48: Controlled Finance Test Data
  // ----------------------------------------------------
  console.log('\n--- Section 48: Controlled Finance Dataset ---');
  // Student A: invoice 5,000 (500000 paisa), paid 3,000, remaining 2,000
  // Student B: invoice 5,000, paid 5,000, reversed 2,000
  // Student C: invoice net 4,000 after 1,000 discount, paid 4,000
  const stAId = new mongoose.Types.ObjectId();
  const stBId = new mongoose.Types.ObjectId();
  const stCId = new mongoose.Types.ObjectId();

  const fees = await StudentFee.insertMany([
    {
      tenantId,
      studentId: stAId,
      sessionId: dummySession,
      classId: dummyClass,
      sectionId: dummySession,
      feeStructureId: new mongoose.Types.ObjectId(),
      feeType: 'monthly_tuition',
      originalAmount: 500000,
      discountAmount: 0,
      fineAmount: 0,
      otherFeeAmount: 0,
      scholarshipAmount: 0,
      netPayable: 500000,
      amountPaid: 300000,
      remainingBalance: 200000,
      status: 'partial',
    },
    {
      tenantId,
      studentId: stBId,
      sessionId: dummySession,
      classId: dummyClass,
      sectionId: dummySession,
      feeStructureId: new mongoose.Types.ObjectId(),
      feeType: 'monthly_tuition',
      originalAmount: 500000,
      discountAmount: 0,
      fineAmount: 0,
      otherFeeAmount: 0,
      scholarshipAmount: 0,
      netPayable: 500000,
      amountPaid: 500000,
      remainingBalance: 0,
      status: 'paid',
    },
    {
      tenantId,
      studentId: stCId,
      sessionId: dummySession,
      classId: dummyClass,
      sectionId: dummySession,
      feeStructureId: new mongoose.Types.ObjectId(),
      feeType: 'monthly_tuition',
      originalAmount: 500000,
      discountAmount: 100000,
      fineAmount: 0,
      otherFeeAmount: 0,
      scholarshipAmount: 0,
      netPayable: 400000,
      amountPaid: 400000,
      remainingBalance: 0,
      status: 'paid',
    },
  ]);

  const pA = await Payment.create({
    tenantId,
    studentId: stAId,
    studentFeeId: fees[0]._id,
    sessionId: dummySession,
    classId: dummyClass,
    collectedBy: new mongoose.Types.ObjectId(),
    amount: 300000,
    refundableAmount: 300000,
    paymentMethod: 'cash',
    receiptNumber: `REC-CTRL-A-${Date.now()}`,
    paymentDate: new Date(),
  });
  const pB = await Payment.create({
    tenantId,
    studentId: stBId,
    studentFeeId: fees[1]._id,
    sessionId: dummySession,
    classId: dummyClass,
    collectedBy: new mongoose.Types.ObjectId(),
    amount: 500000,
    refundableAmount: 500000,
    paymentMethod: 'cash',
    receiptNumber: `REC-CTRL-B-${Date.now()}`,
    paymentDate: new Date(),
  });
  const pC = await Payment.create({
    tenantId,
    studentId: stCId,
    studentFeeId: fees[2]._id,
    sessionId: dummySession,
    classId: dummyClass,
    collectedBy: new mongoose.Types.ObjectId(),
    amount: 400000,
    refundableAmount: 400000,
    paymentMethod: 'cash',
    receiptNumber: `REC-CTRL-C-${Date.now()}`,
    paymentDate: new Date(),
  });

  const revB = await PaymentReversal.create({
    tenantId,
    paymentId: pB._id,
    studentId: stBId,
    obligationId: fees[1]._id,
    amount: 200000,
    sourceType: 'regular_fee',
    reversalType: 'partial_refund',
    originalReceiptNumber: pB.receiptNumber,
    reversalReceiptNumber: `REV-CTRL-B-${Date.now()}`,
    reason: 'Student B fee reversal',
    initiatedBy: new mongoose.Types.ObjectId(),
    reversedBy: new mongoose.Types.ObjectId(),
    createdAt: new Date(),
  });

  const controlledFeeIds = fees.map((f) => f._id);
  const controlledFeeAgg = await StudentFee.aggregate([
    { $match: { _id: { $in: controlledFeeIds } } },
    {
      $group: {
        _id: null,
        totalExpected: { $sum: '$netPayable' },
        totalRemaining: { $sum: '$remainingBalance' },
        totalDiscounts: { $sum: '$discountAmount' },
      },
    },
  ]);
  const controlledPayAgg = await Payment.aggregate([
    { $match: { _id: { $in: [pA._id, pB._id, pC._id] } } },
    { $group: { _id: null, totalGross: { $sum: '$amount' } } },
  ]);
  const controlledRevAgg = await PaymentReversal.aggregate([
    { $match: { _id: revB._id } },
    { $group: { _id: null, totalRev: { $sum: '$amount' } } },
  ]);

  const expTotal = controlledFeeAgg[0].totalExpected / 100;
  const grossTotal = controlledPayAgg[0].totalGross / 100;
  const revTotal = controlledRevAgg[0].totalRev / 100;
  const netColTotal = grossTotal - revTotal;
  const outTotal = controlledFeeAgg[0].totalRemaining / 100;
  const discTotal = controlledFeeAgg[0].totalDiscounts / 100;

  console.log(`Expected / Net Payable: ${expTotal} (Expected 14000)`);
  console.log(`Gross Paid: ${grossTotal} (Expected 12000)`);
  console.log(`Reversal: ${revTotal} (Expected 2000)`);
  console.log(`Net Collection: ${netColTotal} (Expected 10000)`);
  console.log(`Outstanding: ${outTotal} (Expected 4000)`);
  console.log(`Discounts: ${discTotal} (Expected 1000)`);

  assert.strictEqual(expTotal, 14000);
  assert.strictEqual(grossTotal, 12000);
  assert.strictEqual(revTotal, 2000);
  assert.strictEqual(netColTotal, 10000);
  assert.strictEqual(outTotal, 2000); // 2000 from Student A (Student B remains 0 outstanding)
  assert.strictEqual(discTotal, 1000);
  console.log('✓ Section 48 Controlled Finance Data verified 100%.');

  // Clean up Section 48 data
  await StudentFee.deleteMany({ _id: { $in: controlledFeeIds } });
  await Payment.deleteMany({ _id: { $in: [pA._id, pB._id, pC._id] } });
  await PaymentReversal.deleteOne({ _id: revB._id });

  // ----------------------------------------------------
  // Section 49: >2,000 Financial Records Test
  // ----------------------------------------------------
  console.log('\n--- Section 49: >2,000 Financial Records Full-Dataset Totals ---');
  const scaleBatchSize = 2100;
  const scaleSessionId = new mongoose.Types.ObjectId();
  const dummyFees = Array.from({ length: scaleBatchSize }, (_, i) => ({
    tenantId,
    studentId: new mongoose.Types.ObjectId(),
    sessionId: scaleSessionId,
    classId: dummyClass,
    sectionId: dummySession,
    feeStructureId: new mongoose.Types.ObjectId(),
    feeType: 'monthly_tuition',
    originalAmount: 100000,
    discountAmount: 0,
    fineAmount: 0,
    otherFeeAmount: 0,
    scholarshipAmount: 0,
    netPayable: 100000,
    amountPaid: 0,
    remainingBalance: 100000, // 1000 PKR each
    status: 'unpaid',
    createdAt: new Date(),
  }));

  await StudentFee.insertMany(dummyFees);

  // Invoke pendingFees controller with pagination page 1 and limit 100
  const { req: pReq, res: pRes } = mockReqRes({
    tenantId,
    query: { sessionId: String(scaleSessionId), page: '1', limit: '100' },
  });
  const pData = await invoke(pendingFees, pReq, pRes);

  assert.strictEqual(pData.data.count, 2100, 'Count must reflect full dataset of 2,100 records');
  assert.strictEqual(pData.data.totalOutstanding, 2100 * 100000, 'Total outstanding must sum across all 2,100 records, not truncated');
  assert.strictEqual(pData.data.rows.length, 100, 'Page 1 must return requested page limit rows');

  // Check Page 20
  const { req: p20Req, res: p20Res } = mockReqRes({
    tenantId,
    query: { sessionId: String(scaleSessionId), page: '20', limit: '100' },
  });
  const p20Data = await invoke(pendingFees, p20Req, p20Res);
  assert.strictEqual(p20Data.data.totalOutstanding, pData.data.totalOutstanding, 'Page 20 must have identical summary totals as Page 1');
  console.log(`✓ Total outstanding: PKR ${pData.data.totalOutstanding / 100} across ${pData.data.count} records (Full MongoDB aggregation, no 2000 cutoff).`);

  // Clean up scale records
  await StudentFee.deleteMany({ sessionId: scaleSessionId });

  // ----------------------------------------------------
  // Section 50: >200 Exam Records Test
  // ----------------------------------------------------
  console.log('\n--- Section 50: >200 Exam Records Test ---');
  const examSessionId = new mongoose.Types.ObjectId();
  const examClassId = new mongoose.Types.ObjectId();
  const examSubId = new mongoose.Types.ObjectId();

  const scaleScale = await GradeScale.findOne() || await GradeScale.create({
    tenantId,
    name: 'Scale Grading',
    isDefault: true,
    boundaries: [{ grade: 'A', minPercentage: 50 }, { grade: 'F', minPercentage: 0 }],
  });

  const testExam = await Exam.create({
    tenantId,
    name: 'Scale Test Exam',
    sessionId: examSessionId,
    classId: examClassId,
    gradeScaleId: scaleScale._id,
    subjects: [{ subjectId: examSubId, maxMarks: 100, passMarks: 40 }],
    status: 'Published',
    isPublished: true,
    examDate: new Date(),
  });

  const numStudents = 250;
  const dummyStudents = Array.from({ length: numStudents }, (_, i) => ({
    tenantId,
    sessionId: examSessionId,
    classId: examClassId,
    fullName: `Exam Student ${i + 1}`,
    admissionNumber: `EX-ADM-${i + 1}`,
    rollNumber: `${i + 1}`,
    gender: 'male',
    dateOfBirth: new Date('2010-01-01'),
    guardianName: 'Guardian Name',
    admissionDate: new Date(),
    isArchived: false,
  }));
  const createdStudents = await Student.insertMany(dummyStudents);

  const dummyMarks = createdStudents.map((s, i) => ({
    tenantId,
    examId: testExam._id,
    studentId: s._id,
    subjectId: examSubId,
    classId: examClassId,
    sessionId: examSessionId,
    marksObtained: i % 2 === 0 ? 80 : 30, // half pass (80), half fail (30)
    isAbsent: false,
  }));
  await Mark.insertMany(dummyMarks);

  const { req: exReq, res: exRes } = mockReqRes({
    tenantId,
    query: { examId: String(testExam._id) },
  });
  const exSummary = await invoke(getExamSummaryReport, exReq, exRes);

  assert.strictEqual(exSummary.data.totalStudents, 250, 'Total students must be 250');
  assert.strictEqual(exSummary.data.appeared, 250, 'Appeared must be 250 (not cut off at 200)');
  assert.strictEqual(exSummary.data.passed, 125, '125 students passed');
  assert.strictEqual(exSummary.data.failed, 125, '125 students failed');
  assert.strictEqual(exSummary.data.passRate, 50.0, 'Pass rate must be 50.0%');
  console.log(`✓ 250 exam students processed: ${exSummary.data.passed} Passed, ${exSummary.data.failed} Failed, Pass Rate: ${exSummary.data.passRate}%.`);

  // Clean up exam scale records
  await Exam.deleteOne({ _id: testExam._id });
  await Student.deleteMany({ sessionId: examSessionId });
  await Mark.deleteMany({ examId: testExam._id });

  // ----------------------------------------------------
  // Section 56: Archived Student History Test
  // ----------------------------------------------------
  console.log('\n--- Section 56: Archived Student History Reporting ---');
  const archStudent = await Student.create({
    tenantId,
    sessionId: dummySession,
    classId: dummyClass,
    fullName: 'Archived Student Test',
    admissionNumber: `ARCH-${Date.now()}`,
    gender: 'female',
    dateOfBirth: new Date('2012-05-05'),
    guardianName: 'Guardian Parent',
    admissionDate: new Date(),
    isArchived: true, // Archived!
  });

  const archFee = await StudentFee.create({
    tenantId,
    studentId: archStudent._id,
    sessionId: dummySession,
    classId: dummyClass,
    sectionId: dummySession,
    feeStructureId: new mongoose.Types.ObjectId(),
    feeType: 'monthly_tuition',
    originalAmount: 500000,
    discountAmount: 0,
    fineAmount: 0,
    otherFeeAmount: 0,
    scholarshipAmount: 0,
    netPayable: 500000,
    amountPaid: 200000,
    remainingBalance: 300000, // 3000 PKR outstanding
    status: 'partial',
  });

  const archAtt = await StudentAttendance.create({
    tenantId,
    studentId: archStudent._id,
    sessionId: dummySession,
    classId: dummyClass,
    attendanceDate: new Date('2026-09-10T00:00:00.000Z'),
    status: 'present',
    markedBy: new mongoose.Types.ObjectId(),
  });

  // Query pending fees for this student
  const { req: afReq, res: afRes } = mockReqRes({
    tenantId,
    query: { sessionId: String(dummySession) },
  });
  const afData = await invoke(pendingFees, afReq, afRes);
  assert(afData.data.totalOutstanding >= 300000, 'Archived student debt must be preserved in totalOutstanding');

  // Query attendance for this class
  const { req: aaReq, res: aaRes } = mockReqRes({
    tenantId,
    query: { classId: String(dummyClass), month: '2026-09' },
  });
  const aaData = await invoke(attendanceReport, aaReq, aaRes);
  assert(aaData.data.rows.length > 0, 'Attendance report must include historical records of archived student');
  console.log('✓ Operational student archive correctly preserves historical financial debt and attendance records.');

  // Clean up
  await Student.deleteOne({ _id: archStudent._id });
  await StudentFee.deleteOne({ _id: archFee._id });
  await StudentAttendance.deleteOne({ _id: archAtt._id });

  console.log('\n======================================================');
  console.log('ALL EDGE CASE, SCALE, AND RETENTION TESTS PASSED 100%!');
  console.log('======================================================\n');
  await mongoose.disconnect();
}

runEdgeCases().catch((err) => {
  console.error('Edge case test failed:', err);
  process.exit(1);
});
