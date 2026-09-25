import mongoose, { Schema, Document, Model } from 'mongoose';

export function normalizeSessionName(name: string): string {
  return (name || '').trim().replace(/\s*[-–—]\s*/g, '-').replace(/\s+/g, ' ').toLowerCase();
}

export interface IAcademicSession extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  normalizedName?: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  isArchived: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const academicSessionSchema = new Schema<IAcademicSession>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    normalizedName: { type: String, trim: true, lowercase: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

academicSessionSchema.pre('save', function (next) {
  if (this.name) {
    this.normalizedName = normalizeSessionName(this.name);
  }
  next();
});

academicSessionSchema.index(
  { tenantId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true }, name: 'active_unique_per_tenant' }
);
academicSessionSchema.index(
  { tenantId: 1, normalizedName: 1 },
  { unique: true, partialFilterExpression: { isArchived: false }, name: 'normalized_name_unique_per_tenant' }
);
academicSessionSchema.index({ tenantId: 1, isArchived: 1 });

export const AcademicSession: Model<IAcademicSession> =
  mongoose.models.AcademicSession || mongoose.model<IAcademicSession>('AcademicSession', academicSessionSchema);

export function publicSession(s: IAcademicSession) {
  return {
    _id: String(s._id),
    tenantId: s.tenantId ? String(s.tenantId) : null,
    name: s.name,
    startDate: s.startDate,
    endDate: s.endDate,
    isActive: s.isActive,
    isArchived: s.isArchived,
    createdAt: s.createdAt,
  };
}
