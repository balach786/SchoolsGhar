import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { SchoolClosure } from '../models/SchoolClosure';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

/** GET /api/school-closures */
export const getClosures = asyncHandler(async (req: Request, res: Response) => {
  const month = req.query.month as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const filter: Record<string, any> = {};

  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    filter.dateString = { $regex: `^${month}-` };
  } else if (from || to) {
    filter.dateString = {};
    if (from) filter.dateString.$gte = from;
    if (to) filter.dateString.$lte = to;
  }

  const closures = await SchoolClosure.find(scopeQuery(req, filter))
    .sort({ dateString: 1 })
    .lean();

  res.json({
    success: true,
    data: closures,
  });
});

/** POST /api/school-closures */
export const setClosure = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantObjectId(req);
  const user = req.user as any;
  const { dateString, type, reason, reasonCategory, notes, applicableTo = 'all' } = req.body;

  if (!dateString || !type || !reason) {
    throw ApiError.badRequest('dateString, type, and reason are required');
  }

  const date = new Date(`${dateString}T00:00:00.000Z`);

  const closure = await SchoolClosure.findOneAndUpdate(
    scopeQuery(req, { dateString, applicableTo }),
    {
      $set: {
        tenantId,
        date,
        dateString,
        type,
        reason,
        reasonCategory: reasonCategory || 'other',
        notes: notes || '',
        applicableTo,
        createdBy: user?._id,
      },
    },
    { upsert: true, new: true }
  );

  res.status(200).json({
    success: true,
    message: `School ${type === 'official_leave' ? 'official holiday' : 'closure'} saved for ${dateString}`,
    data: closure,
  });
});

/** DELETE /api/school-closures/:idOrDate */
export const deleteClosure = asyncHandler(async (req: Request, res: Response) => {
  const { idOrDate } = req.params;

  let filter: Record<string, any>;
  if (/^\d{4}-\d{2}-\d{2}$/.test(idOrDate)) {
    filter = { dateString: idOrDate };
  } else {
    filter = { _id: idOrDate };
  }

  const result = await SchoolClosure.findOneAndDelete(scopeQuery(req, filter));
  if (!result) {
    throw ApiError.notFound('Closure record not found');
  }

  res.json({
    success: true,
    message: 'Holiday / closure removed successfully',
    data: { dateString: result.dateString },
  });
});
