import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { Tenant } from '../models/Tenant';
import { isPermissionSubset, buildEffectivePermissionMap } from '../services/permission.service';
import { ROLE_SLUGS } from '../config/permissions';

async function main() {
  console.log('====================================================');
  console.log('TESTING ROLE ASSIGNMENT CEILING & INACTIVE FILTER');
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGODB_URI as string);

  const tenant = await Tenant.findOne({ slug: 'sec-test-school-a' });
  if (!tenant) throw new Error('Tenant sec-test-school-a not found');

  const adminRole = await Role.findOne({ slug: 'admin', isSystemRole: true }).lean();
  const receptionistRole = await Role.findOne({ slug: 'receptionist', isSystemRole: true }).lean();
  const studentRole = await Role.findOne({ slug: 'student', isSystemRole: true }).lean();

  if (!adminRole || !receptionistRole || !studentRole) {
    throw new Error('System roles not found');
  }

  const adminPerms = buildEffectivePermissionMap(adminRole);
  const receptionistPerms = buildEffectivePermissionMap(receptionistRole);
  const studentPerms = buildEffectivePermissionMap(studentRole);

  console.log('1. Checking Receptionist assigning Admin role:');
  const receptionistCanAssignAdmin = isPermissionSubset(adminPerms, receptionistPerms);
  console.log('   Can receptionist assign Admin?', receptionistCanAssignAdmin ? 'YES (UNSAFE!)' : 'NO (BLOCKED - SAFE)');
  if (receptionistCanAssignAdmin) {
    throw new Error('FAILED: Role assignment ceiling allowed receptionist to assign admin role!');
  }

  console.log('2. Checking Admin assigning Receptionist role:');
  const adminCanAssignReceptionist = isPermissionSubset(receptionistPerms, adminPerms);
  console.log('   Can Admin assign Receptionist?', adminCanAssignReceptionist ? 'YES (ALLOWED)' : 'NO (UNEXPECTED)');
  if (!adminCanAssignReceptionist) {
    throw new Error('FAILED: Admin could not assign receptionist role!');
  }

  console.log('3. Checking Admin assigning Student role:');
  const adminCanAssignStudent = isPermissionSubset(studentPerms, adminPerms);
  console.log('   Can Admin assign Student?', adminCanAssignStudent ? 'YES (ALLOWED)' : 'NO (UNEXPECTED)');
  if (!adminCanAssignStudent) {
    throw new Error('FAILED: Admin could not assign student role!');
  }

  console.log('4. Checking Inactive User Filter logic:');
  // Create 3 users: active, inactive, archived
  const activeUser = await User.create({
    tenantId: tenant._id,
    name: 'Active User',
    email: `act-${Date.now()}@school.test`,
    passwordHash: 'dummy',
    roleId: studentRole._id,
    isActive: true,
    isArchived: false,
  });

  const inactiveUser = await User.create({
    tenantId: tenant._id,
    name: 'Inactive User',
    email: `inact-${Date.now()}@school.test`,
    passwordHash: 'dummy',
    roleId: studentRole._id,
    isActive: false,
    isArchived: false,
  });

  const archivedUser = await User.create({
    tenantId: tenant._id,
    name: 'Archived User',
    email: `arch-${Date.now()}@school.test`,
    passwordHash: 'dummy',
    roleId: studentRole._id,
    isActive: false,
    isArchived: true,
  });

  // Query inactive filter: { tenantId, isActive: false, isArchived: false }
  const inactiveDocs = await User.find({
    tenantId: tenant._id,
    isActive: false,
    isArchived: false,
    _id: { $in: [activeUser._id, inactiveUser._id, archivedUser._id] },
  }).lean();

  console.log(`   Inactive query returned ${inactiveDocs.length} users (expected exactly 1: the unarchived inactive user).`);
  const containsArchived = inactiveDocs.some((d) => String(d._id) === String(archivedUser._id));
  const containsInactive = inactiveDocs.some((d) => String(d._id) === String(inactiveUser._id));

  if (inactiveDocs.length === 1 && containsInactive && !containsArchived) {
    console.log('   [PASS] Inactive filter correctly excludes archived users!');
  } else {
    throw new Error('FAILED: Inactive filter returned incorrect users');
  }

  // Cleanup
  await User.deleteMany({ _id: { $in: [activeUser._id, inactiveUser._id, archivedUser._id] } });

  console.log('\n[PASS] All Role Ceiling & Inactive Filter checks succeeded!');
}

main()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test error:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
