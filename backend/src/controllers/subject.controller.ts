import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import { ok, created, paginated } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { parsePagination } from '../utils/query';
import { publicSubject } from '../models/Subject';
import { getTenantModels } from '../services/TenantModelRegistry';
import { requireSession, ensureClassesInSession, requireTeachingStaff } from '../services/academic.service';
import { recordAudit } from '../services/audit.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

async function resolveNames(req: Request, ids: string[], model: mongoose.Model<mongoose.Document>, field: string) {
  if (!ids.length) return new Map<string, string>();
  const query = scopeQuery(req, { _id: { $in: ids } });
  const docs = (await model.find(query).select(field).lean()) as { _id: unknown; [k: string]: unknown }[];
  return new Map(docs.map((d) => [String(d._id), String(d[field] ?? '')]));
}

/** GET /api/subjects */
export const listSubjects = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Subject, Class } = getTenantModels(tenantDb);
  const { page, limit } = parsePagination(req.query);
  const { search, classId, sessionId, status } = req.query as Record<string, string | undefined>;

  let filter: Record<string, unknown> = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { code: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    ];
  }
  if (classId) filter.classIds = classId;
  if (sessionId) filter.sessionId = sessionId;
  if (status === 'active') filter.isActive = true;
  else if (status === 'inactive') filter.isActive = false;
  else if (status === 'archived') filter.isArchived = true;
  else filter.isArchived = false;

  filter = scopeQuery(req, filter);

  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    Subject.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Subject.countDocuments(filter),
  ]);

  const classIds = Array.from(new Set(docs.flatMap((d) => (d.classIds ?? []).map(String))));
  const [classNames] = await Promise.all([
    resolveNames(req, classIds, Class as unknown as mongoose.Model<mongoose.Document>, 'name'),
  ]);

  const data = docs.map((d) => ({
    ...publicSubject(d as never),
    classNames: (d.classIds ?? []).map((c) => classNames.get(String(c)) ?? '—').join(', '),
  }));
  paginated(res, { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 } });
});

/** GET /api/subjects/:id */
export const getSubject = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Subject } = getTenantModels(tenantDb);
  const doc = await Subject.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Subject not found');
  ok(res, publicSubject(doc));
});

/** POST /api/subjects */
export const createSubject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, code, sessionId, classIds } = req.body as {
    name: string;
    code: string;
    sessionId: string;
    classIds?: string[];
  };
  const tenantId = getTenantObjectId(req);
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Subject } = getTenantModels(tenantDb);
  await requireSession(sessionId, false, tenantId, undefined, tenantDb);
  await ensureClassesInSession(classIds ?? [], sessionId, tenantId, tenantDb);



  const existing = await Subject.findOne(scopeQuery(req, { sessionId, code: code.toUpperCase(), isArchived: false }));
  if (existing) throw ApiError.conflict('A subject with this code already exists in this session', 'SUBJECT_CODE_TAKEN');

  try {
    const doc = await Subject.create({
      tenantId,
      name,
      code: code.toUpperCase(),
      sessionId,
      classIds: classIds ?? [],
    });

    recordAudit('subjects', 'SUBJECT_CREATED', req.user, String(doc._id), { name: doc.name });
    created(res, publicSubject(doc));
  } catch (err: any) {
    if (err?.code === 11000 || err?.message?.includes('E11000')) {
      throw ApiError.conflict('A subject with this code already exists in this session', 'SUBJECT_CODE_TAKEN');
    }
    throw err;
  }
});

/** PATCH /api/subjects/:id — edit + class/teacher assignment. */
export const updateSubject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Subject } = getTenantModels(tenantDb);
  const doc = await Subject.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Subject not found');
  if (doc.isArchived) throw ApiError.badRequest('Archived subjects cannot be edited');
  const tenantId = getTenantObjectId(req);

  const { name, code, classIds, isActive } = req.body as {
    name?: string;
    code?: string;
    classIds?: string[];
    isActive?: boolean;
  };

  if (code) {
    const dup = await Subject.findOne(scopeQuery(req, { sessionId: doc.sessionId, code: code.toUpperCase(), isArchived: false, _id: { $ne: doc._id } }));
    if (dup) throw ApiError.conflict('A subject with this code already exists in this session', 'SUBJECT_CODE_TAKEN');
  }

  if (classIds) await ensureClassesInSession(classIds, String(doc.sessionId), tenantId, tenantDb);

  if (name !== undefined) doc.name = name;
  if (code !== undefined) doc.code = code.toUpperCase();
  if (classIds !== undefined) doc.classIds = classIds as never;
  if (isActive !== undefined) doc.isActive = isActive;

  try {
    await doc.save();
  } catch (err: any) {
    if (err?.code === 11000 || err?.message?.includes('E11000')) {
      throw ApiError.conflict('A subject with this code already exists in this session', 'SUBJECT_CODE_TAKEN');
    }
    throw err;
  }

  recordAudit('subjects', 'SUBJECT_UPDATED', req.user, String(doc._id), { name: doc.name });
  ok(res, publicSubject(doc));
});

/** POST /api/subjects/:id/archive | /restore */
export const archiveSubject = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Subject } = getTenantModels(tenantDb);
  const restore = req.path.endsWith('/restore');
  const tenantId = getTenantObjectId(req);
  const doc = await Subject.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Subject not found');

  if (!restore) {
    doc.isArchived = true;
    doc.isActive = false;
  } else {
    await requireSession(String(doc.sessionId), false, tenantId, undefined, tenantDb);
    doc.isArchived = false;
    doc.isActive = true;
  }

  try {
    await doc.save();
  } catch (err: any) {
    if (err?.code === 11000 || err?.message?.includes('E11000')) {
      throw ApiError.conflict('An active subject with this code already exists in this academic session', 'SUBJECT_CODE_TAKEN');
    }
    throw err;
  }

  recordAudit('subjects', restore ? 'SUBJECT_RESTORED' : 'SUBJECT_ARCHIVED', req.user, String(doc._id), { name: doc.name });
  ok(res, publicSubject(doc));
});
