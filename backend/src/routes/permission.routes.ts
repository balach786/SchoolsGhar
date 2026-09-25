import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { checkSubscriptionAccess } from '../middleware/subscription';
import * as permissionController from '../controllers/permission.controller';

const router = Router();

router.use(authenticate, resolveTenant, checkSubscriptionAccess);

router.get('/catalog', requirePermission('roles', 'view'), permissionController.getPermissionCatalog);

export default router;
