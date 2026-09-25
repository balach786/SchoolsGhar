import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { paginated } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/query';
import { scopeQuery } from '../utils/tenantScope';
import { AuthRequest } from '../types';
import mongoose from 'mongoose';
import { getTenantModels } from '../services/TenantModelRegistry';
import { ApiError } from '../utils/ApiError';

/**
 * GET /api/audit-logs
 * Paginated audit viewer with search + filters (user, module, action, date range).
 */
export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as AuthRequest).tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { AuditLog, User } = getTenantModels(tenantDb);

  const { page, limit } = parsePagination(req.query);
  const { search, module, action, userId, from, to } = req.query as Record<string, string | undefined>;

  const filter: Record<string, unknown> = scopeQuery(req, {});

  if (module) filter.module = module;
  if (action) filter.action = action;
  if (userId) filter.userId = new Types.ObjectId(userId);

  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) {
      const d = new Date(`${from}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) range.$gte = d;
    }
    if (to) {
      const d = new Date(`${to}T23:59:59.999Z`);
      if (!Number.isNaN(d.getTime())) range.$lte = d;
    }
    if (Object.keys(range).length) filter.createdAt = range;
  }

  if (search) {
    // Search across targetId + resolved user names below
    const matchingUsers = await User.find({
      name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
    })
      .select('_id')
      .limit(100)
      .lean();
    filter.$or = [
      { targetId: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { userId: { $in: matchingUsers.map((u) => u._id) } },
      { module: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { action: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  // Resolve actor names compactly
  const userIds = Array.from(new Set(docs.map((d) => d.userId).filter(Boolean) as Types.ObjectId[]));
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select('name').lean()
    : [];
  const nameMap = new Map(users.map((u) => [String(u._id), u.name]));

  const data = docs.map((d) => ({
    _id: String(d._id),
    userId: d.userId ? String(d.userId) : null,
    userName: d.userId ? (nameMap.get(String(d.userId)) ?? 'Unknown') : 'System',
    module: d.module,
    action: d.action,
    targetId: d.targetId ?? null,
    metadata: d.metadata ?? {},
    createdAt: d.createdAt,
  }));

  paginated(res, { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 } });
});

/** Distinct modules + actions present in the logs (for filter dropdowns). */
export const auditFilters = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as AuthRequest).tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { AuditLog } = getTenantModels(tenantDb);

  const filter = scopeQuery(req, {});
  const [modules, actions] = await Promise.all([
    AuditLog.distinct('module', filter),
    AuditLog.distinct('action', filter),
  ]);
  res.json({
    success: true,
    data: {
      modules: modules.filter(Boolean).sort(),
      actions: actions.filter(Boolean).sort(),
    },
  });
});
