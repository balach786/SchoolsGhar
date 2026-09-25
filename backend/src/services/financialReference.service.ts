import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { FinancialReference, normalizeFinancialReference, ReferenceSourceType } from '../models/FinancialReference';

/**
 * Reserves an external non-cash payment reference.
 * Cash payments do not require reference reservation.
 * Throws 409 DUPLICATE_PAYMENT_REFERENCE if already used within the tenant.
 */
export async function reserveFinancialReference(
  tenantId: string | mongoose.Types.ObjectId,
  paymentMethod: string,
  rawReference: string | undefined,
  sourceType: ReferenceSourceType,
  paymentId: mongoose.Types.ObjectId,
  receiptNumber: string,
  session?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
): Promise<void> {
  const method = paymentMethod.trim().toLowerCase();
  if (method === 'cash') {
    return; // Cash payments do not reserve external references
  }

  if (!rawReference || !rawReference.trim()) {
    return; // Empty reference (e.g. unreferenced bank transfer) does not reserve
  }

  const normalized = normalizeFinancialReference(rawReference);
  const tId = new mongoose.Types.ObjectId(String(tenantId));
  const refKey = `${tId}:${method}:${normalized}`;

  let model = FinancialReference;
  if (tenantDb) {
    const { getTenantModels } = require('./TenantModelRegistry');
    model = getTenantModels(tenantDb).FinancialReference;
  }

  const existing = await model.findById(refKey).session(session || null);
  if (existing) {
    throw ApiError.conflict(
      `Payment reference '${normalized}' has already been used for ${existing.sourceType === 'regular_fee' ? 'fee payment' : 'exam fee payment'} (Receipt ${existing.receiptNumber})`,
      'DUPLICATE_PAYMENT_REFERENCE'
    );
  }

  const docRef = {
    _id: refKey,
    tenantId: tId,
    paymentMethod: method,
    normalizedReference: normalized,
    sourceType,
    paymentId,
    receiptNumber,
  };

  const doc = new model(docRef);

  try {
    await doc.save({ session });
  } catch (err: any) {
    if (err.code === 11000 || err.message?.includes('E11000')) {
      throw ApiError.conflict(
        `Payment reference '${normalized}' has already been used for another transaction`,
        'DUPLICATE_PAYMENT_REFERENCE'
      );
    }
    throw err;
  }
}
