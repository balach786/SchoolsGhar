import mongoose from 'mongoose';
import { getTenantModels } from '../services/TenantModelRegistry';
import { IFeeSetting } from '../models/FeeSetting';
import { IFeeDiscount } from '../models/FeeDiscount';
import { ApiError } from '../utils/ApiError';
import { IStudentFee, IChargeBreakdown } from '../models/StudentFee';
import { requireFeeStructure, resolveFeeContext, AuthedUser } from './finance.service';

/**
 * Ensures a tenant FeeSetting document exists, initializing defaults if needed.
 */
export async function getOrCreateFeeSettings(tenantId: string | mongoose.Types.ObjectId, tenantDb: mongoose.Connection): Promise<IFeeSetting> {
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeSetting, FeeDiscount, StudentFee, FeeStructure, Student, StudentHistory, Payment, PaymentReversal, AcademicSession, Class, Section, ReceiptCounter } = getTenantModels(tenantDb);

  const tId = new mongoose.Types.ObjectId(String(tenantId));
  let settings = await FeeSetting.findOne({ tenantId: tId });
  if (!settings) {
    settings = await FeeSetting.create({
      tenantId: tId,
      admissionFee: { enabled: true, allowReAdmission: false },
      otherFee: { enabled: false, feeName: 'Other Fee', defaultAmount: 0 },
      lateFee: { enabled: false, lateFeeAmount: 0, gracePeriodDays: 0 },
      dueDate: { enabled: true, defaultMonthlyDueDay: 10 },
      discount: { enabled: true, allowDiscountStacking: false },
    });
  }
  return settings;
}

/**
 * 3-Tier Discount Priority:
 * Priority 1: Student-specific discount
 * Priority 2: Class-specific discount
 * Priority 3: All-Students discount
 *
 * Default: Only highest-priority active discount applies.
 * If allowDiscountStacking is true, returns all applicable discounts.
 */
export async function findApplicableDiscounts(
  tenantId: string | mongoose.Types.ObjectId,
  studentId: string | mongoose.Types.ObjectId,
  classId: string | mongoose.Types.ObjectId,
  allowStacking = false
, tenantDb: mongoose.Connection): Promise<IFeeDiscount[]> {
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeSetting, FeeDiscount, StudentFee, FeeStructure, Student, StudentHistory, Payment, PaymentReversal, AcademicSession, Class, Section, ReceiptCounter } = getTenantModels(tenantDb);

  const tId = new mongoose.Types.ObjectId(String(tenantId));
  const sId = new mongoose.Types.ObjectId(String(studentId));
  const cId = new mongoose.Types.ObjectId(String(classId));

  // 1. Student-specific
  const studentDiscounts = await FeeDiscount.find({ tenantId: tId, studentId: sId, applyTo: 'student', isActive: true });
  if (!allowStacking && studentDiscounts.length > 0) {
    return [studentDiscounts[0]];
  }

  // 2. Class-specific
  const classDiscounts = await FeeDiscount.find({ tenantId: tId, classId: cId, applyTo: 'class', isActive: true });
  if (!allowStacking) {
    if (classDiscounts.length > 0) return [classDiscounts[0]];
  }

  // 3. All-students
  const allDiscounts = await FeeDiscount.find({ tenantId: tId, applyTo: 'all', isActive: true });
  if (!allowStacking) {
    if (allDiscounts.length > 0) return [allDiscounts[0]];
    return [];
  }

  return [...studentDiscounts, ...classDiscounts, ...allDiscounts];
}

/**
 * Calculate discount amount using integer-safe basis points.
 * 1% = 100 bps, 100% = 10000 bps.
 */
export function calculateDiscountAmount(
  baseAmountPaisa: number,
  discount: IFeeDiscount
): { amountPaisa: number; type: 'fixed' | 'percentage'; valueBps: number | null } {
  if (discount.discountType === 'fixed') {
    const amountPaisa = Math.min(baseAmountPaisa, discount.value);
    return { amountPaisa, type: 'fixed', valueBps: null };
  } else {
    // Percentage via basis points
    const bps = discount.valueBps || discount.value;
    const boundedBps = Math.max(0, Math.min(10000, bps));
    const amountPaisa = Math.min(baseAmountPaisa, Math.floor((baseAmountPaisa * boundedBps) / 10000));
    return { amountPaisa, type: 'percentage', valueBps: boundedBps };
  }
}

/**
 * Check Admission Fee Eligibility strictly from database financial history.
 */
export async function checkAdmissionFeeEligibility(
  tenantId: string | mongoose.Types.ObjectId,
  studentId: string | mongoose.Types.ObjectId,
  tenantDb: mongoose.Connection,
  reAdmissionEventId?: string | mongoose.Types.ObjectId
): Promise<{ eligible: boolean; reason?: string }> {
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeSetting, FeeDiscount, StudentFee, FeeStructure, Student, StudentHistory, Payment, PaymentReversal, AcademicSession, Class, Section, ReceiptCounter } = getTenantModels(tenantDb);

  const tId = new mongoose.Types.ObjectId(String(tenantId));
  const sId = new mongoose.Types.ObjectId(String(studentId));

  const settings = await getOrCreateFeeSettings(tId, tenantDb);
  if (!settings.admissionFee.enabled) {
    return { eligible: false, reason: 'Admission fee feature is disabled for this school' };
  }

  // Check existing admission fee invoices
  const existingAdmissionFees = await StudentFee.find({
    tenantId: tId,
    studentId: sId,
    feeType: 'admission_fee',
  }).select('_id status amountPaid reAdmissionEventId').lean();

  if (existingAdmissionFees.length === 0) {
    // Normal first-time admission
    return { eligible: true };
  }

  // A prior admission fee exists. Check re-admission configuration.
  if (!settings.admissionFee.allowReAdmission) {
    return { eligible: false, reason: 'Student already has an admission fee obligation and re-admission fee is disabled' };
  }

  if (!reAdmissionEventId) {
    return { eligible: false, reason: 'Re-admission event reference (reAdmissionEventId) is required to assess a secondary admission fee' };
  }

  const rEventId = new mongoose.Types.ObjectId(String(reAdmissionEventId));
  const event = await StudentHistory.findOne({
    _id: rEventId,
    tenantId: tId,
    studentId: sId,
    status: 're_admitted',
  }).lean();

  if (!event) {
    throw ApiError.badRequest('Invalid or unmatched re-admission history event for this student', 'INVALID_READMISSION_EVENT');
  }

  // Check if an admission fee has already been charged for this specific re-admission event
  const alreadyChargedForEvent = existingAdmissionFees.some(
    (f) => f.reAdmissionEventId && String(f.reAdmissionEventId) === String(rEventId)
  );
  if (alreadyChargedForEvent) {
    return { eligible: false, reason: 'Admission fee has already been charged for this re-admission event' };
  }

  return { eligible: true };
}

/**
 * Generate Student Fees with financial rule snapshotting.
 */
export async function generateStudentFeesWithSnapshot(
  actor: AuthedUser,
  input: {
    sessionId: string;
    classId: string;
    sectionId?: string;
    feeStructureId: string;
    studentIds?: string[];
    month?: number;
    year?: number;
  }
, tenantDb: mongoose.Connection): Promise<{ created: number; skipped: number }> {
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeSetting, FeeDiscount, StudentFee, FeeStructure, Student, StudentHistory, Payment, PaymentReversal, AcademicSession, Class, Section, ReceiptCounter } = getTenantModels(tenantDb);

  const { sessionId, classId, sectionId, feeStructureId, studentIds } = input;
  const tenantId = actor.tenantId;
  if (!tenantId) throw ApiError.badRequest('Tenant context required');
  const tId = new mongoose.Types.ObjectId(String(tenantId));

  const [structure, settings] = await Promise.all([
    requireFeeStructure(feeStructureId, tId, tenantDb),
    getOrCreateFeeSettings(tId, tenantDb),
  ]);

  if (structure.isArchived) throw ApiError.badRequest('Fee structure is archived', 'FEE_STRUCTURE_ARCHIVED');
  if (String(structure.sessionId) !== String(sessionId) || String(structure.classId) !== String(classId)) {
    throw ApiError.badRequest('Fee structure does not belong to the selected session/class', 'INVALID_FEE_STRUCTURE');
  }
  await resolveFeeContext(sessionId, classId, sectionId, tId, tenantDb);

  const billingMonth = input.month !== undefined ? input.month : (structure.month ?? new Date().getUTCMonth() + 1);
  const billingYear = input.year !== undefined ? input.year : new Date().getUTCFullYear();

  if (structure.effectiveFromYear) {
    if (billingYear < structure.effectiveFromYear) {
      throw ApiError.badRequest(`This fee structure is only effective from ${structure.effectiveFromMonth}/${structure.effectiveFromYear}`, 'FEE_NOT_EFFECTIVE_YET');
    }
    if (billingYear === structure.effectiveFromYear && structure.effectiveFromMonth && billingMonth < structure.effectiveFromMonth) {
      throw ApiError.badRequest(`This fee structure is only effective from ${structure.effectiveFromMonth}/${structure.effectiveFromYear}`, 'FEE_NOT_EFFECTIVE_YET');
    }
  }

  // Calculate Due Date Snapshot:
  let dueDateSnapshot: Date | undefined = structure.dueDate;
  if (settings.dueDate.enabled && billingMonth && billingYear) {
    const dueDay = Math.min(28, settings.dueDate.defaultMonthlyDueDay || 10);
    dueDateSnapshot = new Date(Date.UTC(billingYear, billingMonth - 1, dueDay, 23, 59, 59, 999));
  }

  const eligibility: Record<string, any> = {
    tenantId: tId,
    sessionId,
    classId,
    isArchived: false,
    isActive: true,
    ...(sectionId ? { sectionId } : {}),
  };
  const eligible = await Student.find(eligibility).select('_id sectionId classId').lean();

  let targets = eligible;
  if (studentIds?.length) {
    const wanted = new Set(studentIds.map(String));
    const matched = eligible.filter((s) => wanted.has(String(s._id)));
    if (matched.length !== studentIds.length) {
      throw ApiError.badRequest('One or more selected students are not eligible for this fee', 'INVALID_STUDENT_SELECTION');
    }
    targets = matched;
  }

  // Pre-check admission fee eligibility if applicable
  if (structure.feeType === 'admission_fee') {
    const eligibleTargets: typeof targets = [];
    for (const t of targets) {
      const { eligible } = await checkAdmissionFeeEligibility(tId, t._id, tenantDb);
      if (eligible) eligibleTargets.push(t);
    }
    targets = eligibleTargets;
  }

  // Pre-filter students who already have this fee
  const existingQuery: Record<string, any> = {
    tenantId: tId,
    studentId: { $in: targets.map((t) => t._id) },
  };

  if (structure.feeType === 'monthly_tuition') {
    existingQuery.sessionId = sessionId;
    existingQuery.feeType = 'monthly_tuition';
    existingQuery.billingMonth = billingMonth;
    existingQuery.billingYear = billingYear;
  } else {
    existingQuery.feeStructureId = structure._id;
  }

  const existingInvoices = await StudentFee.find(existingQuery).select('studentId feeStructureId billingMonth classId').lean();
  console.log("EXISTING INVOICES FOUND FOR GENERATE:", JSON.stringify(existingInvoices));
  const existingSet = new Set(existingInvoices.map((e) => String(e.studentId)));

  const docsToInsert: any[] = [];
  console.log("TARGETS FOR GENERATE:", JSON.stringify(targets));
  for (const student of targets) {
    if (existingSet.has(String(student._id))) continue;

    const baseFeePaisa = structure.amount;
    let discountAmountPaisa = 0;
    let discountMetadata: IChargeBreakdown['discount'] = {
      discountId: null,
      name: null,
      type: null,
      valueBps: null,
      amountPaisa: 0,
    };

    if (settings.discount.enabled) {
      const discounts = await findApplicableDiscounts(tId, student._id, student.classId, settings.discount.allowDiscountStacking, tenantDb);
      if (discounts.length > 0) {
        const topDiscount = discounts[0];
        const calc = calculateDiscountAmount(baseFeePaisa, topDiscount);
        discountAmountPaisa = calc.amountPaisa;
        discountMetadata = {
          discountId: topDiscount._id as mongoose.Types.ObjectId,
          name: topDiscount.name,
          type: calc.type,
          valueBps: calc.valueBps,
          amountPaisa: calc.amountPaisa,
        };
      }
    }

    // Other Fee Snapshot
    let otherFeeAmountPaisa = 0;
    let otherFeeMetadata: IChargeBreakdown['otherFee'] = {
      applied: false,
      name: null,
      amountPaisa: 0,
    };

    if (settings.otherFee.enabled && structure.feeType === 'monthly_tuition') {
      otherFeeAmountPaisa = settings.otherFee.defaultAmount || 0;
      otherFeeMetadata = {
        applied: true,
        name: settings.otherFee.feeName,
        amountPaisa: otherFeeAmountPaisa,
      };
    }

    // Late Fee Snapshot initially not assessed at generation
    const lateFeeMetadata: IChargeBreakdown['lateFee'] = {
      applied: false,
      amountPaisa: 0,
      assessedAt: null,
    };

    const netPayablePaisa = Math.max(0, baseFeePaisa - discountAmountPaisa + otherFeeAmountPaisa);

    const chargeBreakdown: IChargeBreakdown = {
      baseFeePaisa,
      discount: discountMetadata,
      lateFee: lateFeeMetadata,
      otherFee: otherFeeMetadata,
      netPayablePaisa,
    };

    docsToInsert.push({
      tenantId: tId,
      studentId: student._id,
      sessionId: structure.sessionId,
      classId: structure.classId,
      sectionId: student.sectionId,
      feeStructureId: structure._id,
      title: structure.title,
      feeType: structure.feeType,
      month: billingMonth,
      billingMonth,
      billingYear,
      originalAmount: baseFeePaisa,
      discountAmount: discountAmountPaisa,
      scholarshipAmount: 0,
      fineAmount: 0,
      otherFeeAmount: otherFeeAmountPaisa,
      fineAssessedAt: null,
      chargeBreakdown,
      netPayable: netPayablePaisa,
      amountPaid: 0,
      remainingBalance: netPayablePaisa,
      status: 'unpaid' as const,
      dueDate: dueDateSnapshot,
      createdBy: actor._id ? new mongoose.Types.ObjectId(actor._id) : undefined,
    });
  }

  let createdCount = 0;
  console.log("DOCS TO INSERT LENGTH:", docsToInsert.length);
  console.log("FIRST DOC TO INSERT:", JSON.stringify(docsToInsert[0]));
  if (docsToInsert.length > 0) {
    try {
      const res = await StudentFee.insertMany(docsToInsert, { ordered: false });
      console.log("INSERT RES:", res);
      console.log("IS ARRAY:", Array.isArray(res));
      createdCount = Array.isArray(res) ? res.length : (res as any).insertedCount ?? 0;
      console.log("INSERT RES LENGTH:", createdCount);
    } catch (err: any) {
      console.log("INSERT ERROR:", err);
      if (!err?.message?.includes('E11000')) throw err;
      // Partial successes with duplicate suppression
      createdCount = err.insertedDocs?.length ?? 0;
    }
  }

  return {
    created: createdCount,
    skipped: targets.length - createdCount,
  };
}

/**
 * Real-Time Student Fee Calculator:
 * Calculates Current Month Fee, Previous Pending Invoices Breakdown,
 * Admission Fee, Other Fee, Late Fee, Discount, and Total Payable.
 * Separates historical invoices from current month obligations.
 */
export async function calculateStudentFeeObligations(
  tenantId: string | mongoose.Types.ObjectId,
  studentId: string | mongoose.Types.ObjectId,
  options: { sessionId?: string; month?: number; year?: number; reAdmissionEventId?: string }
, tenantDb: mongoose.Connection) {
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeSetting, FeeDiscount, StudentFee, FeeStructure, Student, StudentHistory, Payment, PaymentReversal, AcademicSession, Class, Section, ReceiptCounter } = getTenantModels(tenantDb);

  const tId = new mongoose.Types.ObjectId(String(tenantId));
  const sId = new mongoose.Types.ObjectId(String(studentId));

  const [student, settings] = await Promise.all([
    Student.findOne({ _id: sId, tenantId: tId }).select('fullName admissionNumber rollNumber classId sectionId sessionId').lean(),
    getOrCreateFeeSettings(tId, tenantDb),
  ]);
  if (!student) throw ApiError.notFound('Student not found');

  const now = new Date();
  const currentMonth = options.month ?? now.getUTCMonth() + 1;
  const currentYear = options.year ?? now.getUTCFullYear();

  // Find all unpaid or partial invoices for this student
  const pendingInvoices = await StudentFee.find({
    tenantId: tId,
    studentId: sId,
    status: { $in: ['unpaid', 'partial'] },
  }).sort({ createdAt: 1 }).lean();

  // Traceable Late Fee Assessment:
  // If due date setting is enabled, late fee is enabled, and invoice is overdue past grace period
  const evaluatedPending: any[] = [];
  let assessedLateFeeTotal = 0;

  for (const inv of pendingInvoices) {
    let invRemaining = inv.remainingBalance;
    let invFine = inv.fineAmount || 0;
    let invFineAssessedAt = inv.fineAssessedAt;

    if (
      settings.dueDate.enabled &&
      settings.lateFee.enabled &&
      settings.lateFee.lateFeeAmount > 0 &&
      inv.dueDate &&
      !inv.fineAssessedAt &&
      inv.status !== 'paid'
    ) {
      const graceDays = settings.lateFee.gracePeriodDays || 0;
      const dueTime = new Date(inv.dueDate).getTime() + graceDays * 24 * 3600 * 1000;
      if (now.getTime() > dueTime) {
        // Assess late fee atomically once
        const lateFeeAmt = settings.lateFee.lateFeeAmount;
        const updated = await StudentFee.findOneAndUpdate(
          { _id: inv._id, tenantId: tId, fineAssessedAt: null },
          {
            $set: {
              fineAmount: lateFeeAmt,
              fineAssessedAt: now,
              netPayable: inv.netPayable + lateFeeAmt,
              remainingBalance: inv.remainingBalance + lateFeeAmt,
              'chargeBreakdown.lateFee': {
                applied: true,
                amountPaisa: lateFeeAmt,
                assessedAt: now,
              },
            },
          },
          { new: true, runValidators: true }
        ).lean();
        if (updated) {
          invRemaining = updated.remainingBalance;
          invFine = updated.fineAmount;
          invFineAssessedAt = updated.fineAssessedAt;
        }
      }
    }

    assessedLateFeeTotal += invFine;

    evaluatedPending.push({
      invoiceId: String(inv._id),
      title: inv.title || inv.feeType.toUpperCase(),
      feeType: inv.feeType,
      month: inv.billingMonth ?? inv.month ?? null,
      year: inv.billingYear ?? null,
      dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString() : null,
      originalAmount: inv.originalAmount,
      discountAmount: inv.discountAmount ?? 0,
      fineAmount: invFine,
      otherFeeAmount: inv.otherFeeAmount ?? 0,
      netPayable: inv.netPayable,
      amountPaid: inv.amountPaid ?? 0,
      remainingBalance: invRemaining,
      status: inv.status,
    });
  }

  // Partition current month invoice vs prior pending invoices
  const currentInvoice = evaluatedPending.find(
    (inv) =>
      inv.feeType === 'monthly_tuition' &&
      inv.month === currentMonth &&
      (!inv.year || inv.year === currentYear)
  ) || null;

  const previousPendingInvoices = evaluatedPending.filter(
    (inv) => !currentInvoice || String(inv.invoiceId) !== String(currentInvoice.invoiceId)
  );

  const previousPendingTotal = previousPendingInvoices.reduce((sum, i) => sum + i.remainingBalance, 0);
  const currentMonthFeePayable = currentInvoice ? currentInvoice.remainingBalance : 0;
  const currentMonthBaseFee = currentInvoice ? currentInvoice.originalAmount : 0;

  // Admission Fee Eligibility:
  const admissionEligibility = await checkAdmissionFeeEligibility(tId, sId, tenantDb, options.reAdmissionEventId);

  let admissionFeeAmount = 0;
  if (admissionEligibility.eligible) {
    const admissionStructure = await FeeStructure.findOne({
      tenantId: tId,
      classId: student.classId,
      feeType: 'admission_fee',
      isActive: true,
      isArchived: false,
    }).select('amount').lean();
    if (admissionStructure) {
      admissionFeeAmount = admissionStructure.amount;
    }
  }

  const totalOutstanding = previousPendingTotal + currentMonthFeePayable;

  return {
    student: {
      studentId: String(student._id),
      fullName: student.fullName,
      admissionNumber: student.admissionNumber,
      rollNumber: student.rollNumber,
    },
    settings: {
      lateFeeEnabled: settings.lateFee.enabled,
      dueDateEnabled: settings.dueDate.enabled,
      otherFeeEnabled: settings.otherFee.enabled,
      discountEnabled: settings.discount.enabled,
      admissionFeeEnabled: settings.admissionFee.enabled,
    },
    currentMonthFee: {
      invoiceId: currentInvoice?.invoiceId ?? null,
      baseFee: currentMonthBaseFee,
      discount: currentInvoice?.discountAmount ?? 0,
      otherFee: currentInvoice?.otherFeeAmount ?? 0,
      lateFee: currentInvoice?.fineAmount ?? 0,
      netPayable: currentInvoice?.netPayable ?? 0,
      amountPaid: currentInvoice?.amountPaid ?? 0,
      remainingAmount: currentMonthFeePayable,
    },
    previousPending: {
      totalAmount: previousPendingTotal,
      invoices: previousPendingInvoices,
    },
    admissionFee: {
      isEligible: admissionEligibility.eligible,
      reason: admissionEligibility.reason ?? null,
      amount: admissionFeeAmount,
    },
    totalPayable: totalOutstanding,
    totalAlreadyPaid: evaluatedPending.reduce((sum, i) => sum + i.amountPaid, 0),
    totalRemainingAmount: totalOutstanding,
  };
}
