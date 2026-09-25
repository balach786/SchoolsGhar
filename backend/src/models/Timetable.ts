import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Compact timetable period. Times are "HH:mm" (24h) strings — no Date objects,
 * no room assignment (excluded by design).
 * dayOfWeek: 1=Monday … 6=Saturday (configurable school days, no Sunday).
 */
export interface ITimetable extends Document {
  tenantId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId | null;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subjectId?: mongoose.Types.ObjectId;
  teacherId?: mongoose.Types.ObjectId;
  isBreak: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const timetableSchema = new Schema<ITimetable>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', default: null },
    dayOfWeek: { type: Number, required: true, min: 1, max: 6 },
    periodNumber: { type: Number, required: true, min: 1, max: 20 },
    startTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    endTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher' },
    isBreak: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, versionKey: false }
);

timetableSchema.index({ tenantId: 1, classId: 1, sectionId: 1, dayOfWeek: 1 });
timetableSchema.index({ tenantId: 1, teacherId: 1, dayOfWeek: 1 });

export const Timetable: Model<ITimetable> =
  mongoose.models.Timetable || mongoose.model<ITimetable>('Timetable', timetableSchema);

export function publicTimetable(t: ITimetable) {
  return {
    _id: String(t._id),
    sessionId: String(t.sessionId),
    classId: String(t.classId),
    sectionId: t.sectionId ? String(t.sectionId) : null,
    dayOfWeek: t.dayOfWeek,
    periodNumber: t.periodNumber,
    startTime: t.startTime,
    endTime: t.endTime,
    subjectId: t.subjectId ? String(t.subjectId) : null,
    teacherId: t.teacherId ? String(t.teacherId) : null,
    isBreak: t.isBreak,
    isArchived: t.isArchived ?? false,
  };
}

export const DAY_NAMES: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

/** Parse "HH:mm" → minutes since midnight. */
export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** True when [s1,e1) overlaps [s2,e2). */
export function overlaps(s1: string, e1: string, s2: string, e2: string): boolean {
  return toMinutes(s1) < toMinutes(e2) && toMinutes(s2) < toMinutes(e1);
}
