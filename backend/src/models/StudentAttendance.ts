import mongoose, { Schema, Document, Model } from 'mongoose';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave';

export interface IStudentAttendance extends Document {
  tenantId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  sectionId?: mongoose.Types.ObjectId | null;
  attendanceDate: Date;
  status: AttendanceStatus;
  markedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const studentAttendanceSchema = new Schema<IStudentAttendance>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: false },
    attendanceDate: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'late', 'leave'], required: true },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

// Duplicate prevention: one record per student per session per date.
studentAttendanceSchema.index({ tenantId: 1, studentId: 1, sessionId: 1, attendanceDate: 1 }, { unique: true });
// Daily roster queries + monthly reports (with section and without section).
studentAttendanceSchema.index({ tenantId: 1, classId: 1, sectionId: 1, attendanceDate: 1 });
studentAttendanceSchema.index({ tenantId: 1, classId: 1, attendanceDate: 1 });
studentAttendanceSchema.index({ tenantId: 1, attendanceDate: 1 });

export const StudentAttendance: Model<IStudentAttendance> =
  mongoose.models.StudentAttendance || mongoose.model<IStudentAttendance>('StudentAttendance', studentAttendanceSchema);
