import mongoose, { Schema, Document, Model } from 'mongoose';

export type ReferenceSourceType = 'regular_fee' | 'exam_fee';

export interface IFinancialReference {
  _id: string; // "${tenantId}:${paymentMethod}:${normalizedReference}"
  tenantId: mongoose.Types.ObjectId;
  paymentMethod: string;
  normalizedReference: string;
  sourceType: ReferenceSourceType;
  paymentId: mongoose.Types.ObjectId;
  receiptNumber: string;
  createdAt: Date;
}

export const financialReferenceSchema = new Schema(
  {
    _id: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    paymentMethod: { type: String, required: true, lowercase: true, trim: true },
    normalizedReference: { type: String, required: true, uppercase: true, trim: true },
    sourceType: { type: String, enum: ['regular_fee', 'exam_fee'], required: true },
    paymentId: { type: Schema.Types.ObjectId, required: true },
    receiptNumber: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

financialReferenceSchema.index({ tenantId: 1, paymentMethod: 1, normalizedReference: 1 }, { unique: true });

export const FinancialReference: Model<IFinancialReference> =
  mongoose.models.FinancialReference ||
  mongoose.model<IFinancialReference>('FinancialReference', financialReferenceSchema);

export function normalizeFinancialReference(raw: string): string {
  return raw.trim().toUpperCase();
}
