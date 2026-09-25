import mongoose, { Schema, Document, Model } from 'mongoose';

export type SchoolClosureType = 'official_leave' | 'school_closed';

export interface ISchoolClosure extends Document {
  tenantId: mongoose.Types.ObjectId;
  date: Date;
  dateString: string; // 'YYYY-MM-DD'
  type: SchoolClosureType;
  reason: string; // e.g., 'Eid-ul-Fitr', 'Heavy Rain Warning', 'Local Strike'
  reasonCategory?: string; // 'gazetted_holiday' | 'weather' | 'strike' | 'emergency' | 'maintenance' | 'training' | 'sports' | 'other'
  notes?: string;
  applicableTo: 'all' | 'students' | 'staff';
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const schoolClosureSchema = new Schema<ISchoolClosure>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    date: { type: Date, required: true },
    dateString: { type: String, required: true, trim: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    type: {
      type: String,
      enum: ['official_leave', 'school_closed'],
      required: true,
      default: 'official_leave',
    },
    reason: { type: String, required: true, trim: true, maxlength: 200 },
    reasonCategory: {
      type: String,
      trim: true,
      default: 'other',
    },
    notes: { type: String, trim: true, maxlength: 500 },
    applicableTo: {
      type: String,
      enum: ['all', 'students', 'staff'],
      default: 'all',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

// One closure entry per date per tenant per applicable group (usually 'all')
schoolClosureSchema.index({ tenantId: 1, dateString: 1, applicableTo: 1 }, { unique: true });
schoolClosureSchema.index({ tenantId: 1, date: 1 });

export const SchoolClosure: Model<ISchoolClosure> =
  mongoose.models.SchoolClosure || mongoose.model<ISchoolClosure>('SchoolClosure', schoolClosureSchema);
