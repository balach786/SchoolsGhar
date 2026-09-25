import mongoose, { Schema, Document, Model } from 'mongoose';

export type StudentExamFeeStatus = 'unpaid' | 'partial' | 'paid' | 'waived';

export interface IStudentExamFee extends Document {
  tenantId: mongoose.Types.ObjectId;
  examId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  sectionId: mongoose.Types.ObjectId;
  /** All money in integer paisa */
  originalAmount: number;
  discountAmount: number;
  scholarshipAmount: number;
  fineAmount: number;
  netPayable: number;
  amountPaid: number;
  remainingBalance: number;
  status: StudentExamFeeStatus;
  dueDate?: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const studentExamFeeSchema = new Schema<IStudentExamFee>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
    originalAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    scholarshipAmount: { type: Number, default: 0, min: 0 },
    fineAmount: { type: Number, default: 0, min: 0 },
    netPayable: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    remainingBalance: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['unpaid', 'partial', 'paid', 'waived'],
      default: 'unpaid',
    },
    dueDate: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

// Exactly one exam fee record per student per exam per tenant (duplicate prevention)
studentExamFeeSchema.index({ tenantId: 1, studentId: 1, examId: 1 }, { unique: true });
studentExamFeeSchema.index({ tenantId: 1, examId: 1, status: 1 });
studentExamFeeSchema.index({ tenantId: 1, examId: 1, classId: 1, sectionId: 1 });
studentExamFeeSchema.index({ tenantId: 1, studentId: 1, sessionId: 1 });

export const StudentExamFee: Model<IStudentExamFee> =
  mongoose.models.StudentExamFee || mongoose.model<IStudentExamFee>('StudentExamFee', studentExamFeeSchema);

export function publicStudentExamFee(doc: IStudentExamFee | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    examId: String(doc.examId),
    studentId: String(doc.studentId),
    sessionId: String(doc.sessionId),
    classId: String(doc.classId),
    sectionId: String(doc.sectionId),
    originalAmount: doc.originalAmount,
    discountAmount: doc.discountAmount ?? 0,
    scholarshipAmount: doc.scholarshipAmount ?? 0,
    fineAmount: doc.fineAmount ?? 0,
    netPayable: doc.netPayable,
    amountPaid: doc.amountPaid ?? 0,
    remainingBalance: doc.remainingBalance,
    status: doc.status,
    dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : null,
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
