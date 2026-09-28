import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { AuthRequest } from '../types';
import { getTenantId } from '../utils/tenantScope';
import { ApiError } from '../utils/ApiError';

// On Vercel serverless the filesystem is read-only except /tmp.
// Use /tmp on serverless; use project-local uploads/ otherwise.
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const uploadDir = isServerless
  ? path.join(os.tmpdir(), 'uploads', 'logos')
  : path.join(process.cwd(), 'uploads', 'logos');

// Ensure directory exists — wrapped in try/catch so it never crashes the app
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch {
  // Silently ignore — the upload route will fail gracefully at runtime
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Re-ensure dir at request time in case /tmp was purged
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
    } catch { /* noop */ }
    cb(null, uploadDir);
  },
  filename: (req: AuthRequest, file, cb) => {
    const tenantId = getTenantId(req) || 'unknown';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo-${tenantId}-${timestamp}${ext}`);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Invalid file type. Only JPEG, PNG and WEBP are allowed.') as any, false);
  }
};

export const uploadLogo = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max
  },
  fileFilter,
});
