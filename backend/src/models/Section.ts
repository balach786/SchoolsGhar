import mongoose, { Schema, Document, Model } from 'mongoose';

export function normalizeSectionName(name: string): string {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface ISection extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  normalizedName?: string;
  classId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  isActive: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const sectionSchema = new Schema<ISection>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 20 },
    normalizedName: { type: String, trim: true, lowercase: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true, index: true },
    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

sectionSchema.pre('save', function (next) {
  if (this.name) {
    this.normalizedName = normalizeSectionName(this.name);
  }
  next();
});

sectionSchema.index({ tenantId: 1, classId: 1, isArchived: 1 });

export const Section: Model<ISection> = mongoose.models.Section || mongoose.model<ISection>('Section', sectionSchema);

export function publicSection(s: ISection) {
  return {
    _id: String(s._id),
    tenantId: s.tenantId ? String(s.tenantId) : null,
    name: s.name,
    classId: String(s.classId),
    sessionId: String(s.sessionId),
    isActive: s.isActive,
    isArchived: s.isArchived,
    createdAt: s.createdAt,
  };
}
