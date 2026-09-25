import mongoose, { Types } from 'mongoose';
import { AuthSession } from '../models/AuthSession';
import { User, IUser } from '../models/User';
import { Role } from '../models/Role';
import { Tenant } from '../models/Tenant';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyPassword,
  hashToken,
  refreshTokenTtlMs,
} from '../utils/security';
import { randomToken } from '../utils/id';
import { ApiError } from '../utils/ApiError';
import { effectiveRole, getRolePermissionMap } from './permission.service';

/**
 * Session/token service — storage-efficient strategy:
 *  - Refresh tokens are stored as SHA-256 hashes only (never raw tokens).
 *  - Sessions carry a MongoDB TTL index → expired sessions delete themselves.
 *  - Rotation on every refresh; reuse of a revoked token revokes the family.
 */

export interface IssueResult {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export interface SafeUserWithAuth {
  user: {
    _id: string;
    name: string;
    email: string;
    roleId: string;
    role: string;
    roleLabel: string;
    tenantId?: string | null;
    isPlatformAdmin?: boolean;
    isActive: boolean;
    lastLoginAt: Date | null;
    permissions: Record<string, string[]>;
    dashboardOrder: string[];
  };
  accessToken: string;
  refreshToken: string;
}

export async function issueTokensForUser(user: IUser, roleSlug: string, tenantDb: mongoose.Connection): Promise<IssueResult> {
  const sessionId = randomToken(16);
  const refreshToken = signRefreshToken({ 
    sub: String(user._id), 
    type: 'refresh', 
    sid: sessionId,
    tenantId: user.tenantId ? String(user.tenantId) : undefined
  });
  const accessToken = signAccessToken({
    sub: String(user._id),
    role: roleSlug,
    roleId: String(user.roleId),
    email: user.email,
    name: user.name,
    tenantId: user.tenantId ? String(user.tenantId) : undefined,
    isPlatformAdmin: Boolean(user.isPlatformAdmin),
    type: 'access',
  });

  const { getTenantModels } = await import('./TenantModelRegistry');
  const tenantModels = getTenantModels(tenantDb);
  await tenantModels.AuthSession.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + refreshTokenTtlMs(refreshToken)),
  });

  return { accessToken, refreshToken, sessionId };
}

export async function buildSafeAuthResponse(user: IUser, tenantDb: mongoose.Connection): Promise<SafeUserWithAuth> {
  const role = await effectiveRole(String(user.roleId), user.tenantId ? String(user.tenantId) : undefined, tenantDb);
  if (!role?.isActive) throw ApiError.forbidden('Your role is not active. Contact your administrator.', 'ROLE_INACTIVE');
  const roleSlug = role.slug;
  const permissions = await getRolePermissionMap(String(user.roleId), roleSlug, user.tenantId ? String(user.tenantId) : undefined, tenantDb);
  const tokens = await issueTokensForUser(user, roleSlug, tenantDb);

  return {
    user: {
      _id: String(user._id),
      name: user.name,
      email: user.email,
      roleId: String(user.roleId),
      role: roleSlug,
      roleLabel: role?.name ?? roleSlug,
      tenantId: user.tenantId ? String(user.tenantId) : null,
      isPlatformAdmin: Boolean(user.isPlatformAdmin),
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt ?? null,
      permissions,
      dashboardOrder: user.dashboardOrder ?? [],
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

export async function getTenantDb(tenantId: string | undefined): Promise<mongoose.Connection> {
  const { getTenantConnection } = await import('./TenantConnectionManager');
  const { getMasterConnection } = await import('./MasterConnectionManager');
  const { getMasterModels } = await import('./MasterModelRegistry');
  const { env } = await import('../config/env');

  if (!tenantId) {
    return getMasterConnection();
  }

  const masterDb = getMasterConnection();
  const masterModels = getMasterModels(masterDb);
  let tenant = await masterModels.Tenant.findById(tenantId);
  if (!tenant) {
    tenant = await Tenant.findById(tenantId);
  }

  const dbName = tenant?.databaseName;
  if (!tenant?.isDatabaseProvisioned || !dbName) {
    throw new Error('School account is not fully provisioned yet.');
  }
  return getTenantConnection(dbName);
}

/** Authenticate using Phase 2 School Code + Email + Password */
export async function loginUser(schoolCode: string, email: string, password: string): Promise<SafeUserWithAuth> {
  const { getMasterConnection } = await import('./MasterConnectionManager');
  const { getMasterModels } = await import('./MasterModelRegistry');
  const { getTenantModels } = await import('./TenantModelRegistry');
  const { getTenantConnection } = await import('./TenantConnectionManager');
  const { env } = await import('../config/env');
  const masterDb = getMasterConnection();
  const masterModels = getMasterModels(masterDb);

  let tenant = await masterModels.Tenant.findOne({ slug: schoolCode.toLowerCase() });
  if (!tenant) {
    // TRANSITION COMPATIBILITY: Fallback to legacy default connection for old dummy tenants
    tenant = await Tenant.findOne({ slug: schoolCode.toLowerCase() });
  }

  if (!tenant) {
    throw ApiError.unauthorized('Invalid school code or credentials', 'INVALID_CREDENTIALS');
  }
  if (tenant.isDeleted) {
    throw ApiError.forbidden('School account has been deleted.', 'TENANT_DELETED');
  }
  if (tenant.isSuspended) {
    throw ApiError.forbidden('School account is suspended.', 'TENANT_SUSPENDED');
  }
  if (tenant.provisioningStatus === 'failed') {
    throw ApiError.unauthorized('School account provisioning failed. Please contact support.', 'PROVISIONING_FAILED');
  }

  const dbName = tenant.databaseName;
  if (!tenant.isDatabaseProvisioned || !dbName) {
    throw ApiError.unauthorized('School account is not fully provisioned yet.', 'PROVISIONING_PENDING');
  }
  const tenantDb = getTenantConnection(dbName);
  const tenantModels = getTenantModels(tenantDb);

  const user = await tenantModels.User.findOne({ email, isArchived: false }).select('+passwordHash');
  if (!user) {
    throw ApiError.unauthorized('Invalid school code or credentials', 'INVALID_CREDENTIALS');
  }

  // TRANSITION COMPATIBILITY: Since all tenants currently share 'schoolsghar', 
  // ensure the matched user actually belongs to the resolved tenant.
  if (user.tenantId && String(user.tenantId) !== String(tenant._id)) {
    throw ApiError.unauthorized('Invalid school code or credentials', 'INVALID_CREDENTIALS');
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    throw ApiError.unauthorized('Invalid school code or credentials', 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('Your account has been deactivated. Please contact the administrator.', 'ACCOUNT_INACTIVE');
  }

  const role = await effectiveRole(String(user.roleId), user.tenantId ? String(user.tenantId) : undefined, tenantDb);
  if (!role || !role.isActive) {
    throw ApiError.forbidden('Your role is not active. Please contact the administrator.', 'ROLE_INACTIVE');
  }

  user.lastLoginAt = new Date();
  await user.save();

  return buildSafeAuthResponse(user, tenantDb);
}

/** Refresh: verify token, find live session, rotate, return fresh pair. */
export async function refreshSession(refreshToken: string): Promise<SafeUserWithAuth> {
  let payload: any;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Session expired. Please sign in again.', 'REFRESH_EXPIRED');
  }

  const tenantDb = await getTenantDb(payload.tenantId);
  const { getTenantModels } = await import('./TenantModelRegistry');
  const tenantModels = getTenantModels(tenantDb);

  const tokenHash = hashToken(refreshToken);
  const session = await tenantModels.AuthSession.findOne({ tokenHash });

  if (!session) {
    throw ApiError.unauthorized('Session expired. Please sign in again.', 'REFRESH_EXPIRED');
  }

  if (session.revokedAt) {
    await tenantModels.AuthSession.updateMany(
      { user: session.user, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    throw ApiError.unauthorized('Session expired. Please sign in again.', 'REFRESH_REUSED');
  }

  if (session.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthorized('Session expired. Please sign in again.', 'REFRESH_EXPIRED');
  }

  const user = await tenantModels.User.findById(session.user);
  if (!user || user.isArchived || !user.isActive) {
    throw ApiError.unauthorized('Account is no longer active', 'ACCOUNT_INACTIVE');
  }

  session.revokedAt = new Date();
  await session.save();

  return buildSafeAuthResponse(user, tenantDb);
}

/** Logout: revoke the presented refresh token's session. */
export async function logoutSession(refreshToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(refreshToken) as any;
    const tenantDb = await getTenantDb(payload.tenantId);
    const { getTenantModels } = await import('./TenantModelRegistry');
    const tenantModels = getTenantModels(tenantDb);
    
    const tokenHash = hashToken(refreshToken);
    await tenantModels.AuthSession.updateOne({ tokenHash }, { $set: { revokedAt: new Date() } });
  } catch {
    // Logout must never fail the request — invalid tokens are simply ignored.
  }
}

export async function revokeAllSessions(userId: Types.ObjectId, tenantDb: mongoose.Connection, keepSessionId?: string): Promise<void> {
  const { getTenantModels } = await import('./TenantModelRegistry');
  const tenantModels = getTenantModels(tenantDb);
  await tenantModels.AuthSession.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

/** Current-user state: fresh from MongoDB — reflects latest permission changes. */
export async function currentUserState(userId: string, tenantDb: mongoose.Connection): Promise<SafeUserWithAuth['user']> {
  const { getTenantModels } = await import('./TenantModelRegistry');
  const tenantModels = getTenantModels(tenantDb);
  const user = await tenantModels.User.findById(userId).where('isArchived').equals(false);
  if (!user) throw ApiError.notFound('User not found');
  if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated.', 'ACCOUNT_INACTIVE');

  if (user.tenantId) {
    const { getMasterConnection } = await import('./MasterConnectionManager');
    const { getMasterModels } = await import('./MasterModelRegistry');
    const masterDb = getMasterConnection();
    const masterModels = getMasterModels(masterDb);
    
    let tenantExists = await masterModels.Tenant.exists({ _id: user.tenantId });
    if (!tenantExists) {
      tenantExists = await Tenant.exists({ _id: user.tenantId });
    }
    if (!tenantExists) throw ApiError.unauthorized('School tenant no longer exists. Please sign in again.');
  }

  const role = await effectiveRole(String(user.roleId), user.tenantId ? String(user.tenantId) : undefined, tenantDb);
  if (!role?.isActive) throw ApiError.forbidden('Your role is not active. Contact your administrator.', 'ROLE_INACTIVE');
  const roleSlug = role.slug;
  const permissions = await getRolePermissionMap(String(user.roleId), roleSlug, user.tenantId ? String(user.tenantId) : undefined, tenantDb);

  return {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    roleId: String(user.roleId),
    role: roleSlug,
    roleLabel: role?.name ?? roleSlug,
    tenantId: user.tenantId ? String(user.tenantId) : null,
    isPlatformAdmin: Boolean(user.isPlatformAdmin),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ?? null,
    permissions,
    dashboardOrder: user.dashboardOrder ?? [],
  };
}
