import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, created } from '../utils/apiResponse';
import { Tenant, publicTenant, getEffectiveTenantStatus } from '../models/Tenant';
import { SubscriptionPlan, publicPlan } from '../models/SubscriptionPlan';
import { PaymentMethod, publicPaymentMethod } from '../models/PaymentMethod';
import { SubscriptionPayment, publicSubscriptionPayment } from '../models/SubscriptionPayment';
import { SubscriptionHistory, publicSubscriptionHistory } from '../models/SubscriptionHistory';
import { PlatformNotification } from '../models/PlatformNotification';

/** GET /api/subscription/me — Get current tenant's subscription status & summary */
export const getSubscriptionStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user?.tenantId) {
    throw ApiError.forbidden('School workspace required', 'NO_TENANT');
  }

  const tenant = await Tenant.findById(req.user.tenantId);
  if (!tenant) {
    throw ApiError.notFound('School workspace not found', 'TENANT_NOT_FOUND');
  }

  const effective = getEffectiveTenantStatus(tenant);

  let currentPlan = null;
  if (tenant.currentPlanId) {
    const planDoc = await SubscriptionPlan.findById(tenant.currentPlanId).lean();
    if (planDoc) currentPlan = publicPlan(planDoc as any);
  }

  const pendingPayment = await SubscriptionPayment.findOne({
    tenantId: tenant._id,
    status: 'pending',
  })
    .sort({ createdAt: -1 })
    .lean();

  ok(res, {
    tenant: publicTenant(tenant),
    status: effective.status,
    daysRemaining: effective.daysRemaining,
    isExpired: effective.isExpired,
    isSuspended: effective.isSuspended,
    trialEndsAt: tenant.trialEndsAt,
    subscriptionEndsAt: tenant.subscriptionEndsAt ?? null,
    currentPlan,
    pendingPayment: pendingPayment ? publicSubscriptionPayment(pendingPayment as any) : null,
  });
});

/** GET /api/subscription/plans — Active subscription plans */
export const listPlans = asyncHandler(async (_req: Request, res: Response) => {
  const plans = await SubscriptionPlan.find({ isActive: true })
    .sort({ displayOrder: 1, price: 1 })
    .lean();
  ok(res, plans.map(publicPlan as any));
});

/** GET /api/subscription/payment-methods — Configured payment methods */
export const listPaymentMethods = asyncHandler(async (_req: Request, res: Response) => {
  const methods = await PaymentMethod.find({ isActive: true })
    .sort({ displayOrder: 1 })
    .lean();
  ok(res, methods.map(publicPaymentMethod as any));
});

/** POST /api/subscription/payments — Submit manual payment with proof upload */
export const submitPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user?.tenantId) {
    throw ApiError.forbidden('School workspace required', 'NO_TENANT');
  }

  const file = req.file;
  if (!file) {
    throw ApiError.badRequest('Payment screenshot/proof is required', 'PROOF_REQUIRED');
  }

  const planId = req.body.planId;
  const paymentMethod = req.body.paymentMethod || req.body.paymentMethodId || req.body.method;
  const transactionReference = req.body.transactionReference || req.body.transactionId || req.body.reference;
  const paymentDate = req.body.paymentDate;
  const amount = req.body.amount || req.body.amountPaid;
  const notes = req.body.notes;

  if (!planId) throw ApiError.badRequest('Plan ID is required', 'PLAN_REQUIRED');
  if (!paymentMethod) throw ApiError.badRequest('Payment method is required', 'METHOD_REQUIRED');
  if (!transactionReference) throw ApiError.badRequest('Transaction reference number is required', 'REF_REQUIRED');

  const plan = await SubscriptionPlan.findById(planId).lean();
  if (!plan || !plan.isActive) {
    throw ApiError.badRequest('Selected subscription plan does not exist or is inactive', 'INVALID_PLAN');
  }

  const tenant = await Tenant.findById(req.user.tenantId);
  if (!tenant) throw ApiError.notFound('School workspace not found');

  const parsedAmount = Number(amount) || plan.price;
  const parsedDate = paymentDate ? new Date(paymentDate) : new Date();

  // Public URL served by backend static middleware
  const proofUrl = `/uploads/proofs/${file.filename}`;
  const proofStorageKey = file.filename;

  // Server-controlled fields only — client cannot specify status or approval!
  const payment = await SubscriptionPayment.create({
    tenantId: tenant._id,
    submittedBy: req.user._id,
    planId: plan._id,
    amount: parsedAmount,
    currency: plan.currency,
    paymentMethod,
    transactionReference: String(transactionReference).trim(),
    paymentDate: parsedDate,
    proofUrl,
    proofStorageKey,
    fileName: file.originalname,
    mimeType: file.mimetype,
    fileSize: file.size,
    notes: notes ? String(notes).trim().slice(0, 500) : undefined,
    status: 'pending',
    submittedAt: new Date(),
  });

  // Emits platform notification for SaaS Owner immediately
  await PlatformNotification.create({
    type: 'payment_submitted',
    title: 'New Payment Proof Submitted',
    message: `${tenant.name} submitted a payment proof for plan "${plan.name}" (${plan.currency} ${parsedAmount.toLocaleString()}). Ref: ${transactionReference}`,
    tenantId: tenant._id,
    paymentId: payment._id,
  });

  created(res, publicSubscriptionPayment(payment));
});

/** GET /api/subscription/payments — Customer's payment history */
export const listCustomerPayments = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user?.tenantId) {
    throw ApiError.forbidden('School workspace required', 'NO_TENANT');
  }

  const payments = await SubscriptionPayment.find({ tenantId: req.user.tenantId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const planIds = Array.from(new Set(payments.map((p) => String(p.planId))));
  const plans = await SubscriptionPlan.find({ _id: { $in: planIds } }).select('name slug').lean();
  const planMap = new Map(plans.map((p) => [String(p._id), p.name]));

  const result = payments.map((p) => ({
    ...publicSubscriptionPayment(p as any),
    planName: planMap.get(String(p.planId)) ?? 'Subscription Plan',
  }));

  ok(res, result);
});

/** GET /api/subscription/history — Customer's subscription events */
export const listCustomerHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user?.tenantId) {
    throw ApiError.forbidden('School workspace required', 'NO_TENANT');
  }

  const history = await SubscriptionHistory.find({ tenantId: req.user.tenantId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  ok(res, history.map(publicSubscriptionHistory as any));
});
