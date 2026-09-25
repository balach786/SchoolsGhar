import { Request } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import { ApiError } from './ApiError';

/**
 * Extract tenantId string from authenticated request.
 */
export function getTenantId(req: Request | AuthRequest): string | undefined {
  const authReq = req as AuthRequest;
  const tid = authReq.tenant?._id ? String(authReq.tenant._id) : authReq.user?.tenantId;
  return tid ? String(tid) : undefined;
}

/**
 * Extract tenantId as mongoose ObjectId.
 */
export function getTenantObjectId(req: Request | AuthRequest): mongoose.Types.ObjectId | undefined {
  const tid = getTenantId(req);
  if (!tid) return undefined;
  try {
    return new mongoose.Types.ObjectId(tid);
  } catch {
    return undefined;
  }
}

/**
 * Require a tenantId or throw ApiError.
 */
export function requireTenantId(req: Request | AuthRequest): string {
  const tid = getTenantId(req);
  if (!tid) {
    throw ApiError.forbidden('School workspace context required for this operation', 'NO_TENANT');
  }
  return tid;
}

/**
 * Injects tenantId into an existing MongoDB query object.
 * Returns the query object with tenantId if tenant exists.
 */
export function scopeQuery<T extends Record<string, any>>(req: Request | AuthRequest, query: T = {} as T): T {
  const tid = getTenantId(req);
  if (tid) {
    return {
      ...query,
      tenantId: new mongoose.Types.ObjectId(tid),
    };
  }
  return query;
}
