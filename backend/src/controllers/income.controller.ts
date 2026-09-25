import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { paginated, ok, created } from '../utils/apiResponse';
import { getTenantModels } from '../services/TenantModelRegistry';
import { recordAudit } from '../services/audit.service';
import { sendCsv, wantsCsv } from '../utils/csv';
import { AuthRequest } from '../types';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

function buildFilter(query: Record<string, any>): Record<string, any> {
  const filter: Record<string, any> = { isArchived: false };
  if (query.category) filter.category = query.category;
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = new Date(query.from);
    if (query.to) filter.date.$lte = new Date(new Date(String(query.to)).getTime() + 24 * 3600 * 1000 - 1);
  }
  if (query.search) filter.title = { $regex: String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  return filter;
}

/** GET /api/incomes */
export const listIncomes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;
  const filter = scopeQuery(req, buildFilter(req.query));

  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Income } = getTenantModels(tenantDb);
  const { publicIncome } = require('../models/Income');

  const [docs, total] = await Promise.all([
    Income.find(filter).sort({ date: -1 }).skip(skip).limit(limit).lean(),
    Income.countDocuments(filter),
  ]);

  if (wantsCsv(req)) {
    return sendCsv(
      res,
      `income-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Category', 'Title', 'Amount (PKR)', 'Reference', 'Description'],
      docs.map((d) => [new Date(d.date).toISOString().slice(0, 10), d.category, d.title, (d.amount / 100).toFixed(2), d.reference ?? '', d.description ?? ''])
    );
  }

  paginated(res, {
    data: docs.map((d) => publicIncome(d as never)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

/** POST /api/incomes — explicit whitelist (strict schema rejects extra keys). */
export const createIncome = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantId = getTenantObjectId(req);
  let validSessionId: mongoose.Types.ObjectId | undefined;
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Income, AcademicSession } = getTenantModels(tenantDb);
  const { publicIncome } = require('../models/Income');

  if (req.body.sessionId) {
    if (!mongoose.isValidObjectId(req.body.sessionId)) {
      throw ApiError.badRequest('Invalid academic session ID', 'INVALID_SESSION');
    }
    const session = await AcademicSession.findOne(
      scopeQuery(req, { _id: req.body.sessionId, isArchived: false })
    ).select('_id').lean();
    if (!session) {
      throw ApiError.badRequest('Academic session not found or does not belong to this school', 'INVALID_SESSION');
    }
    validSessionId = session._id as mongoose.Types.ObjectId;
  }

  const doc = await Income.create({
    tenantId,
    sessionId: validSessionId,
    category: req.body.category,
    title: req.body.title,
    amount: req.body.amount,
    description: req.body.description ?? undefined,
    reference: req.body.reference ?? undefined,
    date: new Date(req.body.date),
    createdBy: req.user?._id,
  });
  recordAudit('incomes', 'INCOME_CREATED', req.user, String(doc._id), { title: doc.title, amount: doc.amount });
  created(res, publicIncome(doc as never), { message: 'Income recorded' });
});

/** PATCH /api/incomes/:id */
export const updateIncome = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Income } = getTenantModels(tenantDb);
  const { publicIncome } = require('../models/Income');

  const doc = await Income.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Income record not found');
  if (doc.isArchived) throw ApiError.badRequest('Archived income cannot be edited', 'INCOME_ARCHIVED');
  for (const key of ['category', 'title', 'amount', 'description', 'reference'] as const) {
    if (req.body[key] !== undefined) (doc as any)[key] = req.body[key];
  }
  if (req.body.date !== undefined) doc.date = new Date(req.body.date);
  await doc.save();
  recordAudit('incomes', 'INCOME_UPDATED', req.user, String(doc._id), { title: doc.title, amount: doc.amount });
  ok(res, publicIncome(doc as never), 200, { message: 'Income updated' });
});

/** POST /api/incomes/:id/archive | /restore */
export const archiveIncome = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Income } = getTenantModels(tenantDb);
  const { publicIncome } = require('../models/Income');

  const doc = await Income.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Income record not found');
  const archive = req.path.endsWith('/archive');
  doc.isArchived = archive;
  await doc.save();
  ok(res, publicIncome(doc as never), 200, { message: archive ? 'Income archived' : 'Income restored' });
});
