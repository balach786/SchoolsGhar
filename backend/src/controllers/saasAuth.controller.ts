import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { created } from '../utils/apiResponse';
import { hashPassword } from '../utils/security';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { Tenant, publicTenant } from '../models/Tenant';
import { SchoolSettings } from '../models/SchoolSettings';
import { SubscriptionHistory } from '../models/SubscriptionHistory';
import { PlatformNotification } from '../models/PlatformNotification';
import { buildSafeAuthResponse } from '../services/auth.service';
import { createCanonicalSession } from '../services/academicSession.service';
import { ROLE_SLUGS } from '../config/permissions';
import { env } from '../config/env';
import { randomToken } from '../utils/id';

const registerSchema = z.object({
  schoolName: z.string().trim().min(2, 'School name must be at least 2 characters').max(120),
  ownerName: z.string().trim().min(2, 'Owner name must be at least 2 characters').max(80),
  email: z.string().trim().email('Invalid email address').max(120),
  phone: z.string().trim().max(40).optional(),
  city: z.string().trim().max(80).optional(),
  country: z.string().trim().max(80).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  confirmPassword: z.string().min(8).max(100),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

import { getMasterConnection } from '../services/MasterConnectionManager';
import { getMasterModels } from '../services/MasterModelRegistry';
import { TenantProvisioningService } from '../services/TenantProvisioningService';

/** POST /api/public/register — Customer self-service SaaS registration */
export const registerTenant = asyncHandler(async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.unprocessable(parsed.error.errors.map((e) => e.message).join(', '));
  }

  const { schoolName, ownerName, email, phone, city, country, password } = parsed.data;

  const masterDb = getMasterConnection();
  const masterModels = getMasterModels(masterDb);

  // Note: Since users are now strictly in Tenant databases, we cannot just query Master User model.
  // Wait, if it's a completely new tenant, they shouldn't exist in master. 
  // Should we query legacy schoolsghar for email conflicts?
  // We can just rely on the Tenant model having unique slugs.
  // And the Tenant DB enforcing unique emails. But to prevent multiple schools registering same email, 
  // maybe we check if any Tenant has this contactEmail?
  const existingTenantByEmail = await masterModels.Tenant.findOne({ contactEmail: email.toLowerCase() }).select('_id').lean();
  if (existingTenantByEmail) {
    throw ApiError.conflict('An account with this email address is already associated with a school. Please sign in.', 'EMAIL_EXISTS');
  }

  // 2. Generate collision-free slug
  const baseSlug = slugify(schoolName) || 'school';
  let slug = baseSlug;
  let counter = 1;
  while (await masterModels.Tenant.findOne({ slug }).select('_id').lean()) {
    slug = `${baseSlug}-${counter}-${randomToken(4).toLowerCase()}`;
    counter++;
  }

  const now = new Date();
  const trialDays = env.trialDays || 7;
  const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

  const mongoSession = await masterDb.startSession();
  let createdTenant: any;
  let ownerUserId = new mongoose.Types.ObjectId();

  try {
    await mongoSession.withTransaction(async () => {
      // 5. Create Tenant account metadata in Master DB
      const shortSlug = slug.substring(0, 20);
      const tenant = new masterModels.Tenant({
        name: schoolName,
        slug,
        databaseName: `school_${shortSlug}_${randomToken(4).toLowerCase()}`,
        isDatabaseProvisioned: false,
        provisioningStatus: 'pending',
        ownerUserId,
        contactEmail: email.toLowerCase(),
        contactPhone: phone,
        city,
        country: country || 'Pakistan',
        status: 'trial',
        trialStartedAt: now,
        trialEndsAt,
        subscriptionStatus: 'trial',
        isActive: true,
        isSuspended: false,
        academicSessionSeq: 0,
      });

      await tenant.save({ session: mongoSession });

      // 6. Immutable history record for trial start in Master DB
      await masterModels.SubscriptionHistory.create(
        [
          {
            tenantId: tenant._id,
            action: 'trial_started',
            newStatus: 'trial',
            newEndsAt: trialEndsAt,
            source: 'trial',
            performedBy: ownerUserId,
            reason: `Automatic ${trialDays}-day free trial upon registration`,
          },
        ],
        { session: mongoSession }
      );

      // 7. Platform notification for SaaS Owner in Master DB
      await masterModels.PlatformNotification.create(
        [
          {
            type: 'new_customer',
            title: 'New School Registered',
            message: `${schoolName} has registered for a ${trialDays}-day free trial. Contact: ${email}`,
            tenantId: tenant._id,
          },
        ],
        { session: mongoSession }
      );

      createdTenant = tenant;
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      if (err?.keyPattern?.slug) {
        throw ApiError.conflict('A school with a similar name was just created. Please try again.', 'SLUG_EXISTS');
      }
    }
    throw err;
  } finally {
    await mongoSession.endSession();
  }

  // 8. Provision Tenant Database (Fail-closed)
  let provisionedUser: any;
  try {
    createdTenant.provisioningStatus = 'provisioning';
    await createdTenant.save();

    const passwordHash = await hashPassword(password);
    provisionedUser = await TenantProvisioningService.provisionTenant(
      createdTenant,
      ownerName,
      email,
      passwordHash
    );

    createdTenant.isDatabaseProvisioned = true;
    createdTenant.provisioningStatus = 'ready';
    await createdTenant.save();
  } catch (error: any) {
    createdTenant.provisioningStatus = 'failed';
    createdTenant.provisioningFailedAt = new Date();
    createdTenant.provisioningErrorCode = error.message ? error.message.substring(0, 200) : 'Unknown error';
    await createdTenant.save();
    
    // We intentionally do NOT delete the tenant to preserve the audit trail and fail closed.
    throw new ApiError(500, 'School registration succeeded, but database provisioning failed. Please contact support.', 'PROVISIONING_FAILED');
  }

  // 9. Issue session tokens using Tenant DB connection
  // Since buildSafeAuthResponse needs the tenant connection, we must provide it.
  const { getTenantConnection } = await import('../services/TenantConnectionManager');
  const tenantDb = getTenantConnection(createdTenant.databaseName);
  const authResponse = await buildSafeAuthResponse(provisionedUser, tenantDb);

  created(res, {
    tenant: publicTenant(createdTenant),
    user: authResponse.user,
    accessToken: authResponse.accessToken,
    refreshToken: authResponse.refreshToken,
  });
});
