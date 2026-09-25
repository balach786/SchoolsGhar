import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate, requirePermission } from '../middleware/auth';
import { createUserSchema, updateUserSchema, listUsersQuerySchema, searchUnlinkedPeopleQuerySchema } from '../validators/user.validators';
import { resetPasswordSchema } from '../validators/auth.validators';
import * as userController from '../controllers/user.controller';
import { resolveTenant } from '../middleware/tenant';
import { checkSubscriptionAccess } from '../middleware/subscription';

import { listRoles } from '../controllers/role.controller';
const router = Router();

router.use(authenticate, resolveTenant, checkSubscriptionAccess);

router.get('/', requirePermission('users', 'view'), validate({ query: listUsersQuerySchema }), userController.listUsers);
router.post('/', requirePermission('users', 'create'), validate({ body: createUserSchema }), userController.createUser);
router.get('/roles', requirePermission('users', 'view'), listRoles);
router.get('/unlinked-people', requirePermission('users', 'create'), validate({ query: searchUnlinkedPeopleQuerySchema }), userController.searchUnlinkedPeople);
router.get('/:id', requirePermission('users', 'view'), userController.getUser);
router.patch('/:id', requirePermission('users', 'edit'), validate({ body: updateUserSchema }), userController.updateUser);
router.post(
  '/:id/reset-password',
  requirePermission('users', 'edit'),
  validate({ body: resetPasswordSchema }),
  userController.resetUserPassword
);
router.post('/:id/activate', requirePermission('users', 'edit'), userController.activateUser);
router.post('/:id/deactivate', requirePermission('users', 'edit'), userController.deactivateUser);

export default router;
