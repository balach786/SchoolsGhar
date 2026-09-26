import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import mongoose from 'mongoose';
import { getTenantModels } from '../services/TenantModelRegistry';
import { paginated, ok, created } from '../utils/apiResponse';
import { publicPayment } from '../models/Payment';
import { publicStudentFee } from '../models/StudentFee';
import { publicFeeStructure } from '../models/FeeStructure';
import { recordPayment, ownStudentScope, type AuthedUser } from '../services/finance.service';
import { executePaymentReversal } from '../services/reversal.service';
import { recordAudit } from '../services/audit.service';
import { notify, NOTIFICATION_TYPES } from '../services/notification.service';
import { AuthRequest } from '../types';
import { getTenantObjectId, scopeQuery } from '../utils/tenantScope';

const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

async function resolveNames(req: Request, payments: any[]) {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  const { Student, StudentFee, FeeStructure, User } = getTenantModels(tenantDb);
  const ids = (key: string) => Array.from(new Set(payments.map((p) => p[key]).filter(Boolean).map((v: unknown) => String(v))));
  
  const allFeeIds = new Set<string>();
  for (const p of payments) {
    if (p.studentFeeId) allFeeIds.add(String(p.studentFeeId));
    if (p.allocations && p.allocations.length > 0) {
      p.allocations.forEach((a: any) => allFeeIds.add(String(a.studentFeeId)));
    }
  }

  const [students, users, studentFees] = await Promise.all([
    Student.find(scopeQuery(req, { _id: { $in: ids('studentId') } })).select('fullName admissionNumber rollNumber classId sectionId').lean(),
    User.find(scopeQuery(req, { _id: { $in: ids('collectedBy') } })).select('name').lean(),
    StudentFee.find(scopeQuery(req, { _id: { $in: Array.from(allFeeIds) } })).select('feeStructureId feeType month').lean(),
  ]);
  const structureIds = Array.from(new Set(studentFees.map((sf: any) => String(sf.feeStructureId)).filter(Boolean)));
  const structures = await FeeStructure.find(scopeQuery(req, { _id: { $in: structureIds } })).select('title').lean();
  const structureMap = new Map(structures.map((s: any) => [String(s._id), s.title]));
  const feeMap = new Map(
    studentFees.map((sf: any) => {
      const title = structureMap.get(String(sf.feeStructureId)) || (sf.feeType ? sf.feeType.toUpperCase() : 'Fee');
      return [String(sf._id), title];
    })
  );
  return {
    studentMap: new Map(students.map((s: any) => [String(s._id), s])),
    userMap: new Map(users.map((u: any) => [String(u._id), u.name])),
    feeMap,
  };
}

function withNames(p: any, names: any) {
  const stu = names.studentMap.get(String(p.studentId));
  
  let feeTitle = '—';
  if (p.studentFeeId) {
    feeTitle = names.feeMap?.get(String(p.studentFeeId)) ?? '—';
  } else if (p.allocations && p.allocations.length > 0) {
    if (p.allocations.length === 1) {
      feeTitle = names.feeMap?.get(String(p.allocations[0].studentFeeId)) ?? '—';
    } else {
      const firstTitle = names.feeMap?.get(String(p.allocations[0].studentFeeId)) ?? 'Fee';
      feeTitle = `${firstTitle} + ${p.allocations.length - 1} more`;
    }
  }

  return {
    ...publicPayment(p),
    studentName: stu?.fullName ?? '—',
    admissionNumber: stu?.admissionNumber ?? '—',
    collectedByName: names.userMap.get(String(p.collectedBy)) ?? '—',
    feeTitle,
  };
}

/** POST /api/payments — record a payment (server-calculated everything). */
export const createPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;
  const tenantId = getTenantObjectId(req);

  let studentId = req.body.studentId;
  if (!studentId && req.body.studentFeeId) {
    const feeDoc = await StudentFee.findById(req.body.studentFeeId).select('studentId').lean();
    if (!feeDoc) throw new ApiError(404, 'Fee not found', 'NOT_FOUND');
    studentId = String(feeDoc.studentId);
  }
  if (!studentId) throw new ApiError(400, 'studentId is required', 'BAD_REQUEST');

  const { payment, fee, fees } = await recordPayment(
    user,
    { ...req.body, studentId, idempotencyKey },
    tenantId,
    tenantDb
  );

  // Notify the linked student user (if any).
  const student = await Student.findOne(scopeQuery(req, { _id: payment.studentId })).select('userId fullName').lean();
  if (student?.userId) {
    notify(tenantDb, {
      userId: student.userId as never,
      type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
      title: 'Payment received',
      message: `A payment of ${(payment.amount / 100).toFixed(2)} was received (receipt ${payment.receiptNumber}).`,
      referenceType: 'payment',
      referenceId: String(payment._id),
    });

    const affectedFees = fees || (fee ? [fee] : []);
    for (const f of affectedFees) {
      if (f.status === 'paid') {
        notify(tenantDb, {
          userId: student.userId as never,
          type: NOTIFICATION_TYPES.FEE_PAID,
          title: 'Fee fully paid',
          message: 'An outstanding fee has been fully paid. Thank you!',
          referenceType: 'studentFee',
          referenceId: String(f._id),
        });
      } else {
        notify(tenantDb, {
          userId: student.userId as never,
          type: NOTIFICATION_TYPES.BALANCE_REMAINING,
          title: 'Balance remaining',
          message: `A balance of ${(f.remainingBalance / 100).toFixed(2)} remains on this fee.`,
          referenceType: 'studentFee',
          referenceId: String(f._id),
          dedupe: true,
        });
      }
    }
  }

  created(res, {
    payment: publicPayment(payment as never),
    fee: fee ? {
      _id: String(fee._id),
      remainingBalance: fee.remainingBalance,
      amountPaid: fee.amountPaid,
      netPayable: fee.netPayable,
      status: fee.status,
    } : null,
    fees: fees ? fees.map((f: any) => ({
      _id: String(f._id),
      remainingBalance: f.remainingBalance,
      amountPaid: f.amountPaid,
      netPayable: f.netPayable,
      status: f.status,
    })) : null,
  }, { message: `Payment recorded — receipt ${payment.receiptNumber}` });
});

/** GET /api/payments */
export const listPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;

  const ownStudentId = await ownStudentScope(user, req.query.studentId as string | undefined, tenantDb);

  let filter: Record<string, any> = {};
  if (req.query.sessionId) filter.sessionId = req.query.sessionId;
  if (req.query.method) filter.paymentMethod = req.query.method;
  if (req.query.from || req.query.to) {
    filter.paymentDate = {};
    if (req.query.from) filter.paymentDate.$gte = new Date(String(req.query.from));
    if (req.query.to) filter.paymentDate.$lte = new Date(new Date(String(req.query.to)).getTime() + 24 * 3600 * 1000 - 1);
  }

  if (ownStudentId) {
    filter.studentId = ownStudentId;
    if (req.query.search) {
      const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.receiptNumber = rx;
    }
    if (req.query.classId || req.query.sectionId) {
      const stuFilter: Record<string, any> = { _id: ownStudentId };
      if (req.query.classId) stuFilter.classId = req.query.classId;
      if (req.query.sectionId) stuFilter.sectionId = req.query.sectionId;
      const count = await Student.countDocuments(scopeQuery(req, stuFilter));
      if (count === 0) filter.studentId = null;
    }
  } else {
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.search) {
      const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matched = await Student.find(scopeQuery(req, { $or: [{ fullName: rx }, { admissionNumber: rx }] })).select('_id').lean();
      // Search covers student name, admission number AND receipt number.
      filter.$or = [{ receiptNumber: rx }, { studentId: { $in: matched.map((m) => m._id) } }];
    }
    if (req.query.classId || req.query.sectionId) {
      const stuFilter: Record<string, any> = {};
      if (req.query.classId) stuFilter.classId = req.query.classId;
      if (req.query.sectionId) stuFilter.sectionId = req.query.sectionId;
      const matched = await Student.find(scopeQuery(req, stuFilter)).select('_id').lean();
      filter.studentId = { $in: matched.map((m) => m._id) };
    }
  }

  filter = scopeQuery(req, filter);

  const [docs, total] = await Promise.all([
    Payment.find(filter).sort({ paymentDate: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Payment.countDocuments(filter),
  ]);
  const names = await resolveNames(req, docs);
  paginated(res, {
    data: docs.map((d) => withNames(d, names)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

/** GET /api/payments/:id/receipt — printable receipt payload (school branding). */
export const paymentReceipt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section, SchoolSettings, User, PaymentReversal } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const payment = await Payment.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!payment) throw ApiError.notFound('Payment not found');

  const ownStudentId = await ownStudentScope(user, String(payment.studentId), tenantDb);
  if (ownStudentId && String(payment.studentId) !== String(ownStudentId)) {
    throw ApiError.forbidden('You can only view your own receipts', 'FINANCE_FORBIDDEN');
  }

  const tenantId = getTenantObjectId(req);
  const [student, settingsDoc, collector, reversals] = await Promise.all([
    Student.findOne(scopeQuery(req, { _id: payment.studentId })).select('fullName admissionNumber rollNumber classId sectionId sessionId fatherName guardianName gender caste').lean(),
    (tenantId ? SchoolSettings.findOne({ tenantId }).sort({ updatedAt: -1 }).lean() : null),
    User.findOne(scopeQuery(req, { _id: payment.collectedBy })).select('name').lean(),
    PaymentReversal.find(scopeQuery(req, { paymentId: payment._id })).sort({ createdAt: 1 }).lean(),
  ]);
  const settings = settingsDoc || await SchoolSettings.findById('main').lean() || await SchoolSettings.findOne().lean();

  const [cls, section, session] = await Promise.all([
    student ? Class.findOne(scopeQuery(req, { _id: student.classId })).select('name').lean() : Promise.resolve(null),
    student ? Section.findOne(scopeQuery(req, { _id: student.sectionId })).select('name').lean() : Promise.resolve(null),
    student ? AcademicSession.findOne(scopeQuery(req, { _id: student.sessionId })).select('name').lean() : Promise.resolve(null),
  ]);

  const paymentAllocations = payment.allocations && payment.allocations.length > 0
    ? payment.allocations
    : (payment.studentFeeId ? [{ studentFeeId: payment.studentFeeId, amountAllocated: payment.amount }] : []);

  const feeIds = paymentAllocations.map((a: any) => a.studentFeeId);
  const fees = await StudentFee.find(scopeQuery(req, { _id: { $in: feeIds } })).lean();
  
  const structureIds = Array.from(new Set(fees.map((f: any) => f.feeStructureId).filter(Boolean)));
  const structures = await FeeStructure.find(scopeQuery(req, { _id: { $in: structureIds } })).select('title').lean();
  const structureMap = new Map(structures.map((s: any) => [String(s._id), s.title]));

  const totalRefunded = reversals.reduce((s: number, r: any) => s + r.amount, 0);
  const isCancelled = totalRefunded >= payment.amount || reversals.some((r: any) => r.reversalType === 'full_reversal' || r.reversalType === 'void');
  const firstReversal = reversals.length > 0 ? reversals[reversals.length - 1] : null;

  const allocationsBreakdown = paymentAllocations.map((alloc: any) => {
    const feeDoc = fees.find((f: any) => String(f._id) === String(alloc.studentFeeId));
    if (!feeDoc) return { ...alloc, feeTitle: '—' };
    return {
      studentFeeId: alloc.studentFeeId,
      amountAllocated: alloc.amountAllocated,
      feeTitle: structureMap.get(String(feeDoc.feeStructureId)) || feeDoc.feeType || 'Fee',
      feeType: feeDoc.feeType,
      month: feeDoc.billingMonth ?? feeDoc.month ?? null,
      year: feeDoc.billingYear ?? null,
      netPayable: feeDoc.netPayable,
      currentRemainingBalance: feeDoc.remainingBalance
    };
  });

  let legacyFee = null;
  if (payment.studentFeeId) {
    const f = fees.find((f: any) => String(f._id) === String(payment.studentFeeId));
    if (f) {
      legacyFee = {
        title: structureMap.get(String(f.feeStructureId)) ?? '—',
        feeType: f.feeType,
        month: f.billingMonth ?? f.month ?? null,
        year: f.billingYear ?? null,
        originalAmount: f.originalAmount,
        discountAmount: f.discountAmount ?? 0,
        scholarshipAmount: f.scholarshipAmount ?? 0,
        otherFeeAmount: f.otherFeeAmount ?? 0,
        fineAmount: f.fineAmount ?? 0,
        chargeBreakdown: f.chargeBreakdown ?? null,
        netPayable: f.netPayable,
        remainingBalanceAfter: f.remainingBalance,
        status: f.status,
      };
    }
  }

  ok(res, {
    school: settings
      ? {
          schoolName: settings.schoolName,
          schoolLogoUrl: settings.schoolLogoUrl ?? null,
          address: settings.address ?? null,
          phone: settings.phone ?? null,
          email: settings.email ?? null,
          currency: settings.currency ?? 'PKR',
          signatureLabel: settings.receiptSettings?.signatureLabel ?? 'Authorized Signatory',
          footerText: settings.receiptSettings?.footerText ?? null,
        }
      : { schoolName: 'School Management System', schoolLogoUrl: null, address: null, phone: null, email: null, currency: 'PKR', signatureLabel: 'Authorized Signatory', footerText: null },
    payment: {
      ...publicPayment(payment as never),
      collectedByName: collector?.name ?? '—',
      isCancelled,
      allocations: allocationsBreakdown,
      reversals: reversals.map((r: any) => ({
        reversalReceiptNumber: r.reversalReceiptNumber,
        reversalType: r.reversalType,
        reason: r.reason,
        amount: r.amount,
        cancelledAt: r.createdAt,
        cancelledBy: String(r.initiatedBy),
      })),
      cancellation: firstReversal
        ? {
            reversalReceiptNumber: firstReversal.reversalReceiptNumber,
            reversalType: firstReversal.reversalType,
            reason: firstReversal.reason,
            amount: firstReversal.amount,
            cancelledAt: firstReversal.createdAt,
            cancelledBy: String(firstReversal.initiatedBy),
          }
        : null,
    },
    student: student
      ? {
          studentId: String(student._id),
          fullName: student.fullName,
          admissionNumber: student.admissionNumber,
          rollNumber: student.rollNumber,
          className: cls?.name ?? '—',
          sectionName: section?.name ?? '—',
          sessionName: session?.name ?? '—',
          fatherName: student.fatherName,
          guardianName: student.guardianName,
          gender: student.gender,
        }
      : null,
    fee: legacyFee,
  });
});

/** GET /api/payments/:id */
export const getPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const doc = await Payment.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Payment not found');
  const ownStudentId = await ownStudentScope(user, String(doc.studentId), tenantDb);
  if (ownStudentId && String(doc.studentId) !== String(ownStudentId)) {
    throw ApiError.forbidden('You can only view your own payments', 'FINANCE_FORBIDDEN');
  }
  const names = await resolveNames(req, [doc]);
  ok(res, withNames(doc, names));
});

/** PATCH /api/payments/:id — notes only (amount and reference are immutable). */
export const updatePaymentNotes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const doc = await Payment.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Payment not found');
  if (req.body.reference !== undefined && req.body.reference !== doc.reference) {
    throw ApiError.badRequest('Payment reference cannot be modified on a posted payment. Corrections require reversal.', 'REFERENCE_IMMUTABLE');
  }
  if (req.body.notes !== undefined) doc.notes = req.body.notes || undefined;
  await doc.save();
  recordAudit('payments', 'PAYMENT_UPDATED', req.user, String(doc._id), { receiptNumber: doc.receiptNumber });
  ok(res, publicPayment(doc as never), 200, { message: 'Payment updated' });
});

/** POST /api/payments/:id/reversal — refund or reversal workflow */
export const createPaymentReversalController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const tenantId = getTenantObjectId(req);
  if (!tenantId) throw ApiError.badRequest('Tenant context required');

  const { amount, reversalType, reason, notes } = req.body;
  const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;

  let reversalAmount = Number(amount);
  if (!reversalAmount || isNaN(reversalAmount)) {
    const payment = await Payment.findOne(scopeQuery(req, { _id: req.params.id })).lean();
    if (!payment) throw ApiError.notFound('Payment not found');
    reversalAmount = payment.refundableAmount ?? payment.amount;
  }

  const result = await executePaymentReversal(
    user,
    {
      sourceType: 'regular_fee',
      paymentId: req.params.id,
      amount: reversalAmount,
      reversalType: reversalType || 'full_reversal',
      reason: reason || 'Administrative refund',
      notes,
      idempotencyKey,
    },
    tenantId,
    tenantDb
  );

  created(res, result, { message: 'Payment reversal/refund processed successfully' });
});
