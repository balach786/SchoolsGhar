import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import { ok, created, paginated } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { parsePagination } from '../utils/query';
import { publicSession, normalizeSessionName } from '../models/AcademicSession';
import { getTenantModels } from '../services/TenantModelRegistry';
import { recordAudit } from '../services/audit.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';
import {
  createCanonicalSession,
  activateCanonicalSession,
  archiveCanonicalSession,
  deleteCanonicalSession,
  parseSessionRange,
} from '../services/academicSession.service';

/** GET /api/academic-sessions — paginated list + student & class counts + summary. */
export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantObjectId(req);
  const { page, limit } = parsePagination(req.query);
  const { search, status } = req.query as Record<string, string | undefined>;

  let filter: Record<string, unknown> = {};
  if (search) filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (status === 'active') filter.isActive = true;
  else if (status === 'inactive') { filter.isActive = false; filter.isArchived = false; }
  else if (status === 'archived') filter.isArchived = true;
  else if (status === 'all') { /* no filter on isArchived */ }
  else filter.isArchived = false;

  filter = scopeQuery(req, filter);

  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { AcademicSession } = getTenantModels(tenantDb);

  const skip = (page - 1) * limit;
  const [docs, total, totalAllSessions, activeDoc, archivedTotal] = await Promise.all([
    AcademicSession.find(filter).sort({ startDate: -1 }).skip(skip).limit(limit).lean(),
    AcademicSession.countDocuments(filter),
    AcademicSession.countDocuments(scopeQuery(req, {})),
    AcademicSession.findOne(scopeQuery(req, { isActive: true })).lean(),
    AcademicSession.countDocuments(scopeQuery(req, { isArchived: true })),
  ]);

  const ids = docs.map((d) => d._id);
  const match: Record<string, unknown> = { sessionId: { $in: ids }, isArchived: false };
  if (tenantId) match.tenantId = tenantId;

  const { Student, Class } = getTenantModels(tenantDb);
  const [studentCounts, classCounts] = await Promise.all([
    Student.aggregate([
      { $match: match },
      { $group: { _id: '$sessionId', n: { $sum: 1 } } },
    ]),
    Class.aggregate([
      { $match: match },
      { $group: { _id: '$sessionId', n: { $sum: 1 } } },
    ]),
  ]);

  const studentCountMap = new Map(studentCounts.map((c) => [String(c._id), c.n]));
  const classCountMap = new Map(classCounts.map((c) => [String(c._id), c.n]));

  let activeStudentCount = 0;
  let activeClassCount = 0;
  if (activeDoc) {
    const activeMatch: Record<string, unknown> = { sessionId: activeDoc._id, isArchived: false };
    if (tenantId) activeMatch.tenantId = tenantId;
    const [stCount, clCount] = await Promise.all([
      Student.countDocuments(activeMatch),
      Class.countDocuments(activeMatch),
    ]);
    activeStudentCount = stCount;
    activeClassCount = clCount;
  }

  const summary = {
    totalSessions: totalAllSessions,
    activeSession: activeDoc ? publicSession(activeDoc as never) : null,
    activeStudentCount,
    activeClassCount,
    archivedCount: archivedTotal,
  };

  paginated(res, {
    data: docs.map((d) => ({
      ...publicSession(d as never),
      studentCount: studentCountMap.get(String(d._id)) ?? 0,
      classCount: classCountMap.get(String(d._id)) ?? 0,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    summary,
  });
});

/** GET /api/academic-sessions/active — the single active session for the tenant. */
export const getActiveSession = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { AcademicSession } = getTenantModels(tenantDb);

  const session = await AcademicSession.findOne(scopeQuery(req, { isActive: true })).lean();
  ok(res, session ? publicSession(session as never) : null);
});

/** POST /api/academic-sessions */
export const createSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantId = getTenantObjectId(req);
  if (!tenantId) {
    throw ApiError.forbidden('School workspace context required', 'NO_TENANT');
  }

  const { name, startDate, endDate, makeActive } = req.body as {
    name: string;
    startDate: string;
    endDate: string;
    makeActive?: boolean;
  };

  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');

  const session = await createCanonicalSession({
    tenantId,
    name,
    startDate,
    endDate,
    makeActive,
    createdBy: req.user?._id,
    userAuditContext: req.user,
    tenantDb,
  } as any);

  created(res, publicSession(session));
});

/** GET /api/academic-sessions/:id */
export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { AcademicSession } = getTenantModels(tenantDb);

  const doc = await AcademicSession.findOne(scopeQuery(req, { _id: req.params.id })).lean();
  if (!doc) throw ApiError.notFound('Session not found');
  ok(res, publicSession(doc as never));
});

/** GET /api/academic-sessions/lookup — lightweight reference list for dropdowns */
export const lookupSessions = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { AcademicSession } = getTenantModels(tenantDb);

  const filter = scopeQuery(req, { isArchived: false });
  const docs = await AcademicSession.find(filter)
    .sort({ startDate: -1 })
    .select('_id name isActive')
    .lean();
  ok(res, docs.map(d => ({ _id: String(d._id), name: d.name, isActive: d.isActive })));
});

/** PATCH /api/academic-sessions/:id */
export const updateSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { AcademicSession } = getTenantModels(tenantDb);

  const session = await AcademicSession.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!session) throw ApiError.notFound('Academic session not found');
  if (session.isArchived) throw ApiError.badRequest('Archived sessions cannot be edited');

  const { name, startDate: s, endDate: e } = req.body as {
    name?: string;
    startDate?: string;
    endDate?: string;
  };

  const nextStart = s ?? session.startDate.toISOString().slice(0, 10);
  const nextEnd = e ?? session.endDate.toISOString().slice(0, 10);
  const { startDate, endDate } = parseSessionRange(nextStart, nextEnd);

  if (name !== undefined) {
    session.name = name;
    session.normalizedName = normalizeSessionName(name);
  }
  session.startDate = startDate;
  session.endDate = endDate;

  try {
    await session.save();
  } catch (err: any) {
    if (err?.code === 11000 && err?.message?.includes('normalizedName')) {
      throw ApiError.conflict('A session with this name already exists for this school', 'SESSION_NAME_TAKEN');
    }
    throw err;
  }

  recordAudit('academicSessions', 'SESSION_UPDATED', req.user, String(session._id), { name: session.name });
  ok(res, publicSession(session));
});

/** POST /api/academic-sessions/:id/activate — exactly one active session at a time per tenant. */
export const activateSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantId = getTenantObjectId(req);
  if (!tenantId) {
    throw ApiError.forbidden('School workspace context required', 'NO_TENANT');
  }
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');

  const session = await activateCanonicalSession(tenantId, req.params.id, req.user, tenantDb);
  ok(res, publicSession(session));
});

/** POST /api/academic-sessions/:id/archive | /restore */
export const archiveSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantId = getTenantObjectId(req);
  if (!tenantId) {
    throw ApiError.forbidden('School workspace context required', 'NO_TENANT');
  }
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');

  const restore = req.path.endsWith('/restore');
  const session = await archiveCanonicalSession(tenantId, req.params.id, restore, req.user, tenantDb);
  ok(res, publicSession(session));
});

/** DELETE /api/academic-sessions/:id — safely delete an unreferenced, inactive session. */
export const deleteSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantId = getTenantObjectId(req);
  if (!tenantId) {
    throw ApiError.forbidden('School workspace context required', 'NO_TENANT');
  }
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const result = await deleteCanonicalSession(tenantDb, tenantId, req.params.id, req.user);
  ok(res, result);
});
