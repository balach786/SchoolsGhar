import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { AuthRequest } from '../types';
import { getTenantId } from '../utils/tenantScope';
import { ApiError } from '../utils/ApiError';

const storage = multer.memoryStorage();

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
