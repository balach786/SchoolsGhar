import mongoose, { Schema, Document, Model } from 'mongoose';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'easypaisa' | 'jazzcash' | 'card' | 'online' | 'other';
export type PaymentStatus = 'active' | 'voided' | 'refunded';

export interface IPayment extends Document {
  tenantId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  /** Legacy: specific invoice. Now optional in favor of allocations. */
  studentFeeId?: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  /** Integer paisa. Total amount of this transaction. */
  amount: number;
  /** Available integer paisa for refund/reversal. Initialized to amount. */
  refundableAmount: number;
  paymentMethod: PaymentMethod;
  paymentDate: Date;
  /** Server-generated, collision-safe (atomic counter). */
  receiptNumber: string;
  reference?: string;
  notes?: string;
  /** Oldest-first multi-invoice allocation breakdown */
  allocations?: {
    studentFeeId: mongoose.Types.ObjectId;
    amountAllocated: number;
  }[];
  status: PaymentStatus;
  /** Server-controlled — never client-submitted. */
  collectedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const paymentSchema = new Schema<IPayment>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    studentFeeId: { type: Schema.Types.ObjectId, ref: 'StudentFee' }, // Made optional
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    amount: { type: Number, required: true, min: 1 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    refundableAmount: { type: Number, required: true, min: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'card', 'online', 'other'],
      required: true,
    },
    paymentDate: { type: Date, required: true },
    receiptNumber: { type: String, required: true },
    reference: { type: String, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 500 },
    allocations: [
      {
        studentFeeId: { type: Schema.Types.ObjectId, ref: 'StudentFee', required: true },
        amountAllocated: { type: Number, required: true, min: 1 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
      },
    ],
    status: { type: String, enum: ['active', 'voided', 'refunded'], default: 'active' },
    collectedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

// Collision-safe uniqueness for receipts per tenant.
paymentSchema.index({ tenantId: 1, receiptNumber: 1 }, { unique: true });
paymentSchema.index({ tenantId: 1, studentFeeId: 1, paymentDate: 1 });
paymentSchema.index({ tenantId: 1, 'allocations.studentFeeId': 1, paymentDate: 1 });
paymentSchema.index({ tenantId: 1, paymentDate: 1 });
paymentSchema.index({ tenantId: 1, studentId: 1, sessionId: 1 });
paymentSchema.index({ tenantId: 1, status: 1 });

export const Payment: Model<IPayment> =
  mongoose.models.Payment || mongoose.model<IPayment>('Payment', paymentSchema);

export function publicPayment(doc: IPayment | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    studentId: String(doc.studentId),
    studentFeeId: doc.studentFeeId ? String(doc.studentFeeId) : null,
    sessionId: String(doc.sessionId),
    amount: doc.amount,
    refundableAmount: doc.refundableAmount !== undefined ? doc.refundableAmount : doc.amount,
    paymentMethod: doc.paymentMethod,
    paymentDate: new Date(doc.paymentDate).toISOString(),
    receiptNumber: doc.receiptNumber,
    reference: doc.reference ?? null,
    notes: doc.notes ?? null,
    allocations: doc.allocations?.map((a: any) => ({
      studentFeeId: String(a.studentFeeId),
      amountAllocated: a.amountAllocated,
    })) || [],
    status: doc.status || 'active',
    collectedBy: doc.collectedBy ? String(doc.collectedBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
