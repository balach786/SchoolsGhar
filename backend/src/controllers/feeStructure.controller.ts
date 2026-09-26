import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import mongoose from 'mongoose';
import { getTenantModels } from '../services/TenantModelRegistry';
import { paginated, ok, created } from '../utils/apiResponse';
import { publicFeeStructure } from '../models/FeeStructure';
import { resolveFeeContext } from '../services/finance.service';
import { recordAudit } from '../services/audit.service';
import { AuthRequest } from '../types';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';
import { generateStudentFeesWithSnapshot, resolveBillingYearForSession } from '../services/feeManagement.service';

const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

async function resolveNames(req: Request, docs: any[]) {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const ids = (key: string) => Array.from(new Set(docs.map((d) => d[key]).filter(Boolean).map((v: unknown) => String(v))));
  const [classes, sessions] = await Promise.all([
    Class.find(scopeQuery(req, { _id: { $in: ids('classId') } })).select('name').lean(),
    AcademicSession.find(scopeQuery(req, { _id: { $in: ids('sessionId') } })).select('name').lean(),
  ]);
  return {
    classMap: new Map(classes.map((c) => [String(c._id), c.name])),
    sessionMap: new Map(sessions.map((s) => [String(s._id), s.name])),
  };
}

function withNames(d: any, names: { classMap: Map<string, string>; sessionMap: Map<string, string> }) {
  return {
    ...publicFeeStructure(d),
    className: names.classMap.get(String(d.classId)) ?? '—',
    sessionName: names.sessionMap.get(String(d.sessionId)) ?? '—',
  };
}

/** GET /api/fee-structures */
export const listFeeStructures = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;

  let filter: Record<string, any> = {};
  if (req.query.sessionId) filter.sessionId = req.query.sessionId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.feeType) filter.feeType = req.query.feeType;
  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'inactive') filter.isActive = false;
  if (req.query.status === 'archived') filter.isArchived = true;
  else filter.isArchived = false;
  if (req.query.search) filter.title = { $regex: String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

  filter = scopeQuery(req, filter);

  const [docs, total] = await Promise.all([
    FeeStructure.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    FeeStructure.countDocuments(filter),
  ]);
  const names = await resolveNames(req, docs);
  paginated(res, {
    data: docs.map((d) => withNames(d, names)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

/** POST /api/fee-structures */
export const createFeeStructure = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  let { sessionId, classId, feeType, title, amount, month, effectiveFromMonth, effectiveFromYear, dueDate, description, isActive } = req.body;
  const tenantId = getTenantObjectId(req);
  await resolveFeeContext(sessionId, classId, undefined, tenantId, tenantDb);

  // If monthly_tuition and "All Months" is selected, create 12 structures
  if (feeType === 'monthly_tuition' && (month === null || month === undefined)) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Validate uniqueness for all 12 months
    const existing = await FeeStructure.findOne(scopeQuery(req, {
      sessionId,
      classId,
      feeType,
      month: { $in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }
    })).select('_id').lean();
    if (existing) throw ApiError.conflict('One or more monthly structures already exist for this class', 'FEE_STRUCTURE_EXISTS');

    const promises = months.map((mName, i) => {
      const mNum = i + 1;
      return FeeStructure.create({
        tenantId,
        sessionId,
        classId,
        feeType,
        title: `${mName} Tuition`,
        amount,
        month: mNum,
        effectiveFromMonth: effectiveFromMonth ?? null,
        effectiveFromYear: effectiveFromYear ?? null,
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
        ...(description ? { description } : {}),
        isActive: isActive ?? true,
        createdBy: req.user?._id,
      });
    });

    const docs = await Promise.all(promises);
    recordAudit('fees', 'FEE_STRUCTURE_CREATED', req.user, 'batch', { type: 'all_months', classId, amount });
    return created(res, { count: docs.length }, { message: '12 Fee structures created' });
  }

  // Handle single structure creation
  if (feeType === 'monthly_tuition') {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (month && month >= 1 && month <= 12) {
      title = `${months[month - 1]} Tuition`;
    } else {
      title = 'Monthly Tuition';
    }
  }

  let existingQuery: Record<string, any> = {
    sessionId,
    classId,
    feeType,
  };
  
  if (feeType === 'monthly_tuition') {
    existingQuery.month = month ?? null;
  } else {
    existingQuery.month = month ?? null;
    existingQuery.title = { $regex: new RegExp(`^${String(title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
    existingQuery.effectiveFromMonth = effectiveFromMonth ?? null;
    existingQuery.effectiveFromYear = effectiveFromYear ?? null;
  }

  const existing = await FeeStructure.findOne(scopeQuery(req, existingQuery)).select('_id').lean();
  if (existing) throw ApiError.conflict('An identical fee structure already exists for this class', 'FEE_STRUCTURE_EXISTS');

  const doc = await FeeStructure.create({
    tenantId,
    sessionId,
    classId,
    feeType,
    title,
    amount,
    month: month ?? null,
    effectiveFromMonth: effectiveFromMonth ?? null,
    effectiveFromYear: effectiveFromYear ?? null,
    ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
    ...(description ? { description } : {}),
    isActive: isActive ?? true,
    createdBy: req.user?._id,
  });

  let invoiceGeneration = undefined;
  if (doc.feeType === 'monthly_tuition' && doc.month) {
    const sessionDoc = await AcademicSession.findById(sessionId).lean();
    if (sessionDoc) {
      const resolvedBillingYear = resolveBillingYearForSession(sessionDoc, doc.month);
      try {
        const stats = await generateStudentFeesWithSnapshot(
          req.user!,
          {
            sessionId: String(doc.sessionId),
            classId: String(doc.classId),
            feeStructureId: String(doc._id),
            month: doc.month,
            year: resolvedBillingYear
          },
          tenantDb
        );
        invoiceGeneration = {
          success: true,
          created: stats.created,
          skipped: stats.skipped,
          month: doc.month,
          year: resolvedBillingYear
        };
      } catch (e: any) {
        console.error('Auto-generation of student fees failed:', e);
        invoiceGeneration = {
          success: false,
          created: 0,
          skipped: 0,
          errorCode: e.code || e.name || 'UNKNOWN_ERROR',
        };
      }
    }
  }

  recordAudit('fees', 'FEE_STRUCTURE_CREATED', req.user, String(doc._id), { title, amount });
  
  const publicRes = publicFeeStructure(doc as never) as any;
  if (invoiceGeneration) {
    publicRes.invoiceGeneration = invoiceGeneration;
  }
  
  created(res, publicRes, { message: 'Fee structure created' });
});

/** GET /api/fee-structures/:id */
export const getFeeStructure = asyncHandler(async (req: Request, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const doc = await FeeStructure.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Fee structure not found');
  const names = await resolveNames(req, [doc]);
  ok(res, withNames(doc, names));
});

/** PATCH /api/fee-structures/:id */
export const updateFeeStructure = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const doc = await FeeStructure.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Fee structure not found');
  if (doc.isArchived) throw ApiError.badRequest('Archived fee structures cannot be edited', 'FEE_STRUCTURE_ARCHIVED');

  if (req.body.title !== undefined && doc.feeType !== 'monthly_tuition') doc.title = req.body.title;
  if (req.body.amount !== undefined) doc.amount = req.body.amount;
  if (req.body.month !== undefined) {
    doc.month = req.body.month;
    if (doc.feeType === 'monthly_tuition') {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      if (doc.month && doc.month >= 1 && doc.month <= 12) {
        doc.title = `${months[doc.month - 1]} Tuition`;
      } else {
        doc.title = 'Monthly Tuition';
      }
    }
  }
  if (req.body.dueDate !== undefined) doc.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : undefined;
  if (req.body.description !== undefined) doc.description = req.body.description;
  if (req.body.isActive !== undefined) doc.isActive = req.body.isActive;
  await doc.save();

  recordAudit('fees', 'FEE_STRUCTURE_UPDATED', req.user, String(doc._id), { title: doc.title, amount: doc.amount });
  ok(res, publicFeeStructure(doc as never), 200, { message: 'Fee structure updated' });
});

/** POST /api/fee-structures/:id/archive | /restore */
export const archiveFeeStructure = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const doc = await FeeStructure.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Fee structure not found');
  const archive = req.path.endsWith('/archive');
  doc.isArchived = archive;
  if (archive) doc.isActive = false;
  await doc.save();
  recordAudit('fees', archive ? 'FEE_STRUCTURE_ARCHIVED' : 'FEE_STRUCTURE_RESTORED', req.user, String(doc._id), { title: doc.title });
  ok(res, publicFeeStructure(doc as never), 200, { message: archive ? 'Fee structure archived' : 'Fee structure restored' });
});
