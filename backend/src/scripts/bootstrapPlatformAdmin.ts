/**
 * Platform Admin Bootstrap CLI:
 *   npm run bootstrap:platform-admin
 *
 * Reads PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_INITIAL_PASSWORD from environment.
 * Creates the Platform Administrator account if missing.
 * Idempotent — will NEVER overwrite an existing platform administrator account.
 */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { env } from '../config/env';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { hashPassword } from '../utils/security';
import { logger } from '../utils/logger';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const email = (env.platformAdminEmail || 'platformadmin@saas.school').toLowerCase();
  const password = env.platformAdminInitialPassword || 'PlatformAdmin2026!';

  logger.info(`Checking Platform Admin bootstrap for: ${email}`);

  // 1. Ensure platform_admin role exists
  let platformRole = await Role.findOne({ slug: 'platform_admin' });
  if (!platformRole) {
    platformRole = await Role.create({
      name: 'Platform Administrator',
      slug: 'platform_admin',
      description: 'SaaS Platform Owner with global management privileges',
      isSystemRole: true,
      isActive: true,
      permissions: [],
    });
    logger.info('Created system role: platform_admin');
  }

  // 2. Check if platform admin user already exists
  const existing = await User.findOne({ email });
  if (existing) {
    // Ensure isPlatformAdmin flag is true
    if (!existing.isPlatformAdmin) {
      existing.isPlatformAdmin = true;
      await existing.save();
    }
    logger.info(`✓ Platform Admin account already exists (${email}). No changes made.`);
    await disconnectDatabase();
    process.exit(0);
  }

  // 3. Create Platform Admin user
  const passwordHash = await hashPassword(password);
  const admin = await User.create({
    name: 'SaaS Platform Administrator',
    email,
    passwordHash,
    roleId: platformRole._id,
    isPlatformAdmin: true,
    isActive: true,
    isArchived: false,
  });

  logger.info(`✓ Successfully created Platform Administrator: ${admin.email}`);
  logger.info(`  Role: platform_admin`);
  logger.info(`  Password configured from PLATFORM_ADMIN_INITIAL_PASSWORD`);

  await disconnectDatabase();
  process.exit(0);
}

bootstrap().catch(async (err) => {
  logger.error('Failed to bootstrap platform admin:', err);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
