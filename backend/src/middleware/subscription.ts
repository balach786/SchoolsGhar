import { NextFunction, Response } from 'express';
import { AuthRequest } from '../types';
import { ApiError } from '../utils/ApiError';
import { Tenant, getEffectiveTenantStatus } from '../models/Tenant';

/**
 * Subscription & Free Trial Access Gate.
 * Enforces active trial or subscription for normal school management modules.
 * Excluded endpoints (like /billing, /auth, /subscription, /manual-payments) do NOT use this middleware.
 */
export async function checkSubscriptionAccess(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    // Platform admin bypasses school subscription checks
    if (req.user.isPlatformAdmin || req.user.role === 'platform_admin') {
      return next();
    }

    let tenant = req.tenant;
    if (!tenant && req.user.tenantId) {
      tenant = await Tenant.findById(req.user.tenantId);
      req.tenant = tenant;
    }

    if (!tenant) {
      return next(ApiError.forbidden('Active school workspace required', 'NO_TENANT'));
    }

    const effective = getEffectiveTenantStatus(tenant);

    if (effective.isSuspended) {
      const reason = tenant.suspensionReason
        ? `Account suspended: ${tenant.suspensionReason}`
        : 'Your school account has been suspended. Please contact platform support.';
      return next(ApiError.forbidden(reason, 'ACCOUNT_SUSPENDED'));
    }

    if (effective.isExpired) {
      // Lazily update tenant status in MongoDB if not yet marked as expired
      if (tenant.status !== 'expired' || tenant.subscriptionStatus !== 'expired') {
        await Tenant.updateOne(
          { _id: tenant._id },
          { $set: { status: 'expired', subscriptionStatus: 'expired' } }
        );
      }

      return next(
        ApiError.forbidden(
          'Your free trial or subscription has expired. Please renew your subscription to continue using school management features. Your existing school data is completely safe.',
          'SUBSCRIPTION_REQUIRED'
        )
      );
    }

    // Account has an active trial or active subscription
    next();
  } catch (err) {
    next(err);
  }
}
