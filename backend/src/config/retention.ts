/**
 * Retention policy for the compact, append-heavy collections.
 *
 * The 512 MB MongoDB budget depends on keeping notifications and audit logs
 * small. Cleanup only ever deletes read notifications and audit history —
 * never source records (students, payments, marks, attendance…).
 */
export const RETENTION = {
  /** Read notifications older than this many days are removed by retention cleanup. */
  notificationsDays: 90,
  /** Audit log entries older than this many days are removed by retention cleanup. */
  auditLogDays: 180,
} as const;

/** Manual retention cleanup is an explicit super-admin action (no cron in this deployment). */
export const CLEANUP_MODULE = 'system';
export const CLEANUP_ACTION = 'cleanup';
