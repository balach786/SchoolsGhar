import { Response } from 'express';
import { AuthRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { paginated, ok, created } from '../utils/apiResponse';
import { publicGradeScale } from '../models/GradeScale';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';
import { getTenantModels } from '../services/TenantModelRegistry';
import mongoose from 'mongoose';

const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

function validateBoundaries(boundaries: { grade: string; minPercentage: number }[]): void {
  for (let i = 0; i < boundaries.length; i++) {
    if (i > 0 && boundaries[i].minPercentage >= boundaries[i - 1].minPercentage) {
      throw ApiError.unprocessable(
        'Grade boundaries must be sorted from highest to lowest minPercentage',
        'GRADE_BOUNDARIES_UNSORTED'
      );
    }
  }
}

/** GET /api/grade-scales */
export const listGradeScales = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { GradeScale } = getTenantModels(tenantDb);

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;

  const filter = scopeQuery(req, {});

  let [docs, total] = await Promise.all([
    GradeScale.find(filter).sort({ isDefault: -1, name: 1 }).skip(skip).limit(limit).lean(),
    GradeScale.countDocuments(filter),
  ]);

  if (total === 0) {
    const tenantId = getTenantObjectId(req);
    if (tenantId) {
      const created = await GradeScale.create({
        tenantId,
        name: 'Standard Grading (A+ to F)',
        isDefault: true,
        boundaries: [
          { grade: 'A+', minPercentage: 90 },
          { grade: 'A', minPercentage: 80 },
          { grade: 'B', minPercentage: 70 },
          { grade: 'C', minPercentage: 60 },
          { grade: 'D', minPercentage: 50 },
          { grade: 'E', minPercentage: 40 },
          { grade: 'F', minPercentage: 0 },
        ],
      });
      docs = [created.toObject() as any];
      total = 1;
    }
  }
  paginated(res, {
    data: docs.map((d) => publicGradeScale(d as never)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

/** POST /api/grade-scales */
export const createGradeScale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { GradeScale } = getTenantModels(tenantDb);

  const { name, boundaries } = req.body;
  validateBoundaries(boundaries);
  const tenantId = getTenantObjectId(req);

  const existing = await GradeScale.findOne(scopeQuery(req, {
    name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  })).select('_id').lean();
  if (existing) throw ApiError.conflict('A grade scale with this name already exists in this school', 'GRADE_SCALE_EXISTS');

  const doc = await GradeScale.create({ tenantId, name, boundaries, isDefault: false });
  created(res, publicGradeScale(doc as never), { message: 'Grade scale created' });
});

/** GET /api/grade-scales/:id */
export const getGradeScale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { GradeScale } = getTenantModels(tenantDb);

  const doc = await GradeScale.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Grade scale not found');
  ok(res, publicGradeScale(doc as never));
});

/** PATCH /api/grade-scales/:id */
export const updateGradeScale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { GradeScale } = getTenantModels(tenantDb);

  const doc = await GradeScale.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Grade scale not found');

  if (req.body.name !== undefined) doc.name = req.body.name;
  if (req.body.boundaries !== undefined) {
    validateBoundaries(req.body.boundaries);
    doc.boundaries = req.body.boundaries;
  }
  await doc.save();
  ok(res, publicGradeScale(doc as never), 200, { message: 'Grade scale updated' });
});

/** POST /api/grade-scales/:id/set-default — safe switch, only ONE default per tenant. */
export const setDefaultGradeScale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { GradeScale } = getTenantModels(tenantDb);

  const doc = await GradeScale.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Grade scale not found');

  await GradeScale.updateMany(scopeQuery(req, { _id: { $ne: doc._id } }), { $set: { isDefault: false } });
  doc.isDefault = true;
  await doc.save();
  ok(res, publicGradeScale(doc as never), 200, { message: 'Default grade scale updated' });
});
