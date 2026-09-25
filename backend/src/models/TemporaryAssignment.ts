import mongoose, { Schema, Document, Model } from 'mongoose';

export type TemporaryAssignmentStatus = 'active' | 'cancelled' | 'expired';

export interface ITemporaryAssignment extends Document {
  tenantId: mongoose.Types.ObjectId;
  classId: mongoose.Types.ObjectId;
  permanentTeacherId?: mongoose.Types.ObjectId;
  substituteTeacherId: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  status: TemporaryAssignmentStatus;
  assignedBy: mongoose.Types.ObjectId;
  cancelledAt?: Date;
  cancelledBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const temporaryAssignmentSchema = new Schema<ITemporaryAssignment>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    permanentTeacherId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    substituteTeacherId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['active', 'cancelled', 'expired'], default: 'active', index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cancelledAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false }
);

// Indexes for querying active assignments
temporaryAssignmentSchema.index({ tenantId: 1, classId: 1, status: 1 });
temporaryAssignmentSchema.index({ tenantId: 1, substituteTeacherId: 1, status: 1 });

export const TemporaryAssignment: Model<ITemporaryAssignment> =
  mongoose.models.TemporaryAssignment || mongoose.model<ITemporaryAssignment>('TemporaryAssignment', temporaryAssignmentSchema);

export function publicTemporaryAssignment(t: ITemporaryAssignment) {
  return {
    _id: String(t._id),
    tenantId: t.tenantId ? String(t.tenantId) : null,
    classId: String(t.classId),
    permanentTeacherId: t.permanentTeacherId ? String(t.permanentTeacherId) : null,
    substituteTeacherId: String(t.substituteTeacherId),
    startDate: t.startDate,
    endDate: t.endDate,
    status: t.status,
    assignedBy: String(t.assignedBy),
    cancelledAt: t.cancelledAt,
    cancelledBy: t.cancelledBy ? String(t.cancelledBy) : null,
    createdAt: t.createdAt,
  };
}
