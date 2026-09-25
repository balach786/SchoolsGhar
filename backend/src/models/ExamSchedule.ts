import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExamSchedule extends Document {
  tenantId: mongoose.Types.ObjectId;
  examId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  subjectId: mongoose.Types.ObjectId;
  examDate: Date;
  startTime: string; // e.g. "09:00"
  endTime: string;   // e.g. "12:00"
  totalMarks: number;
  passingMarks: number;
  theoryMarks?: number;
  practicalMarks?: number;
  instructions?: string;
  createdAt: Date;
  updatedAt: Date;
}

const examScheduleSchema = new Schema<IExamSchedule>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    examDate: { type: Date, required: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    totalMarks: { type: Number, required: true, min: 1, max: 1000 },
    passingMarks: { type: Number, required: true, min: 0, max: 1000 },
    theoryMarks: { type: Number, min: 0, max: 1000 },
    practicalMarks: { type: Number, min: 0, max: 1000 },
    instructions: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, versionKey: false }
);

// Prevent duplicate subject schedule for same exam/class per tenant
examScheduleSchema.index({ tenantId: 1, examId: 1, classId: 1, subjectId: 1 }, { unique: true });
examScheduleSchema.index({ tenantId: 1, examId: 1, examDate: 1 });
examScheduleSchema.index({ tenantId: 1, classId: 1, examDate: 1 });

export const ExamSchedule: Model<IExamSchedule> =
  mongoose.models.ExamSchedule || mongoose.model<IExamSchedule>('ExamSchedule', examScheduleSchema);

export function publicExamSchedule(doc: IExamSchedule | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    examId: String(doc.examId),
    sessionId: String(doc.sessionId),
    classId: String(doc.classId),
    subjectId: String(doc.subjectId),
    examDate: new Date(doc.examDate).toISOString(),
    startTime: doc.startTime,
    endTime: doc.endTime,
    totalMarks: doc.totalMarks,
    passingMarks: doc.passingMarks,
    theoryMarks: doc.theoryMarks ?? null,
    practicalMarks: doc.practicalMarks ?? null,
    instructions: doc.instructions ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
