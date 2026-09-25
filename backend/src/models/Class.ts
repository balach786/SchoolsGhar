import mongoose, { Schema, Document, Model } from 'mongoose';

export function normalizeName(name: string): string {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface IClass extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  normalizedName?: string;
  code: string;
  sessionId: mongoose.Types.ObjectId;

  isActive: boolean;
  isArchived: boolean;
  classTeacherId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const classSchema = new Schema<IClass>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    normalizedName: { type: String, trim: true, lowercase: true, index: true },
    code: { type: String, trim: true, uppercase: true, maxlength: 20 },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true, index: true },

    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
    classTeacherId: { type: Schema.Types.ObjectId, ref: 'Staff', index: true },
  },
  { timestamps: true, versionKey: false }
);

classSchema.pre('save', function (next) {
  if (this.name) {
    this.normalizedName = normalizeName(this.name);
  }
  next();
});

classSchema.index({ tenantId: 1, sessionId: 1, isArchived: 1 });


export const Class: Model<IClass> = mongoose.models.Class || mongoose.model<IClass>('Class', classSchema);

export function publicClass(c: IClass) {
  return {
    _id: String(c._id),
    tenantId: c.tenantId ? String(c.tenantId) : null,
    name: c.name,
    code: c.code,
    sessionId: String(c.sessionId),
    classTeacherId: c.classTeacherId ? String(c.classTeacherId) : null,

    isActive: c.isActive,
    isArchived: c.isArchived,
    createdAt: c.createdAt,
  };
}
