import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExamType extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  isActive: boolean;
  isDefault?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const examTypeSchema = new Schema<IExamType>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300 },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

examTypeSchema.index({ tenantId: 1, name: 1 }, { unique: true });
examTypeSchema.index({ tenantId: 1, isActive: 1 });

export const ExamType: Model<IExamType> =
  mongoose.models.ExamType || mongoose.model<IExamType>('ExamType', examTypeSchema);

export function publicExamType(doc: IExamType | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    name: doc.name,
    description: doc.description ?? null,
    isActive: Boolean(doc.isActive),
    isDefault: Boolean(doc.isDefault),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const DEFAULT_EXAM_TYPES = [
  'Monthly Test',
  'Weekly Test',
  'Unit Test',
  'Midterm',
  'First Term',
  'Second Term',
  'Final Exam',
  'Pre-Board',
  'Mock Exam',
  'Custom',
];

/** Seed default exam types for a tenant if none exist. */
export async function ensureDefaultExamTypes(tenantDb: mongoose.Connection, tenantId: mongoose.Types.ObjectId | string): Promise<void> {
  const ExamTypeTenant = tenantDb.models.ExamType || tenantDb.model<IExamType>('ExamType', examTypeSchema);
  const query: Record<string, any> = { tenantId };
  const count = await ExamTypeTenant.countDocuments(query);
  if (count === 0) {
    const docs = DEFAULT_EXAM_TYPES.map((name) => ({
      tenantId,
      name,
      description: `Standard ${name}`,
      isActive: true,
      isDefault: true,
    }));
    await ExamTypeTenant.insertMany(docs, { ordered: false });
  }
}
