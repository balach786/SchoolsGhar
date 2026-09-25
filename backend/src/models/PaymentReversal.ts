import mongoose, { Schema, Document, Model } from 'mongoose';

export type ReversalType = 'full_reversal' | 'partial_refund' | 'void';
export type ReversalSourceType = 'regular_fee' | 'exam_fee';

export interface IPaymentReversal extends Document {
  tenantId: mongoose.Types.ObjectId;
  sourceType: ReversalSourceType;
  paymentId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  obligationId: mongoose.Types.ObjectId; // studentFeeId or studentExamFeeId
  originalReceiptNumber: string;
  reversalReceiptNumber: string;
  amount: number; // integer paisa
  reversalType: ReversalType;
  reason: string;
  initiatedBy: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const paymentReversalSchema = new Schema<IPaymentReversal>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    sourceType: { type: String, enum: ['regular_fee', 'exam_fee'], required: true },
    paymentId: { type: Schema.Types.ObjectId, required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    obligationId: { type: Schema.Types.ObjectId, required: true },
    originalReceiptNumber: { type: String, required: true },
    reversalReceiptNumber: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    reversalType: { type: String, enum: ['full_reversal', 'partial_refund', 'void'], required: true },
    reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 300 },
    initiatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, versionKey: false }
);

paymentReversalSchema.index({ tenantId: 1, reversalReceiptNumber: 1 }, { unique: true });
paymentReversalSchema.index({ tenantId: 1, paymentId: 1 });
paymentReversalSchema.index({ tenantId: 1, studentId: 1, createdAt: -1 });
paymentReversalSchema.index({ tenantId: 1, sourceType: 1, createdAt: 1 });

export const PaymentReversal: Model<IPaymentReversal> =
  mongoose.models.PaymentReversal ||
  mongoose.model<IPaymentReversal>('PaymentReversal', paymentReversalSchema);

export function publicPaymentReversal(doc: IPaymentReversal | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    sourceType: doc.sourceType,
    paymentId: String(doc.paymentId),
    studentId: String(doc.studentId),
    obligationId: String(doc.obligationId),
    originalReceiptNumber: doc.originalReceiptNumber,
    reversalReceiptNumber: doc.reversalReceiptNumber,
    amount: doc.amount,
    reversalType: doc.reversalType,
    reason: doc.reason,
    initiatedBy: doc.initiatedBy ? String(doc.initiatedBy) : null,
    approvedBy: doc.approvedBy ? String(doc.approvedBy) : null,
    notes: doc.notes ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
