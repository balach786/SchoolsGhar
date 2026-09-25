import mongoose, { Schema, Document, Model } from 'mongoose';

export type StudentLifecycleEvent =
  | 'admitted'
  | 'section_changed'
  | 'class_changed'
  | 'transferred'
  | 'promoted'
  | 'status_changed'
  | 're_admitted';

export const STUDENT_LIFECYCLE_EVENTS: StudentLifecycleEvent[] = [
  'admitted',
  'section_changed',
  'class_changed',
  'transferred',
  'promoted',
  'status_changed',
  're_admitted',
];

/**
 * Compact, append-only academic history.
 * Records chronological lifecycle events per student across sessions.
 * Never editable or deletable via normal operations.
 */
export interface IStudentHistory extends Document {
  tenantId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId;
  status: StudentLifecycleEvent;
  eventDate: Date;
  date: Date; // Maintained for 100% backward compatibility
  previousClassId?: mongoose.Types.ObjectId;
  previousSectionId?: mongoose.Types.ObjectId;
  remarks?: string;
  recordedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const studentHistorySchema = new Schema<IStudentHistory>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: false },
    status: {
      type: String,
      enum: STUDENT_LIFECYCLE_EVENTS,
      default: 'admitted',
      required: true,
    },
    eventDate: { type: Date, default: Date.now },
    date: { type: Date, default: Date.now },
    previousClassId: { type: Schema.Types.ObjectId, ref: 'Class', required: false },
    previousSectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: false },
    remarks: { type: String, trim: true, maxlength: 500, required: false },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  },
  { timestamps: true, versionKey: false }
);

// Non-unique chronological indexes for fast student timeline & session reporting
studentHistorySchema.index({ tenantId: 1, studentId: 1, eventDate: -1 });
studentHistorySchema.index({ tenantId: 1, sessionId: 1, eventDate: -1 });
studentHistorySchema.index({ tenantId: 1, sessionId: 1, classId: 1 });

// ── Append-Only Protection Middleware ──────────────────────────────
// Normal application operations must NEVER mutate or delete history records.
// Administrative migration / disaster recovery bypass is explicit and opt-in only.

studentHistorySchema.pre('save', function (next) {
  if (!this.isNew && !(this as any).$locals?.allowAdministrativeHistoryMutation) {
    return next(new Error('StudentHistory records are append-only and immutable. Updates are rejected.'));
  }
  // Ensure date and eventDate stay synchronized if only one was provided
  if (!this.eventDate && this.date) this.eventDate = this.date;
  if (!this.date && this.eventDate) this.date = this.eventDate;
  next();
});

studentHistorySchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'], function (next) {
  const options = this.getOptions();
  if (!options?.allowAdministrativeHistoryMutation) {
    return next(new Error('Direct updates to StudentHistory are prohibited. Events must be appended as new records.'));
  }
  next();
});

studentHistorySchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
  const options = this.getOptions();
  if (!options?.allowAdministrativeHistoryMutation) {
    return next(new Error('Deletion of StudentHistory records is prohibited. History is append-only.'));
  }
  next();
});

export const StudentHistory: Model<IStudentHistory> =
  mongoose.models.StudentHistory || mongoose.model<IStudentHistory>('StudentHistory', studentHistorySchema);

export function publicHistory(h: IStudentHistory) {
  return {
    _id: String(h._id),
    sessionId: String(h.sessionId),
    classId: String(h.classId),
    sectionId: h.sectionId ? String(h.sectionId) : null,
    status: h.status,
    eventDate: h.eventDate || h.date,
    date: h.date || h.eventDate,
    previousClassId: h.previousClassId ? String(h.previousClassId) : null,
    previousSectionId: h.previousSectionId ? String(h.previousSectionId) : null,
    remarks: h.remarks ?? null,
  };
}

