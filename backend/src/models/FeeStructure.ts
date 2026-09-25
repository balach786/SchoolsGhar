import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Money representation (documented): every monetary amount across the finance
 * module is stored as an INTEGER in the smallest monetary unit (paisa).
 *   PKR 1,500.00  →  150000
 * All arithmetic happens on the backend using integers only — no floats.
 */

export type FeeType = 'monthly_tuition' | 'admission_fee' | 'other';

export interface IFeeStructure extends Document {
  tenantId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  feeType: FeeType;
  title: string;
  /** Integer paisa. */
  amount: number;
  /** 1-12; required for monthly tuition, otherwise null. */
  month: number | null;
  /** Optional: Effective starting month (1-12) to preserve history */
  effectiveFromMonth?: number | null;
  /** Optional: Effective starting year */
  effectiveFromYear?: number | null;
  dueDate?: Date;
  description?: string;
  isActive: boolean;
  isArchived: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const feeStructureSchema = new Schema<IFeeStructure>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    feeType: { type: String, enum: ['monthly_tuition', 'admission_fee', 'other'], required: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    amount: { type: Number, required: true, min: 1 },
    month: { type: Number, min: 1, max: 12, default: null },
    effectiveFromMonth: { type: Number, min: 1, max: 12, default: null },
    effectiveFromYear: { type: Number, default: null },
    dueDate: { type: Date },
    description: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

// Duplicate prevention for non-monthly structures: same tenant+class+session+type+month+title+effectiveFrom is a duplicate.
feeStructureSchema.index(
  { tenantId: 1, sessionId: 1, classId: 1, feeType: 1, month: 1, title: 1, effectiveFromMonth: 1, effectiveFromYear: 1 }, 
  { unique: true, partialFilterExpression: { feeType: { $in: ['admission_fee', 'other'] } } }
);

// Strict duplicate prevention for monthly tuition: same tenant+class+session+type+month is a duplicate.
// Title does not determine uniqueness for monthly tuition.
feeStructureSchema.index(
  { tenantId: 1, sessionId: 1, classId: 1, feeType: 1, month: 1 },
  { unique: true, partialFilterExpression: { feeType: 'monthly_tuition' } }
);

feeStructureSchema.index({ tenantId: 1, sessionId: 1, classId: 1, isArchived: 1 });

export const FeeStructure: Model<IFeeStructure> =
  mongoose.models.FeeStructure || mongoose.model<IFeeStructure>('FeeStructure', feeStructureSchema);

export function publicFeeStructure(doc: IFeeStructure | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    sessionId: String(doc.sessionId),
    classId: String(doc.classId),
    feeType: doc.feeType,
    title: doc.title,
    amount: doc.amount,
    month: doc.month ?? null,
    effectiveFromMonth: doc.effectiveFromMonth ?? null,
    effectiveFromYear: doc.effectiveFromYear ?? null,
    dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : null,
    description: doc.description ?? null,
    isActive: Boolean(doc.isActive),
    isArchived: Boolean(doc.isArchived),
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
