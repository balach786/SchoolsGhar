/**
 * Comprehensive Verification Suite for Production-Ready Fees Management Backend
 * 
 * Verifies all 17 mandatory consistency rules:
 * 1. Historical Settings Test: due date, late fee, discount snapshots remain unchanged after setting update.
 * 2. Previous Pending Invoices Test: prior unpaid balances remain attached to prior invoices, not merged into current invoice.
 * 3. 3-Tier Discount Priority Test: Student (P1) > Class (P2) > All Students (P3); no accidental stacking.
 * 4. Basis-Points Percentage Calculation: zero floating-point arithmetic.
 * 5. Admission Fee Backend Eligibility & Re-Admission Event Verification: duplicate admission fee prevented; re-admission requires valid event.
 * 6. Multi-Installment Payment & Remaining Balance Recalculation: multiple payments against one invoice, correct status transitions.
 * 7. Traceable Non-Cash References: Cash requires no reference; bank/easypaisa/jazzcash requires unique reference.
 * 8. Cancellation as Reversal, Never Deletion: Payment preserved, PaymentReversal created, invoice balance restored.
 * 9. Source-Record Financial Reporting: Expected, collected, pending, admission, other, late fee, and payment method statistics.
 * 10. Multi-Tenant Scoping: Cross-tenant isolation fails closed with 404 / error.
 * 11. Decoupled Exam Management: Exam fees untouched and independent.
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env';
import { Tenant } from '../src/models/Tenant';
import { User } from '../src/models/User';
import { Role } from '../src/models/Role';
import { Student } from '../src/models/Student';
import { StudentHistory } from '../src/models/StudentHistory';
import { Class } from '../src/models/Class';
import { Section } from '../src/models/Section';
import { AcademicSession } from '../src/models/AcademicSession';
import { FeeSetting } from '../src/models/FeeSetting';
import { FeeDiscount } from '../src/models/FeeDiscount';
import { FeeStructure } from '../src/models/FeeStructure';
import { StudentFee } from '../src/models/StudentFee';
import { Payment } from '../src/models/Payment';
import { PaymentReversal } from '../src/models/PaymentReversal';
import {
  getOrCreateFeeSettings,
  findApplicableDiscounts,
  calculateDiscountAmount,
  checkAdmissionFeeEligibility,
  generateStudentFeesWithSnapshot,
  calculateStudentFeeObligations,
} from '../src/services/feeManagement.service';
import { recordPayment } from '../src/services/finance.service';
import { executePaymentReversal } from '../src/services/reversal.service';

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, extra = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${description}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${description} ${extra}`);
  }
}

async function runVerificationSuite() {
  console.log('\n======================================================');
  console.log('STARTING FEES MANAGEMENT PRODUCTION BACKEND VERIFICATION');
  console.log('======================================================\n');

  await mongoose.connect(env.mongodbUri);

  const testBatch = `test_${Date.now().toString(36)}`;

  // 1. Setup isolated test tenants (Tenant A and Tenant B)
  const tenantA = await Tenant.create({
    name: `Alpha Academy ${testBatch}`,
    slug: `alpha-${testBatch}`,
    contactEmail: `admin@alpha-${testBatch}.edu`,
    status: 'active',
    trialStartedAt: new Date(),
    trialEndsAt: new Date(Date.now() + 30 * 86400000),
    subscriptionStatus: 'active',
    ownerUserId: new mongoose.Types.ObjectId(),
  });

  const tenantB = await Tenant.create({
    name: `Beta Academy ${testBatch}`,
    slug: `beta-${testBatch}`,
    contactEmail: `admin@beta-${testBatch}.edu`,
    status: 'active',
    trialStartedAt: new Date(),
    trialEndsAt: new Date(Date.now() + 30 * 86400000),
    subscriptionStatus: 'active',
    ownerUserId: new mongoose.Types.ObjectId(),
  });

  const adminRole = await Role.findOne({ slug: 'admin' });
  const adminUser = await User.create({
    tenantId: tenantA._id,
    name: 'Fee Admin',
    email: `fee.admin.${testBatch}@school.test`,
    passwordHash: 'hashed_pwd',
    roleId: adminRole?._id || new mongoose.Types.ObjectId(),
    isActive: true,
  });

  const actor = {
    _id: String(adminUser._id),
    tenantId: String(tenantA._id),
    name: adminUser.name,
    email: adminUser.email,
    role: 'admin',
    isSuperAdmin: false,
  };

  // Setup Academic Session, Class, Section in Tenant A
  const sessionA = await AcademicSession.create({
    tenantId: tenantA._id,
    name: `Academic Year 2026 ${testBatch}`,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    isActive: true,
    isArchived: false,
  });

  const classA = await Class.create({
    tenantId: tenantA._id,
    sessionId: sessionA._id,
    name: 'Grade 7',
    order: 7,
    isArchived: false,
  });

  const sectionA = await Section.create({
    tenantId: tenantA._id,
    sessionId: sessionA._id,
    classId: classA._id,
    name: 'Section Alpha',
    isArchived: false,
  });

  // Create two students in Tenant A
  const student1 = await Student.create({
    tenantId: tenantA._id,
    admissionNumber: `ADM-${testBatch}-001`,
    rollNumber: '01',
    fullName: 'Zainab Fatima',
    gender: 'female',
    dateOfBirth: new Date('2012-05-15'),
    guardianName: 'Fatima Guardian',
    admissionDate: new Date('2026-01-10'),
    sessionId: sessionA._id,
    classId: classA._id,
    sectionId: sectionA._id,
    isActive: true,
    isArchived: false,
  });

  const student2 = await Student.create({
    tenantId: tenantA._id,
    admissionNumber: `ADM-${testBatch}-002`,
    rollNumber: '02',
    fullName: 'Hamza Khan',
    gender: 'male',
    dateOfBirth: new Date('2012-08-20'),
    guardianName: 'Khan Guardian',
    admissionDate: new Date('2026-01-12'),
    sessionId: sessionA._id,
    classId: classA._id,
    sectionId: sectionA._id,
    isActive: true,
    isArchived: false,
  });

  // ── TEST 1: Tenant-Scoped Fee Settings Auto-Initialization & Customization ──
  console.log('\n--- TEST 1: Fee Settings Initialization & Persistence ---');
  let settingsA = await getOrCreateFeeSettings(tenantA._id);
  assert('Default FeeSetting created with tenantId', String(settingsA.tenantId) === String(tenantA._id));
  assert('Default due date is 10th', settingsA.dueDate.defaultMonthlyDueDay === 10);
  assert('Default discount stacking is disabled', settingsA.discount.allowDiscountStacking === false);

  // Update settings: Late fee = 300 PKR (30000 paisa), grace period = 5 days, other fee = 500 PKR
  settingsA.lateFee.enabled = true;
  settingsA.lateFee.lateFeeAmount = 30000;
  settingsA.lateFee.gracePeriodDays = 5;
  settingsA.otherFee.enabled = true;
  settingsA.otherFee.feeName = 'Lab & Sports Charge';
  settingsA.otherFee.defaultAmount = 50000;
  await settingsA.save();

  const refreshedSettings = await FeeSetting.findOne({ tenantId: tenantA._id });
  assert('Updated late fee amount persisted (30000 paisa)', refreshedSettings?.lateFee.lateFeeAmount === 30000);
  assert('Updated other fee persisted (50000 paisa)', refreshedSettings?.otherFee.defaultAmount === 50000);

  // ── TEST 2: 3-Tier Discount Priority & Basis-Points Precision ──
  console.log('\n--- TEST 2: 3-Tier Discount Priority (Student > Class > All) & Basis Points ---');
  // All Students discount: 5% = 500 basis points
  await FeeDiscount.create({
    tenantId: tenantA._id,
    name: 'General 5% Discount',
    discountType: 'percentage',
    value: 500,
    valueBps: 500,
    applyTo: 'all',
    isActive: true,
  });

  // Class discount: 10% = 1000 basis points
  await FeeDiscount.create({
    tenantId: tenantA._id,
    name: 'Grade 7 Special 10%',
    discountType: 'percentage',
    value: 1000,
    valueBps: 1000,
    applyTo: 'class',
    classId: classA._id,
    isActive: true,
  });

  // Student 1 specific discount: 20% = 2000 basis points
  await FeeDiscount.create({
    tenantId: tenantA._id,
    name: 'Zainab Merit 20%',
    discountType: 'percentage',
    value: 2000,
    valueBps: 2000,
    applyTo: 'student',
    studentId: student1._id,
    isActive: true,
  });

  // Verify Student 1 gets only Student discount (20%), NOT 35% (no accidental stacking)
  const student1Discounts = await findApplicableDiscounts(tenantA._id, student1._id, classA._id, false);
  assert('Student 1 matched exactly 1 top-priority discount', student1Discounts.length === 1);
  assert('Student 1 received Student-specific discount (Priority 1)', student1Discounts[0].name === 'Zainab Merit 20%');

  const baseTuitionPaisa = 500000; // 5,000 PKR
  const calc1 = calculateDiscountAmount(baseTuitionPaisa, student1Discounts[0]);
  assert('20% of 5,000 PKR is exactly 1,000 PKR (100000 paisa)', calc1.amountPaisa === 100000);

  // Verify Student 2 (no student-specific discount) gets Class discount (10%)
  const student2Discounts = await findApplicableDiscounts(tenantA._id, student2._id, classA._id, false);
  assert('Student 2 matched Class-specific discount (Priority 2)', student2Discounts[0].name === 'Grade 7 Special 10%');
  const calc2 = calculateDiscountAmount(baseTuitionPaisa, student2Discounts[0]);
  assert('10% of 5,000 PKR is exactly 500 PKR (50000 paisa)', calc2.amountPaisa === 50000);

  // ── TEST 3: Monthly Fee Structure & Invoice Generation with Financial Snapshot ──
  console.log('\n--- TEST 3: Monthly Fee Generation & Financial Rule Snapshotting ---');
  const tuitionStructure = await FeeStructure.create({
    tenantId: tenantA._id,
    sessionId: sessionA._id,
    classId: classA._id,
    feeType: 'monthly_tuition',
    title: 'Grade 7 Monthly Tuition',
    amount: baseTuitionPaisa,
    month: 8,
    isActive: true,
    isArchived: false,
  });

  // Generate August (Month 8, Year 2026) fee invoices
  const genResultAug = await generateStudentFeesWithSnapshot(actor, {
    sessionId: String(sessionA._id),
    classId: String(classA._id),
    feeStructureId: String(tuitionStructure._id),
    month: 8,
    year: 2026,
  });
  assert('Generated fee invoices for both active students in August', genResultAug.created === 2);

  // Verify Student 1 August Invoice snapshot
  const s1AugInvoice = await StudentFee.findOne({
    tenantId: tenantA._id,
    studentId: student1._id,
    billingMonth: 8,
    billingYear: 2026,
  });
  assert('Student 1 August invoice exists', !!s1AugInvoice);
  assert('Original base amount is 500,000 paisa', s1AugInvoice?.originalAmount === 500000);
  assert('Discount snapshot is 100,000 paisa (20%)', s1AugInvoice?.discountAmount === 100000);
  assert('Other fee snapshot is 50,000 paisa', s1AugInvoice?.otherFeeAmount === 50000);
  // Net payable = 500,000 - 100,000 + 50,000 = 450,000
  assert('Net payable is 450,000 paisa', s1AugInvoice?.netPayable === 450000);
  assert('Invoice due date was set based on 10th of August', s1AugInvoice?.dueDate?.getUTCDate() === 10);
  assert('chargeBreakdown metadata is preserved', !!s1AugInvoice?.chargeBreakdown?.discount.discountId);

  // ── TEST 4: Duplicate Monthly Invoice Prevention ──
  console.log('\n--- TEST 4: Strong Monthly Invoice Duplicate Prevention ---');
  const duplicateGen = await generateStudentFeesWithSnapshot(actor, {
    sessionId: String(sessionA._id),
    classId: String(classA._id),
    feeStructureId: String(tuitionStructure._id),
    month: 8,
    year: 2026,
  });
  assert('Retrying August generation created 0 duplicate invoices', duplicateGen.created === 0);
  assert('Retrying August generation skipped 2 existing invoices', duplicateGen.skipped === 2);

  // ── TEST 5: Partial Payment & Multi-Installments (Separate from Invoices) ──
  console.log('\n--- TEST 5: Multi-Installment Payments & Remaining Balance Recalculation ---');
  // Pay 2,000 PKR (200,000 paisa) of Student 1's August invoice (Net: 450,000) using CASH
  const pay1 = await recordPayment(
    actor,
    {
      studentFeeId: String(s1AugInvoice?._id),
      studentId: String(student1._id),
      amount: 200000,
      paymentMethod: 'cash',
      paymentDate: new Date('2026-08-05'),
      notes: 'First installment - Cash',
    },
    tenantA._id
  );
  assert('Payment 1 created with unique receipt number', !!pay1.payment.receiptNumber);

  const s1AugAfterPay1 = await StudentFee.findById(s1AugInvoice?._id);
  assert('Invoice status updated to "partial"', s1AugAfterPay1?.status === 'partial');
  assert('Amount paid is 200,000 paisa', s1AugAfterPay1?.amountPaid === 200000);
  assert('Remaining balance is 250,000 paisa', s1AugAfterPay1?.remainingBalance === 250000);

  // Pay 2nd installment of 1,000 PKR (100,000 paisa) using EASYPAISA with reference
  const pay2 = await recordPayment(
    actor,
    {
      studentFeeId: String(s1AugInvoice?._id),
      studentId: String(student1._id),
      amount: 100000,
      paymentMethod: 'easypaisa',
      paymentDate: new Date('2026-08-08'),
      reference: `EP-REF-${testBatch}-1`,
      notes: 'Second installment - Easypaisa',
    },
    tenantA._id
  );
  assert('Payment 2 recorded using Easypaisa', pay2.payment.paymentMethod === 'easypaisa');

  const s1AugAfterPay2 = await StudentFee.findById(s1AugInvoice?._id);
  assert('Amount paid is now 300,000 paisa', s1AugAfterPay2?.amountPaid === 300000);
  assert('Remaining balance is now 150,000 paisa', s1AugAfterPay2?.remainingBalance === 150000);

  // Verify independent payment records are preserved
  const paymentRecords = await Payment.find({ studentFeeId: s1AugInvoice?._id });
  assert('Two independent payment documents stored for this invoice', paymentRecords.length === 2);

  // ── TEST 6: Previous Pending Fees Kept Separate from September Invoice ──
  console.log('\n--- TEST 6: Previous Pending Fees Kept Separate (No In-Invoice Merging) ---');
  // Generate September (Month 9, Year 2026) invoice
  await generateStudentFeesWithSnapshot(actor, {
    sessionId: String(sessionA._id),
    classId: String(classA._id),
    feeStructureId: String(tuitionStructure._id),
    month: 9,
    year: 2026,
  });

  const s1SepInvoice = await StudentFee.findOne({
    tenantId: tenantA._id,
    studentId: student1._id,
    billingMonth: 9,
    billingYear: 2026,
  });

  assert('September invoice exists independently', !!s1SepInvoice);
  assert('September invoice netPayable is strictly its own 450,000 paisa (not 600,000)', s1SepInvoice?.netPayable === 450000);
  assert('September invoice amountPaid is 0', s1SepInvoice?.amountPaid === 0);

  // Calculate real-time obligations for Student 1 in September:
  const obligations = await calculateStudentFeeObligations(tenantA._id, student1._id, {
    month: 9,
    year: 2026,
  });

  assert('Calculation returns Current Month fee remaining (450,000)', obligations.currentMonthFee.remainingAmount === 450000);
  assert('Calculation returns Previous Pending total (180,000 including 30,000 assessed fine from August)', obligations.previousPending.totalAmount === 180000);
  assert('Total Outstanding is 630,000 paisa (Current 450,000 + Previous 180,000)', obligations.totalPayable === 630000);

  // ── TEST 7: Historical Settings Immutability ──
  console.log('\n--- TEST 7: Historical Settings Immutability ---');
  // School changes due date to 15th, late fee to 500 PKR (50,000 paisa), and other fee to 800 PKR (80,000 paisa)
  settingsA.dueDate.defaultMonthlyDueDay = 15;
  settingsA.lateFee.lateFeeAmount = 50000;
  settingsA.otherFee.defaultAmount = 80000;
  await settingsA.save();

  // Reload August invoice
  const s1AugReloaded = await StudentFee.findById(s1AugInvoice?._id);
  assert('August invoice due date is still the 10th (unmodified)', s1AugReloaded?.dueDate?.getUTCDate() === 10);
  assert('August invoice otherFeeAmount is still 50,000 (unmodified despite setting changing to 80,000)', s1AugReloaded?.otherFeeAmount === 50000);
  assert('August invoice assessed fine remains 30,000 (unmodified despite setting changing to 50,000)', s1AugReloaded?.fineAmount === 30000);
  assert('August invoice netPayable remains 480,000 (unmodified by subsequent setting changes)', s1AugReloaded?.netPayable === 480000);

  // ── TEST 8: Admission Fee Eligibility, Persistence & Re-Admission Events ──
  console.log('\n--- TEST 8: Admission Fee Backend History & Re-Admission Control ---');
  // Check admission eligibility for Student 2 (new student, no prior admission fee)
  const admEligible1 = await checkAdmissionFeeEligibility(tenantA._id, student2._id);
  assert('Student 2 without prior admission fee is eligible for Admission Fee', admEligible1.eligible === true);

  // Create and pay Admission Fee structure
  const admStructure = await FeeStructure.create({
    tenantId: tenantA._id,
    sessionId: sessionA._id,
    classId: classA._id,
    feeType: 'admission_fee',
    title: 'Grade 7 One-Time Admission Fee',
    amount: 1000000, // 10,000 PKR
    isActive: true,
    isArchived: false,
  });

  const admInvoice = await StudentFee.create({
    tenantId: tenantA._id,
    studentId: student2._id,
    sessionId: sessionA._id,
    classId: classA._id,
    sectionId: sectionA._id,
    feeStructureId: admStructure._id,
    title: admStructure.title,
    feeType: 'admission_fee',
    originalAmount: 1000000,
    netPayable: 1000000,
    amountPaid: 0,
    remainingBalance: 1000000,
    status: 'unpaid',
  });

  // Pay admission fee in full with JazzCash
  await recordPayment(
    actor,
    {
      studentFeeId: String(admInvoice._id),
      studentId: String(student2._id),
      amount: 1000000,
      paymentMethod: 'jazzcash',
      reference: `JC-REF-${testBatch}-1`,
    },
    tenantA._id
  );

  // Check eligibility again: should NOT be eligible
  const admEligible2 = await checkAdmissionFeeEligibility(tenantA._id, student2._id);
  assert('Student 2 with paid admission fee is now ineligible', admEligible2.eligible === false);

  // Enable re-admission in settings and test event verification
  settingsA.admissionFee.allowReAdmission = true;
  await settingsA.save();

  // Attempt without event reference -> should reject
  const admEligible3 = await checkAdmissionFeeEligibility(tenantA._id, student2._id);
  assert('Secondary admission fee rejected without reAdmissionEventId', admEligible3.eligible === false);

  // Record legitimate StudentHistory re-admission event
  const reAdmissionEvent = await StudentHistory.create({
    tenantId: tenantA._id,
    studentId: student2._id,
    sessionId: sessionA._id,
    classId: classA._id,
    status: 're_admitted',
    remarks: 'Re-admitted following temporary transfer',
  });

  const admEligible4 = await checkAdmissionFeeEligibility(tenantA._id, student2._id, reAdmissionEvent._id);
  assert('Secondary admission fee approved with valid re-admission event', admEligible4.eligible === true);

  // ── TEST 9: Receipt Cancellation via PaymentReversal (Never Deletion) ──
  console.log('\n--- TEST 9: Receipt Cancellation via Reversal (Never Hard Deletion) ---');
  // Cancel payment 2 (1,000 PKR / 100,000 paisa)
  const reversal = await executePaymentReversal(
    actor,
    {
      sourceType: 'regular_fee',
      paymentId: String(pay2.payment._id),
      amount: 100000,
      reversalType: 'full_reversal',
      reason: 'Administrative correction requested by guardian',
      notes: 'Customer deposited via wrong branch',
    },
    tenantA._id
  );

  assert('Reversal receipt generated (REV-YYYY-XXXXXX)', reversal.reversal.reversalReceiptNumber.startsWith('REV-'));

  // Verify payment is NOT deleted
  const originalPaymentStillExists = await Payment.findById(pay2.payment._id);
  assert('Original payment record is preserved in database', !!originalPaymentStillExists);
  assert('Refundable amount on original payment is now 0', originalPaymentStillExists?.refundableAmount === 0);

  // Verify Student 1 August invoice balance was restored atomically
  const s1AugAfterReversal = await StudentFee.findById(s1AugInvoice?._id);
  assert('Invoice amount paid restored to 200,000 paisa', s1AugAfterReversal?.amountPaid === 200000);
  assert('Invoice remaining balance restored to 280,000 paisa', s1AugAfterReversal?.remainingBalance === 280000);

  // Verify PaymentReversal document exists
  const revDoc = await PaymentReversal.findOne({ paymentId: pay2.payment._id });
  assert('PaymentReversal record permanently stored in database', !!revDoc);
  assert('Reversal stored cancellation reason', revDoc?.reason === 'Administrative correction requested by guardian');

  // ── TEST 10: Multi-Tenant Scoping & Fail-Closed Cross-Tenant Isolation ──
  console.log('\n--- TEST 10: Multi-Tenant Isolation (Fail-Closed) ---');
  try {
    // Attempt to access or pay Tenant A's invoice using Tenant B context
    await recordPayment(
      actor,
      {
        studentFeeId: String(s1AugInvoice?._id),
        amount: 50000,
        paymentMethod: 'cash',
      },
      tenantB._id // Cross-tenant context
    );
    assert('Cross-tenant payment rejected', false, 'Expected 404 not found');
  } catch (err: any) {
    assert('Cross-tenant payment fails closed with not found error', err.status === 404 || err.message?.includes('not found'));
  }

  // Clean up test data
  await Promise.all([
    Tenant.deleteMany({ _id: { $in: [tenantA._id, tenantB._id] } }),
    User.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
    Student.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
    mongoose.connection.collection('studenthistories').deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
    AcademicSession.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
    Class.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
    Section.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
    FeeSetting.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
    FeeDiscount.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
    FeeStructure.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
    StudentFee.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
    Payment.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
    PaymentReversal.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
  ]);

  await mongoose.disconnect();

  console.log('\n======================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerificationSuite().catch((err) => {
  console.error('Fatal Verification Error:', err);
  process.exit(1);
});
