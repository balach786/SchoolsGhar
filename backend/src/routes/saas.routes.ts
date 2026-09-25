import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenant';
import { uploadPaymentProof } from '../middleware/upload';
import { registerTenant } from '../controllers/saasAuth.controller';
import {
  getSubscriptionStatus,
  listPlans,
  listPaymentMethods,
  submitPayment,
  listCustomerPayments,
  listCustomerHistory,
} from '../controllers/subscription.controller';

const router = Router();

// Public routes
router.post('/public/register', registerTenant);
router.get('/public/plans', listPlans);
router.get('/public/payment-methods', listPaymentMethods);

// Customer billing routes (requires login + tenant, but EXEMPT from subscription block so expired customers can access)
router.get('/subscription/me', authenticate, resolveTenant, getSubscriptionStatus);
router.get('/subscription/status', authenticate, resolveTenant, getSubscriptionStatus);
router.get('/subscription/plans', listPlans);
router.get('/subscription/payment-methods', listPaymentMethods);
router.post('/subscription/payments', authenticate, resolveTenant, uploadPaymentProof, submitPayment);
router.get('/subscription/payments', authenticate, resolveTenant, listCustomerPayments);
router.get('/subscription/history', authenticate, resolveTenant, listCustomerHistory);

export default router;
