import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate, requirePermission } from '../middleware/auth';
import { listAuditQuerySchema } from '../validators/user.validators';
import * as auditController from '../controllers/audit.controller';
import { resolveTenant } from '../middleware/tenant';
import { checkSubscriptionAccess } from '../middleware/subscription';

const router = Router();

router.use(authenticate, resolveTenant, checkSubscriptionAccess);

router.get('/', requirePermission('auditLogs', 'view'), validate({ query: listAuditQuerySchema }), auditController.listAuditLogs);
router.get('/filters', requirePermission('auditLogs', 'view'), auditController.auditFilters);

export default router;
