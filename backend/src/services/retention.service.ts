import { Notification } from '../models/Notification';
import { AuditLog } from '../models/AuditLog';
import { RETENTION } from '../config/retention';
import { cleanupNotifications } from './prompt7.service';
import { Tenant } from '../models/Tenant';
import { getTenantConnection } from './TenantConnectionManager';
import { logger } from '../utils/logger';

export interface RetentionResult {
  notificationsDeleted: number;
  auditLogsDeleted: number;
}

/**
 * Compact-log retention: deletes read notifications and old audit entries
 * older than `olderThanDays` (defaults to the configured retention windows).
 * Never touches source records.
 */
export async function runRetentionCleanup(options?: { notificationsDays?: number; auditDays?: number }): Promise<RetentionResult> {
  const notificationsDays = options?.notificationsDays ?? RETENTION.notificationsDays;
  const auditDays = options?.auditDays ?? RETENTION.auditLogDays;

  const tenants = await Tenant.find().select('databaseName').lean();
  let notificationsDeleted = 0;
  for (const tenant of tenants) {
    if (!tenant.databaseName) continue;
    const tenantDb = getTenantConnection(tenant.databaseName);
    notificationsDeleted += (await cleanupNotifications(tenantDb, notificationsDays)).deleted;
  }

  const auditCutoff = new Date(Date.now() - auditDays * 24 * 3600 * 1000);
  const auditResult = await AuditLog.deleteMany({ createdAt: { $lt: auditCutoff } });
  const auditLogsDeleted = auditResult.deletedCount ?? 0;

  logger.info(
    `Retention cleanup: ${notificationsDeleted} read notification(s) and ${auditLogsDeleted} audit log(s) removed (${notificationsDays}d / ${auditDays}d windows)`
  );

  return { notificationsDeleted, auditLogsDeleted };
}
