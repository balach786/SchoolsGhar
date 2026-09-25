import mongoose, { Schema, Document, Model } from 'mongoose';

/** External file reference only — never store bytes in MongoDB. */
export interface AssignmentFileRef {
  name: string;
  url: string;
  mimeType?: string;
}

export interface IAssignment extends Document {
  tenantId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  classId: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;
  subjectId?: mongoose.Types.ObjectId;
  teacherId?: mongoose.Types.ObjectId;
  dueDate?: Date;
  maxMarks?: number;
  attachments: AssignmentFileRef[];
  isArchived: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const assignmentSchema = new Schema<IAssignment>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: false, index: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000 },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section' },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher' },
    dueDate: { type: Date },
    maxMarks: { type: Number, min: 0, max: 1000 },
    attachments: {
      type: [
        {
          name: { type: String, required: true, maxlength: 160 },
          url: { type: String, required: true, maxlength: 500 },
          mimeType: { type: String, maxlength: 80 },
        },
      ],
      default: [],
    },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

assignmentSchema.index({ tenantId: 1, classId: 1, isArchived: 1, dueDate: 1 });
assignmentSchema.index({ tenantId: 1, teacherId: 1, isArchived: 1 });
assignmentSchema.index({ tenantId: 1, sectionId: 1 });

export const Assignment: Model<IAssignment> =
  mongoose.models.Assignment || mongoose.model<IAssignment>('Assignment', assignmentSchema);
