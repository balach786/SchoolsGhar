import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Lightweight DB-driven notification (Prompt 7 builds the full module;
 * Prompt 6 finance already emits events through notification.service).
 * Documents stay small: no copied records, only a reference.
 */
export interface INotification extends Document {
  tenantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: string;
  title: string;
  message: string;
  referenceType?: string;
  referenceId?: mongoose.Types.ObjectId;
  isRead: boolean;
  createdAt: Date;
  readAt?: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, maxlength: 40 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 300 },
    referenceType: { type: String, maxlength: 40 },
    referenceId: { type: Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

// Unread-count queries + per-user lists.
notificationSchema.index({ tenantId: 1, userId: 1, isRead: 1, createdAt: -1 });
// Retention cleanup (old read notifications).
notificationSchema.index({ tenantId: 1, isRead: 1, createdAt: 1 });

export const Notification: Model<INotification> =
  mongoose.models.Notification || mongoose.model<INotification>('Notification', notificationSchema);

export function publicNotification(doc: INotification | (Record<string, any> & { _id?: unknown })) {
  return {
    _id: String(doc._id),
    type: doc.type,
    title: doc.title,
    message: doc.message,
    referenceType: doc.referenceType ?? null,
    referenceId: doc.referenceId ? String(doc.referenceId) : null,
    isRead: Boolean(doc.isRead),
    readAt: doc.readAt ? new Date(doc.readAt).toISOString() : null,
    createdAt: doc.createdAt,
  };
}
