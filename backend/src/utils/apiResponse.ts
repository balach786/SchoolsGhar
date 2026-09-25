import { Response } from 'express';
import { Paginated } from '../types';

/**
 * Uniform API envelope:
 *   success: true  → { success, data, ...extra }
 *   success: false → { success, error: { code, message, details } }
 * Never include secrets, stack traces, or internal state.
 */
export const ok = (res: Response, data: unknown, status = 200, extra?: Record<string, unknown>) => {
  return res.status(status).json({ success: true, data, ...(extra ?? {}) });
};

export const created = (res: Response, data: unknown, extra?: Record<string, unknown>) => {
  return ok(res, data, 201, extra);
};

export const noContent = (res: Response) => {
  return res.status(204).send();
};

/** Paginated response shape: { success, data: [...], pagination } */
export const paginated = <T>(res: Response, result: Paginated<T>) => {
  return res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
    ...(result.summary !== undefined ? { summary: result.summary } : {}),
  });
};

export const fail = (
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
) => {
  return res.status(status).json({
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  });
};
