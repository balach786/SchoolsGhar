import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok } from '../utils/apiResponse';
import { AuthRequest } from '../types';
import { getStorageReport } from '../services/storage.service';
import { runRetentionCleanup } from '../services/retention.service';
import { recordAudit } from '../services/audit.service';

const SUPER_ADMIN_ROLE = 'super_admin';

/** GET /api/system/storage — live MongoDB usage vs the 512 MB budget (super_admin only). */
export const storageReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== SUPER_ADMIN_ROLE) {
    throw ApiError.forbidden('Storage reports are restricted to Super Admins', 'SUPER_ADMIN_ONLY');
  }
  const report = await getStorageReport();
  recordAudit('system', 'STORAGE_REPORTED', req.user, 'storage', { percent: report.usage.percent });
  ok(res, report, 200, { message: 'Live storage report' });
});

/**
 * POST /api/system/cleanup — retention cleanup for compact logs.
 * Explicit super-admin command; never deletes source records.
 */
export const runCleanup = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== SUPER_ADMIN_ROLE) {
    throw ApiError.forbidden('Retention cleanup is restricted to Super Admins', 'SUPER_ADMIN_ONLY');
  }
  const result = await runRetentionCleanup({
    notificationsDays: req.body.notificationsDays,
    auditDays: req.body.auditDays,
  });
  recordAudit('system', 'RETENTION_CLEANUP', req.user, 'retention', { ...result });
  ok(res, result, 200, { message: 'Retention cleanup completed' });
});
