import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate, requirePermission, requirePlatformAdmin } from '../middleware/auth';
import { DataTransferController } from '../controllers/dataTransfer.controller';

const router = Router();

// In-memory file storage for spreadsheet processing (zero disk, zero MongoDB storage)
const uploadSpreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB maximum file size limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.csv') {
      return cb(null, true);
    }
    return cb(new Error('Invalid file type. Only Excel (.xlsx) and CSV (.csv) files are permitted.'));
  },
});

// All routes require authentication
router.use(authenticate);

// Tenant-level full backup & export (Mode A & Mode B)
router.get(
  '/tenant-export/school-data',
  DataTransferController.exportTenantSchoolData
);

router.get(
  '/tenant-export/internal-recovery',
  requirePlatformAdmin,
  DataTransferController.exportTenantInternalRecovery
);

// Template downloads
router.get(
  '/template/:module',
  requirePermission('dataManagement', 'view'),
  DataTransferController.downloadTemplate
);

// Data exports
router.get(
  '/export/:module',
  requirePermission('dataManagement', 'export'),
  DataTransferController.exportData
);

// Import Preview (Read-Only)
router.post(
  '/import/preview/:module',
  requirePermission('dataManagement', 'import'),
  uploadSpreadsheet.single('file'),
  DataTransferController.previewImport
);

// Import Execution
router.post(
  '/import/confirm/:module',
  requirePermission('dataManagement', 'import'),
  uploadSpreadsheet.single('file'),
  DataTransferController.confirmImport
);

// Download Error Sheet
router.post(
  '/import/error-sheet',
  requirePermission('dataManagement', 'view'),
  DataTransferController.downloadErrorSheet
);

// History & Presets
router.get(
  '/history',
  requirePermission('dataManagement', 'view'),
  DataTransferController.getHistory
);

router.get(
  '/presets',
  requirePermission('dataManagement', 'view'),
  DataTransferController.getPresets
);

router.post(
  '/presets',
  requirePermission('dataManagement', 'export'),
  DataTransferController.savePreset
);

router.delete(
  '/presets/:id',
  requirePermission('dataManagement', 'export'),
  DataTransferController.deletePreset
);

export default router;
