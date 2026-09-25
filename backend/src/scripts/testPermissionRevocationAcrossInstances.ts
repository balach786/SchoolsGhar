import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { Tenant } from '../models/Tenant';
import { TenantRoleOverride } from '../models/TenantRoleOverride';
import { effectiveRole, buildEffectivePermissionMap } from '../services/permission.service';
import { hashPassword } from '../utils/security';

async function main() {
  console.log('====================================================');
  console.log('TESTING ZERO-STALE MULTI-INSTANCE PERMISSION REVOCATION');
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGODB_URI as string);

  const testTenant = await Tenant.findOneAndUpdate(
    { slug: 'perm-revocation-tenant' },
    {
      $setOnInsert: {
        name: 'Permission Revocation Test Tenant',
        slug: 'perm-revocation-tenant',
        ownerUserId: new mongoose.Types.ObjectId(),
        contactEmail: 'revoc@school.test',
        status: 'active',
        subscriptionStatus: 'active',
        trialStartedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 86400000),
      },
    },
    { upsert: true, new: true }
  );

  // Create a dedicated custom role for this test
  const testRole = await Role.create({
    tenantId: testTenant._id,
    name: 'Inspector Role',
    slug: `inspector-${Date.now()}`,
    isSystemRole: false,
    permissions: [
      { module: 'students', actions: ['view', 'edit'] },
    ],
  });

  const testUser = await User.create({
    tenantId: testTenant._id,
    name: 'Inspector User',
    email: `inspector-${Date.now()}@school.test`,
    passwordHash: await hashPassword('Password123!'),
    roleId: testRole._id,
    isActive: true,
    isArchived: false,
  });

  console.log('1. Simulating Instance B request: user evaluates permissions with students:edit');
  // Instance B evaluates request by calling effectiveRole & buildEffectivePermissionMap directly from MongoDB
  const roleOnInstanceB_1 = await effectiveRole(String(testUser.roleId), String(testTenant._id));
  const permsOnInstanceB_1 = buildEffectivePermissionMap(roleOnInstanceB_1);

  const hasEditBefore = permsOnInstanceB_1['students']?.includes('edit');
  console.log('   Instance B evaluation before revocation:', hasEditBefore ? 'ALLOWED (students:edit present)' : 'DENIED');
  if (!hasEditBefore) {
    throw new Error('Initial permission check failed');
  }

  console.log('2. Admin on Instance A immediately revokes students:edit from MongoDB');
  // Instance A writes permission revocation to MongoDB
  await Role.updateOne(
    { _id: testRole._id },
    { $set: { permissions: [{ module: 'students', actions: ['view'] }] } }
  );

  console.log('3. Immediately (0ms) evaluate next request on Instance B');
  // Next request arrives on Instance B — authenticate evaluates live DB state
  const roleOnInstanceB_2 = await effectiveRole(String(testUser.roleId), String(testTenant._id));
  const permsOnInstanceB_2 = buildEffectivePermissionMap(roleOnInstanceB_2);

  const hasEditAfter = permsOnInstanceB_2['students']?.includes('edit');
  console.log('   Instance B evaluation immediately after revocation:', hasEditAfter ? 'ALLOWED (STALE!)' : 'DENIED (403)');

  if (hasEditAfter) {
    throw new Error('FAILED: Stale permission window detected! Instance B served old permissions.');
  }

  console.log('\n[PASS] Multi-instance permission revocation is LIVE (0-second stale window)!');

  // Cleanup
  await User.deleteOne({ _id: testUser._id });
  await Role.deleteOne({ _id: testRole._id });
  await Tenant.deleteOne({ _id: testTenant._id });
}

main()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Revocation test error:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
