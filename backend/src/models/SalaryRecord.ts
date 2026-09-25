import mongoose, { Schema, Document, Model } from 'mongoose';

export type SalaryStatus = 'unpaid' | 'paid';

/**
 * Teacher salary record for a month in an academic session.
 * Amounts are integer paisa. netAmount = baseAmount + adjustmentAmount
 * and is always computed on the backend.
 */
export interface ISalaryRecord extends Document {
  tenantId: mongoose.Types.ObjectId;
  staffId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  /** Format YYYY-MM (e.g. 2026-09). */
  salaryMonth: string;
  baseAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  status: SalaryStatus;
  paymentDate?: Date;
  paymentMethod?: string;
  notes?: string;
  absentDays?: number;
  bonusAmount?: number;
  bonusReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const salaryRecordSchema = new Schema<ISalaryRecord>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    salaryMonth: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    baseAmount: { type: Number, required: true, min: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    adjustmentAmount: { type: Number, default: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    netAmount: { type: Number, required: true , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    status: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
    paymentDate: { type: Date },
    paymentMethod: { type: String, trim: true, maxlength: 20 },
    notes: { type: String, trim: true, maxlength: 500 },
    absentDays: { type: Number, default: 0 },
    bonusAmount: { type: Number, default: 0, min: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    bonusReason: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true, versionKey: false }
);

// One salary record per staff per month per session per tenant.
salaryRecordSchema.index({ tenantId: 1, staffId: 1, salaryMonth: 1, sessionId: 1 }, { unique: true });
salaryRecordSchema.index({ tenantId: 1, status: 1, sessionId: 1 });
salaryRecordSchema.index({ tenantId: 1, salaryMonth: 1 });

export const SalaryRecord: Model<ISalaryRecord> =
  mongoose.models.SalaryRecord || mongoose.model<ISalaryRecord>('SalaryRecord', salaryRecordSchema);

/** Salary values are only visible to roles with salaries.view (enforced at route level). */
export function publicSalaryRecord(doc: ISalaryRecord | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    staffId: String(doc.staffId),
    sessionId: String(doc.sessionId),
    salaryMonth: doc.salaryMonth,
    baseAmount: doc.baseAmount,
    adjustmentAmount: doc.adjustmentAmount ?? 0,
    netAmount: doc.netAmount,
    absentDays: doc.absentDays ?? 0,
    bonusAmount: doc.bonusAmount ?? 0,
    bonusReason: doc.bonusReason ?? null,
    status: doc.status,
    paymentDate: doc.paymentDate ? new Date(doc.paymentDate).toISOString() : null,
    paymentMethod: doc.paymentMethod ?? null,
    notes: doc.notes ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
