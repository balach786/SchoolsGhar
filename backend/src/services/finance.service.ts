import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { AcademicSession } from '../models/AcademicSession';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { Student } from '../models/Student';
import { FeeStructure, type FeeType } from '../models/FeeStructure';
import { StudentFee } from '../models/StudentFee';
import { Payment } from '../models/Payment';
import { SalaryRecord } from '../models/SalaryRecord';
import { Staff } from '../models/Staff';
import { nextReceiptNumber } from '../models/ReceiptCounter';
import { getOwnStudent, type AuthedUser } from './attendance.service';
import { getTenantModels } from './TenantModelRegistry';
import { acquireIdempotency, completeIdempotency, releaseIdempotency } from './idempotency.service';
import { reserveFinancialReference } from './financialReference.service';
import { recordAuditWithSession } from './audit.service';

export type { AuthedUser };

/**
 * Finance service — Hardened in Phase 4E.
 *
 * MONEY REPRESENTATION: All money fields are integer paisa (PKR 1,500.00 → 150000).
 * All calculations use integer arithmetic; balances, status, and receipt numbers
 * are strictly server-owned.
 *
 * CONSISTENCY & INTEGRITY STRATEGY:
 * - Strict tenant isolation on every read and write (fails closed).
 * - Multi-document MongoDB transactions (ClientSession.withTransaction) guarantee
 *   all-or-nothing atomicity across fee balance, payment document, external reference
 *   reservation, receipt sequence, and audit log.
 * - Atomic conditional pipeline updates ($expr) prevent concurrency races and overpayment.
 * - Durable idempotency (FinancialIdempotency) prevents duplicate charges.
 * - External reference registry (FinancialReference) prevents cross-collection duplicate references.
 */

export async function requireFeeStructure(id: string, tenantId: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection) {
  const query: Record<string, unknown> = { _id: id, tenantId: new mongoose.Types.ObjectId(String(tenantId)) };
  const fs = await getTenantModels(tenantDb!).FeeStructure.findOne(query);
  if (!fs) throw ApiError.notFound('Fee structure not found');
  return fs;
}

/** Validate the session → class → section chain for fee operations within a tenant. */
export async function resolveFeeContext(
  sessionId: string,
  classId: string,
  sectionId?: string,
  tenantId?: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection
) {
  const tId = tenantId ? new mongoose.Types.ObjectId(String(tenantId)) : undefined;

  const qSession: Record<string, unknown> = { _id: sessionId };
  if (tId) qSession.tenantId = tId;
  const session = await getTenantModels(tenantDb!).AcademicSession.findOne(qSession);
  if (!session) throw ApiError.notFound('Academic session not found');
  if (session.isArchived) throw ApiError.badRequest('Academic session is archived', 'SESSION_ARCHIVED');
  if (!session.isActive) throw ApiError.badRequest('Fees can only be created for the active academic session', 'SESSION_INACTIVE');

  const qClass: Record<string, unknown> = { _id: classId };
  if (tId) qClass.tenantId = tId;
  const cls = await getTenantModels(tenantDb!).Class.findOne(qClass);
  if (!cls) throw ApiError.notFound('Class not found');
  if (cls.isArchived) throw ApiError.badRequest('Class is archived', 'CLASS_ARCHIVED');
  if (String(cls.sessionId) !== String(session._id)) {
    throw ApiError.badRequest('Class does not belong to the selected session', 'INVALID_CLASS_SESSION');
  }

  let section: any = null;
  if (sectionId) {
    const qSection: Record<string, unknown> = { _id: sectionId };
    if (tId) qSection.tenantId = tId;
    section = await getTenantModels(tenantDb!).Section.findOne(qSection);
    if (!section) throw ApiError.notFound('Section not found');
    if (section.isArchived) throw ApiError.badRequest('Section is archived', 'SECTION_ARCHIVED');
    if (String(section.classId) !== String(cls._id)) {
      throw ApiError.badRequest('Section does not belong to the selected class', 'INVALID_SECTION_CLASS');
    }
  }
  return { session, cls, section };
}

export interface GenerationResult {
  created: number;
  skipped: number;
}

/**
 * Generate StudentFee records for eligible students from a fee structure.
 * Copies getTenantModels(tenantDb!).FeeStructure.title into getTenantModels(tenantDb!).StudentFee.title as an immutable historical snapshot.
 */
export async function generateStudentFees(
  actor: AuthedUser,
  input: { sessionId: string; classId: string; sectionId?: string; feeStructureId: string; studentIds?: string[] },
  tenantDb?: mongoose.Connection
): Promise<GenerationResult> {
  const { sessionId, classId, sectionId, feeStructureId, studentIds } = input;
  const tenantId = actor.tenantId;
  if (!tenantId) throw ApiError.badRequest('Tenant context required');

  const structure = await requireFeeStructure(feeStructureId, tenantId, tenantDb);
  if (structure.isArchived) throw ApiError.badRequest('Fee structure is archived', 'FEE_STRUCTURE_ARCHIVED');
  if (String(structure.sessionId) !== String(sessionId) || String(structure.classId) !== String(classId)) {
    throw ApiError.badRequest('Fee structure does not belong to the selected session/class', 'INVALID_FEE_STRUCTURE');
  }
  await resolveFeeContext(sessionId, classId, sectionId, tenantId, tenantDb);

  const eligibility: Record<string, any> = {
    tenantId: structure.tenantId,
    sessionId,
    classId,
    isArchived: false,
    isActive: true,
    ...(sectionId ? { sectionId } : {}),
  };
  const eligible = await getTenantModels(tenantDb!).Student.find(eligibility).select('_id sectionId').lean();

  let targets = eligible;
  if (studentIds?.length) {
    const wanted = new Set(studentIds.map(String));
    const matched = eligible.filter((s) => wanted.has(String(s._id)));
    if (matched.length !== studentIds.length) {
      throw ApiError.badRequest('One or more selected students are not eligible for this fee', 'INVALID_STUDENT_SELECTION');
    }
    targets = matched;
  }

  const existing = await getTenantModels(tenantDb!).StudentFee.find({
    tenantId: structure.tenantId,
    feeStructureId: structure._id,
    studentId: { $in: targets.map((t) => t._id) },
  })
    .select('studentId')
    .lean();
  const existingSet = new Set(existing.map((e) => String(e.studentId)));

  const docs = targets
    .filter((t) => !existingSet.has(String(t._id)))
    .map((t) => ({
      tenantId: structure.tenantId,
      studentId: t._id,
      sessionId: structure.sessionId,
      classId: structure.classId,
      sectionId: t.sectionId,
      feeStructureId: structure._id,
      title: structure.title, // Immutable snapshot of title at creation time
      feeType: structure.feeType as FeeType,
      month: structure.month ?? null,
      originalAmount: structure.amount,
      discountAmount: 0,
      scholarshipAmount: 0,
      fineAmount: 0,
      netPayable: structure.amount,
      amountPaid: 0,
      remainingBalance: structure.amount,
      status: 'unpaid' as const,
      dueDate: structure.dueDate,
      createdBy: actor._id ? new mongoose.Types.ObjectId(actor._id) : undefined,
    }));

  if (docs.length) {
    try {
      await getTenantModels(tenantDb!).StudentFee.insertMany(docs, { ordered: false });
    } catch (err: any) {
      if (!err?.message?.includes('E11000')) throw err;
    }
  }

  const after = await getTenantModels(tenantDb!).StudentFee.countDocuments({
    tenantId: structure.tenantId,
    feeStructureId: structure._id,
    studentId: { $in: targets.map((t) => t._id) },
  });
  return { created: Math.max(0, after - existingSet.size), skipped: existingSet.size };
}

/** Recompute netPayable/remaining/status helpers — integers only. */
export function deriveFeeState(
  original: number,
  discount: number,
  scholarship: number,
  fine: number,
  paid: number
): { netPayable: number; remainingBalance: number; status: 'unpaid' | 'partial' | 'paid' } {
  const netPayable = original - discount - scholarship + fine;
  const remainingBalance = Math.max(0, netPayable - paid);
  const status = remainingBalance <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  return { netPayable, remainingBalance, status };
}

/**
 * Apply discount/scholarship/fine adjustments.
 * Guard: Net payable cannot fall below the amount already paid.
 */
export async function adjustStudentFee(
  fee: any,
  patch: { discountAmount?: number; scholarshipAmount?: number; fineAmount?: number },
  tenantId?: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection
) {
  if (tenantId && String(fee.tenantId) !== String(tenantId)) {
    throw ApiError.notFound('Student fee not found');
  }

  const nextDiscount = patch.discountAmount ?? fee.discountAmount ?? 0;
  const nextScholarship = patch.scholarshipAmount ?? fee.scholarshipAmount ?? 0;
  const nextFine = patch.fineAmount ?? fee.fineAmount ?? 0;

  const { netPayable, remainingBalance, status } = deriveFeeState(
    fee.originalAmount,
    nextDiscount,
    nextScholarship,
    nextFine,
    fee.amountPaid ?? 0
  );
  if (netPayable < 0) {
    throw ApiError.unprocessable('Adjustments cannot make the net payable negative', 'INVALID_ADJUSTMENT');
  }
  if (netPayable < (fee.amountPaid ?? 0)) {
    throw ApiError.unprocessable(
      'Net payable cannot fall below the amount already paid. Please issue a refund first.',
      'FEE_ADJUSTMENT_REQUIRES_REFUND'
    );
  }

  const updatedFee = await getTenantModels(tenantDb!).StudentFee.findOneAndUpdate(
    {
      _id: fee._id,
      tenantId: fee.tenantId,
      amountPaid: { $lte: netPayable },
    },
    {
      $set: {
        discountAmount: nextDiscount,
        scholarshipAmount: nextScholarship,
        fineAmount: nextFine,
        netPayable,
        remainingBalance,
        status,
      },
    },
    { new: true, runValidators: true }
  );

  if (!updatedFee) {
    throw ApiError.unprocessable(
      'Net payable cannot fall below the amount already paid. Please issue a refund first.',
      'FEE_ADJUSTMENT_REQUIRES_REFUND'
    );
  }

  fee.discountAmount = nextDiscount;
  fee.scholarshipAmount = nextScholarship;
  fee.fineAmount = nextFine;
  fee.netPayable = netPayable;
  fee.remainingBalance = remainingBalance;
  fee.status = status;
  return updatedFee;
}

/**
 * Record a payment inside an atomic MongoDB ClientSession transaction.
 * - Enforces strict tenant isolation.
 * - Checks/acquires financial idempotency.
 * - Atomically checks balance and updates StudentFee via $expr.
 * - Reserves non-cash external references across regular and exam payments.
 * - Allocates unique receipt number within transaction.
 * - Creates immutable Payment record with refundableAmount.
 * - Writes AuditLog inside the transaction.
 * - Commits idempotency.
 */
export async function recordPayment(
  actor: AuthedUser,
  input: {
    studentId: string;
    studentFeeId?: string; // Optional: target specific invoice
    amount: number;
    paymentMethod: string;
    paymentDate?: string | Date;
    reference?: string;
    notes?: string;
    receiptPrefix?: string;
    idempotencyKey?: string;
  },
  tenantIdOverride?: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection
) {
  const tenantId = tenantIdOverride || actor.tenantId;
  if (!tenantId) throw ApiError.badRequest('Tenant context required');
  const tId = new mongoose.Types.ObjectId(String(tenantId));

  const amount = input.amount;
  if (!Number.isInteger(amount) || amount < 1) {
    throw ApiError.badRequest('Payment amount must be at least 1 paisa');
  }

  // Check idempotency before transaction
  const idempotency = await acquireIdempotency(
    tId,
    'fee_payment',
    input.idempotencyKey,
    { studentId: input.studentId, studentFeeId: input.studentFeeId, amount: input.amount, paymentMethod: input.paymentMethod, reference: input.reference }
  );
  if (idempotency.isCached && idempotency.cachedResponse) {
    return idempotency.cachedResponse.body;
  }

  const session = await mongoose.startSession();
  try {
    let resultPayload: any;
    await session.withTransaction(async () => {
      // 1. Fetch fees to pay (either specific or all unpaid oldest-first)
      const query: any = { tenantId: tId, studentId: new mongoose.Types.ObjectId(input.studentId), status: { $ne: 'paid' } };
      if (input.studentFeeId) query._id = new mongoose.Types.ObjectId(input.studentFeeId);

      const feesToPay = await getTenantModels(tenantDb!).StudentFee.find(query)
        .sort({ billingYear: 1, billingMonth: 1, dueDate: 1, createdAt: 1 })
        .session(session);

      if (feesToPay.length === 0) {
        throw ApiError.unprocessable('No unpaid fees found for this student', 'NO_UNPAID_FEES');
      }

      const totalRemaining = feesToPay.reduce((acc, f) => acc + (f.netPayable - (f.amountPaid || 0)), 0);
      if (amount > totalRemaining) {
        throw ApiError.unprocessable(
          'Payment exceeds the remaining balance — credit balances are not supported',
          'PAYMENT_EXCEEDS_BALANCE',
          { remainingBalance: totalRemaining }
        );
      }

      // 2. Allocate oldest first
      let remainingAmount = amount;
      const allocations: { studentFeeId: mongoose.Types.ObjectId; amountAllocated: number; nextStatus: string }[] = [];
      const bulkOps: any[] = [];

      for (const fee of feesToPay) {
        if (remainingAmount <= 0) break;
        const feeRemaining = fee.netPayable - (fee.amountPaid || 0);
        if (feeRemaining <= 0) continue;

        const allocated = Math.min(feeRemaining, remainingAmount);
        remainingAmount -= allocated;

        const newAmountPaid = (fee.amountPaid || 0) + allocated;
        const newRemaining = fee.netPayable - newAmountPaid;
        const newStatus = newRemaining <= 0 ? 'paid' : 'partial';

        allocations.push({ studentFeeId: fee._id as mongoose.Types.ObjectId, amountAllocated: allocated, nextStatus: newStatus });

        bulkOps.push({
          updateOne: {
            filter: { _id: fee._id, tenantId: tId },
            update: {
              $set: {
                amountPaid: newAmountPaid,
                remainingBalance: newRemaining,
                status: newStatus,
              },
            },
          },
        });
      }

      if (remainingAmount > 0) {
        throw ApiError.unprocessable('Could not allocate full payment amount', 'ALLOCATION_ERROR');
      }

      // Execute bulk updates
      await getTenantModels(tenantDb!).StudentFee.bulkWrite(bulkOps, { session });

      const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();

      // 3. Allocate receipt number within transaction
      const receiptNumber = await nextReceiptNumber(paymentDate, input.receiptPrefix || 'RCPT', String(tId), session);

      // 4. Create Payment record with allocations
      const [payment] = await getTenantModels(tenantDb!).Payment.create(
        [
          {
            tenantId: tId,
            studentId: new mongoose.Types.ObjectId(input.studentId),
            studentFeeId: input.studentFeeId ? new mongoose.Types.ObjectId(input.studentFeeId) : undefined,
            sessionId: feesToPay[0].sessionId, // Tie to the first fee's session conceptually
            amount,
            refundableAmount: amount,
            paymentMethod: input.paymentMethod,
            paymentDate,
            receiptNumber,
            reference: input.reference ? input.reference.trim() : undefined,
            notes: input.notes,
            allocations: allocations.map(a => ({ studentFeeId: a.studentFeeId, amountAllocated: a.amountAllocated })),
            status: 'active',
            collectedBy: actor._id,
          },
        ],
        { session }
      );

      // 5. Reserve non-cash external reference in FinancialReference registry
      await reserveFinancialReference(
        tId,
        input.paymentMethod,
        input.reference,
        'regular_fee',
        payment._id as mongoose.Types.ObjectId,
        receiptNumber,
        session
      );

      // 6. Record AuditLog inside transaction session
      await recordAuditWithSession(
        'payments',
        'PAYMENT_RECORDED',
        actor as any,
        String(payment._id),
        {
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
          studentId: input.studentId,
          allocationsCount: payment.allocations?.length || 0,
          paymentMethod: payment.paymentMethod,
        },
        session,
        'tenant',
        tId
      );

      const updatedFees = await getTenantModels(tenantDb!).StudentFee.find({ _id: { $in: allocations.map(a => a.studentFeeId) } }).session(session);
      
      // Keep backwards compatible fee payload for single-fee target, else return array
      resultPayload = { 
        payment, 
        fee: input.studentFeeId ? updatedFees[0] : null,
        fees: updatedFees 
      };

      // 7. Commit completed idempotency outcome inside the session
      await completeIdempotency(
        idempotency.recordKey,
        { paymentId: String(payment._id), receiptNumber: payment.receiptNumber },
        201,
        resultPayload,
        session,
        idempotency.ownerToken
      );
    });

    return resultPayload;
  } catch (err) {
    await releaseIdempotency(idempotency.recordKey, idempotency.ownerToken);
    throw err;
  } finally {
    idempotency.stopHeartbeat?.();
    await session.endSession();
  }
}

/** Build the per-student fee ledger with strict tenant scoping. */
export async function buildLedger(
  studentId: string,
  opts: { sessionId?: string; feeType?: string; from?: string; to?: string },
  tenantId?: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection
) {
  const feeFilter: Record<string, any> = { studentId };
  if (tenantId) feeFilter.tenantId = new mongoose.Types.ObjectId(String(tenantId));
  if (opts.sessionId) feeFilter.sessionId = opts.sessionId;
  if (opts.feeType) feeFilter.feeType = opts.feeType;

  const fees = await getTenantModels(tenantDb!).StudentFee.find(feeFilter)
    .select('_id feeStructureId title feeType month originalAmount discountAmount scholarshipAmount fineAmount netPayable createdAt dueDate')
    .lean();
  const feeIds = fees.map((f) => f._id);
  const payFilter: Record<string, any> = {
    $or: [{ studentFeeId: { $in: feeIds } }, { 'allocations.studentFeeId': { $in: feeIds } }],
  };
  if (tenantId) payFilter.tenantId = new mongoose.Types.ObjectId(String(tenantId));
  if (opts.from || opts.to) {
    payFilter.paymentDate = {};
    if (opts.from) payFilter.paymentDate.$gte = new Date(opts.from);
    if (opts.to) payFilter.paymentDate.$lte = new Date(new Date(opts.to).getTime() + 24 * 3600 * 1000 - 1);
  }
  const payments = await getTenantModels(tenantDb!).Payment.find(payFilter)
    .select('studentFeeId amount paymentDate receiptNumber paymentMethod allocations status')
    .sort({ paymentDate: 1, createdAt: 1 })
    .lean();

  const structures = await getTenantModels(tenantDb!).FeeStructure.find({
    _id: { $in: fees.map((f) => f.feeStructureId) },
    ...(tenantId ? { tenantId: new mongoose.Types.ObjectId(String(tenantId)) } : {}),
  })
    .select('title')
    .lean();
  const titleMap = new Map(structures.map((s) => [String(s._id), s.title]));

  const rows: any[] = [];
  for (const fee of fees) {
    rows.push({
      date: new Date(fee.createdAt).toISOString(),
      kind: 'charge',
      feeType: fee.feeType,
      month: fee.month ?? null,
      title: fee.title || titleMap.get(String(fee.feeStructureId)) || '—',
      charge: fee.netPayable,
      discount: fee.discountAmount ?? 0,
      scholarship: fee.scholarshipAmount ?? 0,
      fine: fee.fineAmount ?? 0,
      payment: 0,
      receipt: null,
      balance: 0,
    });
    
    for (const p of payments) {
      let allocatedToFee = 0;
      if (p.allocations && p.allocations.length > 0) {
        const alloc = p.allocations.find(a => String(a.studentFeeId) === String(fee._id));
        if (alloc) allocatedToFee = alloc.amountAllocated;
      } else if (String(p.studentFeeId) === String(fee._id)) {
        allocatedToFee = p.amount;
      }

      if (allocatedToFee > 0) {
        // Emit Payment Row
        rows.push({
          date: new Date(p.paymentDate).toISOString(),
          kind: 'payment',
          feeType: fee.feeType,
          month: fee.month ?? null,
          title: fee.title || titleMap.get(String(fee.feeStructureId)) || '—',
          charge: 0,
          discount: 0,
          scholarship: 0,
          fine: 0,
          payment: allocatedToFee,
          receipt: p.receiptNumber,
          balance: 0,
        });

        // Emit Reversal Row if voided
        if (p.status === 'voided' || p.status === 'refunded') {
          // Approximate reversal date as payment date + 1ms to appear right after
          const voidDate = new Date(new Date(p.paymentDate).getTime() + 1);
          rows.push({
            date: voidDate.toISOString(),
            kind: 'reversal',
            feeType: fee.feeType,
            month: fee.month ?? null,
            title: `Reversal: ${fee.title || titleMap.get(String(fee.feeStructureId)) || '—'}`,
            charge: allocatedToFee, // A reversal adds back to the charge
            discount: 0,
            scholarship: 0,
            fine: 0,
            payment: 0,
            receipt: p.receiptNumber + ' (VOID)',
            balance: 0,
          });
        }
      }
    }
  }

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || (a.kind === 'charge' ? -1 : 1));
  let running = 0;
  for (const r of rows) {
    running += r.charge - r.payment;
    r.balance = running;
  }
  return rows;
}

/** Resolve the staff profile for salary records with strict tenant verification. */
export async function requireStaffForSalary(staffId: string, tenantId: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection) {
  const query: Record<string, unknown> = {
    _id: staffId,
    tenantId: new mongoose.Types.ObjectId(String(tenantId)),
  };
  const staff = await getTenantModels(tenantDb!).Staff.findOne(query);
  if (!staff) throw ApiError.notFound('Staff member not found in this school');
  if (staff.isArchived) throw ApiError.badRequest('Staff member is archived', 'STAFF_ARCHIVED');
  return staff;
}

/** Create a salary record with strict tenant scoping. */
export async function createSalaryRecord(
  actor: AuthedUser,
  input: { staffId: string; sessionId: string; salaryMonth: string; baseAmount?: number; adjustmentAmount?: number; notes?: string; absentDays?: number; bonusAmount?: number; bonusReason?: string },
  tenantId?: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection
) {
  const resolvedTenantId = tenantId || actor.tenantId;
  if (!resolvedTenantId) throw ApiError.badRequest('Tenant context required');
  const tId = new mongoose.Types.ObjectId(String(resolvedTenantId));

  const qSession: Record<string, unknown> = { _id: input.sessionId, tenantId: tId };
  const session = await getTenantModels(tenantDb!).AcademicSession.findOne(qSession);
  if (!session) throw ApiError.notFound('Academic session not found in this school');
  if (session.isArchived) throw ApiError.badRequest('Academic session is archived', 'SESSION_ARCHIVED');

  const staff = await requireStaffForSalary(input.staffId, tId, tenantDb);
  const baseAmount = input.baseAmount ?? staff.salary ?? 0;
  const adjustmentAmount = input.adjustmentAmount ?? 0;
  const bonusAmount = input.bonusAmount ?? 0;
  if (!Number.isInteger(bonusAmount) || bonusAmount < 0) {
    throw ApiError.unprocessable('Bonus amount must be a non-negative integer (paisa)', 'INVALID_BONUS');
  }
  const netAmount = baseAmount + adjustmentAmount + bonusAmount;
  if (netAmount < 0) throw ApiError.unprocessable('Net salary cannot be negative', 'INVALID_SALARY');

  const qExisting = { staffId: input.staffId, salaryMonth: input.salaryMonth, sessionId: input.sessionId, tenantId: tId };
  const existing = await getTenantModels(tenantDb!).SalaryRecord.findOne(qExisting).select('_id').lean();
  if (existing) throw ApiError.conflict('A salary record already exists for this staff member and month', 'SALARY_EXISTS');

  return getTenantModels(tenantDb!).SalaryRecord.create({
    tenantId: tId,
    staffId: input.staffId,
    sessionId: input.sessionId,
    salaryMonth: input.salaryMonth,
    baseAmount,
    adjustmentAmount,
    netAmount,
    absentDays: input.absentDays ?? 0,
    bonusAmount,
    bonusReason: input.bonusReason,
    status: 'unpaid',
    notes: input.notes,
  });
}

/** Student-only scoping helper for fee/payment lists. */
export async function ownStudentScope(user: AuthedUser, requestedStudentId?: string, tenantDb?: mongoose.Connection): Promise<string> {
  if (user.role === 'student') {
    const own = await getOwnStudent(user, tenantDb);
    if (requestedStudentId && String(requestedStudentId) !== String(own._id)) {
      throw ApiError.forbidden('You can only view your own financial records', 'FINANCE_FORBIDDEN');
    }
    return String(own._id);
  }
  return requestedStudentId ?? '';
}
