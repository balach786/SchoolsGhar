import { Response } from 'express';
import { AuthRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, created } from '../utils/apiResponse';
import { publicExamType, ensureDefaultExamTypes } from '../models/ExamType';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';
import { getTenantModels } from '../services/TenantModelRegistry';
import mongoose from 'mongoose';

/** GET /api/exam-types */
export const listExamTypes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { ExamType } = getTenantModels(tenantDb);

  const tenantId = getTenantObjectId(req);
  if (tenantId) await ensureDefaultExamTypes(tenantDb, tenantId);

  const filter: Record<string, any> = scopeQuery(req, {});
  if (req.query.activeOnly === 'true') {
    filter.isActive = true;
  }

  const docs = await ExamType.find(filter).sort({ isDefault: -1, name: 1 }).lean();
  ok(res, docs.map(publicExamType));
});

/** POST /api/exam-types */
export const createExamType = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { ExamType } = getTenantModels(tenantDb);

  const tenantId = getTenantObjectId(req);
  const { name, description, isActive } = req.body;

  const existing = await ExamType.findOne(scopeQuery(req, { name: new RegExp(`^${name.trim()}$`, 'i') })).lean();
  if (existing) {
    throw ApiError.conflict('An exam type with this name already exists', 'EXAM_TYPE_ALREADY_EXISTS');
  }

  const doc = await ExamType.create({
    tenantId,
    name: name.trim(),
    description,
    isActive: isActive ?? true,
    isDefault: false,
  });

  created(res, publicExamType(doc), { message: 'Exam type created' });
});

/** PATCH /api/exam-types/:id */
export const updateExamType = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { ExamType } = getTenantModels(tenantDb);

  const doc = await ExamType.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Exam type not found');

  if (req.body.name !== undefined) {
    const nextName = req.body.name.trim();
    const existing = await ExamType.findOne(
      scopeQuery(req, { _id: { $ne: doc._id }, name: new RegExp(`^${nextName}$`, 'i') })
    ).lean();
    if (existing) {
      throw ApiError.conflict('Another exam type with this name already exists', 'EXAM_TYPE_ALREADY_EXISTS');
    }
    doc.name = nextName;
  }

  if (req.body.description !== undefined) doc.description = req.body.description;
  if (req.body.isActive !== undefined) doc.isActive = req.body.isActive;

  await doc.save();
  ok(res, publicExamType(doc), 200, { message: 'Exam type updated' });
});

/** POST /api/exam-types/:id/toggle */
export const toggleExamType = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { ExamType } = getTenantModels(tenantDb);

  const doc = await ExamType.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Exam type not found');

  doc.isActive = !doc.isActive;
  await doc.save();
  ok(res, publicExamType(doc), 200, { message: `Exam type ${doc.isActive ? 'activated' : 'deactivated'}` });
});
