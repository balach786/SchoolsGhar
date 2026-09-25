import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  createRoleSchema,
  updateRoleSchema,
  updateRolePermissionsSchema,
} from '../validators/user.validators';
import * as roleController from '../controllers/role.controller';

import { resolveTenant } from '../middleware/tenant';
import { checkSubscriptionAccess } from '../middleware/subscription';
const router = Router();

router.use(authenticate, resolveTenant, checkSubscriptionAccess);

router.get('/', requirePermission('roles', 'view'), roleController.listRoles);
router.post('/', requirePermission('roles', 'create'), validate({ body: createRoleSchema }), roleController.createRole);
router.get('/:id', requirePermission('roles', 'view'), roleController.getRole);
router.patch('/:id', requirePermission('roles', 'edit'), validate({ body: updateRoleSchema }), roleController.updateRole);
router.put(
  '/:id/permissions',
  requirePermission('roles', 'edit'),
  validate({ body: updateRolePermissionsSchema }),
  roleController.updateRolePermissions
);
router.get('/:id/users', requirePermission('roles', 'view'), roleController.roleUsers);

export default router;
