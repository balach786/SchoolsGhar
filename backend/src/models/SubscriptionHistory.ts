import mongoose, { Schema, Document, Model } from 'mongoose';

export type SubscriptionHistorySource =
  | 'trial'
  | 'payment'
  | 'manual_extension'
  | 'manual_activation'
  | 'admin_adjustment'
  | 'system';

export interface ISubscriptionHistory extends Document {
  tenantId: mongoose.Types.ObjectId;
  planId?: mongoose.Types.ObjectId;
  action: string; // e.g. 'trial_started', 'payment_approved', 'manual_extended', etc.
  previousStatus?: string;
  newStatus: string;
  previousEndsAt?: Date;
  newEndsAt?: Date;
  source: SubscriptionHistorySource;
  performedBy?: mongoose.Types.ObjectId;
  paymentId?: mongoose.Types.ObjectId;
  reason?: string;
  createdAt: Date;
}

const subscriptionHistorySchema = new Schema<ISubscriptionHistory>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
    action: { type: String, required: true, trim: true, maxlength: 60 },
    previousStatus: { type: String, trim: true, maxlength: 40 },
    newStatus: { type: String, required: true, trim: true, maxlength: 40 },
    previousEndsAt: { type: Date },
    newEndsAt: { type: Date },
    source: {
      type: String,
      enum: ['trial', 'payment', 'manual_extension', 'manual_activation', 'admin_adjustment', 'system'],
      default: 'system',
    },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    paymentId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPayment' },
    reason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

subscriptionHistorySchema.index({ tenantId: 1, createdAt: -1 });

export const SubscriptionHistory: Model<ISubscriptionHistory> =
  mongoose.models.SubscriptionHistory ||
  mongoose.model<ISubscriptionHistory>('SubscriptionHistory', subscriptionHistorySchema);

export function publicSubscriptionHistory(h: ISubscriptionHistory) {
  return {
    _id: String(h._id),
    tenantId: String(h.tenantId),
    planId: h.planId ? String(h.planId) : null,
    action: h.action,
    previousStatus: h.previousStatus ?? null,
    newStatus: h.newStatus,
    previousEndsAt: h.previousEndsAt ?? null,
    newEndsAt: h.newEndsAt ?? null,
    source: h.source,
    performedBy: h.performedBy ? String(h.performedBy) : null,
    paymentId: h.paymentId ? String(h.paymentId) : null,
    reason: h.reason ?? null,
    createdAt: h.createdAt,
  };
}
