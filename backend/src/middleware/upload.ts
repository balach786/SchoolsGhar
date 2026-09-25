import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { randomToken } from '../utils/id';

// Ensure proofs directory exists
const proofsDir = path.join(env.uploadDir, 'proofs');
if (!fs.existsSync(proofsDir)) {
  fs.mkdirSync(proofsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, proofsDir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const key = `proof-${Date.now()}-${randomToken(8)}${ext}`;
    cb(null, key);
  },
});

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      ApiError.badRequest(
        'Invalid file type. Allowed formats: JPEG, PNG, WEBP, PDF.',
        'INVALID_FILE_TYPE'
      )
    );
  }
  cb(null, true);
}

import { validateFileMagicBytes } from '../controllers/file.controller';

const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: env.paymentProofMaxSize,
  },
  fileFilter,
}).single('proof');

export const uploadPaymentProof = (req: Request, res: any, next: any) => {
  uploadMiddleware(req, res, (err: any) => {
    if (err) return next(err);
    if (req.file) {
      const isValidMagic = validateFileMagicBytes(req.file.path, req.file.mimetype);
      if (!isValidMagic) {
        // Remove fraudulent file from disk immediately
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
        return next(
          ApiError.badRequest(
            'File content does not match the claimed file extension/MIME signature.',
            'INVALID_FILE_SIGNATURE'
          )
        );
      }
    }
    next();
  });
};
