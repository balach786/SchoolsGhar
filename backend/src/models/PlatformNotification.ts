import mongoose, { Schema, Document, Model } from 'mongoose';

export type PlatformNotificationType =
  | 'new_customer'
  | 'payment_submitted'
  | 'trial_expiring'
  | 'subscription_expiring'
  | 'subscription_expired'
  | 'payment_needs_review';

export interface IPlatformNotification extends Document {
  type: PlatformNotificationType;
  title: string;
  message: string;
  tenantId?: mongoose.Types.ObjectId;
  paymentId?: mongoose.Types.ObjectId;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

const platformNotificationSchema = new Schema<IPlatformNotification>(
  {
    type: {
      type: String,
      enum: [
        'new_customer',
        'payment_submitted',
        'trial_expiring',
        'subscription_expiring',
        'subscription_expired',
        'payment_needs_review',
      ],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    paymentId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPayment' },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

platformNotificationSchema.index({ isRead: 1, createdAt: -1 });

export const PlatformNotification: Model<IPlatformNotification> =
  mongoose.models.PlatformNotification ||
  mongoose.model<IPlatformNotification>('PlatformNotification', platformNotificationSchema);

export function publicPlatformNotification(n: IPlatformNotification) {
  return {
    _id: String(n._id),
    type: n.type,
    title: n.title,
    message: n.message,
    tenantId: n.tenantId ? String(n.tenantId) : null,
    paymentId: n.paymentId ? String(n.paymentId) : null,
    isRead: n.isRead,
    readAt: n.readAt ?? null,
    createdAt: n.createdAt,
  };
}
