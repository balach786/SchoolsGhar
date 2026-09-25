import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import mongoose from 'mongoose';
import { getTenantModels } from '../services/TenantModelRegistry';
import { ok, created, paginated } from '../utils/apiResponse';
import { AuthRequest } from '../types';
import { getTenantObjectId, scopeQuery } from '../utils/tenantScope';
import { publicFeeDiscount } from '../models/FeeDiscount';
import { recordAudit } from '../services/audit.service';

/** GET /api/fee-discounts */
export const listFeeDiscounts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const filter: Record<string, any> = {};
  if (req.query.applyTo) filter.applyTo = req.query.applyTo;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.studentId) filter.studentId = req.query.studentId;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

  const docs = await FeeDiscount.find(scopeQuery(req, filter)).sort({ createdAt: -1 }).lean();

  const studentIds = docs.map((d) => d.studentId).filter(Boolean);
  const classIds = docs.map((d) => d.classId).filter(Boolean);

  const [students, classes] = await Promise.all([
    Student.find(scopeQuery(req, { _id: { $in: studentIds } })).select('fullName admissionNumber').lean(),
    Class.find(scopeQuery(req, { _id: { $in: classIds } })).select('name').lean(),
  ]);

  const stuMap = new Map(students.map((s) => [String(s._id), s]));
  const clsMap = new Map(classes.map((c) => [String(c._id), c.name]));

  const rows = docs.map((d) => ({
    ...publicFeeDiscount(d),
    studentName: d.studentId ? stuMap.get(String(d.studentId))?.fullName ?? '—' : null,
    admissionNumber: d.studentId ? stuMap.get(String(d.studentId))?.admissionNumber ?? '—' : null,
    className: d.classId ? clsMap.get(String(d.classId)) ?? '—' : null,
  }));

  ok(res, rows);
});

/** POST /api/fee-discounts */
export const createFeeDiscount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const tenantId = getTenantObjectId(req);
  if (!tenantId) throw ApiError.badRequest('Tenant context required');

  const { name, discountType, value, applyTo, classId, studentId, isActive } = req.body;

  if (applyTo === 'class') {
    const cls = await Class.findOne(scopeQuery(req, { _id: classId }));
    if (!cls) throw ApiError.notFound('Class not found');
  }
  if (applyTo === 'student') {
    const stu = await Student.findOne(scopeQuery(req, { _id: studentId }));
    if (!stu) throw ApiError.notFound('Student not found');
  }

  const doc = await FeeDiscount.create({
    tenantId,
    name,
    discountType,
    value,
    valueBps: discountType === 'percentage' ? value : undefined,
    applyTo,
    classId: classId || undefined,
    studentId: studentId || undefined,
    isActive: isActive ?? true,
    createdBy: req.user?._id,
  });

  recordAudit('fees', 'FEE_DISCOUNT_CREATED', req.user, String(doc._id), { name, discountType, value });
  created(res, publicFeeDiscount(doc), { message: 'Fee discount policy created' });
});

/** PATCH /api/fee-discounts/:id */
export const updateFeeDiscount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const doc = await FeeDiscount.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Fee discount policy not found');

  if (req.body.name !== undefined) doc.name = req.body.name;
  if (req.body.discountType !== undefined) doc.discountType = req.body.discountType;
  if (req.body.value !== undefined) {
    doc.value = req.body.value;
    if (doc.discountType === 'percentage') doc.valueBps = req.body.value;
  }
  if (req.body.applyTo !== undefined) doc.applyTo = req.body.applyTo;
  if (req.body.classId !== undefined) doc.classId = req.body.classId || undefined;
  if (req.body.studentId !== undefined) doc.studentId = req.body.studentId || undefined;
  if (req.body.isActive !== undefined) doc.isActive = req.body.isActive;

  await doc.save();
  recordAudit('fees', 'FEE_DISCOUNT_UPDATED', req.user, String(doc._id), { name: doc.name, value: doc.value });
  ok(res, publicFeeDiscount(doc), 200, { message: 'Fee discount policy updated' });
});

/** DELETE /api/fee-discounts/:id */
export const deleteFeeDiscount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const doc = await FeeDiscount.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Fee discount policy not found');

  await FeeDiscount.deleteOne({ _id: doc._id });
  recordAudit('fees', 'FEE_DISCOUNT_DELETED', req.user, String(doc._id), { name: doc.name });
  ok(res, { deleted: true }, 200, { message: 'Fee discount policy deleted' });
});
