import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { Payment } from '../models/Payment';
import { ExamFeePayment } from '../models/ExamFeePayment';
import { StudentFee } from '../models/StudentFee';
import { StudentExamFee } from '../models/StudentExamFee';
import { PaymentReversal, ReversalType, ReversalSourceType, publicPaymentReversal } from '../models/PaymentReversal';
import { nextReceiptNumber } from '../models/ReceiptCounter';
import { recordAuditWithSession } from './audit.service';
import { acquireIdempotency, completeIdempotency, releaseIdempotency } from './idempotency.service';
import type { AuthedUser } from './finance.service';
import { getTenantModels } from './TenantModelRegistry';

export interface CreateReversalInput {
  sourceType: ReversalSourceType;
  paymentId: string;
  amount: number; // integer paisa
  reversalType: ReversalType;
  reason: string;
  notes?: string;
  idempotencyKey?: string;
}

export async function executePaymentReversal(
  actor: AuthedUser,
  input: CreateReversalInput,
  tenantId?: string | mongoose.Types.ObjectId,
  tenantDb?: mongoose.Connection
) {
  const resolvedTenantId = tenantId || actor.tenantId;
  if (!resolvedTenantId) {
    throw ApiError.badRequest('Tenant context required');
  }
  const tId = new mongoose.Types.ObjectId(String(resolvedTenantId));
  const amount = input.amount;
  if (!Number.isInteger(amount) || amount < 1) {
    throw ApiError.badRequest('Reversal amount must be at least 1 paisa');
  }

  // Idempotency check before transaction
  const idempotency = await acquireIdempotency(
    tId,
    'payment_reversal',
    input.idempotencyKey,
    { paymentId: input.paymentId, amount: input.amount, reversalType: input.reversalType, reason: input.reason }
  );
  if (idempotency.isCached && idempotency.cachedResponse) {
    return idempotency.cachedResponse.body;
  }

  if (!tenantDb) {
    throw ApiError.badRequest('Tenant database connection is required');
  }

  const { Payment, ExamFeePayment, StudentFee, StudentExamFee, PaymentReversal } = getTenantModels(tenantDb);

  const session = await mongoose.startSession();
  try {
    let resultPayload: any;
    await session.withTransaction(async () => {
      let paymentDoc: any;
      let studentId: mongoose.Types.ObjectId;
      let obligationId: mongoose.Types.ObjectId;
      let originalReceiptNumber: string;

      if (input.sourceType === 'regular_fee') {
        // Atomic deduction of refundableAmount on Payment
        paymentDoc = await Payment.findOneAndUpdate(
          {
            _id: input.paymentId,
            tenantId: tId,
            refundableAmount: { $gte: amount },
          },
          { 
            $inc: { refundableAmount: -amount },
            $set: { status: input.reversalType === 'void' || input.reversalType === 'full_reversal' ? 'voided' : 'refunded' }
          },
          { session, new: true, runValidators: true }
        );

        if (!paymentDoc) {
          const checkExists = await Payment.findOne({ _id: input.paymentId, tenantId: tId }).session(session);
          if (!checkExists) {
            throw ApiError.notFound('Payment not found in this school');
          }
          throw ApiError.conflict(
            `Requested refund amount (${amount / 100} PKR) exceeds available refundable balance (${(checkExists.refundableAmount ?? checkExists.amount) / 100} PKR)`,
            'REFUND_EXCEEDS_AVAILABLE_AMOUNT'
          );
        }

        studentId = paymentDoc.studentId;
        originalReceiptNumber = paymentDoc.receiptNumber;

        // Restore StudentFee balances atomically based on allocations
        // If allocations exist, we roll them back. If old single studentFeeId exists, we roll that back.
        if (paymentDoc.allocations && paymentDoc.allocations.length > 0) {
           // We are doing a full reversal. If it's a partial refund spanning multiple allocations, 
           // determining which allocation gets refunded is complex. The user wants oldest-first allocations,
           // so a partial refund would logically refund the newest allocation first.
           // For simplicity and safety as requested: full void of allocations.
           if (amount < paymentDoc.amount) {
              throw ApiError.badRequest('Partial refunds for multi-invoice payments are currently not supported. Please void the entire payment.');
           }

           for (const alloc of paymentDoc.allocations) {
              const fee = await StudentFee.findOne({ _id: alloc.studentFeeId, tenantId: tId }).session(session);
              if (!fee) continue; // Should not happen, but safe

              const newAmountPaid = Math.max(0, (fee.amountPaid || 0) - alloc.amountAllocated);
              const newRemaining = Math.max(0, fee.netPayable - newAmountPaid);
              const newStatus = newRemaining <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid';

              await StudentFee.updateOne(
                { _id: fee._id, tenantId: tId },
                { $set: { amountPaid: newAmountPaid, remainingBalance: newRemaining, status: newStatus } },
                { session, runValidators: true }
              );
           }
           obligationId = paymentDoc.allocations[0].studentFeeId; // Track first obligation for reference
        } else if (paymentDoc.studentFeeId) {
          // Legacy single-invoice payment rollback
          obligationId = paymentDoc.studentFeeId;
          const fee = await StudentFee.findOne({ _id: obligationId, tenantId: tId }).session(session);
          if (!fee) throw ApiError.notFound('Associated student fee obligation not found');

          const newAmountPaid = Math.max(0, (fee.amountPaid || 0) - amount);
          const newRemaining = Math.max(0, fee.netPayable - newAmountPaid);
          const newStatus = newRemaining <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid';

          await StudentFee.updateOne(
            { _id: fee._id, tenantId: tId },
            {
              $set: {
                amountPaid: newAmountPaid,
                remainingBalance: newRemaining,
                status: newStatus,
              },
            },
            { session, runValidators: true }
          );
        } else {
           throw ApiError.badRequest('Payment has no linked fee obligations to reverse');
        }
      } else if (input.sourceType === 'exam_fee') {
        // Atomic deduction of refundableAmount on ExamFeePayment
        paymentDoc = await ExamFeePayment.findOneAndUpdate(
          {
            _id: input.paymentId,
            tenantId: tId,
            refundableAmount: { $gte: amount },
          },
          { $inc: { refundableAmount: -amount } },
          { session, new: true, runValidators: true }
        );

        if (!paymentDoc) {
          const checkExists = await ExamFeePayment.findOne({ _id: input.paymentId, tenantId: tId }).session(session);
          if (!checkExists) {
            throw ApiError.notFound('Exam fee payment not found in this school');
          }
          throw ApiError.conflict(
            `Requested refund amount (${amount / 100} PKR) exceeds available refundable balance (${(checkExists.refundableAmount ?? checkExists.amount) / 100} PKR)`,
            'REFUND_EXCEEDS_AVAILABLE_AMOUNT'
          );
        }

        studentId = paymentDoc.studentId;
        obligationId = paymentDoc.studentExamFeeId;
        originalReceiptNumber = paymentDoc.receiptNumber;

        // Restore StudentExamFee balance atomically
        const fee = await StudentExamFee.findOne({ _id: obligationId, tenantId: tId }).session(session);
        if (!fee) throw ApiError.notFound('Associated student exam fee obligation not found');

        const newAmountPaid = Math.max(0, fee.amountPaid - amount);
        const newRemaining = Math.max(0, fee.netPayable - newAmountPaid);
        const newStatus = newRemaining <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid';

        await StudentExamFee.updateOne(
          { _id: fee._id, tenantId: tId },
          {
            $set: {
              amountPaid: newAmountPaid,
              remainingBalance: newRemaining,
              status: newStatus,
            },
          },
          { session, runValidators: true }
        );
      } else {
        throw ApiError.badRequest('Invalid reversal sourceType');
      }

      // Generate REV receipt number within transaction
      const reversalReceiptNumber = await nextReceiptNumber(new Date(), 'REV', String(tId), session, tenantDb);

      // Create PaymentReversal record
      const [reversalDoc] = await PaymentReversal.create(
        [
          {
            tenantId: tId,
            sourceType: input.sourceType,
            paymentId: paymentDoc._id,
            studentId,
            obligationId,
            originalReceiptNumber,
            reversalReceiptNumber,
            amount,
            reversalType: input.reversalType,
            reason: input.reason,
            initiatedBy: actor._id,
            notes: input.notes,
          },
        ],
        { session, runValidators: true }
      );

      // Audit log within transaction
      await recordAuditWithSession(
        'payments',
        input.reversalType === 'full_reversal' ? 'PAYMENT_REVERSED' : 'PAYMENT_REFUNDED',
        actor as any,
        String(paymentDoc._id),
        {
          reversalId: String(reversalDoc._id),
          reversalReceiptNumber,
          originalReceiptNumber,
          amount,
          reversalType: input.reversalType,
          reason: input.reason,
        },
        session,
        'tenant',
        tId
      );

      resultPayload = {
        reversal: publicPaymentReversal(reversalDoc),
        refundableRemaining: paymentDoc.refundableAmount,
      };

      // Complete idempotency inside session
      await completeIdempotency(
        idempotency.recordKey,
        { reversalId: String(reversalDoc._id), receiptNumber: reversalReceiptNumber },
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
