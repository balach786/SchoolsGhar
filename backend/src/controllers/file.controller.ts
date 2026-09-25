import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { SubscriptionPayment } from '../models/SubscriptionPayment';
import { storageService } from '../services/storage.service';

/**
 * Validates magic numbers for allowed MIME types.
 * Supported: JPEG, PNG, WebP, PDF.
 */
export function validateFileMagicBytes(filePathOrBuffer: string | Buffer, expectedMime: string): boolean {
  try {
    let buffer: Buffer;
    if (Buffer.isBuffer(filePathOrBuffer)) {
      buffer = filePathOrBuffer;
    } else {
      const fd = fs.openSync(filePathOrBuffer, 'r');
      buffer = Buffer.alloc(12);
      fs.readSync(fd, buffer, 0, 12, 0);
      fs.closeSync(fd);
    }

    // JPEG: FF D8 FF
    if (expectedMime === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return true;
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      expectedMime === 'image/png' &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return true;
    }
    // WebP: RIFF ... WEBP (0x52 0x49 0x46 0x46 ... 0x57 0x45 0x42 0x50)
    if (
      expectedMime === 'image/webp' &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return true;
    }
    // PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
    if (
      expectedMime === 'application/pdf' &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * GET /api/files/proofs/:key
 * Authenticated, tenant-authorized private document delivery.
 */
export const getAuthorizedProofFile = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) throw ApiError.unauthorized('Authentication required to access private files');

  const { key } = req.params;
  if (!key || typeof key !== 'string' || key.includes('..') || key.includes('/') || key.includes('\\')) {
    throw ApiError.badRequest('Invalid file key');
  }

  // Find the payment proof record in database
  const payment = await SubscriptionPayment.findOne({ proofStorageKey: key }).lean();
  if (!payment) {
    throw ApiError.notFound('Requested file does not exist');
  }

  // Authorization gate: Platform admins OR the submitting tenant
  const isPlatformAdmin = user.isPlatformAdmin || user.role === 'platform_admin';
  const isOwnerTenant = user.tenantId && String(user.tenantId) === String(payment.tenantId);

  if (!isPlatformAdmin && !isOwnerTenant) {
    throw ApiError.forbidden('You do not have permission to view this file', 'FORBIDDEN_TENANT_FILE');
  }

  const relativeKey = path.join('proofs', key);
  const streamInfo = await storageService.getStream(relativeKey);
  if (!streamInfo) {
    throw ApiError.notFound('File not found in storage');
  }

  const contentType = payment.mimeType || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // If PDF, trigger inline view or attachment
  if (contentType === 'application/pdf') {
    res.setHeader('Content-Disposition', `inline; filename="${payment.fileName || 'document.pdf'}"`);
  } else {
    res.setHeader('Content-Disposition', `inline; filename="${payment.fileName || key}"`);
  }

  streamInfo.stream.pipe(res);
});
