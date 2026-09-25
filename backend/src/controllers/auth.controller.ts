import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import { ok, noContent } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { hashPassword, verifyPassword } from '../utils/security';
import {
  loginUser,
  logoutSession,
  refreshSession,
  currentUserState,
  revokeAllSessions,
  buildSafeAuthResponse,
} from '../services/auth.service';
import { User } from '../models/User';
import { recordAudit, AUDIT_ACTIONS } from '../services/audit.service';

/** POST /api/auth/login */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { schoolCode, email, password } = req.body as { schoolCode: string; email: string; password: string };
  if (!schoolCode) throw ApiError.badRequest('School Code is required');
  const result = await loginUser(schoolCode, email, password);
  recordAudit('auth', AUDIT_ACTIONS.LOGIN_SUCCESS, {
    _id: result.user._id,
    role: result.user.role,
    roleId: result.user.roleId,
    email: result.user.email,
    name: result.user.name,
    tenantId: result.user.tenantId ?? undefined,
    isPlatformAdmin: result.user.isPlatformAdmin,
  });
  ok(res, result, 200);
});

/** POST /api/auth/refresh */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };
  const result = await refreshSession(refreshToken);
  ok(res, result, 200);
});

/** POST /api/auth/logout */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) await logoutSession(refreshToken);
  noContent(res);
});

/** GET /api/auth/me — fresh permission state from MongoDB. */
export const me = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await currentUserState(req.user!._id, req.tenantDb!);
  if (req.user?.permissions) {
    user.permissions = req.user.permissions;
  }
  ok(res, { user });
});

/** POST /api/auth/change-password — verifies current password, revokes other sessions. */
export const changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };

  const TenantUser = req.tenantDb!.model('User', User.schema);
  const user = await TenantUser.findById(req.user!._id).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');

  const passwordOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!passwordOk) {
    throw ApiError.badRequest('Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();

  // Invalidate every other session; issue fresh tokens for this one.
  await revokeAllSessions(user._id, req.tenantDb!);

  recordAudit('auth', AUDIT_ACTIONS.PASSWORD_CHANGED, req.user, String(user._id));

  const result = await buildSafeAuthResponse(user as any, req.tenantDb!);
  ok(res, result, 200);
});

/** PATCH /api/auth/me/preferences — updates dashboardOrder */
export const updatePreferences = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { dashboardOrder } = req.body;
  if (!Array.isArray(dashboardOrder)) {
    throw ApiError.badRequest('dashboardOrder must be an array of strings');
  }
  if (dashboardOrder.length > 50) {
    throw ApiError.badRequest('dashboardOrder array is too large');
  }
  if (!dashboardOrder.every((item) => typeof item === 'string')) {
    throw ApiError.badRequest('dashboardOrder must be an array of strings');
  }
  
  const uniqueOrder = Array.from(new Set(dashboardOrder));
  
  const TenantUser = req.tenantDb!.model('User', User.schema);
  const user = await TenantUser.findById(req.user!._id);
  if (!user) throw ApiError.notFound('User not found');
  
  user.dashboardOrder = uniqueOrder;
  await user.save();
  
  const updatedUser = await currentUserState(req.user!._id, req.tenantDb!);
  if (req.user?.permissions) {
    updatedUser.permissions = req.user.permissions;
  }
  ok(res, { user: updatedUser });
});
