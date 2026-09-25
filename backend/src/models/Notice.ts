import mongoose, { Schema, Document, Model } from 'mongoose';

export type NoticeAudience = 'school' | 'students' | 'teachers' | 'class' | 'section';

export interface INotice extends Document {
  tenantId: mongoose.Types.ObjectId;
  title: string;
  body: string;
  audienceType: NoticeAudience;
  classId?: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;
  isPinned: boolean;
  isImportant: boolean;
  expiresAt?: Date;
  isArchived: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const noticeSchema = new Schema<INotice>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 140 },
    body: { type: String, required: true, trim: true, maxlength: 3000 },
    audienceType: {
      type: String,
      enum: ['school', 'students', 'teachers', 'class', 'section'],
      required: true,
    },
    classId: { type: Schema.Types.ObjectId, ref: 'Class' },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section' },
    isPinned: { type: Boolean, default: false },
    isImportant: { type: Boolean, default: false },
    expiresAt: { type: Date },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

noticeSchema.index({ tenantId: 1, createdAt: -1, isArchived: 1 });
noticeSchema.index({ tenantId: 1, audienceType: 1, isArchived: 1 });
noticeSchema.index({ tenantId: 1, isPinned: 1, createdAt: -1 });

export const Notice: Model<INotice> =
  mongoose.models.Notice || mongoose.model<INotice>('Notice', noticeSchema);
