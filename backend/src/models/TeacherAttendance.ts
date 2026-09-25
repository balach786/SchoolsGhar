import mongoose, { Schema, Document, Model } from 'mongoose';
import { AttendanceStatus } from './StudentAttendance';

export interface ITeacherAttendance extends Document {
  tenantId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  attendanceDate: Date;
  status: AttendanceStatus;
  markedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const teacherAttendanceSchema = new Schema<ITeacherAttendance>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: false, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
    attendanceDate: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'late', 'leave'], required: true },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

teacherAttendanceSchema.index({ tenantId: 1, teacherId: 1, attendanceDate: 1 }, { unique: true });
teacherAttendanceSchema.index({ tenantId: 1, attendanceDate: 1 });

export const TeacherAttendance: Model<ITeacherAttendance> =
  mongoose.models.TeacherAttendance || mongoose.model<ITeacherAttendance>('TeacherAttendance', teacherAttendanceSchema);
