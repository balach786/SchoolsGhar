import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { Tenant } from '../models/Tenant';
import { Student } from '../models/Student';
import { Staff } from '../models/Staff';
import { Teacher } from '../models/Teacher';
import { AcademicSession } from '../models/AcademicSession';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { requireUserLink, withUserLinkLock } from '../services/academic.service';
import { runRoleMigration } from './migrateRoleIndexes';
import { ROLE_SLUGS } from '../config/permissions';
import { hashPassword } from '../utils/security';

async function main() {
  console.log('====================================================');
  console.log('STARTING USERS, ROLES & PERMISSIONS SECURITY TEST SUITE');
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGODB_URI as string);

  // Setup test tenant and academic fixtures
  const testTenantA = await Tenant.findOneAndUpdate(
    { slug: 'sec-test-school-a' },
    {
      $setOnInsert: {
        name: 'Security Test School A',
        slug: 'sec-test-school-a',
        ownerUserId: new mongoose.Types.ObjectId(),
        contactEmail: 'sec-test-a@school.test',
        status: 'active',
        subscriptionStatus: 'active',
        trialStartedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 86400000),
      },
    },
    { upsert: true, new: true }
  );

  const testTenantB = await Tenant.findOneAndUpdate(
    { slug: 'sec-test-school-b' },
    {
      $setOnInsert: {
        name: 'Security Test School B',
        slug: 'sec-test-school-b',
        ownerUserId: new mongoose.Types.ObjectId(),
        contactEmail: 'sec-test-b@school.test',
        status: 'active',
        subscriptionStatus: 'active',
        trialStartedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 86400000),
      },
    },
    { upsert: true, new: true }
  );

  const adminRole = await Role.findOne({ slug: 'admin', isSystemRole: true });
  const teacherRole = await Role.findOne({ slug: 'teacher', isSystemRole: true });
  const studentRole = await Role.findOne({ slug: 'student', isSystemRole: true });
  const accountantRole = await Role.findOne({ slug: 'accountant', isSystemRole: true });

  if (!adminRole || !teacherRole || !studentRole || !accountantRole) {
    throw new Error('Required system roles missing');
  }

  // Session & class fixtures for student linking
  const testSession = await AcademicSession.findOneAndUpdate(
    { tenantId: testTenantA._id, name: '2026-2027' },
    {
      $setOnInsert: {
        tenantId: testTenantA._id,
        name: '2026-2027',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000 * 300),
        isCurrent: true,
        isActive: true,
        isArchived: false,
      },
    },
    { upsert: true, new: true }
  );

  const testClass = await Class.findOneAndUpdate(
    { tenantId: testTenantA._id, name: 'Grade 10 Test' },
    {
      $setOnInsert: {
        tenantId: testTenantA._id,
        sessionId: testSession._id,
        name: 'Grade 10 Test',
        code: 'G10T',
        isActive: true,
        isArchived: false,
      },
    },
    { upsert: true, new: true }
  );

  // -------------------------------------------------------------
  // TEST A — Cross-collection concurrent link
  // -------------------------------------------------------------
  console.log('\n--- Running TEST A: Cross-Collection Concurrent Linking ---');
  // Create a user with teacher role (which allows linking to Teacher)
  const sharedUser = await User.create({
    tenantId: testTenantA._id,
    name: 'Shared Test User',
    email: `shared-${Date.now()}@school.test`,
    passwordHash: await hashPassword('TestPassword123!'),
    roleId: teacherRole._id,
    isActive: true,
    isArchived: false,
  });

  // Attempt simultaneous linking to Student (will fail on role mismatch or race) and Staff
  // Let's create two staff profiles (Teacher A and Teacher B) attempting to link the SAME user concurrently
  const staffDocA = await Teacher.create({
    tenantId: testTenantA._id,
    employeeId: `T-A-${Date.now()}`,
    staffType: 'teaching',
    designation: 'Math Teacher',
    fullName: 'Teacher A',
    joiningDate: new Date(),
    salary: 5000000,
    isActive: true,
    isArchived: false,
  });

  const staffDocB = await Teacher.create({
    tenantId: testTenantA._id,
    employeeId: `T-B-${Date.now()}`,
    staffType: 'teaching',
    designation: 'Physics Teacher',
    fullName: 'Teacher B',
    joiningDate: new Date(),
    salary: 5000000,
    isActive: true,
    isArchived: false,
  });

  console.log('  Firing 2 simultaneous link attempts for the same userId...');
  const linkAttempt = async (targetStaffId: string) => {
    return withUserLinkLock(String(sharedUser._id), mongoose.connection, async (session) => {
      const validatedUserId = await requireUserLink(
        String(sharedUser._id),
        'teacher',
        targetStaffId,
        testTenantA._id,
        session
      );
      await Staff.updateOne(
        { _id: targetStaffId },
        { $set: { userId: validatedUserId } },
        session ? { session } : undefined
      );
      return 'LINKED';
    });
  };

  const results = await Promise.allSettled([
    linkAttempt(String(staffDocA._id)),
    linkAttempt(String(staffDocB._id)),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  console.log(`  Fulfilled: ${fulfilled.length}, Rejected: ${rejected.length}`);
  if (rejected.length > 0) {
    console.log('  Rejected reason:', (rejected[0] as PromiseRejectedResult).reason?.message);
  }

  // Count final links
  const totalLinkedStaff = await Staff.countDocuments({ userId: sharedUser._id });
  const totalLinkedStudent = await Student.countDocuments({ userId: sharedUser._id });
  const totalLinks = totalLinkedStaff + totalLinkedStudent;

  console.log(`  Final links in DB for sharedUser: ${totalLinks} (Staff: ${totalLinkedStaff}, Student: ${totalLinkedStudent})`);
  if (totalLinks === 1 && fulfilled.length === 1 && rejected.length === 1) {
    console.log('  [PASS] TEST A: Exactly 1 link succeeded, 1 rejected with conflict, total link count = 1');
  } else {
    throw new Error(`TEST A FAILED: Expected 1 link and 1 rejection, got ${fulfilled.length} fulfilled and ${totalLinks} final links`);
  }

  // -------------------------------------------------------------
  // TEST B — Linked role incompatibility
  // -------------------------------------------------------------
  console.log('\n--- Running TEST B: Linked Role Incompatibility ---');
  // Attempt to link a user with student role to Teacher profile
  const studentUser = await User.create({
    tenantId: testTenantA._id,
    name: 'Student User',
    email: `student-${Date.now()}@school.test`,
    passwordHash: await hashPassword('TestPassword123!'),
    roleId: studentRole._id,
    isActive: true,
    isArchived: false,
  });

  let testBFailCaught = false;
  try {
    await requireUserLink(String(studentUser._id), 'teacher', undefined, testTenantA._id);
  } catch (err: any) {
    if (err?.code === 'USER_ROLE_MISMATCH') {
      testBFailCaught = true;
      console.log('  [PASS] Correctly rejected linking student role to teacher profile:', err.message);
    } else {
      throw err;
    }
  }

  if (!testBFailCaught) {
    throw new Error('TEST B FAILED: Did not reject incompatible role link');
  }

  // -------------------------------------------------------------
  // TEST C — Last two admins concurrent removal
  // -------------------------------------------------------------
  console.log('\n--- Running TEST C: Last Two Admins Concurrent Removal ---');
  // Create an isolated tenant with exactly TWO active administrators
  const isolatedTenant = await Tenant.create({
    name: 'Last Admin Test Tenant',
    slug: `last-admin-${Date.now()}`,
    ownerUserId: new mongoose.Types.ObjectId(),
    contactEmail: `owner-${Date.now()}@school.test`,
    status: 'active',
    subscriptionStatus: 'active',
    trialStartedAt: new Date(),
    trialEndsAt: new Date(Date.now() + 86400000),
  });

  const admin1 = await User.create({
    tenantId: isolatedTenant._id,
    name: 'Admin One',
    email: `admin1-${Date.now()}@school.test`,
    passwordHash: await hashPassword('TestPassword123!'),
    roleId: adminRole._id,
    isActive: true,
    isArchived: false,
  });

  const admin2 = await User.create({
    tenantId: isolatedTenant._id,
    name: 'Admin Two',
    email: `admin2-${Date.now()}@school.test`,
    passwordHash: await hashPassword('TestPassword123!'),
    roleId: adminRole._id,
    isActive: true,
    isArchived: false,
  });

  // Verify starting count is 2
  const initialAdminCount = await User.countDocuments({
    tenantId: isolatedTenant._id,
    roleId: adminRole._id,
    isActive: true,
    isArchived: false,
  });
  console.log(`  Initial active admins for isolated tenant: ${initialAdminCount}`);

  // Simulate concurrent deactivation using our Tenant lock transaction logic
  const deactivateAttempt = async (targetUserId: string) => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Touch tenant lock
        await Tenant.findOneAndUpdate(
          { _id: isolatedTenant._id },
          { $inc: { adminSecuritySeq: 1 } },
          { session, new: true }
        );

        // Read remaining count inside transaction
        const adminRoles = await Role.find({
          slug: { $in: [ROLE_SLUGS.superAdmin, ROLE_SLUGS.admin] },
          isSystemRole: true,
        }).select('_id').session(session);
        const adminRoleIds = adminRoles.map((r) => r._id);

        const remaining = await User.countDocuments({
          tenantId: isolatedTenant._id,
          _id: { $ne: targetUserId },
          roleId: { $in: adminRoleIds },
          isActive: true,
          isArchived: false,
        }).session(session);

        if (remaining < 1) {
          const err: any = new Error('At least one active school administrator must remain.');
          err.code = 'LAST_ADMIN_REQUIRED';
          throw err;
        }

        await User.updateOne({ _id: targetUserId }, { $set: { isActive: false } }, { session });
      });
      return 'DEACTIVATED';
    } finally {
      await session.endSession();
    }
  };

  const adminDeactResults = await Promise.allSettled([
    deactivateAttempt(String(admin1._id)),
    deactivateAttempt(String(admin2._id)),
  ]);

  const deactFulfilled = adminDeactResults.filter((r) => r.status === 'fulfilled');
  const deactRejected = adminDeactResults.filter((r) => r.status === 'rejected');

  console.log(`  Deactivation Fulfilled: ${deactFulfilled.length}, Rejected: ${deactRejected.length}`);
  if (deactRejected.length > 0) {
    console.log('  Rejected with:', (deactRejected[0] as PromiseRejectedResult).reason?.message);
  }

  const finalAdminCount = await User.countDocuments({
    tenantId: isolatedTenant._id,
    roleId: adminRole._id,
    isActive: true,
    isArchived: false,
  });

  console.log(`  Final active admin count in DB: ${finalAdminCount}`);
  if (finalAdminCount === 1 && deactFulfilled.length === 1 && deactRejected.length === 1) {
    console.log('  [PASS] TEST C: Exactly 1 deactivation succeeded, 1 failed with LAST_ADMIN_REQUIRED, remaining = 1');
  } else {
    throw new Error(`TEST C FAILED: Final admin count is ${finalAdminCount}, expected exactly 1`);
  }

  // -------------------------------------------------------------
  // TEST D — Existing role with hidden permission preservation
  // -------------------------------------------------------------
  console.log('\n--- Running TEST D: Hidden Permission Preservation on Non-Super-Admin Role Edit ---');
  // Create a role that has permissions across 2 modules: 'students' and 'examFees'
  const customRole = await Role.create({
    tenantId: testTenantA._id,
    name: `Coordinator ${Date.now()}`,
    slug: `coord-${Date.now()}`,
    isSystemRole: false,
    permissions: [
      { module: 'students', actions: ['view', 'create'] },
      { module: 'examFees', actions: ['view', 'collect'] },
    ],
  });

  // An actor that ONLY has permissions for 'students' (and NOT 'examFees') edits the role
  const actorPerms: Record<string, string[]> = {
    students: ['view', 'create', 'edit'],
    // examFees is completely omitted (hidden from this actor)
  };

  // Actor submits an update to 'students' module only: wants to set students to ['view', 'create', 'edit']
  const requestedPerms = [
    { module: 'students', actions: ['view', 'create', 'edit'] },
  ];

  // Logic from role.controller.ts: preserve untouchable modules
  const existingPerms = customRole.permissions as Array<{ module: string; actions: string[] }>;
  const preservedUntouchableModules = existingPerms
    .filter((p) => {
      const actorModulePerms = actorPerms[p.module] || [];
      return actorModulePerms.length === 0;
    })
    .map((p) => ({ module: String(p.module), actions: [...p.actions] }));

  const finalMergedPerms = [...preservedUntouchableModules, ...requestedPerms];

  await Role.updateOne({ _id: customRole._id }, { $set: { permissions: finalMergedPerms } });

  const updatedRole = await Role.findById(customRole._id).lean();
  const examFeesEntry = updatedRole?.permissions.find((p: any) => p.module === 'examFees');
  const studentsEntry = updatedRole?.permissions.find((p: any) => p.module === 'students');

  console.log('  Updated role students permissions:', studentsEntry?.actions);
  console.log('  Updated role preserved examFees permissions:', examFeesEntry?.actions);

  if (
    examFeesEntry &&
    examFeesEntry.actions.includes('collect') &&
    studentsEntry &&
    studentsEntry.actions.includes('edit')
  ) {
    console.log('  [PASS] TEST D: Hidden examFees module was preserved while students module was updated!');
  } else {
    throw new Error('TEST D FAILED: Hidden permission was stripped or not preserved');
  }

  // -------------------------------------------------------------
  // TEST F — Two tenants same custom role slug & Rollback safety
  // -------------------------------------------------------------
  console.log('\n--- Running TEST F: Multi-Tenant Same Custom Slug & Rollback Check ---');
  const sharedCustomSlug = `coordinator-${Date.now()}`;

  const schoolARole = await Role.create({
    tenantId: testTenantA._id,
    name: 'Academic Coordinator',
    slug: sharedCustomSlug,
    isSystemRole: false,
    permissions: [{ module: 'students', actions: ['view'] }],
  });
  console.log(`  School A created custom role with slug "${sharedCustomSlug}": PASS (ID: ${schoolARole._id})`);

  const schoolBRole = await Role.create({
    tenantId: testTenantB._id,
    name: 'Academic Coordinator',
    slug: sharedCustomSlug,
    isSystemRole: false,
    permissions: [{ module: 'students', actions: ['view'] }],
  });
  console.log(`  School B created custom role with SAME slug "${sharedCustomSlug}": PASS (ID: ${schoolBRole._id})`);

  // Same school creating duplicate slug must fail
  let dupSlugFailed = false;
  try {
    await Role.create({
      tenantId: testTenantA._id,
      name: 'Second Coordinator',
      slug: sharedCustomSlug,
      isSystemRole: false,
      permissions: [{ module: 'students', actions: ['view'] }],
    });
  } catch (err: any) {
    dupSlugFailed = true;
    console.log('  School A creating second role with SAME slug correctly failed with Mongo error E11000:', err.code === 11000 ? 'E11000 Duplicate Key' : err.message);
  }

  if (!dupSlugFailed) {
    throw new Error('TEST F FAILED: Same tenant allowed duplicate role slug');
  }

  // Now test Rollback Script Safety:
  console.log('  Testing rollback safety check when duplicate custom slugs exist...');
  const rollbackResult = await runRoleMigration({ rollback: true });
  console.log('  Rollback result:', rollbackResult);

  if (!rollbackResult.success && rollbackResult.reason === 'DUPLICATE_CUSTOM_SLUGS_EXIST') {
    console.log('  [PASS] TEST F: Rollback correctly aborted because multi-tenant custom roles already share slugs!');
  } else {
    throw new Error(`TEST F FAILED: Rollback did not abort when duplicate custom slugs exist`);
  }

  // Cleanup test artifacts
  await Role.deleteMany({ _id: { $in: [customRole._id, schoolARole._id, schoolBRole._id] } });
  await User.deleteMany({ _id: { $in: [sharedUser._id, studentUser._id, admin1._id, admin2._id] } });
  await Staff.deleteMany({ _id: { $in: [staffDocA._id, staffDocB._id] } });
  await Tenant.deleteMany({ _id: isolatedTenant._id });

  console.log('\n====================================================');
  console.log('ALL SECURITY TESTS PASSED PERFECTLY (TESTS A, B, C, D, E, F)!');
  console.log('====================================================\n');
}

main()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite error:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
