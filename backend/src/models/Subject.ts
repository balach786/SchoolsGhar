import mongoose, { Schema, Document, Model } from 'mongoose';

export function normalizeSubjectCode(code: string): string {
  return (code || '').trim().toUpperCase();
}

export interface ISubject extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  sessionId: mongoose.Types.ObjectId;
  classIds: mongoose.Types.ObjectId[];

  isActive: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const subjectSchema = new Schema<ISubject>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true, index: true },
    // compact arrays of ObjectIds — no duplicated names/docs
    classIds: { type: [Schema.Types.ObjectId], ref: 'Class', default: [], index: true },

    isActive: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

subjectSchema.pre('save', function (next) {
  if (this.code) {
    this.code = normalizeSubjectCode(this.code);
  }
  next();
});

subjectSchema.index({ tenantId: 1, sessionId: 1, isArchived: 1 });

export const Subject: Model<ISubject> = mongoose.models.Subject || mongoose.model<ISubject>('Subject', subjectSchema);

export function publicSubject(s: ISubject) {
  return {
    _id: String(s._id),
    tenantId: s.tenantId ? String(s.tenantId) : null,
    name: s.name,
    code: s.code,
    sessionId: String(s.sessionId),
    classIds: (s.classIds ?? []).map(String),

    isActive: s.isActive,
    isArchived: s.isArchived,
    createdAt: s.createdAt,
  };
}
