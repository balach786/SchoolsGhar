import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, paginated } from '../utils/apiResponse';
import { Notice } from '../models/Notice';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { AuthRequest } from '../types';
import { resolveNoticeScope, notifyNoticeCreated } from '../services/prompt7.service';
import { type AuthedUser } from '../services/attendance.service';
import { recordAudit } from '../services/audit.service';
import { requireTenantId, scopeQuery } from '../utils/tenantScope';
import mongoose from 'mongoose';
import { getTenantModels } from '../services/TenantModelRegistry';

const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

export const listNotices = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Notice, Class, Section } = getTenantModels(tenantDb);

  const user = req.user as unknown as AuthedUser;
  const tenantId = requireTenantId(req);
  const filter = await resolveNoticeScope(user, tenantDb);
  filter.tenantId = tenantId;
  const authUser = user as any;
  const canManageNotices = authUser.isPlatformAdmin || (authUser.permissions?.['notices']?.some((a: string) => ['create', 'edit', 'archive'].includes(a)));

  if (req.query.audienceType && canManageNotices) {
    filter.audienceType = req.query.audienceType;
  }
  if (req.query.includeArchived === 'true' && canManageNotices) {
    delete filter.isArchived;
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    Notice.find(filter).sort({ isPinned: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notice.countDocuments(filter),
  ]);
  const classIds = [...new Set(docs.map((d) => d.classId).filter(Boolean).map(String))];
  const sectionIds = [...new Set(docs.map((d) => d.sectionId).filter(Boolean).map(String))];
  const [classes, sections] = await Promise.all([
    Class.find({ tenantId, _id: { $in: classIds } }).select('name').lean(),
    Section.find({ tenantId, _id: { $in: sectionIds } }).select('name').lean(),
  ]);
  const classMap = new Map(classes.map((c) => [String(c._id), c.name]));
  const sectionMap = new Map(sections.map((s) => [String(s._id), s.name]));

  paginated(res, {
    data: docs.map((d) => ({
      _id: String(d._id),
      title: d.title,
      body: d.body,
      audienceType: d.audienceType,
      className: d.classId ? classMap.get(String(d.classId)) ?? null : null,
      sectionName: d.sectionId ? sectionMap.get(String(d.sectionId)) ?? null : null,
      isPinned: d.isPinned,
      isImportant: d.isImportant,
      expiresAt: d.expiresAt ? new Date(d.expiresAt).toISOString() : null,
      isArchived: d.isArchived,
      createdAt: d.createdAt,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

/** POST /api/notices — admins only (notices.create). */
export const createNotice = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Notice, Class, Section } = getTenantModels(tenantDb);

  const tenantId = requireTenantId(req);
  if (req.body.classId) {
    const cls = await Class.findOne({ _id: req.body.classId, tenantId });
    if (!cls) throw ApiError.notFound('Class not found');
  }
  if (req.body.sectionId) {
    const section = await Section.findOne({ _id: req.body.sectionId, tenantId });
    if (!section) throw ApiError.notFound('Section not found');
  }
  // Explicit mass-assignment whitelist (extra keys are already rejected by the strict schema).
  const doc = await Notice.create({
    tenantId,
    title: req.body.title,
    body: req.body.body,
    audienceType: req.body.audienceType,
    classId: req.body.classId ?? undefined,
    sectionId: req.body.sectionId ?? undefined,
    isPinned: req.body.isPinned ?? false,
    isImportant: req.body.isImportant ?? false,
    expiresAt: req.body.expiresAt ?? undefined,
    createdBy: req.user!._id,
  });
  notifyNoticeCreated(doc, tenantDb);
  recordAudit('notices', 'NOTICE_CREATED', req.user!, String(doc._id), {
    title: doc.title,
    audienceType: doc.audienceType,
  });
  ok(res, {
    _id: String(doc._id),
    title: doc.title,
    body: doc.body,
    audienceType: doc.audienceType,
    isPinned: doc.isPinned,
    isImportant: doc.isImportant,
    expiresAt: doc.expiresAt ?? null,
    createdAt: doc.createdAt,
  }, 201, { message: 'Notice published' });
});

/** PATCH /api/notices/:id — admins only. */
export const updateNotice = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Notice } = getTenantModels(tenantDb);

  const doc = await Notice.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Notice not found');
  const allowed = ['title', 'body', 'audienceType', 'classId', 'sectionId', 'isPinned', 'isImportant', 'expiresAt'] as const;
  for (const key of allowed) {
    if (req.body[key] !== undefined) (doc as any)[key] = req.body[key];
  }
  await doc.save();
  recordAudit('notices', 'NOTICE_UPDATED', req.user, String(doc._id));
  ok(res, { _id: String(doc._id), title: doc.title, updatedAt: doc.updatedAt });
});

/** POST /api/notices/:id/archive — hide a notice. */
export const archiveNotice = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Notice } = getTenantModels(tenantDb);

  const doc = await Notice.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Notice not found');
  doc.isArchived = true;
  await doc.save();
  recordAudit('notices', 'NOTICE_ARCHIVED', req.user, String(doc._id));
  ok(res, { _id: String(doc._id), isArchived: true }, 200, { message: 'Notice archived' });
});

/** POST /api/notices/:id/publish — make an archived notice live again. */
export const publishNotice = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Notice } = getTenantModels(tenantDb);

  const doc = await Notice.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Notice not found');
  doc.isArchived = false;
  await doc.save();
  recordAudit('notices', 'NOTICE_PUBLISHED', req.user, String(doc._id));
  ok(res, { _id: String(doc._id), isArchived: false }, 200, { message: 'Notice published' });
});
