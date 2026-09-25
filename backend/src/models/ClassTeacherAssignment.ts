import mongoose, { Schema, Document, Model } from 'mongoose';

export type ClassTeacherAssignmentStatus = 'active' | 'ended';

export interface IClassTeacherAssignment extends Document {
  tenantId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  startDate: Date;
  endDate?: Date;
  status: ClassTeacherAssignmentStatus;
  assignedBy: mongoose.Types.ObjectId;
  endedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const classTeacherAssignmentSchema = new Schema<IClassTeacherAssignment>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    startDate: { type: Date, required: true, default: Date.now },
    endDate: { type: Date },
    status: { type: String, enum: ['active', 'ended'], default: 'active', index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    endedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

// Indexes for conflict checks
classTeacherAssignmentSchema.index({ tenantId: 1, classId: 1, status: 1 });
classTeacherAssignmentSchema.index({ tenantId: 1, teacherId: 1, status: 1 });

export const ClassTeacherAssignment: Model<IClassTeacherAssignment> =
  mongoose.models.ClassTeacherAssignment || mongoose.model<IClassTeacherAssignment>('ClassTeacherAssignment', classTeacherAssignmentSchema);

export function publicClassTeacherAssignment(a: IClassTeacherAssignment) {
  return {
    _id: String(a._id),
    tenantId: a.tenantId ? String(a.tenantId) : null,
    classId: String(a.classId),
    teacherId: String(a.teacherId),
    startDate: a.startDate,
    endDate: a.endDate,
    status: a.status,
    assignedBy: String(a.assignedBy),
    endedBy: a.endedBy ? String(a.endedBy) : null,
    createdAt: a.createdAt,
  };
}
