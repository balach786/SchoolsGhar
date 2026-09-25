import { Router } from 'express';
import { authenticate, requirePlatformAdmin } from '../middleware/auth';
import {
  platformLogin,
  getDashboardMetrics,
  listCustomers,
  getCustomerDetails,
  extendCustomerSubscription,
  suspendCustomer,
  unsuspendCustomer,
  softDeleteCustomer,
  hardDeleteCustomer,
  listPaymentRequests,
  approvePayment,
  rejectPayment,
  listAllPlans,
  createPlan,
  updatePlan,
  deletePlan,
  listAllPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  listPlatformNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  changeSchoolCode,
} from '../controllers/platformAdmin.controller';

const router = Router();

// Public Platform Login
router.post('/auth/login', platformLogin);

// Protected Platform Admin Routes
router.use(authenticate, requirePlatformAdmin);

router.get('/dashboard', getDashboardMetrics);

// Customer & School Management
router.get('/customers', listCustomers);
router.get('/customers/:id', getCustomerDetails);
router.post('/customers/:id/extend', extendCustomerSubscription);
router.post('/customers/:id/suspend', suspendCustomer);
router.post('/customers/:id/unsuspend', unsuspendCustomer);
router.post('/customers/:id/soft-delete', softDeleteCustomer);
router.post('/customers/:id/hard-delete', hardDeleteCustomer);
router.post('/customers/:id/change-code', changeSchoolCode);

// Payment Review & Verification
router.get('/payments', listPaymentRequests);
router.post('/payments/:id/approve', approvePayment);
router.post('/payments/:id/reject', rejectPayment);

// Plans Management
router.get('/plans', listAllPlans);
router.post('/plans', createPlan);
router.put('/plans/:id', updatePlan);
router.delete('/plans/:id', deletePlan);

// Payment Methods Management
router.get('/payment-methods', listAllPaymentMethods);
router.post('/payment-methods', createPaymentMethod);
router.put('/payment-methods/:id', updatePaymentMethod);

// Platform Notifications
router.get('/notifications', listPlatformNotifications);
router.post('/notifications/:id/read', markNotificationRead);
router.post('/notifications/read-all', markAllNotificationsRead);

export default router;
