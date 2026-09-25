import mongoose, { Schema, Document, Model } from 'mongoose';

export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export type LeaveRequesterType = 'student' | 'teacher';

export interface ILeaveRequest extends Document {
  tenantId: mongoose.Types.ObjectId;
  requesterType: LeaveRequesterType;
  /** ObjectId of the Student or Teacher document (polymorphic reference). */
  requesterId: mongoose.Types.ObjectId;
  fromDate: Date;
  toDate: Date;
  reason: string;
  status: LeaveStatus;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewNote?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const leaveRequestSchema = new Schema<ILeaveRequest>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    requesterType: { type: String, enum: ['student', 'teacher'], required: true },
    requesterId: { type: Schema.Types.ObjectId, required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String, required: true, trim: true, minlength: 5, maxlength: 500 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewNote: { type: String, trim: true, maxlength: 300 },
    reviewedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

leaveRequestSchema.index({ tenantId: 1, requesterId: 1, createdAt: -1 });
leaveRequestSchema.index({ tenantId: 1, status: 1, createdAt: 1 });

export const LeaveRequest: Model<ILeaveRequest> =
  mongoose.models.LeaveRequest || mongoose.model<ILeaveRequest>('LeaveRequest', leaveRequestSchema);
