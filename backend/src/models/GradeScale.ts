import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IGradeBoundary {
  grade: string;
  minPercentage: number;
}

export interface IGradeScale extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  isDefault: boolean;
  boundaries: IGradeBoundary[];
  createdAt: Date;
  updatedAt: Date;
}

const boundarySchema = new Schema<IGradeBoundary>(
  {
    grade: { type: String, required: true, trim: true, minlength: 1, maxlength: 8 },
    minPercentage: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const gradeScaleSchema = new Schema<IGradeScale>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    isDefault: { type: Boolean, default: false },
    boundaries: { type: [boundarySchema], required: true },
  },
  { timestamps: true, versionKey: false }
);

gradeScaleSchema.index({ tenantId: 1, name: 1 }, { unique: true });
gradeScaleSchema.index({ tenantId: 1, isDefault: 1 });

export const GradeScale: Model<IGradeScale> =
  mongoose.models.GradeScale || mongoose.model<IGradeScale>('GradeScale', gradeScaleSchema);

/** Public serializer (no surprises, stable field list). */
export function publicGradeScale(doc: IGradeScale | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    name: doc.name,
    isDefault: Boolean(doc.isDefault),
    boundaries: (doc.boundaries ?? []).map((b: any) => ({
      grade: b.grade,
      minPercentage: b.minPercentage,
    })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Resolve a grade for a percentage against a scale whose boundaries are
 * sorted descending by minPercentage. Returns null when no boundary applies.
 */
export function gradeForPercentage(
  boundaries: IGradeBoundary[],
  percentage: number
): string | null {
  const sorted = [...boundaries].sort((a, b) => b.minPercentage - a.minPercentage);
  for (const b of sorted) {
    if (percentage >= b.minPercentage) return b.grade;
  }
  return null;
}
