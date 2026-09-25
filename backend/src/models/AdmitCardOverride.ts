import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAdmitCardOverride extends Document {
  tenantId: mongoose.Types.ObjectId;
  examId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  reason: string;
  grantedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const admitCardOverrideSchema = new Schema<IAdmitCardOverride>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

admitCardOverrideSchema.index({ tenantId: 1, examId: 1, studentId: 1 }, { unique: true });

export const AdmitCardOverride: Model<IAdmitCardOverride> =
  mongoose.models.AdmitCardOverride || mongoose.model<IAdmitCardOverride>('AdmitCardOverride', admitCardOverrideSchema);

export function publicAdmitCardOverride(doc: IAdmitCardOverride | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    examId: String(doc.examId),
    studentId: String(doc.studentId),
    reason: doc.reason,
    grantedBy: String(doc.grantedBy),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
