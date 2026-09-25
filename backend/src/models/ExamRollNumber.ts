import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExamRollNumber extends Document {
  tenantId: mongoose.Types.ObjectId;
  examId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  examRollNumber: number;
  block?: string;
  seatNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

const examRollNumberSchema = new Schema<IExamRollNumber>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    examRollNumber: { type: Number, required: true },
    block: { type: String, trim: true },
    seatNumber: { type: String, trim: true },
  },
  { timestamps: true, versionKey: false }
);

examRollNumberSchema.index({ tenantId: 1, examId: 1, studentId: 1 }, { unique: true });
examRollNumberSchema.index({ tenantId: 1, examId: 1, examRollNumber: 1 }, { unique: true });
examRollNumberSchema.index(
  { tenantId: 1, examId: 1, block: 1, seatNumber: 1 }, 
  { unique: true, partialFilterExpression: { block: { $type: "string" }, seatNumber: { $type: "string" } } }
);

export const ExamRollNumber: Model<IExamRollNumber> =
  mongoose.models.ExamRollNumber || mongoose.model<IExamRollNumber>('ExamRollNumber', examRollNumberSchema);
