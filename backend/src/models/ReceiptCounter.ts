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
  
  // NEVER use the session for the counter increment.
  // It must increment permanently even if the surrounding transaction aborts.
  // This prevents rollback loops and eliminates WriteConflicts on concurrent payments.
  const options: mongoose.QueryOptions = { upsert: true, new: true };
  
  let model = ReceiptCounter;
  let PaymentModel: any = null;
  let PaymentReversalModel: any = null;

  if (tenantDb) {
    const { getTenantModels } = require('../services/TenantModelRegistry');
    model = getTenantModels(tenantDb).ReceiptCounter;
    PaymentModel = getTenantModels(tenantDb).Payment;
    PaymentReversalModel = getTenantModels(tenantDb).PaymentReversal;
  } else {
    PaymentModel = mongoose.models.Payment;
    PaymentReversalModel = mongoose.models.PaymentReversal;
  }

  // Generate until we find a completely free receipt number.
  // This automatically bypasses any manual imports or legacy data collisions.
  while (true) {
    const doc = await model.findOneAndUpdate(
      { _id: counterKey },
      { $inc: { seq: 1 } },
      options
    );
    
    if (!doc) {
      throw new Error('Failed to generate receipt sequence number');
    }
    
    const receiptNumber = `${prefix}-${year}-${String(doc.seq).padStart(6, '0')}`;
    
    // Check if the generated number collides with existing records
    if (PaymentModel) {
      const existsInPayment = await PaymentModel.exists({ tenantId, receiptNumber }).session(session || null);
      if (existsInPayment) continue;
    }
    
    if (PaymentReversalModel) {
      const existsInReversal = await PaymentReversalModel.exists({ tenantId, reversalReceiptNumber: receiptNumber }).session(session || null);
      if (existsInReversal) continue;
    }
    
    return receiptNumber;
  }
}
