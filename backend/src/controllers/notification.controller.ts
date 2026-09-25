import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, paginated } from '../utils/apiResponse';
import { Notification } from '../models/Notification';
import { AuthRequest } from '../types';
import { publicNotification } from '../services/prompt7.service';
import { type AuthedUser } from '../services/attendance.service';
import mongoose from 'mongoose';
import { getTenantModels } from '../services/TenantModelRegistry';

const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

/** GET /api/notifications — the caller's own notifications + unread count. */
export const listNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Notification } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const filter: Record<string, any> = { userId: user._id };
  if (req.query.unread === 'true') filter.isRead = false;

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;

  const [docs, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId: user._id, isRead: false }),
  ]);
  res.json({
    success: true,
    data: docs.map(publicNotification),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    unreadCount,
  });
});

/** PATCH /api/notifications/:id/read — mark own notification read. */
export const markRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Notification } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const doc = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: user._id },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );
  if (!doc) throw ApiError.notFound('Notification not found');
  ok(res, publicNotification(doc));
});

/** POST /api/notifications/read-all — mark all own notifications read. */
export const markAllRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Notification } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const result = await Notification.updateMany({ userId: user._id, isRead: false }, { $set: { isRead: true, readAt: new Date() } });
  ok(res, { updated: result.modifiedCount ?? 0 }, 200, { message: 'All notifications marked read' });
});

/** DELETE /api/notifications/:id — delete own notification (notifications.delete). */
export const deleteNotification = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Notification } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const result = await Notification.deleteOne({ _id: req.params.id, userId: user._id });
  if (result.deletedCount === 0) throw ApiError.notFound('Notification not found');
  ok(res, { deleted: true }, 200, { message: 'Notification deleted' });
});
