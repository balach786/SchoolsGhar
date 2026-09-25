import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMark extends Document {
  tenantId: mongoose.Types.ObjectId;
  examId: mongoose.Types.ObjectId;
  /** Academic session the exam belongs to (denormalized for the unique key + fast reports). */
  sessionId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  subjectId: mongoose.Types.ObjectId;
  /** Smallest-unit style integer marks (0..subject maxMarks, validated in service). */
  marksObtained: number;
  isAbsent?: boolean;
  markedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const markSchema = new Schema<IMark>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    marksObtained: { type: Number, required: true, min: 0, max: 1000, default: 0 },
    isAbsent: { type: Boolean, default: false },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

// Duplicate prevention: one mark per student per session per subject per exam per tenant.
markSchema.index({ tenantId: 1, studentId: 1, sessionId: 1, examId: 1, subjectId: 1 }, { unique: true });
markSchema.index({ tenantId: 1, examId: 1, subjectId: 1 });
markSchema.index({ tenantId: 1, studentId: 1, examId: 1 });

export const Mark: Model<IMark> =
  mongoose.models.Mark || mongoose.model<IMark>('Mark', markSchema);

/** Public serializer. */
export function publicMark(doc: IMark | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    examId: String(doc.examId),
    sessionId: doc.sessionId ? String(doc.sessionId) : null,
    studentId: String(doc.studentId),
    subjectId: String(doc.subjectId),
    marksObtained: doc.marksObtained,
    isAbsent: Boolean(doc.isAbsent),
    markedBy: doc.markedBy ? String(doc.markedBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
