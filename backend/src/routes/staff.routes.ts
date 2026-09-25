import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { checkSubscriptionAccess } from '../middleware/subscription';
import * as staffController from '../controllers/staff.controller';

const router = Router();

router.use(authenticate, resolveTenant, checkSubscriptionAccess);

// Staff directory & HR management
router.get('/', requirePermission('users', 'view'), staffController.listStaff);
router.post('/', requirePermission('users', 'create'), staffController.createStaff);
router.get('/:id', requirePermission('users', 'view'), staffController.getStaff);
router.patch('/:id', requirePermission('users', 'edit'), staffController.updateStaff);
router.post('/:id/archive', requirePermission('users', 'edit'), staffController.archiveStaff);
router.post('/:id/restore', requirePermission('users', 'edit'), staffController.archiveStaff);

export default router;
