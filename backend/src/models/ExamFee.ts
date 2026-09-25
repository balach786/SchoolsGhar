import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExamFee extends Document {
  tenantId: mongoose.Types.ObjectId;
  examId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  /** Integer paisa (100 paisa = 1 PKR). */
  amount: number;
  dueDate?: Date;
  defaultFine: number;
  discountAllowed: boolean;
  scholarshipAllowed: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const examFeeSchema = new Schema<IExamFee>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date },
    defaultFine: { type: Number, default: 0, min: 0 },
    discountAllowed: { type: Boolean, default: true },
    scholarshipAllowed: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

// One exam fee structure per class per exam per tenant
examFeeSchema.index({ tenantId: 1, examId: 1, classId: 1 }, { unique: true });
examFeeSchema.index({ tenantId: 1, examId: 1 });

export const ExamFee: Model<IExamFee> =
  mongoose.models.ExamFee || mongoose.model<IExamFee>('ExamFee', examFeeSchema);

export function publicExamFee(doc: IExamFee | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    examId: String(doc.examId),
    sessionId: String(doc.sessionId),
    classId: String(doc.classId),
    amount: doc.amount,
    dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : null,
    defaultFine: doc.defaultFine ?? 0,
    discountAllowed: Boolean(doc.discountAllowed),
    scholarshipAllowed: Boolean(doc.scholarshipAllowed),
    isActive: Boolean(doc.isActive),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
