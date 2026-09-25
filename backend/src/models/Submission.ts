import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISubmission extends Document {
  tenantId: mongoose.Types.ObjectId;
  assignmentId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  content?: string;
  /** External file reference only — never store bytes in MongoDB. */
  fileUrl?: string;
  fileMeta?: { name: string; mimeType?: string };
  submittedAt: Date;
  isLate: boolean;
  marksObtained?: number;
  feedback?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const submissionSchema = new Schema<ISubmission>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    content: { type: String, trim: true, maxlength: 5000 },
    fileUrl: { type: String, maxlength: 500 },
    fileMeta: {
      name: { type: String, maxlength: 160 },
      mimeType: { type: String, maxlength: 80 },
    },
    submittedAt: { type: Date, required: true },
    isLate: { type: Boolean, default: false },
    marksObtained: { type: Number, min: 0, max: 1000 },
    feedback: { type: String, trim: true, maxlength: 1000 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

// One submission per student per assignment per tenant.
submissionSchema.index({ tenantId: 1, assignmentId: 1, studentId: 1 }, { unique: true });
submissionSchema.index({ tenantId: 1, studentId: 1, submittedAt: -1 });
submissionSchema.index({ tenantId: 1, assignmentId: 1, submittedAt: 1 });

export const Submission: Model<ISubmission> =
  mongoose.models.Submission || mongoose.model<ISubmission>('Submission', submissionSchema);
