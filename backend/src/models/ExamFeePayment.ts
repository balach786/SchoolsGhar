import mongoose, { Schema, Document, Model } from 'mongoose';
import { PaymentMethod } from './Payment';

export interface IExamFeePayment extends Document {
  tenantId: mongoose.Types.ObjectId;
  studentExamFeeId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  examId: mongoose.Types.ObjectId;
  amount: number; // integer paisa
  refundableAmount: number; // integer paisa available for refund
  paymentMethod: PaymentMethod;
  paymentDate: Date;
  receiptNumber: string;
  reference?: string;
  notes?: string;
  collectedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const examFeePaymentSchema = new Schema<IExamFeePayment>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    studentExamFeeId: { type: Schema.Types.ObjectId, ref: 'StudentExamFee', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
    amount: { type: Number, required: true, min: 1 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    refundableAmount: { type: Number, required: true, min: 0 , validate: { validator: Number.isInteger, message: 'Amount must be stored as integer paisa' }},
    paymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'card', 'online', 'other'], required: true },
    paymentDate: { type: Date, required: true },
    receiptNumber: { type: String, required: true },
    reference: { type: String, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 500 },
    collectedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

examFeePaymentSchema.index({ tenantId: 1, receiptNumber: 1 }, { unique: true });
examFeePaymentSchema.index({ tenantId: 1, studentExamFeeId: 1, paymentDate: 1 });
examFeePaymentSchema.index({ tenantId: 1, examId: 1, paymentDate: 1 });
examFeePaymentSchema.index({ tenantId: 1, studentId: 1 });

export const ExamFeePayment: Model<IExamFeePayment> =
  mongoose.models.ExamFeePayment || mongoose.model<IExamFeePayment>('ExamFeePayment', examFeePaymentSchema);

export function publicExamFeePayment(doc: IExamFeePayment | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    studentExamFeeId: String(doc.studentExamFeeId),
    studentId: String(doc.studentId),
    examId: String(doc.examId),
    amount: doc.amount,
    refundableAmount: doc.refundableAmount !== undefined ? doc.refundableAmount : doc.amount,
    paymentMethod: doc.paymentMethod,
    paymentDate: new Date(doc.paymentDate).toISOString(),
    receiptNumber: doc.receiptNumber,
    reference: doc.reference ?? null,
    notes: doc.notes ?? null,
    collectedBy: doc.collectedBy ? String(doc.collectedBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
