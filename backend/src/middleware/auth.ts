import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, AccessTokenPayload } from '../utils/security';
import { ApiError } from '../utils/ApiError';
import { AuthUser, AuthRequest } from '../types';
import { effectiveRole, buildEffectivePermissionMap } from '../services/permission.service';
import { PermissionAction, ROLE_SLUGS } from '../config/permissions';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';

/**
 * Extracts the Bearer token, verifies it, and attaches the user
 * payload (id, role slug, role id) to req.user.
 *
 * Also re-checks the account against MongoDB on every request, so that
 * deactivated users' LIVE sessions fail immediately (not just future logins).
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Authentication required', 'AUTH_REQUIRED');
    }
    const token = header.slice(7).trim();
    const payload: AccessTokenPayload = verifyAccessToken(token);
    if (payload.type !== 'access') throw ApiError.unauthorized();

    const { getTenantDb } = await import('../services/auth.service');
    const tenantDb = await getTenantDb(payload.tenantId);
    (req as AuthRequest).tenantDb = tenantDb;
    
    const { getTenantModels } = await import('../services/TenantModelRegistry');
    const tenantModels = getTenantModels(tenantDb);

    const account = await tenantModels.User.findById(payload.sub).select('_id isActive isArchived tenantId isPlatformAdmin roleId name email').lean();
    if (!account || account.isArchived) {
      throw ApiError.unauthorized('Account no longer exists. Please sign in again.');
    }
    if (!account.isActive) {
      throw ApiError.forbidden('Your account has been deactivated. Please contact the administrator.', 'ACCOUNT_INACTIVE');
    }

    if (account.tenantId) {
      const { getMasterConnection } = await import('../services/MasterConnectionManager');
      const { getMasterModels } = await import('../services/MasterModelRegistry');
      const masterDb = getMasterConnection();
      const masterModels = getMasterModels(masterDb);
      
      let tenantDoc = await masterModels.Tenant.findById(account.tenantId).select('isSuspended isDatabaseProvisioned').lean();
      if (!tenantDoc) {
        tenantDoc = await Tenant.findById(account.tenantId).select('isSuspended isDatabaseProvisioned').lean();
      }
      if (!tenantDoc) {
        throw ApiError.unauthorized('School tenant no longer exists. Please sign in again.');
      }
      if (tenantDoc.isSuspended) {
        throw ApiError.forbidden('School tenant is suspended. Please contact support.', 'TENANT_SUSPENDED');
      }
      (req as AuthRequest).tenant = tenantDoc;
    }

    const role = await effectiveRole(String(account.roleId), account.tenantId ? String(account.tenantId) : undefined, tenantDb);
    if (!role?.isActive) throw ApiError.forbidden('Your role is not active. Contact your administrator.', 'ROLE_INACTIVE');

    const permissions = buildEffectivePermissionMap(role);

    req.user = {
      _id: payload.sub,
      role: role.slug,
      roleId: String(account.roleId),
      email: account.email,
      name: account.name,
      tenantId: account.tenantId ? String(account.tenantId) : undefined,
      isPlatformAdmin: Boolean(account.isPlatformAdmin),
      permissions,
    } as AuthUser;
    next();
  } catch (err: any) {
    if (err instanceof ApiError) return next(err);
    if (err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Session expired. Please sign in again.', 'ACCESS_TOKEN_EXPIRED'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(ApiError.unauthorized('Invalid token.', 'INVALID_ACCESS_TOKEN'));
    }
    next(err);
  }
}

/**
 * Platform Admin gate: only the SaaS platform owner can access platform management.
 */
export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.user.isPlatformAdmin && req.user.role !== 'platform_admin') {
    return next(ApiError.forbidden('Platform Administrator access required', 'PLATFORM_ADMIN_REQUIRED'));
  }
  next();
}

/**
 * Role gate: the authenticated user must have one of the given roles.
 * Backend enforcement only — frontend hiding is not security.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(ApiError.unauthorized());
    if (allowedRoles.length === 0) return next();
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have access to this resource'));
    }
    next();
  };
}

/**
 * Configurable-permission gate (module + action).
 * Super admins bypass; other roles are evaluated against request-scoped
 * fresh permissions attached during authenticate. Zero cache and zero extra DB queries.
 */
export function requirePermission(moduleName: string, action: PermissionAction) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) return next(ApiError.unauthorized());
      if (req.user.role === ROLE_SLUGS.superAdmin || req.user.role === ROLE_SLUGS.admin) return next();
      if (!req.user.tenantId) return next(ApiError.forbidden('Tenant context required', 'TENANT_REQUIRED'));

      const permissions = req.user.permissions;
      const allowed = permissions?.[moduleName]?.includes(action);
      if (!allowed) {
        return next(ApiError.forbidden(`You do not have permission to ${action} this module`, 'PERMISSION_DENIED'));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Multi-permission gate (OR logic): passes if user has at least one of the specified (module, action) pairs.
 */
export function requireAnyPermission(...checks: [string, PermissionAction][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) return next(ApiError.unauthorized());
      if (req.user.role === ROLE_SLUGS.superAdmin || req.user.role === ROLE_SLUGS.admin) return next();
      if (!req.user.tenantId) return next(ApiError.forbidden('Tenant context required', 'TENANT_REQUIRED'));

      const permissions = req.user.permissions;
      const allowed = checks.some(([moduleName, action]) =>
        permissions?.[moduleName]?.includes(action)
      );
      if (!allowed) {
        return next(ApiError.forbidden('You do not have permission to access this resource', 'PERMISSION_DENIED'));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

