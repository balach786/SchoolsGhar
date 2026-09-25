import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Generic non-fee income record (donations, grants, events, other income).
 * All amounts are integer paisa.
 */
export interface IIncome extends Document {
  tenantId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  category: string;
  title: string;
  amount: number;
  date: Date;
  description?: string;
  reference?: string;
  createdBy?: mongoose.Types.ObjectId;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const incomeSchema = new Schema<IIncome>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: false, index: true },
    category: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    amount: { type: Number, required: true, min: 1 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    date: { type: Date, required: true },
    description: { type: String, trim: true, maxlength: 500 },
    reference: { type: String, trim: true, maxlength: 120 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

incomeSchema.index({ tenantId: 1, date: 1 });
incomeSchema.index({ tenantId: 1, category: 1, date: 1 });

export const Income: Model<IIncome> =
  mongoose.models.Income || mongoose.model<IIncome>('Income', incomeSchema);

export function publicIncome(doc: IIncome | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    category: doc.category,
    title: doc.title,
    amount: doc.amount,
    date: new Date(doc.date).toISOString(),
    description: doc.description ?? null,
    reference: doc.reference ?? null,
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
    isArchived: Boolean(doc.isArchived),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
