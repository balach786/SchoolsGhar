import mongoose from 'mongoose';
import { Notification } from '../models/Notification';
import { logger } from '../utils/logger';

/**
 * Lightweight notification event hub (Prompt 6 integration point; the full
 * notification center UI ships in Prompt 7).
 *
 * Events:
 *   FEE_DUE, PAYMENT_RECEIVED, FEE_PAID, BALANCE_REMAINING,
 *   NEW_ASSIGNMENT, EXAM_ANNOUNCEMENT, RESULT_PUBLISHED, NEW_NOTICE,
 *   LEAVE_APPROVED, LEAVE_REJECTED
 *
 * Notifications are compact documents. Records are never copied. Emissions are
 * fire-and-forget and must never break the source operation.
 */
export const NOTIFICATION_TYPES = {
  FEE_DUE: 'FEE_DUE',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  FEE_PAID: 'FEE_PAID',
  BALANCE_REMAINING: 'BALANCE_REMAINING',
  NEW_ASSIGNMENT: 'NEW_ASSIGNMENT',
  EXAM_ANNOUNCEMENT: 'EXAM_ANNOUNCEMENT',
  RESULT_PUBLISHED: 'RESULT_PUBLISHED',
  NEW_NOTICE: 'NEW_NOTICE',
  LEAVE_APPROVED: 'LEAVE_APPROVED',
  LEAVE_REJECTED: 'LEAVE_REJECTED',
} as const;

interface NotifyInput {
  tenantId?: string | mongoose.Types.ObjectId;
  userId: string | mongoose.Types.ObjectId;
  type: string;
  title: string;
  message: string;
  referenceType?: string;
  referenceId?: string | mongoose.Types.ObjectId;
  /** Skip creation when an identical unread notification already exists. */
  dedupe?: boolean;
}

import { getTenantModels } from '../services/TenantModelRegistry';

export function notify(tenantDb: mongoose.Connection, input: NotifyInput): void {
  if (!tenantDb) {
    logger.error('TENANT_DB_MISSING: Cannot send school notification without a tenantDb');
    return;
  }
  try {
    const { Notification } = getTenantModels(tenantDb);
    const doc = {
      tenantId: input.tenantId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      ...(input.referenceType ? { referenceType: input.referenceType } : {}),
      ...(input.referenceId ? { referenceId: input.referenceId } : {}),
      isRead: false,
      createdAt: new Date(),
    };

    const create = async () => {
      if (input.dedupe) {
        const exists = await Notification.findOne({
          userId: doc.userId,
          type: doc.type,
          referenceId: doc.referenceId,
          isRead: false,
        })
          .select('_id')
          .lean();
        if (exists) return;
      }
      await Notification.create(doc);
    };
    create().catch((err) => logger.warn('Notification write failed', err.message));
  } catch (err) {
    logger.warn('Notification rejected', err instanceof Error ? err.message : 'unknown');
  }
}
