import mongoose, { Schema, Document, Model } from 'mongoose';
import { AttendanceStatus } from './StudentAttendance';

export interface INonTeachingStaffAttendance extends Document {
  tenantId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  staffId: mongoose.Types.ObjectId;
  attendanceDate: Date;
  status: AttendanceStatus;
  markedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const nonTeachingStaffAttendanceSchema = new Schema<INonTeachingStaffAttendance>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: false, index: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    attendanceDate: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'late', 'leave'], required: true },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

nonTeachingStaffAttendanceSchema.index({ tenantId: 1, staffId: 1, attendanceDate: 1 }, { unique: true });
nonTeachingStaffAttendanceSchema.index({ tenantId: 1, attendanceDate: 1 });

export const NonTeachingStaffAttendance: Model<INonTeachingStaffAttendance> =
  mongoose.models.NonTeachingStaffAttendance || mongoose.model<INonTeachingStaffAttendance>('NonTeachingStaffAttendance', nonTeachingStaffAttendanceSchema);
