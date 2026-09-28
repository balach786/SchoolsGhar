import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AuthRequest } from '../types';
import { getTenantId } from '../utils/tenantScope';
import { ApiError } from '../utils/ApiError';

const uploadDir = path.join(process.cwd(), 'uploads', 'logos');

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
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
