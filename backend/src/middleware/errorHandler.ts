import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError, ZodSchema } from 'zod';
import { ApiError } from '../utils/ApiError';
import { fail } from '../utils/apiResponse';
import { isProd } from '../config/env';
import { logger } from '../utils/logger';

/** Centralized error handler — last middleware in the chain. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // Validation errors (zod or mongoose)
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    fail(res, 422, 'VALIDATION_ERROR', 'Validation failed', details);
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    fail(res, 422, 'VALIDATION_ERROR', 'Validation failed', details);
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    fail(res, 400, 'INVALID_ID', `Invalid identifier: ${err.path}`);
    return;
  }

  // Duplicate key (unique index violation)
  if (err instanceof Error && 'code' in err && (err as { code?: number }).code === 11000) {
    const keyPattern = (err as any).keyPattern || {};
    const keyValue = (err as any).keyValue || {};
    if (keyPattern.rollNumber || (err.message && err.message.includes('rollNumber'))) {
      fail(res, 409, 'ROLL_NUMBER_TAKEN', `Roll number "${keyValue.rollNumber || ''}" is already taken in this section/class`, { field: 'rollNumber' });
      return;
    }
    if (keyPattern.admissionNumber || (err.message && err.message.includes('admissionNumber'))) {
      fail(res, 409, 'DUPLICATE_ADMISSION_NUMBER', `Admission number "${keyValue.admissionNumber || ''}" already exists in this school`, { field: 'admissionNumber' });
      return;
    }
    if (keyPattern.version || (err.message && err.message.includes('version'))) {
      fail(res, 409, 'RESULT_VERSION_COLLISION', 'A published result with this version already exists for the student. Please retry.', { field: 'version' });
      return;
    }
    if (keyPattern.receiptNumber || (err.message && err.message.includes('receiptNumber'))) {
      fail(res, 409, 'DUPLICATE_RECEIPT_NUMBER', `Receipt number "${keyValue.receiptNumber || ''}" already exists.`, { field: 'receiptNumber' });
      return;
    }
    fail(res, 409, 'DUPLICATE', 'A record with the same unique value already exists');
    return;
  }

  // Known API errors
  if (err instanceof ApiError) {
    fail(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  // Express body-parser JSON syntax errors
  if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
    fail(res, 400, 'INVALID_JSON', 'Malformed JSON body');
    return;
  }

  // Body size limit exceeded (express.json 1 MB)
  if (err instanceof Error && 'type' in err && (err as { type?: string }).type === 'entity.too.large') {
    fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
    return;
  }

  // Everything else — log fully, respond safely
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  if (isProd) {
    fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again later.');
  } else {
    const message = err instanceof Error ? err.message : 'Unknown error';
    fail(res, 500, 'INTERNAL_ERROR', `Internal error: ${message}`);
  }
}

/** 404 fallback for unknown routes (mounted after all routers). */
export function notFoundHandler(req: Request, res: Response): void {
  fail(res, 404, 'ROUTE_NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`);
}
