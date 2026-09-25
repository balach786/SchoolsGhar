import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { ROLE_SLUGS } from '../config/permissions';

const RESERVED_SLUGS: string[] = [
  ...Object.values(ROLE_SLUGS),
  'platform_admin',
];

interface MigrationOptions {
  dryRun?: boolean;
  rollback?: boolean;
}

export async function runRoleMigration(opts: MigrationOptions = {}) {
  const isDryRun = !!opts.dryRun;
  const isRollback = !!opts.rollback;

  console.log(`\n==================================================`);
  console.log(`ROLE & USER INDEX MIGRATION SCRIPT`);
  console.log(`Mode: ${isRollback ? 'ROLLBACK' : isDryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`==================================================\n`);

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection is not open');
  }

  const roleCol = db.collection('roles');
  const userCol = db.collection('users');
  const overrideCol = db.collection('tenantroleoverrides');

  // 1. Inspect existing indexes
  const currentRoleIndexes = await roleCol.indexes();
  const roleIndexNames = new Set(currentRoleIndexes.map((idx) => idx.name));
  console.log('Current Role Indexes:', Array.from(roleIndexNames));

  if (isRollback) {
    console.log('\n--- Evaluating Rollback Feasibility ---');
    // Check if duplicate custom slugs exist across tenants
    const customRoles = await roleCol.find({ isSystemRole: false }).toArray();
    const slugCounts = new Map<string, number>();
    for (const r of customRoles) {
      slugCounts.set(r.slug, (slugCounts.get(r.slug) || 0) + 1);
    }
    const duplicateSlugs = Array.from(slugCounts.entries()).filter(([_, count]) => count > 1);

    if (duplicateSlugs.length > 0) {
      console.error('ABORT ROLLBACK: Duplicate custom slugs exist across tenants:');
      for (const [slug, count] of duplicateSlugs) {
        console.error(`  - Slug "${slug}" is used by ${count} different tenant roles.`);
      }
      console.error('Cannot restore global unique slug_1 index without violating uniqueness.');
      console.error('Schema is in forward-only state.');
      return { success: false, reason: 'DUPLICATE_CUSTOM_SLUGS_EXIST' };
    }

    if (!isDryRun) {
      if (roleIndexNames.has('system_role_slug_unique')) {
        await roleCol.dropIndex('system_role_slug_unique');
        console.log('Dropped system_role_slug_unique');
      }
      if (roleIndexNames.has('custom_role_tenant_slug_unique')) {
        await roleCol.dropIndex('custom_role_tenant_slug_unique');
        console.log('Dropped custom_role_tenant_slug_unique');
      }
      if (!roleIndexNames.has('slug_1')) {
        await roleCol.createIndex({ slug: 1 }, { unique: true, name: 'slug_1' });
        console.log('Restored global unique slug_1 index');
      }
    }
    console.log('Rollback completed successfully.');
    return { success: true };
  }

  // 2. Classify & verify all role documents
  console.log('\n--- Step 1: Inspecting & Classifying Role Documents ---');
  const allRoles = await roleCol.find({}).toArray();
  console.log(`Found ${allRoles.length} total role documents.`);

  for (const role of allRoles) {
    const isReserved = RESERVED_SLUGS.includes(role.slug);
    const hasTenant = !!role.tenantId;

    if (role.isSystemRole === undefined || role.isSystemRole === null) {
      if (isReserved && !hasTenant) {
        console.log(`  [CLASSIFY] Setting isSystemRole=true for reserved system role: ${role.slug}`);
        if (!isDryRun) {
          await roleCol.updateOne({ _id: role._id }, { $set: { isSystemRole: true } });
        }
      } else if (!isReserved && hasTenant) {
        console.log(`  [CLASSIFY] Setting isSystemRole=false for tenant custom role: ${role.slug}`);
        if (!isDryRun) {
          await roleCol.updateOne({ _id: role._id }, { $set: { isSystemRole: false } });
        }
      } else {
        throw new Error(
          `AMBIGUOUS ROLE DATA: Role "${role.name}" (${role._id}) has slug="${role.slug}", tenantId=${role.tenantId}. Cannot determine if system or custom role.`
        );
      }
    } else {
      // Validate model invariant
      if (role.isSystemRole && hasTenant) {
        console.warn(`  [WARNING] System role "${role.slug}" has tenantId set: ${role.tenantId}`);
      }
      if (!role.isSystemRole && !hasTenant) {
        throw new Error(
          `INVARIANT VIOLATION: Custom role "${role.slug}" (${role._id}) is missing tenantId.`
        );
      }
    }
  }

  // 3. Migrate Role Indexes
  console.log('\n--- Step 2: Role Index Migration ---');
  if (roleIndexNames.has('slug_1')) {
    console.log('  Dropping obsolete global unique slug_1 index...');
    if (!isDryRun) {
      await roleCol.dropIndex('slug_1');
      console.log('  Dropped slug_1 successfully.');
    }
  } else {
    console.log('  slug_1 index is already dropped (idempotent).');
  }

  if (!roleIndexNames.has('system_role_slug_unique')) {
    console.log('  Creating partial unique index system_role_slug_unique on { slug: 1 }...');
    if (!isDryRun) {
      await roleCol.createIndex(
        { slug: 1 },
        {
          unique: true,
          partialFilterExpression: { isSystemRole: true },
          name: 'system_role_slug_unique',
        }
      );
      console.log('  Created system_role_slug_unique successfully.');
    }
  } else {
    console.log('  system_role_slug_unique index already exists (idempotent).');
  }

  if (!roleIndexNames.has('custom_role_tenant_slug_unique')) {
    console.log('  Creating partial unique index custom_role_tenant_slug_unique on { tenantId: 1, slug: 1 }...');
    if (!isDryRun) {
      await roleCol.createIndex(
        { tenantId: 1, slug: 1 },
        {
          unique: true,
          partialFilterExpression: { isSystemRole: false },
          name: 'custom_role_tenant_slug_unique',
        }
      );
      console.log('  Created custom_role_tenant_slug_unique successfully.');
    }
  } else {
    console.log('  custom_role_tenant_slug_unique index already exists (idempotent).');
  }

  // 4. Update Admin Role with roles:create
  console.log('\n--- Step 3: Admin Role `roles:create` Synchronization ---');
  const adminRole = await roleCol.findOne({ slug: 'admin', isSystemRole: true });
  if (adminRole) {
    const rolesEntry = adminRole.permissions?.find((p: any) => p.module === 'roles');
    if (!rolesEntry || !rolesEntry.actions.includes('create')) {
      console.log('  Adding "create" action to Admin role under "roles" module...');
      if (!isDryRun) {
        if (rolesEntry) {
          await roleCol.updateOne(
            { _id: adminRole._id, 'permissions.module': 'roles' },
            { $addToSet: { 'permissions.$.actions': 'create' } }
          );
        } else {
          await roleCol.updateOne(
            { _id: adminRole._id },
            { $push: { permissions: { module: 'roles', actions: ['view', 'create', 'edit'] } } as any }
          );
        }
        console.log('  Admin role updated with roles:create.');
      }
    } else {
      console.log('  Admin role already has roles:create (idempotent).');
    }
  }

  // Check if any tenant overrides for admin exist
  const adminOverrides = await overrideCol.find({}).toArray();
  console.log(`  Found ${adminOverrides.length} TenantRoleOverride records.`);
  console.log('  Note: Existing TenantRoleOverride records are intentionally preserved and NOT overwritten.');

  // 5. Cleanup deprecated users:delete action
  console.log('\n--- Step 4: Sanitizing Deprecated `users:delete` Action ---');
  if (!isDryRun) {
    const roleCleanRes = await roleCol.updateMany(
      { 'permissions.module': 'users' },
      { $pull: { 'permissions.$[elem].actions': 'delete' } as any },
      { arrayFilters: [{ 'elem.module': 'users' }] }
    );
    console.log(`  Cleaned users:delete from ${roleCleanRes.modifiedCount} Role records.`);

    const overrideCleanRes = await overrideCol.updateMany(
      { 'permissions.module': 'users' },
      { $pull: { 'permissions.$[elem].actions': 'delete' } as any },
      { arrayFilters: [{ 'elem.module': 'users' }] }
    );
    console.log(`  Cleaned users:delete from ${overrideCleanRes.modifiedCount} TenantRoleOverride records.`);
  }

  // 6. User Index Optimization
  console.log('\n--- Step 5: User ESR Compound Index ---');
  const currentUserIndexes = await userCol.indexes();
  const userIndexNames = new Set(currentUserIndexes.map((idx) => idx.name));
  const targetUserIndexName = 'tenantId_1_isArchived_1_createdAt_-1';

  if (!userIndexNames.has(targetUserIndexName)) {
    console.log(`  Creating compound ESR index on users { tenantId: 1, isArchived: 1, createdAt: -1 }...`);
    if (!isDryRun) {
      await userCol.createIndex(
        { tenantId: 1, isArchived: 1, createdAt: -1 },
        { name: targetUserIndexName }
      );
      console.log('  Created compound ESR index on users successfully.');
    }
  } else {
    console.log('  User compound ESR index already exists (idempotent).');
  }

  // 7. Verify Final Indexes
  console.log('\n--- Step 6: Post-Migration Index Verification ---');
  const finalRoleIndexes = await roleCol.indexes();
  console.log('Final Role Indexes:');
  for (const idx of finalRoleIndexes) {
    console.log(`  - ${idx.name}:`, JSON.stringify(idx.key), idx.partialFilterExpression ? `(partial: ${JSON.stringify(idx.partialFilterExpression)})` : '');
  }

  console.log('\nMigration completed successfully!');
  return { success: true };
}

// Direct execution
if (require.main === module) {
  const isRollback = process.argv.includes('--rollback');
  const isDryRun = process.argv.includes('--dry-run');

  mongoose
    .connect(process.env.MONGODB_URI as string)
    .then(() => runRoleMigration({ dryRun: isDryRun, rollback: isRollback }))
    .then(() => mongoose.disconnect())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
