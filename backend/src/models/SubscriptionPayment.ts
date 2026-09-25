import mongoose, { Schema, Document, Model } from 'mongoose';

export type PaymentSubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface ISubscriptionPayment extends Document {
  tenantId: mongoose.Types.ObjectId;
  submittedBy: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  paymentMethod: string;
  transactionReference: string;
  paymentDate: Date;
  proofUrl: string;
  proofStorageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  notes?: string;
  status: PaymentSubmissionStatus;
  submittedAt: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
  approvedSubscriptionStart?: Date;
  approvedSubscriptionEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionPaymentSchema = new Schema<ISubscriptionPayment>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, maxlength: 10, default: 'PKR' },
    paymentMethod: { type: String, required: true, trim: true, maxlength: 60 },
    transactionReference: { type: String, required: true, trim: true, maxlength: 100 },
    paymentDate: { type: Date, required: true },
    proofUrl: { type: String, required: true, trim: true, maxlength: 500 },
    proofStorageKey: { type: String, required: true, trim: true, maxlength: 200 },
    fileName: { type: String, required: true, trim: true, maxlength: 200 },
    mimeType: { type: String, required: true, trim: true, maxlength: 100 },
    fileSize: { type: Number, required: true },
    notes: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    submittedAt: { type: Date, required: true, default: Date.now },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true, maxlength: 500 },
    approvedSubscriptionStart: { type: Date },
    approvedSubscriptionEnd: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

subscriptionPaymentSchema.index({ tenantId: 1, createdAt: -1 });
subscriptionPaymentSchema.index({ status: 1, createdAt: -1 });

export const SubscriptionPayment: Model<ISubscriptionPayment> =
  mongoose.models.SubscriptionPayment ||
  mongoose.model<ISubscriptionPayment>('SubscriptionPayment', subscriptionPaymentSchema);

export function publicSubscriptionPayment(p: ISubscriptionPayment) {
  return {
    _id: String(p._id),
    tenantId: String(p.tenantId),
    submittedBy: String(p.submittedBy),
    planId: String(p.planId),
    amount: p.amount,
    currency: p.currency,
    paymentMethod: p.paymentMethod,
    transactionReference: p.transactionReference,
    paymentDate: p.paymentDate,
    proofUrl: p.proofUrl,
    proofStorageKey: p.proofStorageKey,
    fileName: p.fileName,
    mimeType: p.mimeType,
    fileSize: p.fileSize,
    notes: p.notes ?? null,
    status: p.status,
    submittedAt: p.submittedAt,
    reviewedBy: p.reviewedBy ? String(p.reviewedBy) : null,
    reviewedAt: p.reviewedAt ?? null,
    reviewNote: p.reviewNote ?? null,
    approvedSubscriptionStart: p.approvedSubscriptionStart ?? null,
    approvedSubscriptionEnd: p.approvedSubscriptionEnd ?? null,
    createdAt: p.createdAt,
  };
}
