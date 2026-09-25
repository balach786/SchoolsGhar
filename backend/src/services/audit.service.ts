import mongoose from 'mongoose';
import { AuditLog, AuditMetadata, AuditScope, sanitizeMetadata } from '../models/AuditLog';
import { AuthUser } from '../types';
import { logger } from '../utils/logger';

/**
 * Audit writer — fire-and-forget, compact records only.
 * Failures to write an audit entry must never break the main operation.
 * Hardened in Phase 4A to FAIL CLOSED on invalid tenant audit writes.
 */
export function recordAudit(
  module: string,
  action: string,
  actor: AuthUser | null | undefined,
  targetId?: string,
  metadata?: AuditMetadata,
  explicitScope?: AuditScope,
  targetTenantId?: mongoose.Types.ObjectId | string
): void {
  try {
    let resolvedTenantId: mongoose.Types.ObjectId | undefined;
    let resolvedScope: AuditScope;

    // 1. Canonical Actor Authority: if actor belongs to a tenant, it is authoritative
    if (actor?.tenantId) {
      resolvedTenantId = mongoose.isValidObjectId(actor.tenantId)
        ? new mongoose.Types.ObjectId(String(actor.tenantId))
        : undefined;
      resolvedScope = 'tenant';
    } else if (actor?.isPlatformAdmin && targetTenantId) {
      // 2. Platform Admin Acting on Tenant (explicit server-controlled targetTenantId only)
      resolvedTenantId = mongoose.isValidObjectId(targetTenantId)
        ? new mongoose.Types.ObjectId(String(targetTenantId))
        : undefined;
      resolvedScope = 'tenant';
    } else if (explicitScope === 'tenant') {
      // Explicit tenant request but actor has no tenantId and no targetTenantId was provided
      if (targetTenantId && mongoose.isValidObjectId(targetTenantId)) {
        resolvedTenantId = new mongoose.Types.ObjectId(String(targetTenantId));
        resolvedScope = 'tenant';
      } else {
        // FAIL CLOSED: do NOT silently demote to platform
        logger.warn(`Security Warning: Tenant-scoped audit write rejected - no valid tenant context (${module}.${action})`);
        return;
      }
    } else if (explicitScope === 'platform' || actor?.isPlatformAdmin || !actor) {
      // 3. Platform-level action (genuinely unrelated to any tenant)
      resolvedScope = 'platform';
      resolvedTenantId = undefined;
    } else {
      // Unauthenticated or unknown context without explicit scope
      resolvedScope = 'platform';
      resolvedTenantId = undefined;
    }

    // Fail closed: if resolved scope is tenant, resolvedTenantId MUST be valid
    if (resolvedScope === 'tenant' && !resolvedTenantId) {
      logger.warn(`Security Warning: Tenant-scoped audit write rejected - missing resolved tenantId (${module}.${action})`);
      return;
    }

    const entry = {
      scope: resolvedScope,
      tenantId: resolvedTenantId,
      module,
      action,
      userId: actor?._id,
      roleId: actor?.roleId,
      targetId,
      metadata: sanitizeMetadata(metadata),
      createdAt: new Date(),
    };

    const fire = async () => {
      if (resolvedScope === 'tenant' && resolvedTenantId) {
        const { getTenantDb } = await import('./auth.service');
        const tenantDb = await getTenantDb(String(resolvedTenantId));
        const { getTenantModels } = await import('./TenantModelRegistry');
        const { AuditLog: TenantAuditLog } = getTenantModels(tenantDb);
        await TenantAuditLog.create(entry);
      } else {
        await AuditLog.create(entry);
      }
    };
    fire().catch((err) => logger.warn(`Audit write failed (${module}.${action})`, err.message));
  } catch (err) {
    logger.warn(`Audit write rejected (${module}.${action})`, err instanceof Error ? err.message : 'unknown');
  }
}

/** Transactional audit logger — writes within an active MongoDB ClientSession so that if the transaction rolls back, the audit rolls back too. */
export async function recordAuditWithSession(
  module: string,
  action: string,
  actor: AuthUser | null | undefined,
  targetId?: string,
  metadata?: AuditMetadata,
  session?: mongoose.ClientSession,
  explicitScope?: AuditScope,
  targetTenantId?: mongoose.Types.ObjectId | string
): Promise<void> {
  let resolvedTenantId: mongoose.Types.ObjectId | undefined;
  let resolvedScope: AuditScope;

  if (actor?.tenantId) {
    resolvedTenantId = mongoose.isValidObjectId(actor.tenantId)
      ? new mongoose.Types.ObjectId(String(actor.tenantId))
      : undefined;
    resolvedScope = 'tenant';
  } else if (actor?.isPlatformAdmin && targetTenantId) {
    resolvedTenantId = mongoose.isValidObjectId(targetTenantId)
      ? new mongoose.Types.ObjectId(String(targetTenantId))
      : undefined;
    resolvedScope = 'tenant';
  } else if (explicitScope === 'tenant') {
    if (targetTenantId && mongoose.isValidObjectId(targetTenantId)) {
      resolvedTenantId = new mongoose.Types.ObjectId(String(targetTenantId));
      resolvedScope = 'tenant';
    } else {
      logger.warn(`Security Warning: Tenant-scoped audit write rejected - no valid tenant context (${module}.${action})`);
      return;
    }
  } else if (explicitScope === 'platform' || actor?.isPlatformAdmin || !actor) {
    resolvedScope = 'platform';
    resolvedTenantId = undefined;
  } else {
    resolvedScope = 'platform';
    resolvedTenantId = undefined;
  }

  if (resolvedScope === 'tenant' && !resolvedTenantId) {
    logger.warn(`Security Warning: Tenant-scoped audit write rejected - missing resolved tenantId (${module}.${action})`);
    return;
  }

  const entry = {
    scope: resolvedScope,
    tenantId: resolvedTenantId,
    module,
    action,
    userId: actor?._id,
    roleId: actor?.roleId,
    targetId,
    metadata: sanitizeMetadata(metadata),
    createdAt: new Date(),
  };

  let ModelToUse = AuditLog;
  if (resolvedScope === 'tenant' && resolvedTenantId) {
    const { getTenantDb } = await import('./auth.service');
    const tenantDb = await getTenantDb(String(resolvedTenantId));
    const { getTenantModels } = await import('./TenantModelRegistry');
    ModelToUse = getTenantModels(tenantDb).AuditLog as any;
  }

  if (session) {
    await ModelToUse.create([entry], { session });
  } else {
    await ModelToUse.create(entry);
  }
}

/** Audit actions used across the system (compact, consistent). */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_ACTIVATED: 'USER_ACTIVATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_ARCHIVED: 'USER_ARCHIVED',
  USER_RESTORED: 'USER_RESTORED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  ROLE_CREATED: 'ROLE_CREATED',
  ROLE_UPDATED: 'ROLE_UPDATED',
  ROLE_PERMISSION_UPDATED: 'ROLE_PERMISSION_UPDATED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
} as const;
