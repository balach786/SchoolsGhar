import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import mongoose from 'mongoose';
import { getTenantModels } from '../services/TenantModelRegistry';
import { ok } from '../utils/apiResponse';
import { AuthRequest } from '../types';
import { getTenantObjectId } from '../utils/tenantScope';
import { getOrCreateFeeSettings } from '../services/feeManagement.service';
import { publicFeeSetting } from '../models/FeeSetting';
import { recordAudit } from '../services/audit.service';

/** GET /api/fee-settings */
export const getFeeSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const tenantId = getTenantObjectId(req);
  if (!tenantId) throw ApiError.badRequest('Tenant context required');

  const settings = await getOrCreateFeeSettings(tenantId, tenantDb);
  ok(res, publicFeeSetting(settings));
});

/** PATCH /api/fee-settings */
export const updateFeeSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = (req as any).tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'tenantDb connection is required', 'TENANT_DB_MISSING');
  const { FeeStructure, StudentFee, Payment, FeeSetting, FeeDiscount, Class, AcademicSession, Student, Section } = getTenantModels(tenantDb);

  const tenantId = getTenantObjectId(req);
  if (!tenantId) throw ApiError.badRequest('Tenant context required');

  const settings = await getOrCreateFeeSettings(tenantId, tenantDb);

  if (req.body.admissionFee) {
    if (req.body.admissionFee.enabled !== undefined) settings.admissionFee.enabled = req.body.admissionFee.enabled;
    if (req.body.admissionFee.allowReAdmission !== undefined) settings.admissionFee.allowReAdmission = req.body.admissionFee.allowReAdmission;
  }

  if (req.body.otherFee) {
    if (req.body.otherFee.enabled !== undefined) settings.otherFee.enabled = req.body.otherFee.enabled;
    if (req.body.otherFee.feeName !== undefined) settings.otherFee.feeName = req.body.otherFee.feeName;
    if (req.body.otherFee.defaultAmount !== undefined) settings.otherFee.defaultAmount = req.body.otherFee.defaultAmount;
  }

  if (req.body.lateFee) {
    if (req.body.lateFee.enabled !== undefined) settings.lateFee.enabled = req.body.lateFee.enabled;
    if (req.body.lateFee.lateFeeAmount !== undefined) settings.lateFee.lateFeeAmount = req.body.lateFee.lateFeeAmount;
    if (req.body.lateFee.gracePeriodDays !== undefined) settings.lateFee.gracePeriodDays = req.body.lateFee.gracePeriodDays;
  }

  if (req.body.dueDate) {
    if (req.body.dueDate.enabled !== undefined) settings.dueDate.enabled = req.body.dueDate.enabled;
    if (req.body.dueDate.defaultMonthlyDueDay !== undefined) settings.dueDate.defaultMonthlyDueDay = req.body.dueDate.defaultMonthlyDueDay;
  }

  if (req.body.discount) {
    if (req.body.discount.enabled !== undefined) settings.discount.enabled = req.body.discount.enabled;
    if (req.body.discount.allowDiscountStacking !== undefined) settings.discount.allowDiscountStacking = req.body.discount.allowDiscountStacking;
  }

  settings.updatedBy = req.user?._id as any;
  await settings.save();

  recordAudit('fees', 'FEE_SETTINGS_UPDATED', req.user, String(settings._id), {
    admissionEnabled: settings.admissionFee.enabled,
    otherFeeEnabled: settings.otherFee.enabled,
    lateFeeEnabled: settings.lateFee.enabled,
    dueDateEnabled: settings.dueDate.enabled,
  });

  ok(res, publicFeeSetting(settings), 200, { message: 'Fee settings updated successfully' });
});
