import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok } from '../utils/apiResponse';
import { SchoolSettings, publicSchoolSettings } from '../models/SchoolSettings';
import { AcademicSession } from '../models/AcademicSession';
import { recordAudit } from '../services/audit.service';
import { AuthRequest } from '../types';
import { getTenantObjectId, scopeQuery } from '../utils/tenantScope';

function defaultInMemorySettings(tenantId: mongoose.Types.ObjectId, defaultName = 'School Management System') {
  return {
    _id: String(tenantId),
    tenantId,
    schoolName: defaultName,
    currency: 'PKR',
    receiptPrefix: 'RCPT',
    receiptSettings: {
      showLogo: true,
      showAddress: true,
      showPhone: true,
      signatureLabel: 'Authorized Signature',
    },
    resultCardSettings: {
      showLogo: true,
      showPosition: true,
      showGrade: true,
      signatureLabel: 'Principal Signature',
    },
    themeSettings: {
      compactSidebar: false,
    },
  };
}

/** GET /api/school-settings — school branding (strictly read-only, ZERO writes). */
export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantObjectId(req);
  if (!tenantId) {
    throw ApiError.unauthorized('Tenant context is required for school settings');
  }

  const doc = await SchoolSettings.findOne({ tenantId });
  const authReq = req as AuthRequest;
  const schoolCode = authReq.tenant?.slug || '';

  if (!doc) {
    const defaultName = authReq.tenant?.name || 'School Management System';
    return ok(res, { ...publicSchoolSettings(defaultInMemorySettings(tenantId, defaultName) as never), schoolCode });
  }
  ok(res, { ...publicSchoolSettings(doc as never), schoolCode });
});

/** PATCH /api/school-settings — schoolSettings.edit (admin/super_admin). Explicit creation/update only. */
export const updateSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantId = getTenantObjectId(req);
  if (!tenantId) {
    throw ApiError.unauthorized('Tenant context is required for school settings');
  }

  let doc = await SchoolSettings.findOne({ tenantId });
  if (!doc) {
    const defaultName = req.tenant?.name || 'School Management System';
    doc = new SchoolSettings({
      _id: String(tenantId),
      tenantId,
      schoolName: defaultName,
    });
  }

  const scalars = ['schoolName', 'schoolLogoUrl', 'address', 'phone', 'email', 'website', 'principalName', 'currency', 'receiptPrefix'] as const;
  for (const key of scalars) {
    if (req.body[key] !== undefined) (doc as any)[key] = req.body[key];
  }
  if (req.body.activeSessionId !== undefined) {
    if (req.body.activeSessionId) {
      const session = await AcademicSession.findOne(scopeQuery(req, { _id: req.body.activeSessionId })).select('_id').lean();
      if (!session) throw ApiError.notFound('Academic session not found');
    }
    doc.activeSessionId = req.body.activeSessionId || undefined;
  }
  if (req.body.receiptSettings) {
    for (const key of ['showLogo', 'showAddress', 'showPhone', 'signatureLabel', 'footerText'] as const) {
      if (req.body.receiptSettings[key] !== undefined) (doc.receiptSettings as any)[key] = req.body.receiptSettings[key];
    }
  }
  if (req.body.resultCardSettings) {
    for (const key of ['showLogo', 'showPosition', 'showGrade', 'signatureLabel', 'footerText'] as const) {
      if (req.body.resultCardSettings[key] !== undefined) (doc.resultCardSettings as any)[key] = req.body.resultCardSettings[key];
    }
  }
  if (req.body.themeSettings) {
    for (const key of ['accentColor', 'compactSidebar'] as const) {
      if (req.body.themeSettings[key] !== undefined) (doc.themeSettings as any)[key] = req.body.themeSettings[key];
    }
  }

  await doc.save();
  recordAudit('schoolSettings', 'SETTINGS_UPDATED', req.user, String(doc._id), { schoolName: doc.schoolName });
  ok(res, publicSchoolSettings(doc as never), 200, { message: 'School settings updated' });
});
