import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, created, paginated } from '../utils/apiResponse';
import { parsePagination } from '../utils/query';
import { verifyPassword } from '../utils/security';
import { User, IUser } from '../models/User';
import { Role } from '../models/Role';
import { Tenant, publicTenant, getEffectiveTenantStatus } from '../models/Tenant';
import { SubscriptionPlan, publicPlan } from '../models/SubscriptionPlan';
import { PaymentMethod, publicPaymentMethod } from '../models/PaymentMethod';
import { SubscriptionPayment, publicSubscriptionPayment } from '../models/SubscriptionPayment';
import { SubscriptionHistory, publicSubscriptionHistory } from '../models/SubscriptionHistory';
import { PlatformNotification, publicPlatformNotification } from '../models/PlatformNotification';
import { getTenantConnection } from '../services/TenantConnectionManager';
import { getTenantModels } from '../services/TenantModelRegistry';
import { issueTokensForUser } from '../services/auth.service';
import { recordAudit } from '../services/audit.service';

/** POST /api/platform/auth/login — Platform Admin authentication */
export const platformLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) {
    throw ApiError.badRequest('Email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase(), isArchived: false }).select('+passwordHash');
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (!user.isPlatformAdmin) {
    // Check if role is platform_admin
    const role = await Role.findById(user.roleId).select('slug').lean();
    if (role?.slug !== 'platform_admin') {
      throw ApiError.forbidden('Platform Administrator access required', 'PLATFORM_ADMIN_REQUIRED');
    }
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokensForUser(user, 'platform_admin', mongoose.connection);

  ok(res, {
    user: {
      _id: String(user._id),
      name: user.name,
      email: user.email,
      role: 'platform_admin',
      isPlatformAdmin: true,
      lastLoginAt: user.lastLoginAt,
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
});

/** GET /api/platform/dashboard — Aggregated SaaS metrics */
export const getDashboardMetrics = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const [
    totalCustomers,
    activeSubscriptions,
    activeTrials,
    trialsExpiringSoon,
    suspendedAccounts,
    pendingPayments,
    approvedPaymentsCount,
    rejectedPaymentsCount,
    newCustomersThisMonth,
    revenueAgg,
    plansCount,
  ] = await Promise.all([
    Tenant.countDocuments({ isActive: true }),
    Tenant.countDocuments({ subscriptionEndsAt: { $gt: now }, isSuspended: false }),
    Tenant.countDocuments({ trialEndsAt: { $gt: now }, subscriptionEndsAt: { $not: { $gt: now } }, isSuspended: false }),
    Tenant.countDocuments({ trialEndsAt: { $gt: now, $lte: threeDaysFromNow }, subscriptionEndsAt: { $not: { $gt: now } }, isSuspended: false }),
    Tenant.countDocuments({ isSuspended: true }),
    SubscriptionPayment.countDocuments({ status: 'pending' }),
    SubscriptionPayment.countDocuments({ status: 'approved' }),
    SubscriptionPayment.countDocuments({ status: 'rejected' }),
    Tenant.countDocuments({ createdAt: { $gte: startOfMonth } }),
    SubscriptionPayment.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    SubscriptionPlan.countDocuments({ isActive: true }),
  ]);

  const totalRecordedRevenue = revenueAgg[0]?.total ?? 0;
  const expiredAccounts = Math.max(0, totalCustomers - activeSubscriptions - activeTrials - suspendedAccounts);

  // Monthly breakdown of payments for charts (last 6 months)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const monthlyRevenue = await SubscriptionPayment.aggregate([
    { $match: { status: 'approved', paymentDate: { $gte: sixMonthsAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Plan distribution among customers
  const planDistribution = await Tenant.aggregate([
    { $match: { currentPlanId: { $ne: null } } },
    { $group: { _id: '$currentPlanId', count: { $sum: 1 } } },
  ]);
  const planIds = planDistribution.map((p) => p._id);
  const plans = await SubscriptionPlan.find({ _id: { $in: planIds } }).select('name slug').lean();
  const planNameMap = new Map(plans.map((p) => [String(p._id), p.name]));
  const planStats = planDistribution.map((p) => ({
    name: planNameMap.get(String(p._id)) ?? 'Unknown Plan',
    count: p.count,
  }));

  ok(res, {
    totalCustomers,
    activeSubscriptions,
    activeTrials,
    trialsExpiringSoon,
    expiredAccounts,
    suspendedAccounts,
    pendingPayments,
    approvedPayments: approvedPaymentsCount,
    rejectedPayments: rejectedPaymentsCount,
    newCustomersThisMonth,
    totalRecordedRevenue,
    activePlans: plansCount,
    monthlyRevenue,
    planDistribution: planStats,
  });
});

/** GET /api/platform/customers — Search, filter, paginate customers */
export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePagination(req.query);
  const { search, status, planId, sort } = req.query as Record<string, string | undefined>;

  const filter: Record<string, unknown> = {};

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { slug: { $regex: escaped, $options: 'i' } },
      { contactEmail: { $regex: escaped, $options: 'i' } },
      { contactPhone: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (planId) {
    filter.currentPlanId = planId;
  }

  const now = new Date();
  if (status === 'active') {
    filter.isSuspended = false;
    filter.subscriptionEndsAt = { $gt: now };
  } else if (status === 'trial') {
    filter.isSuspended = false;
    filter.trialEndsAt = { $gt: now };
    filter.$or = [{ subscriptionEndsAt: null }, { subscriptionEndsAt: { $lte: now } }];
  } else if (status === 'suspended') {
    filter.isSuspended = true;
  } else if (status === 'expired') {
    filter.isSuspended = false;
    filter.trialEndsAt = { $lte: now };
    filter.$or = [{ subscriptionEndsAt: null }, { subscriptionEndsAt: { $lte: now } }];
  }

  const total = await Tenant.countDocuments(filter);
  const tenants = await Tenant.find(filter)
    .sort(sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const ownerIds = tenants.map((t) => t.ownerUserId).filter(Boolean);
  const owners = await User.find({ _id: { $in: ownerIds } }).select('name email').lean();
  const ownerMap = new Map(owners.map((o) => [String(o._id), o]));

  const planIds = tenants.map((t) => t.currentPlanId).filter(Boolean);
  const plans = await SubscriptionPlan.find({ _id: { $in: planIds } }).select('name slug').lean();
  const planMap = new Map(plans.map((p) => [String(p._id), p.name]));

  const data = tenants.map((t) => {
    const pub = publicTenant(t as any);
    const owner = ownerMap.get(String(t.ownerUserId));
    return {
      ...pub,
      ownerName: owner?.name ?? '—',
      ownerEmail: owner?.email ?? t.contactEmail,
      planName: t.currentPlanId ? planMap.get(String(t.currentPlanId)) ?? '—' : 'Trial Plan',
    };
  });

  paginated(res, {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
});

/** GET /api/platform/customers/:id — Detailed customer view */
export const getCustomerDetails = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await Tenant.findById(req.params.id).lean();
  if (!tenant) throw ApiError.notFound('Customer workspace not found');

  const owner = await User.findById(tenant.ownerUserId).select('name email phone createdAt lastLoginAt').lean();
  const plan = tenant.currentPlanId ? await SubscriptionPlan.findById(tenant.currentPlanId).lean() : null;

  const [payments, history] = await Promise.all([
    SubscriptionPayment.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(20).lean(),
    SubscriptionHistory.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);

  ok(res, {
    tenant: publicTenant(tenant as any),
    owner: owner
      ? {
          _id: String(owner._id),
          name: owner.name,
          email: owner.email,
          createdAt: owner.createdAt,
          lastLoginAt: owner.lastLoginAt ?? null,
        }
      : null,
    currentPlan: plan ? publicPlan(plan as any) : null,
    payments: payments.map(publicSubscriptionPayment as any),
    history: history.map(publicSubscriptionHistory as any),
  });
});

/** POST /api/platform/customers/:id/extend — Manually extend customer subscription */
export const extendCustomerSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { days, customDate, reason } = req.body as {
    days?: number;
    customDate?: string;
    reason?: string;
  };

  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw ApiError.notFound('Customer workspace not found');

  const now = new Date();
  const baseDate = tenant.subscriptionEndsAt && tenant.subscriptionEndsAt > now ? tenant.subscriptionEndsAt : now;

  let newEnd: Date;
  if (customDate) {
    newEnd = new Date(customDate);
    if (isNaN(newEnd.getTime()) || newEnd <= now) {
      throw ApiError.badRequest('Custom date must be a valid future date');
    }
  } else if (days && Number(days) > 0) {
    newEnd = new Date(baseDate.getTime() + Number(days) * 24 * 60 * 60 * 1000);
  } else {
    throw ApiError.badRequest('Either days or customDate must be provided');
  }

  const previousEnd = tenant.subscriptionEndsAt;
  const previousStatus = tenant.subscriptionStatus;

  tenant.subscriptionEndsAt = newEnd;
  tenant.subscriptionStatus = 'active';
  tenant.status = 'active';
  if (!tenant.subscriptionStartedAt) tenant.subscriptionStartedAt = now;
  await tenant.save();

  await SubscriptionHistory.create({
    tenantId: tenant._id,
    action: 'manual_extended',
    previousStatus,
    newStatus: 'active',
    previousEndsAt: previousEnd,
    newEndsAt: newEnd,
    source: 'manual_extension',
    performedBy: req.user?._id,
    reason: reason || `Extended by ${days || 'custom'} days by Platform Admin`,
  });

  // Notify customer
  if (tenant.databaseName) {
    const tenantDb = getTenantConnection(tenant.databaseName);
    const { Notification: TenantNotification } = getTenantModels(tenantDb);
    await TenantNotification.create({
      tenantId: tenant._id,
      userId: tenant.ownerUserId,
      type: 'subscription_extended',
      title: 'Subscription Extended',
      message: `Your school subscription has been extended until ${newEnd.toLocaleDateString()}.`,
    });
  }

  recordAudit('platform', 'SUBSCRIPTION_EXTENDED', req.user as any, String(tenant._id), {
    previousStatus: previousStatus || 'unknown',
    newStatus: 'active',
    days: days ? Number(days) : 0,
  }, 'tenant', tenant._id);

  ok(res, publicTenant(tenant));
});

/** POST /api/platform/customers/:id/suspend — Suspend customer */
export const suspendCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { reason } = req.body as { reason?: string };
  if (!reason) throw ApiError.badRequest('Suspension reason is required');

  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw ApiError.notFound('Customer workspace not found');

  tenant.isSuspended = true;
  tenant.suspensionReason = reason.trim();
  tenant.status = 'suspended';
  await tenant.save();

  await SubscriptionHistory.create({
    tenantId: tenant._id,
    action: 'suspended',
    newStatus: 'suspended',
    source: 'admin_adjustment',
    performedBy: req.user?._id,
    reason,
  });

  if (tenant.databaseName) {
    const tenantDb = getTenantConnection(tenant.databaseName);
    const { Notification: TenantNotification } = getTenantModels(tenantDb);
    await TenantNotification.create({
      tenantId: tenant._id,
      userId: tenant.ownerUserId,
      type: 'account_suspended',
      title: 'School Account Suspended',
      message: `Your account was suspended: ${reason}`,
    });
  }

  recordAudit('platform', 'TENANT_SUSPENDED', req.user as any, String(tenant._id), {
    status: 'suspended',
    reason: reason.substring(0, 50),
  }, 'tenant', tenant._id);

  ok(res, publicTenant(tenant));
});

/** POST /api/platform/customers/:id/unsuspend — Unsuspend customer */
export const unsuspendCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw ApiError.notFound('Customer workspace not found');
  if (tenant.isDeleted || tenant.deletionStatus !== 'NONE') {
    throw ApiError.badRequest('Cannot unsuspend a school that is scheduled for deletion.');
  }

  tenant.isSuspended = false;
  tenant.suspensionReason = undefined;
  const effective = getEffectiveTenantStatus(tenant);
  tenant.status = effective.status;
  await tenant.save();

  await SubscriptionHistory.create({
    tenantId: tenant._id,
    action: 'unsuspended',
    newStatus: effective.status,
    source: 'admin_adjustment',
    performedBy: req.user?._id,
    reason: 'Account restored by Platform Admin',
  });

  if (tenant.databaseName) {
    const tenantDb = getTenantConnection(tenant.databaseName);
    const { Notification: TenantNotification } = getTenantModels(tenantDb);
    await TenantNotification.create({
      tenantId: tenant._id,
      userId: tenant.ownerUserId,
      type: 'account_restored',
      title: 'School Account Restored',
      message: 'Your school account access has been restored.',
    });
  }

  recordAudit('platform', 'TENANT_UNSUSPENDED', req.user as any, String(tenant._id), {
    status: effective.status,
  }, 'tenant', tenant._id);

  ok(res, publicTenant(tenant));
});

/** POST /api/platform/customers/:id/soft-delete — Soft delete customer */
export const softDeleteCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { reason } = req.body as { reason?: string };

  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw ApiError.notFound('Customer workspace not found');
  if (!tenant.isSuspended) {
    throw ApiError.badRequest('School must be suspended before deletion can be scheduled.');
  }

  tenant.isDeleted = true;
  tenant.deletedAt = new Date();
  tenant.deletionStatus = 'SOFT_DELETED';
  // Keep existing suspension reason and status
  await tenant.save();

  await SubscriptionHistory.create({
    tenantId: tenant._id,
    action: 'soft_deleted',
    newStatus: 'suspended',
    source: 'admin_adjustment',
    performedBy: req.user?._id,
    reason: reason || tenant.suspensionReason || 'Soft deleted by Platform Admin',
  });

  recordAudit('platform', 'TENANT_SOFT_DELETED', req.user as any, String(tenant._id), {
    status: 'suspended',
    reason: reason || tenant.suspensionReason || 'Soft deleted',
  }, 'tenant', tenant._id);

  ok(res, publicTenant(tenant));
});

/** POST /api/platform/customers/:id/hard-delete — Permanent delete customer */
export const hardDeleteCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { confirmationCode } = req.body as { confirmationCode?: string };

  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw ApiError.notFound('Customer workspace not found');

  // Resume cleanup if it crashed last time
  if (tenant.deletionStatus === 'DATABASE_DELETED_CLEANUP_PENDING') {
    return completeHardDeleteCleanup(tenant, req, res);
  }

  // Must be soft deleted
  if (!tenant.isDeleted || !tenant.deletedAt || tenant.deletionStatus !== 'SOFT_DELETED') {
    throw ApiError.badRequest('Tenant must be fully soft-deleted first before permanent deletion');
  }

  // Fixed waiting period (7 days)
  const waitingPeriodMs = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - tenant.deletedAt.getTime() < waitingPeriodMs) {
    throw ApiError.badRequest('Waiting period not met. You can only hard-delete after 7 days of soft-deletion');
  }

  // Exact School Code as confirmation
  if (confirmationCode !== tenant.slug) {
    throw ApiError.badRequest('Confirmation code does not match the exact School Code');
  }

  const dbName = tenant.databaseName;
  if (!dbName || typeof dbName !== 'string' || dbName.trim() === '') {
    throw ApiError.badRequest('Tenant has no database assigned or database name is invalid');
  }

  // Protected Database Guardrails
  const PROTECTED_DBS = ['schoolsghar_master', 'admin', 'local', 'config'];
  if (PROTECTED_DBS.includes(dbName)) {
    throw new ApiError(403, 'Protected system database cannot be deleted', 'PROTECTED_DB');
  }

  // Validate naming convention (e.g., alphanumeric, underscore, dash)
  if (!/^[a-zA-Z0-9_-]+$/.test(dbName)) {
    throw new ApiError(400, 'Invalid database name format', 'INVALID_DB_NAME');
  }

  // Verify no other Tenant document points to the same databaseName
  const duplicateDb = await Tenant.exists({ _id: { $ne: tenant._id }, databaseName: dbName });
  if (duplicateDb) {
    throw new ApiError(409, 'Database name collision detected. Another tenant uses this database.', 'COLLISION');
  }

  // Mark deletion in progress
  tenant.deletionStatus = 'DELETION_IN_PROGRESS';
  await tenant.save();

  try {
    const tenantDb = mongoose.connection.useDb(dbName);
    await tenantDb.dropDatabase();
  } catch (err: any) {
    tenant.deletionStatus = 'SOFT_DELETED'; // Revert state so it can be retried safely
    await tenant.save();
    throw new ApiError(500, 'Failed to drop tenant database', 'INTERNAL_ERROR');
  }

  // DB drop succeeded, update state for master cleanup
  tenant.deletionStatus = 'DATABASE_DELETED_CLEANUP_PENDING';
  await tenant.save();

  return completeHardDeleteCleanup(tenant, req, res);
});

async function completeHardDeleteCleanup(tenant: any, req: AuthRequest, res: Response) {
  // We keep the tenant record for platform history, but mark as HARD_DELETED
  tenant.deletionStatus = 'HARD_DELETED';
  tenant.isActive = false;
  tenant.isSuspended = true;
  await tenant.save();

  // We preserve SubscriptionHistory as per requirements (not deleted)
  
  recordAudit('platform', 'TENANT_HARD_DELETED', req.user as any, String(tenant._id), {
    schoolCode: tenant.slug,
    databaseName: tenant.databaseName
  }, 'platform');

  ok(res, { message: 'Tenant database permanently deleted. Metadata preserved.', tenant: publicTenant(tenant) });
}

/** POST /api/platform/customers/:id/change-code — Change school code */
export const changeSchoolCode = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { newSchoolCode } = req.body as { newSchoolCode?: string };
  if (!newSchoolCode || typeof newSchoolCode !== 'string') {
    throw ApiError.badRequest('New School Code is required');
  }

  const normalized = newSchoolCode.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(normalized)) {
    throw ApiError.badRequest('School Code can only contain lowercase letters, numbers, and hyphens');
  }

  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw ApiError.notFound('Customer workspace not found');

  if (tenant.slug === normalized) {
    throw ApiError.badRequest('The school code is already set to this value');
  }

  const exists = await Tenant.exists({ slug: normalized });
  if (exists) {
    throw ApiError.conflict('School code already in use', 'DUPLICATE_SCHOOL_CODE');
  }

  const oldSlug = tenant.slug;
  tenant.slug = normalized;
  
  try {
    await tenant.save();
  } catch (err: any) {
    if (err?.code === 11000) {
      throw ApiError.conflict('School code already in use', 'DUPLICATE_SCHOOL_CODE');
    }
    throw err;
  }

  recordAudit('platform', 'SCHOOL_CODE_CHANGED', req.user as any, String(tenant._id), {
    previousCode: oldSlug,
    newCode: normalized,
  }, 'tenant', tenant._id);

  ok(res, publicTenant(tenant));
});

/** GET /api/platform/payments — List payment requests */
export const listPaymentRequests = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePagination(req.query);
  const { status, search } = req.query as Record<string, string | undefined>;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const total = await SubscriptionPayment.countDocuments(filter);
  const payments = await SubscriptionPayment.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const tenantIds = Array.from(new Set(payments.map((p) => String(p.tenantId))));
  const planIds = Array.from(new Set(payments.map((p) => String(p.planId))));
  const userIds = Array.from(new Set(payments.map((p) => String(p.submittedBy))));

  const [tenants, plans, users] = await Promise.all([
    Tenant.find({ _id: { $in: tenantIds } }).select('name contactEmail').lean(),
    SubscriptionPlan.find({ _id: { $in: planIds } }).select('name currency price durationDays').lean(),
    User.find({ _id: { $in: userIds } }).select('name email').lean(),
  ]);

  const tenantMap = new Map(tenants.map((t) => [String(t._id), t]));
  const planMap = new Map(plans.map((p) => [String(p._id), p]));
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const data = payments.map((p) => {
    const t = tenantMap.get(String(p.tenantId));
    const pl = planMap.get(String(p.planId));
    const u = userMap.get(String(p.submittedBy));
    return {
      ...publicSubscriptionPayment(p as any),
      schoolName: t?.name ?? '—',
      contactEmail: t?.contactEmail ?? '—',
      planName: pl?.name ?? '—',
      planDurationDays: pl?.durationDays ?? 30,
      submittedByName: u?.name ?? '—',
    };
  });

  paginated(res, {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
});

/** POST /api/platform/payments/:id/approve — Atomic payment approval */
export const approvePayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { note } = req.body as { note?: string };
  const paymentId = req.params.id;

  // 1. ATOMIC STATUS TRANSITION: must be currently pending to prevent double-approval
  const payment = await SubscriptionPayment.findOneAndUpdate(
    { _id: paymentId, status: 'pending' },
    {
      $set: {
        status: 'approved',
        reviewedBy: req.user?._id,
        reviewedAt: new Date(),
        reviewNote: note ? String(note).trim() : 'Payment verified and approved.',
      },
    },
    { new: true }
  );

  if (!payment) {
    throw ApiError.badRequest('Payment request is not pending or has already been processed', 'ALREADY_PROCESSED');
  }

  const [tenant, plan] = await Promise.all([
    Tenant.findById(payment.tenantId),
    SubscriptionPlan.findById(payment.planId),
  ]);

  if (!tenant || !plan) {
    throw ApiError.badRequest('Associated school workspace or plan not found');
  }

  // 2. Renewal date calculation:
  // If customer currently has an active subscription, extend from existing end date!
  const now = new Date();
  let subscriptionStart = now;
  let baseDate = now;

  if (tenant.subscriptionEndsAt && tenant.subscriptionEndsAt > now) {
    // Early renewal preserves remaining days
    baseDate = tenant.subscriptionEndsAt;
    subscriptionStart = tenant.subscriptionStartedAt || now;
  }

  const durationDays = plan.durationDays || 30;
  const subscriptionEnd = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

  const previousEnd = tenant.subscriptionEndsAt;

  // 3. Activate Tenant
  tenant.currentPlanId = plan._id;
  tenant.subscriptionStartedAt = subscriptionStart;
  tenant.subscriptionEndsAt = subscriptionEnd;
  tenant.subscriptionStatus = 'active';
  tenant.status = 'active';
  tenant.isSuspended = false;
  await tenant.save();

  // 4. Update payment with approved subscription dates
  payment.approvedSubscriptionStart = subscriptionStart;
  payment.approvedSubscriptionEnd = subscriptionEnd;
  await payment.save();

  // 5. Immutable Subscription History
  await SubscriptionHistory.create({
    tenantId: tenant._id,
    planId: plan._id,
    action: 'payment_approved',
    newStatus: 'active',
    previousEndsAt: previousEnd,
    newEndsAt: subscriptionEnd,
    source: 'payment',
    performedBy: req.user?._id,
    paymentId: payment._id,
    reason: `Payment verified (${plan.currency} ${payment.amount.toLocaleString()}). Duration: ${durationDays} days.`,
  });

  // 6. Notify Customer
  if (tenant.databaseName) {
    const tenantDb = getTenantConnection(tenant.databaseName);
    const { Notification: TenantNotification } = getTenantModels(tenantDb);
    await TenantNotification.create({
      userId: tenant.ownerUserId,
      type: 'subscription_activated',
      title: 'Payment Approved — Full Access Restored',
      message: `Your payment for plan "${plan.name}" has been approved. Your subscription is active until ${subscriptionEnd.toLocaleDateString()}.`,
    });
  }

  recordAudit('platform', 'SUBSCRIPTION_PAYMENT_APPROVED', req.user as any, String(payment._id), {
    planName: plan.name,
    amount: payment.amount,
  }, 'tenant', tenant._id);

  ok(res, {
    payment: publicSubscriptionPayment(payment),
    tenant: publicTenant(tenant),
  });
});

/** POST /api/platform/payments/:id/reject — Reject payment */
export const rejectPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { note } = req.body as { note?: string };
  if (!note) throw ApiError.badRequest('Rejection note/reason is required');

  const payment = await SubscriptionPayment.findOneAndUpdate(
    { _id: req.params.id, status: 'pending' },
    {
      $set: {
        status: 'rejected',
        reviewedBy: req.user?._id,
        reviewedAt: new Date(),
        reviewNote: String(note).trim(),
      },
    },
    { new: true }
  );

  if (!payment) {
    throw ApiError.badRequest('Payment request is not pending or has already been processed', 'ALREADY_PROCESSED');
  }

  const tenant = await Tenant.findById(payment.tenantId);
  if (tenant && tenant.databaseName) {
    const tenantDb = getTenantConnection(tenant.databaseName);
    const { Notification: TenantNotification } = getTenantModels(tenantDb);
    await TenantNotification.create({
      userId: tenant.ownerUserId,
      type: 'payment_rejected',
      title: 'Payment Verification Unsuccessful',
      message: `Your submitted payment was rejected: ${note}. Please review details and resubmit if necessary.`,
    });
  }

  ok(res, publicSubscriptionPayment(payment));
});

/** Platform Plan Management */
export const listAllPlans = asyncHandler(async (_req: Request, res: Response) => {
  const plans = await SubscriptionPlan.find().sort({ displayOrder: 1, price: 1 }).lean();
  ok(res, plans.map(publicPlan as any));
});

export const createPlan = asyncHandler(async (req: Request, res: Response) => {
  const { name, slug, description, price, currency, durationDays, features, isRecommended, displayOrder } = req.body;
  if (!name || price === undefined) throw ApiError.badRequest('Plan name and price are required');

  const plan = await SubscriptionPlan.create({
    name: String(name).trim(),
    slug: slug ? String(slug).trim().toLowerCase() : name.toLowerCase().replace(/\s+/g, '-'),
    description: description ? String(description).trim() : '',
    price: Number(price),
    currency: (currency || 'PKR').toUpperCase(),
    durationDays: Number(durationDays) || 30,
    features: Array.isArray(features) ? features : [],
    isRecommended: Boolean(isRecommended),
    displayOrder: Number(displayOrder) || 0,
    isActive: true,
  });

  created(res, publicPlan(plan));
});

export const updatePlan = asyncHandler(async (req: Request, res: Response) => {
  const plan = await SubscriptionPlan.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!plan) throw ApiError.notFound('Plan not found');
  ok(res, publicPlan(plan));
});

export const deletePlan = asyncHandler(async (req: Request, res: Response) => {
  const plan = await SubscriptionPlan.findByIdAndDelete(req.params.id);
  if (!plan) throw ApiError.notFound('Plan not found');
  ok(res, { success: true });
});

/** Platform Payment Methods Management */
export const listAllPaymentMethods = asyncHandler(async (_req: Request, res: Response) => {
  const methods = await PaymentMethod.find().sort({ displayOrder: 1 }).lean();
  ok(res, methods.map(publicPaymentMethod as any));
});

export const createPaymentMethod = asyncHandler(async (req: Request, res: Response) => {
  const { name, slug, accountTitle, accountNumber, iban, instructions, qrCodeUrl, displayOrder } = req.body;
  if (!name || !accountTitle || !accountNumber) {
    throw ApiError.badRequest('Name, account title and account number are required');
  }

  const method = await PaymentMethod.create({
    name: String(name).trim(),
    slug: slug ? String(slug).trim().toLowerCase() : name.toLowerCase().replace(/\s+/g, '-'),
    accountTitle: String(accountTitle).trim(),
    accountNumber: String(accountNumber).trim(),
    iban: iban ? String(iban).trim() : undefined,
    instructions: instructions ? String(instructions).trim() : '',
    qrCodeUrl: qrCodeUrl ? String(qrCodeUrl).trim() : undefined,
    displayOrder: Number(displayOrder) || 0,
    isActive: true,
  });

  created(res, publicPaymentMethod(method));
});

export const updatePaymentMethod = asyncHandler(async (req: Request, res: Response) => {
  const method = await PaymentMethod.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!method) throw ApiError.notFound('Payment method not found');
  ok(res, publicPaymentMethod(method));
});

/** Platform Notifications */
export const listPlatformNotifications = asyncHandler(async (req: Request, res: Response) => {
  const notifications = await PlatformNotification.find()
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  const unreadCount = await PlatformNotification.countDocuments({ isRead: false });
  ok(res, {
    notifications: notifications.map(publicPlatformNotification as any),
    unreadCount,
  });
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  await PlatformNotification.findByIdAndUpdate(req.params.id, {
    $set: { isRead: true, readAt: new Date() },
  });
  ok(res, { success: true });
});

export const markAllNotificationsRead = asyncHandler(async (_req: Request, res: Response) => {
  await PlatformNotification.updateMany({ isRead: false }, {
    $set: { isRead: true, readAt: new Date() },
  });
  ok(res, { success: true });
});
