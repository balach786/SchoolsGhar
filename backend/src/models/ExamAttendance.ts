import mongoose, { Schema, Document, Model } from 'mongoose';

export type ExamAttendanceStatus = 'present' | 'absent' | 'leave';

export interface IExamAttendance extends Document {
  tenantId: mongoose.Types.ObjectId;
  examId: mongoose.Types.ObjectId;
  examScheduleId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  block: string;
  status: ExamAttendanceStatus;
  markedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examAttendanceSchema = new Schema<IExamAttendance>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
    examScheduleId: { type: Schema.Types.ObjectId, ref: 'ExamSchedule', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    block: { type: String, required: true, trim: true },
    status: { type: String, enum: ['present', 'absent', 'leave'], default: 'present', required: true },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

// Prevent duplicate subject-exam attendance for a student
examAttendanceSchema.index({ tenantId: 1, examScheduleId: 1, studentId: 1 }, { unique: true });
examAttendanceSchema.index({ tenantId: 1, examScheduleId: 1, block: 1 });
examAttendanceSchema.index({ tenantId: 1, examId: 1, studentId: 1 });

export const ExamAttendance: Model<IExamAttendance> =
  mongoose.models.ExamAttendance || mongoose.model<IExamAttendance>('ExamAttendance', examAttendanceSchema);

export function publicExamAttendance(doc: IExamAttendance | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    examId: String(doc.examId),
    examScheduleId: String(doc.examScheduleId),
    studentId: String(doc.studentId),
    block: doc.block,
    status: doc.status,
    markedBy: doc.markedBy ? String(doc.markedBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
