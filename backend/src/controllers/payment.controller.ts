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
  const [students, users, studentFees] = await Promise.all([
    Student.find(scopeQuery(req, { _id: { $in: ids('studentId') } })).select('fullName admissionNumber rollNumber classId sectionId').lean(),
    User.find(scopeQuery(req, { _id: { $in: ids('collectedBy') } })).select('name').lean(),
    StudentFee.find(scopeQuery(req, { _id: { $in: ids('studentFeeId') } })).select('feeStructureId feeType month').lean(),
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
  return {
    ...publicPayment(p),
    studentName: stu?.fullName ?? '—',
    admissionNumber: stu?.admissionNumber ?? '—',
    collectedByName: names.userMap.get(String(p.collectedBy)) ?? '—',
    feeTitle: names.feeMap?.get(String(p.studentFeeId)) ?? '—',
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

  const { payment, fee } = await recordPayment(
    user,
    { ...req.body, studentId, idempotencyKey },
    tenantId,
    tenantDb
  );

  // Notify the linked student user (if any).
  const student = await Student.findOne(scopeQuery(req, { _id: payment.studentId })).select('userId fullName').lean();
  if (student?.userId) {
    const newStatus = fee?.status;
    notify(tenantDb, {
      userId: student.userId as never,
      type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
      title: 'Payment received',
      message: `A payment of ${(payment.amount / 100).toFixed(2)} was received (receipt ${payment.receiptNumber}).`,
      referenceType: 'payment',
      referenceId: String(payment._id),
    });
    if (newStatus === 'paid') {
      notify(tenantDb, {
        userId: student.userId as never,
        type: NOTIFICATION_TYPES.FEE_PAID,
        title: 'Fee fully paid',
        message: 'Your outstanding fee has been fully paid. Thank you!',
        referenceType: 'studentFee',
        referenceId: String(payment.studentFeeId),
      });
    } else {
      notify(tenantDb, {
        userId: student.userId as never,
        type: NOTIFICATION_TYPES.BALANCE_REMAINING,
        title: 'Balance remaining',
        message: `A balance of ${((fee?.remainingBalance ?? 0) / 100).toFixed(2)} remains on this fee.`,
        referenceType: 'studentFee',
        referenceId: String(payment.studentFeeId),
        dedupe: true,
      });
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
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section, SchoolSettings, User } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const payment = await Payment.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!payment) throw ApiError.notFound('Payment not found');

  const ownStudentId = await ownStudentScope(user, String(payment.studentId));
  if (ownStudentId && String(payment.studentId) !== ownStudentId, tenantDb) {
    throw ApiError.forbidden('You can only view your own receipts', 'FINANCE_FORBIDDEN');
  }

  const tenantId = getTenantObjectId(req);
  const [fee, student, settingsDoc, collector] = await Promise.all([
    StudentFee.findOne(scopeQuery(req, { _id: payment.studentFeeId })).lean(),
    Student.findOne(scopeQuery(req, { _id: payment.studentId })).select('fullName admissionNumber rollNumber classId sectionId sessionId fatherName guardianName gender caste').lean(),
    (tenantId ? SchoolSettings.findOne({ tenantId }).sort({ updatedAt: -1 }).lean() : null),
    User.findOne(scopeQuery(req, { _id: payment.collectedBy })).select('name').lean(),
  ]);
  const settings = settingsDoc || await SchoolSettings.findById('main').lean() || await SchoolSettings.findOne().lean();

  const [cls, section, session, structure, reversal] = await Promise.all([
    student ? Class.findOne(scopeQuery(req, { _id: student.classId })).select('name').lean() : Promise.resolve(null),
    student ? Section.findOne(scopeQuery(req, { _id: student.sectionId })).select('name').lean() : Promise.resolve(null),
    student ? AcademicSession.findOne(scopeQuery(req, { _id: student.sessionId })).select('name').lean() : Promise.resolve(null),
    fee ? FeeStructure.findOne(scopeQuery(req, { _id: fee.feeStructureId })).select('title').lean() : Promise.resolve(null),
    import('../models/PaymentReversal').then(({ PaymentReversal }) =>
      PaymentReversal.findOne(scopeQuery(req, { paymentId: payment._id })).lean()
    ),
  ]);

  // Balance after this payment = netPayable - (sum of payments up to & incl. this one).
  const siblingPayments = await Payment.find(scopeQuery(req, { studentFeeId: payment.studentFeeId })).sort({ paymentDate: 1, createdAt: 1 }).select('amount _id').lean();
  const paidUpToHere = siblingPayments
    .filter((p) => String(p._id) === String(payment._id) || new Date(p.paymentDate) <= new Date(payment.paymentDate))
    .reduce((sum, p) => sum + p.amount, 0);

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
      isCancelled: Boolean(reversal),
      cancellation: reversal
        ? {
            reversalReceiptNumber: reversal.reversalReceiptNumber,
            reversalType: reversal.reversalType,
            reason: reversal.reason,
            amount: reversal.amount,
            cancelledAt: reversal.createdAt,
            cancelledBy: String(reversal.initiatedBy),
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
    fee: fee
      ? {
          title: structure?.title ?? '—',
          feeType: fee.feeType,
          month: fee.billingMonth ?? fee.month ?? null,
          year: fee.billingYear ?? null,
          originalAmount: fee.originalAmount,
          discountAmount: fee.discountAmount ?? 0,
          scholarshipAmount: fee.scholarshipAmount ?? 0,
          otherFeeAmount: fee.otherFeeAmount ?? 0,
          fineAmount: fee.fineAmount ?? 0,
          chargeBreakdown: fee.chargeBreakdown ?? null,
          netPayable: fee.netPayable,
          remainingBalanceAfter: Math.max(0, fee.netPayable - paidUpToHere),
          status: fee.status,
        }
      : null,
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
  const ownStudentId = await ownStudentScope(user, String(doc.studentId));
  if (ownStudentId && String(doc.studentId) !== ownStudentId, tenantDb) {
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
