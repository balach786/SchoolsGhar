import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { cleanupSystemSchema } from '../validators/system.validators';
import * as systemController from '../controllers/system.controller';

const router = Router();

router.use(authenticate);

// Storage report vs 512 MB budget (70/80/90 % thresholds).
router.get('/system/storage', requirePermission('system', 'view'), systemController.storageReport);

// Explicit retention cleanup for compact logs (super admin only, enforced again in controller).
router.post('/system/cleanup', requirePermission('system', 'cleanup'), validate({ body: cleanupSystemSchema }), systemController.runCleanup);

export default router;
