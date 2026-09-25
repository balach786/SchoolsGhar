import { NextFunction, Response } from 'express';
import { AuthRequest } from '../types';
import { ApiError } from '../utils/ApiError';
import { Tenant, ITenant } from '../models/Tenant';
import { getMasterConnection } from '../services/MasterConnectionManager';
import { getMasterModels } from '../services/MasterModelRegistry';

/**
 * Resolves the authenticated user's tenant from MongoDB,
 * attaches it to req.tenant, and blocks requests if the tenant is suspended.
 */
export async function resolveTenant(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    // Platform admin without tenantId operates globally
    if (req.user.isPlatformAdmin || req.user.role === 'platform_admin') {
      return next(ApiError.forbidden('Use Platform Administration to manage schools.', 'PLATFORM_CONTEXT_REQUIRED'));
    }

    if (!req.user.tenantId) {
      return next(ApiError.forbidden('A school workspace is required.', 'NO_TENANT'));
    }

    const masterDb = getMasterConnection();
    const masterModels = getMasterModels(masterDb);

    let tenant = await masterModels.Tenant.findById(req.user.tenantId);
    if (!tenant) {
      tenant = await Tenant.findById(req.user.tenantId);
    }
    
    if (!tenant) {
      return next(ApiError.notFound('School workspace not found', 'TENANT_NOT_FOUND'));
    }

    if (tenant.isSuspended) {
      const reason = tenant.suspensionReason
        ? `Account suspended: ${tenant.suspensionReason}`
        : 'Your school account has been suspended. Please contact platform support.';
      return next(ApiError.forbidden(reason, 'ACCOUNT_SUSPENDED'));
    }

    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}
