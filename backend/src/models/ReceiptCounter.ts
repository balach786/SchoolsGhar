import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Atomic receipt-number counter.
 * One tiny document per year ({ _id: "RCPT-2026" }), incremented with $inc —
 * collision-safe even under concurrent payments. Never countDocuments()+1.
 */
export interface IReceiptCounter {
  _id: string;
  seq: number;
}

export const receiptCounterSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

export const ReceiptCounter: Model<IReceiptCounter> =
  mongoose.models.ReceiptCounter || mongoose.model<IReceiptCounter>('ReceiptCounter', receiptCounterSchema);

/**
 * Generate the next collision-safe receipt number, e.g. RCPT-2026-000001.
 * The year is derived from the payment date (school's academic year usage).
 */
export async function nextReceiptNumber(
  paymentDate: Date,
  prefix = 'RCPT',
  tenantId: string,
  session?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
): Promise<string> {
  if (!tenantId) {
    throw new Error('tenantId is required to generate receipt number');
  }
  const year = paymentDate.getUTCFullYear();
  const counterKey = `${tenantId}:${prefix}-${year}`;
  const options: mongoose.QueryOptions = { upsert: true, new: true };
  if (session) {
    options.session = session;
  }
  let model = ReceiptCounter;
  if (tenantDb) {
    const { getTenantModels } = require('../services/TenantModelRegistry');
    model = getTenantModels(tenantDb).ReceiptCounter;
  }
  const doc = await model.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    options
  );
  if (!doc) {
    throw new Error('Failed to generate receipt sequence number');
  }
  return `${prefix}-${year}-${String(doc.seq).padStart(6, '0')}`;
}
