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

export const EXPENSE_CATEGORIES = ['Utilities', 'Maintenance', 'Stationery', 'Rent', 'Events', 'Miscellaneous', 'Other'];

/** GET /api/expenses/categories — dropdown values for the frontend. */
export const expenseCategories = asyncHandler(async (_req: Request, res: Response) => {
  ok(res, { categories: EXPENSE_CATEGORIES });
});

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

/** GET /api/expenses */
export const listExpenses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;
  const filter = scopeQuery(req, buildFilter(req.query));

  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Expense } = getTenantModels(tenantDb);
  const { publicExpense } = require('../models/Expense');

  const [docs, total] = await Promise.all([
    Expense.find(filter).sort({ date: -1 }).skip(skip).limit(limit).lean(),
    Expense.countDocuments(filter),
  ]);

  if (wantsCsv(req)) {
    return sendCsv(
      res,
      `expenses-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Category', 'Title', 'Amount (PKR)', 'Reference', 'Description'],
      docs.map((d) => [new Date(d.date).toISOString().slice(0, 10), d.category, d.title, (d.amount / 100).toFixed(2), d.reference ?? '', d.description ?? ''])
    );
  }

  paginated(res, {
    data: docs.map((d) => publicExpense(d as never)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

/** POST /api/expenses — explicit whitelist (strict schema rejects extra keys). */
export const createExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantId = getTenantObjectId(req);
  let validSessionId: mongoose.Types.ObjectId | undefined;
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Expense, AcademicSession } = getTenantModels(tenantDb);
  const { publicExpense } = require('../models/Expense');

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

  const doc = await Expense.create({
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
  recordAudit('expenses', 'EXPENSE_CREATED', req.user, String(doc._id), { title: doc.title, amount: doc.amount });
  created(res, publicExpense(doc as never), { message: 'Expense recorded' });
});

/** PATCH /api/expenses/:id */
export const updateExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Expense } = getTenantModels(tenantDb);
  const { publicExpense } = require('../models/Expense');

  const doc = await Expense.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Expense record not found');
  if (doc.isArchived) throw ApiError.badRequest('Archived expenses cannot be edited', 'EXPENSE_ARCHIVED');
  for (const key of ['category', 'title', 'amount', 'description', 'reference'] as const) {
    if (req.body[key] !== undefined) (doc as any)[key] = req.body[key];
  }
  if (req.body.date !== undefined) doc.date = new Date(req.body.date);
  await doc.save();
  recordAudit('expenses', 'EXPENSE_UPDATED', req.user, String(doc._id), { title: doc.title, amount: doc.amount });
  ok(res, publicExpense(doc as never), 200, { message: 'Expense updated' });
});

/** POST /api/expenses/:id/archive | /restore */
export const archiveExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Expense } = getTenantModels(tenantDb);
  const { publicExpense } = require('../models/Expense');

  const doc = await Expense.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Expense record not found');
  const archive = req.path.endsWith('/archive');
  doc.isArchived = archive;
  await doc.save();
  ok(res, publicExpense(doc as never), 200, { message: archive ? 'Expense archived' : 'Expense restored' });
});
