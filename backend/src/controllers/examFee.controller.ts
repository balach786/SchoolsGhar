import mongoose from 'mongoose';
import { Response } from 'express';
import { AuthRequest } from '../types';
import { publicExamFee } from '../models/ExamFee';
import { publicStudentExamFee } from '../models/StudentExamFee';
import { publicExamFeePayment } from '../models/ExamFeePayment';
import { publicSchoolSettings } from '../models/SchoolSettings';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, created, paginated } from '../utils/apiResponse';
import { nextReceiptNumber } from '../models/ReceiptCounter';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';
import { getTenantModels } from '../services/TenantModelRegistry';
import { generateStudentExamFeesForClass } from '../services/examFee.service';
import { acquireIdempotency, completeIdempotency, releaseIdempotency } from '../services/idempotency.service';
import { reserveFinancialReference } from '../services/financialReference.service';
import { recordAudit, recordAuditWithSession } from '../services/audit.service';
import { executePaymentReversal } from '../services/reversal.service';

/** GET /api/exam-fees — class fee configurations */
export const listExamFees = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { ExamFee, Class } = getTenantModels(tenantDb);

  const { examId, classId } = req.query;
  const filter: Record<string, any> = {};
  if (examId) filter.examId = examId;
  if (classId) filter.classId = classId;

  const docs = await ExamFee.find(scopeQuery(req, filter)).sort({ classId: 1 }).lean();
  const classIds = Array.from(new Set(docs.map((d) => String(d.classId))));
  const classes = await Class.find(scopeQuery(req, { _id: { $in: classIds } })).select('name').lean();
  const classMap = new Map(classes.map((c) => [String(c._id), c.name]));

  const enriched = docs.map((d) => ({
    ...publicExamFee(d),
    className: classMap.get(String(d.classId)) ?? '—',
  }));

  ok(res, enriched);
});

/** POST /api/exam-fees — setup fee for a class */
export const createOrUpdateExamFee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Exam, ExamFee } = getTenantModels(tenantDb);

  const tenantId = getTenantObjectId(req);
  const { examId, sessionId, classId, amount, dueDate, defaultFine, discountAllowed, scholarshipAllowed } = req.body;

  const exam = await Exam.findOne(scopeQuery(req, { _id: examId }));
  if (!exam) throw ApiError.notFound('Exam not found');

  let doc = await ExamFee.findOne(scopeQuery(req, { examId, classId }));
  if (doc) {
    doc.amount = amount;
    if (dueDate !== undefined) doc.dueDate = dueDate ? new Date(dueDate) : undefined;
    if (defaultFine !== undefined) doc.defaultFine = defaultFine;
    if (discountAllowed !== undefined) doc.discountAllowed = discountAllowed;
    if (scholarshipAllowed !== undefined) doc.scholarshipAllowed = scholarshipAllowed;
    await doc.save();
  } else {
    doc = await ExamFee.create({
      tenantId,
      examId,
      sessionId: sessionId || exam.sessionId,
      classId,
      amount,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      defaultFine: defaultFine ?? 0,
      discountAllowed: discountAllowed ?? true,
      scholarshipAllowed: scholarshipAllowed ?? true,
      isActive: true,
    });
  }

  recordAudit(
    'examFees',
    'EXAM_FEE_CONFIGURED',
    req.user as any,
    String(doc._id),
    { examId, classId, amount: doc.amount, defaultFine: doc.defaultFine },
    'tenant',
    tenantId
  );

  ok(res, publicExamFee(doc), 200, { message: 'Exam fee configured' });
});

/** POST /api/exam-fees/sync-students — Sync new students for an existing exam */
export const syncStudentExamFees = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Exam, ExamFee } = getTenantModels(tenantDb);

  const tenantId = getTenantObjectId(req);
  const { examId } = req.body;

  const exam = await Exam.findOne(scopeQuery(req, { _id: examId }));
  if (!exam) throw ApiError.notFound('Exam not found');

  const feeConfigs = await ExamFee.find(scopeQuery(req, { examId, isActive: true }));
  if (feeConfigs.length === 0) {
    throw ApiError.badRequest('No fee configuration found for this exam.', 'NO_FEE_CONFIGURED');
  }

  let totalGenerated = 0;
  for (const feeConfig of feeConfigs) {
    const generated = await generateStudentExamFeesForClass(
      tenantDb,
      tenantId!,
      examId,
      feeConfig.classId,
      feeConfig.sessionId,
      { amount: feeConfig.amount, dueDate: feeConfig.dueDate || undefined },
      req.user ? (req.user as any)._id : undefined
    );
    totalGenerated += generated;
  }

  recordAudit(
    'examFees',
    'EXAM_FEE_SYNCED',
    req.user as any,
    String(examId),
    {
      examId,
      totalGenerated,
    },
    'tenant',
    tenantId
  );

  ok(res, { generated: totalGenerated }, 200, {
    message: totalGenerated > 0
      ? `Synced ${totalGenerated} missing student fee record(s)`
      : 'All eligible students already have fee records',
  });
});

/** GET /api/exam-fees/students — list individual student exam fees */
export const listStudentExamFees = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { StudentExamFee, Student, Class, Section } = getTenantModels(tenantDb);

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(10000, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter: Record<string, any> = {};
  if (req.query.examId) filter.examId = req.query.examId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.sectionId) filter.sectionId = req.query.sectionId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.studentId) filter.studentId = req.query.studentId;

  // For student role, restrict to own student record
  const user = req.user as any;
  if (user?.role === 'student') {
    const ownStudent = await Student.findOne(scopeQuery(req, { userId: user._id })).select('_id').lean();
    if (ownStudent) {
      filter.studentId = ownStudent._id;
    }
  }

  const [docs, total] = await Promise.all([
    StudentExamFee.find(scopeQuery(req, filter)).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    StudentExamFee.countDocuments(scopeQuery(req, filter)),
  ]);

  const studentIds = Array.from(new Set(docs.map((d) => String(d.studentId))));
  const classIds = Array.from(new Set(docs.map((d) => String(d.classId))));
  const sectionIds = Array.from(new Set(docs.map((d) => String(d.sectionId))));

  const [students, classes, sections] = await Promise.all([
    Student.find(scopeQuery(req, { _id: { $in: studentIds } })).select('fullName admissionNumber rollNumber').lean(),
    Class.find(scopeQuery(req, { _id: { $in: classIds } })).select('name').lean(),
    Section.find(scopeQuery(req, { _id: { $in: sectionIds } })).select('name').lean(),
  ]);

  const studentMap = new Map(students.map((s) => [String(s._id), s]));
  const classMap = new Map(classes.map((c) => [String(c._id), c.name]));
  const sectionMap = new Map(sections.map((s) => [String(s._id), s.name]));

  const enriched = docs.map((d) => {
    const st = studentMap.get(String(d.studentId));
    return {
      ...publicStudentExamFee(d),
      studentName: st?.fullName ?? '—',
      admissionNumber: st?.admissionNumber ?? '—',
      rollNumber: st?.rollNumber ?? '—',
      className: classMap.get(String(d.classId)) ?? '—',
      sectionName: sectionMap.get(String(d.sectionId)) ?? '—',
    };
  });

  paginated(res, {
    data: enriched,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

/** POST /api/exam-fees/collect — record a payment against student exam fee inside an atomic transaction */
export const collectExamFeePayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { StudentExamFee, ExamFeePayment } = getTenantModels(tenantDb);

  const tenantId = getTenantObjectId(req);
  if (!tenantId) throw ApiError.badRequest('Tenant context required');

  const {
    studentExamFeeId,
    paymentDate: rawDate,
    reference,
    notes,
  } = req.body;

  const rawAmount = req.body.amount ?? req.body.amountPaid;
  const amount = Number(rawAmount);
  if (!amount || amount <= 0) {
    throw ApiError.badRequest('Payment amount must be greater than 0');
  }

  const rawMethod = String(req.body.paymentMethod || 'cash').toLowerCase().replace(/\s+/g, '_');
  const validMethods = ['cash', 'bank_transfer', 'card', 'online'];
  const paymentMethod = validMethods.includes(rawMethod) ? rawMethod : 'other';

  const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;

  // Idempotency check before transaction
  const idempotency = await acquireIdempotency(
    tenantId,
    'exam_fee_payment',
    idempotencyKey,
    { studentExamFeeId, amount, paymentMethod, reference }
  );
  if (idempotency.isCached && idempotency.cachedResponse) {
    return ok(res, idempotency.cachedResponse.body, idempotency.cachedResponse.status);
  }

  const session = await mongoose.startSession();
  try {
    let resultPayload: any;
    await session.withTransaction(async () => {
      const doc = await StudentExamFee.findOne({ _id: studentExamFeeId, tenantId }).session(session);
      if (!doc) throw ApiError.notFound('Student exam fee record not found in this school');
      if (doc.status === 'waived') {
        throw ApiError.badRequest('Cannot collect payment on a waived exam fee obligation', 'EXAM_FEE_WAIVED');
      }
      if (doc.status === 'paid' || doc.remainingBalance <= 0) {
        throw ApiError.badRequest('This exam fee has already been fully paid', 'ALREADY_PAID');
      }

      if (amount > doc.remainingBalance) {
        throw ApiError.badRequest(
          `Payment amount (${amount / 100} PKR) exceeds the remaining balance (${doc.remainingBalance / 100} PKR)`,
          'PAYMENT_EXCEEDS_BALANCE'
        );
      }

      const paymentDate = rawDate ? new Date(rawDate) : new Date();

      // Atomic conditional update on StudentExamFee
      const updateResult = await StudentExamFee.updateOne(
        {
          _id: doc._id,
          tenantId,
          $expr: { $lte: [{ $add: ['$amountPaid', amount] }, '$netPayable'] },
        },
        [
          {
            $set: {
              amountPaid: { $add: ['$amountPaid', amount] },
              remainingBalance: { $subtract: ['$netPayable', { $add: ['$amountPaid', amount] }] },
              status: {
                $cond: [
                  { $lte: ['$netPayable', { $add: ['$amountPaid', amount] }] },
                  'paid',
                  'partial',
                ],
              },
            },
          },
        ],
        { session, runValidators: true }
      );

      if (updateResult.matchedCount === 0) {
        throw ApiError.conflict('Payment conflict — the exam fee balance changed. Please retry.', 'EXAM_FEE_PAYMENT_CONFLICT');
      }

      // Receipt allocation
      const receiptNumber = await nextReceiptNumber(paymentDate, 'EXM-RCPT', String(tenantId), session, tenantDb);

      // Create ExamFeePayment with refundableAmount
      const [payment] = await ExamFeePayment.create(
        [
          {
            tenantId,
            studentExamFeeId: doc._id,
            studentId: doc.studentId,
            examId: doc.examId,
            amount,
            refundableAmount: amount,
            paymentMethod,
            paymentDate,
            receiptNumber,
            reference: reference ? reference.trim() : undefined,
            notes,
            collectedBy: (req.user as any)?._id,
          },
        ],
        { session, runValidators: true }
      );

      // Reserve external reference in FinancialReference registry
      await reserveFinancialReference(
        tenantId,
        paymentMethod,
        reference,
        'exam_fee',
        payment._id as mongoose.Types.ObjectId,
        receiptNumber,
        session,
        tenantDb
      );

      // Write AuditLog inside transaction
      await recordAuditWithSession(
        'examFees',
        'EXAM_FEE_PAYMENT_RECORDED',
        req.user as any,
        String(payment._id),
        {
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
          studentExamFeeId: String(doc._id),
          paymentMethod: payment.paymentMethod,
        },
        session,
        'tenant',
        tenantId
      );

      const updatedFee = await StudentExamFee.findOne({ _id: doc._id, tenantId }).session(session);
      const publicFee = {
        ...publicStudentExamFee(updatedFee as any),
        dueAmount: updatedFee?.remainingBalance ?? 0,
      };

      resultPayload = {
        fee: publicFee,
        studentFee: publicFee,
        payment: publicExamFeePayment(payment),
      };

      // Commit idempotency inside session
      await completeIdempotency(
        idempotency.recordKey,
        { examFeePaymentId: String(payment._id), receiptNumber: payment.receiptNumber },
        201,
        resultPayload,
        session,
        idempotency.ownerToken
      );
    });

    ok(res, resultPayload, 201, { message: `Payment of ${(amount / 100).toFixed(2)} PKR recorded successfully` });
  } catch (err) {
    await releaseIdempotency(idempotency.recordKey, idempotency.ownerToken);
    throw err;
  } finally {
    idempotency.stopHeartbeat?.();
    await session.endSession();
  }
});

/** PATCH /api/exam-fees/students/:id/adjust — explicit authorized discount/scholarship/fine adjustment */
export const adjustStudentExamFee = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { StudentExamFee } = getTenantModels(tenantDb);

  const tenantId = getTenantObjectId(req);
  if (!tenantId) throw ApiError.badRequest('Tenant context required');

  const doc = await StudentExamFee.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Student exam fee record not found');

  const nextDiscount = req.body.discountAmount !== undefined ? req.body.discountAmount : doc.discountAmount;
  const nextScholarship = req.body.scholarshipAmount !== undefined ? req.body.scholarshipAmount : doc.scholarshipAmount;
  const nextFine = req.body.fineAmount !== undefined ? req.body.fineAmount : doc.fineAmount;

  const nextNetPayable = Math.max(0, doc.originalAmount - nextDiscount - nextScholarship + nextFine);
  if (nextNetPayable < (doc.amountPaid ?? 0)) {
    throw ApiError.unprocessable(
      'Net payable cannot fall below the amount already paid. Please issue a refund first.',
      'FEE_ADJUSTMENT_REQUIRES_REFUND'
    );
  }

  const before = {
    discountAmount: doc.discountAmount,
    scholarshipAmount: doc.scholarshipAmount,
    fineAmount: doc.fineAmount,
    netPayable: doc.netPayable,
  };

  const nextRemaining = Math.max(0, nextNetPayable - (doc.amountPaid ?? 0));
  let nextStatus = doc.status;
  if (doc.status !== 'waived') {
    nextStatus = nextRemaining === 0 ? 'paid' : (doc.amountPaid ?? 0) > 0 ? 'partial' : 'unpaid';
  }

  const updatedDoc = await StudentExamFee.findOneAndUpdate(
    {
      _id: doc._id,
      tenantId,
      amountPaid: { $lte: nextNetPayable },
    },
    {
      $set: {
        discountAmount: nextDiscount,
        scholarshipAmount: nextScholarship,
        fineAmount: nextFine,
        netPayable: nextNetPayable,
        remainingBalance: nextRemaining,
        status: nextStatus,
      },
    },
    { new: true, runValidators: true }
  );

  if (!updatedDoc) {
    throw ApiError.unprocessable(
      'Net payable cannot fall below the amount already paid. Please issue a refund first.',
      'FEE_ADJUSTMENT_REQUIRES_REFUND'
    );
  }

  recordAudit(
    'examFees',
    'EXAM_FEE_ADJUSTED',
    req.user as any,
    String(doc._id),
    {
      beforeNetPayable: before.netPayable,
      afterNetPayable: doc.netPayable,
      discountAmount: doc.discountAmount,
      scholarshipAmount: doc.scholarshipAmount,
      fineAmount: doc.fineAmount,
    },
    'tenant',
    tenantId
  );

  ok(res, publicStudentExamFee(doc), 200, { message: 'Student exam fee adjusted successfully' });
});

/** POST /api/exam-fees/payments/:id/reversal — refund or reversal workflow for exam fees */
export const createExamFeeReversalController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantId = getTenantObjectId(req);
  if (!tenantId) throw ApiError.badRequest('Tenant context required');

  const { amount, reversalType, reason, notes } = req.body;
  const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;
  const tenantDb = (req as any).tenantDb as import('mongoose').Connection;
  if (!tenantDb) throw ApiError.badRequest('tenantDb is missing');
  const { ExamFeePayment } = require('../services/TenantModelRegistry').getTenantModels(tenantDb);

  let reversalAmount = Number(amount);
  if (!reversalAmount || isNaN(reversalAmount)) {
    const payment = await ExamFeePayment.findOne(scopeQuery(req, { _id: req.params.id })).lean();
    if (!payment) throw ApiError.notFound('Payment not found');
    reversalAmount = payment.refundableAmount ?? payment.amount;
  }

  const result = await executePaymentReversal(
    req.user as any,
    {
      sourceType: 'exam_fee',
      paymentId: req.params.id,
      amount: reversalAmount,
      reversalType: reversalType || 'full_reversal',
      reason: reason || 'Administrative exam fee refund',
      notes,
      idempotencyKey,
    },
    tenantId,
    tenantDb
  );

  created(res, result, { message: 'Exam fee reversal/refund processed successfully' });
});

/** GET /api/exam-fees/receipt/:paymentId — printable receipt data */
export const getExamFeeReceipt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { ExamFeePayment, StudentExamFee, Student, Exam, SchoolSettings, Class, Section, AcademicSession } = getTenantModels(tenantDb);

  const payment = await ExamFeePayment.findOne(scopeQuery(req, { _id: req.params.paymentId })).lean();
  if (!payment) throw ApiError.notFound('Payment not found');

  const [fee, student, exam, settings] = await Promise.all([
    StudentExamFee.findOne(scopeQuery(req, { _id: payment.studentExamFeeId })).lean(),
    Student.findOne(scopeQuery(req, { _id: payment.studentId })).lean(),
    Exam.findOne(scopeQuery(req, { _id: payment.examId })).lean(),
    SchoolSettings.findOne(scopeQuery(req, {})).lean(),
  ]);

  if (!fee || !student || !exam) throw ApiError.notFound('Associated records not found');

  const [cls, section, session] = await Promise.all([
    Class.findOne(scopeQuery(req, { _id: fee.classId })).select('name').lean(),
    Section.findOne(scopeQuery(req, { _id: fee.sectionId })).select('name').lean(),
    AcademicSession.findOne(scopeQuery(req, { _id: fee.sessionId })).select('name').lean(),
  ]);

  ok(res, {
    school: settings ? publicSchoolSettings(settings) : null,
    payment: publicExamFeePayment(payment),
    fee: publicStudentExamFee(fee),
    student: {
      _id: String(student._id),
      fullName: student.fullName,
      admissionNumber: student.admissionNumber,
      rollNumber: student.rollNumber,
      className: cls?.name ?? '—',
      sectionName: section?.name ?? '—',
      sessionName: session?.name ?? '—',
    },
    exam: {
      _id: String(exam._id),
      name: exam.name,
    },
  });
});

/** GET /api/exam-fees/history/:studentId — student exam fee history */
export const getStudentExamFeeHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { StudentExamFee, Exam, ExamFeePayment } = getTenantModels(tenantDb);

  const studentId = req.params.studentId;
  const fees = await StudentExamFee.find(scopeQuery(req, { studentId })).sort({ createdAt: -1 }).lean();
  const examIds = Array.from(new Set(fees.map((f) => String(f.examId))));
  const exams = await Exam.find(scopeQuery(req, { _id: { $in: examIds } })).select('name status startDate endDate').lean();
  const examMap = new Map(exams.map((e) => [String(e._id), e]));

  const payments = await ExamFeePayment.find(scopeQuery(req, { studentId })).sort({ paymentDate: -1 }).lean();

  const history = fees.map((f) => {
    const ex = examMap.get(String(f.examId));
    const feePayments = payments.filter((p) => String(p.studentExamFeeId) === String(f._id));
    return {
      ...publicStudentExamFee(f),
      examName: ex?.name ?? '—',
      examStatus: ex?.status ?? '—',
      payments: feePayments.map(publicExamFeePayment),
    };
  });

  ok(res, history);
});
