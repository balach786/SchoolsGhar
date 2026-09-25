import mongoose, { Schema, Document, Model } from 'mongoose';

export type ExamStatus =
  | 'Draft'
  | 'Scheduled'
  | 'Ongoing'
  | 'Completed'
  | 'Results Pending'
  | 'Published'
  | 'Archived';

export interface IExamSubject {
  subjectId: mongoose.Types.ObjectId;
  maxMarks: number;
  passMarks?: number;
}

export interface IExam extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  examTypeId?: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  classIds?: mongoose.Types.ObjectId[];
  subjects: IExamSubject[];
  gradeScaleId: mongoose.Types.ObjectId;
  examDate?: Date;
  startDate?: Date;
  endDate?: Date;
  description?: string;
  status: ExamStatus;
  requireExamFeeForAdmitCard: boolean;
  isPublished: boolean;
  isArchived: boolean;
  startExamRollNumber?: number;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examSubjectSchema = new Schema<IExamSubject>(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    maxMarks: { type: Number, required: true, min: 1, max: 1000 },
    passMarks: { type: Number, min: 0, max: 1000 },
  },
  { _id: false }
);

const examSchema = new Schema<IExam>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    examTypeId: { type: Schema.Types.ObjectId, ref: 'ExamType' },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    classIds: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
    subjects: { type: [examSubjectSchema], required: true },
    gradeScaleId: { type: Schema.Types.ObjectId, ref: 'GradeScale', required: true },
    examDate: { type: Date },
    startDate: { type: Date },
    endDate: { type: Date },
    description: { type: String, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ['Draft', 'Scheduled', 'Ongoing', 'Completed', 'Results Pending', 'Published', 'Archived'],
      default: 'Scheduled',
    },
    requireExamFeeForAdmitCard: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    startExamRollNumber: { type: Number },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

// One exam with a given name per class per session per tenant.
examSchema.index({ tenantId: 1, name: 1, sessionId: 1, classIds: 1 }, { unique: true });
examSchema.index({ tenantId: 1, sessionId: 1, classId: 1 });
examSchema.index({ tenantId: 1, isPublished: 1 });
examSchema.index({ tenantId: 1, status: 1 });
examSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });

export const Exam: Model<IExam> =
  mongoose.models.Exam || mongoose.model<IExam>('Exam', examSchema);

/** Public serializer (dates → ISO strings, ids → strings). */
export function publicExam(doc: IExam | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    name: doc.name,
    examTypeId: doc.examTypeId ? String(doc.examTypeId) : null,
    sessionId: String(doc.sessionId),
    classId: String(doc.classId),
    classIds: doc.classIds && doc.classIds.length > 0 ? doc.classIds.map((c: any) => String(c)) : doc.classId ? [String(doc.classId)] : [],
    subjects: (doc.subjects ?? []).map((s: any) => ({
      subjectId: String(s.subjectId),
      maxMarks: s.maxMarks,
      passMarks: s.passMarks ?? null,
    })),
    gradeScaleId: String(doc.gradeScaleId),
    examDate: doc.examDate ? new Date(doc.examDate).toISOString() : null,
    startDate: doc.startDate ? new Date(doc.startDate).toISOString() : null,
    endDate: doc.endDate ? new Date(doc.endDate).toISOString() : null,
    description: doc.description ?? null,
    status: doc.status || (doc.isPublished ? 'Published' : doc.isArchived ? 'Archived' : 'Scheduled'),
    requireExamFeeForAdmitCard: Boolean(doc.requireExamFeeForAdmitCard),
    isPublished: Boolean(doc.isPublished),
    isArchived: Boolean(doc.isArchived),
    startExamRollNumber: doc.startExamRollNumber ?? null,
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
