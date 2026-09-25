import mongoose, { Schema, Document, Model } from 'mongoose';

export type IdempotencyStatus = 'in_progress' | 'completed';

export interface IFinancialIdempotency {
  _id: string; // "${tenantId}:${operation}:${idempotencyKey}"
  tenantId: mongoose.Types.ObjectId;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
  status: IdempotencyStatus;
  resultRef?: {
    paymentId?: string;
    examFeePaymentId?: string;
    salaryRecordId?: string;
    reversalId?: string;
    receiptNumber?: string;
  };
  ownerToken?: string;
  heartbeatAt?: Date;
  responseStatus?: number;
  responseBody?: Record<string, any>;
  createdAt: Date;
  expiresAt: Date;
}

export const financialIdempotencySchema = new Schema(
  {
    _id: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    operation: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    requestHash: { type: String, required: true },
    ownerToken: { type: String },
    heartbeatAt: { type: Date },
    status: { type: String, enum: ['in_progress', 'completed'], required: true, default: 'in_progress' },
    resultRef: {
      paymentId: { type: String },
      examFeePaymentId: { type: String },
      salaryRecordId: { type: String },
      reversalId: { type: String },
      receiptNumber: { type: String },
    },
    responseStatus: { type: Number },
    responseBody: { type: Schema.Types.Mixed },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

financialIdempotencySchema.index({ tenantId: 1, operation: 1, idempotencyKey: 1 }, { unique: true });

export const FinancialIdempotency: Model<IFinancialIdempotency> =
  mongoose.models.FinancialIdempotency ||
  mongoose.model<IFinancialIdempotency>('FinancialIdempotency', financialIdempotencySchema);
