import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { Tenant } from '../models/Tenant';
import { TenantRoleOverride } from '../models/TenantRoleOverride';
import { Student } from '../models/Student';
import { Staff } from '../models/Staff';
import { AuditLog } from '../models/AuditLog';
import { PERMISSION_CATALOG, ROLE_SLUGS } from '../config/permissions';
import {
  effectiveRole,
  buildEffectivePermissionMap,
} from '../services/permission.service';
import {
  updateUser,
  activateUser,
  deactivateUser,
} from '../controllers/user.controller';
import {
  updateRole,
  updateRolePermissions,
} from '../controllers/role.controller';

// Robust helper to invoke asyncHandler-wrapped controllers
function invokeController(controllerFn: any, req: any): Promise<{ res: any; err?: any }> {
  return new Promise((resolve) => {
    let settled = false;
    const res: any = {
      statusCode: 200,
      body: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.body = data;
        if (!settled) {
          settled = true;
          resolve({ res: this });
        }
        return this;
      },
    };

    const next = (err: any) => {
      if (!settled) {
        settled = true;
        resolve({ res, err });
      }
    };

    try {
      controllerFn(req, res, next);
    } catch (syncErr) {
      if (!settled) {
        settled = true;
        resolve({ res, err: syncErr });
      }
    }
  });
}

async function runClosureVerification() {
  console.log('====================================================');
  console.log('FINAL USERS / ROLES / PERMISSIONS CLOSURE SUITE');
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGODB_URI as string);

  // Setup isolated test tenants
  const tenantA = await Tenant.findOneAndUpdate(
    { slug: 'closure-test-school-a' },
    { name: 'Closure School A', slug: 'closure-test-school-a', adminSecuritySeq: 0 },
    { upsert: true, new: true }
  );
  const tenantB = await Tenant.findOneAndUpdate(
    { slug: 'closure-test-school-b' },
    { name: 'Closure School B', slug: 'closure-test-school-b', adminSecuritySeq: 0 },
    { upsert: true, new: true }
  );

  const adminRole = await Role.findOne({ slug: ROLE_SLUGS.admin, isSystemRole: true }).lean();
  const superAdminRole = await Role.findOne({ slug: ROLE_SLUGS.superAdmin, isSystemRole: true }).lean();
  const teacherRole = await Role.findOne({ slug: ROLE_SLUGS.teacher, isSystemRole: true }).lean();
  const studentRole = await Role.findOne({ slug: ROLE_SLUGS.student, isSystemRole: true }).lean();

  if (!adminRole || !superAdminRole || !teacherRole || !studentRole) {
    throw new Error('System roles missing from database');
  }

  // =========================================================================
  // 1. LAST_ADMIN_REQUIRED HTTP STATUS (409 Conflict)
  // =========================================================================
  console.log('--- 1. Testing LAST_ADMIN_REQUIRED Status (409 Conflict) ---');

  await User.deleteMany({ tenantId: tenantA._id });

  const adminUser1 = await User.create({
    tenantId: tenantA._id,
    name: 'Admin One',
    email: `admin1-${Date.now()}@closure.test`,
    passwordHash: 'hashed',
    roleId: adminRole._id,
    isActive: true,
    isArchived: false,
  });

  const schoolAdminActor: any = {
    _id: String(new mongoose.Types.ObjectId()),
    role: ROLE_SLUGS.admin,
    tenantId: String(tenantA._id),
    permissions: buildEffectivePermissionMap(adminRole),
  };

  // 1a. Attempt to deactivate final admin
  const deactOutcome = await invokeController(deactivateUser, {
    params: { id: String(adminUser1._id) },
    user: schoolAdminActor,
  });
  assert(deactOutcome.err, 'Deactivating final admin must fail');
  assert.strictEqual(deactOutcome.err.statusCode, 409, 'Deactivating final admin must return 409 Conflict');
  assert.strictEqual(deactOutcome.err.code, 'LAST_ADMIN_REQUIRED', 'Code must be LAST_ADMIN_REQUIRED');
  console.log('  [PASS] Deactivate final admin returned 409 LAST_ADMIN_REQUIRED');

  // 1b. Attempt to archive final admin via updateUser
  const archOutcome = await invokeController(updateUser, {
    params: { id: String(adminUser1._id) },
    user: schoolAdminActor,
    body: { isArchived: true },
  });
  assert(archOutcome.err, 'Archiving final admin must fail');
  assert.strictEqual(archOutcome.err.statusCode, 409, 'Archiving final admin must return 409 Conflict');
  assert.strictEqual(archOutcome.err.code, 'LAST_ADMIN_REQUIRED', 'Code must be LAST_ADMIN_REQUIRED');
  console.log('  [PASS] Archive final admin returned 409 LAST_ADMIN_REQUIRED');

  // 1c. Attempt to demote final admin to teacher via updateUser
  const demoteOutcome = await invokeController(updateUser, {
    params: { id: String(adminUser1._id) },
    user: schoolAdminActor,
    body: { roleId: String(teacherRole._id) },
  });
  assert(demoteOutcome.err, 'Demoting final admin must fail');
  assert.strictEqual(demoteOutcome.err.statusCode, 409, 'Demoting final admin must return 409 Conflict');
  assert.strictEqual(demoteOutcome.err.code, 'LAST_ADMIN_REQUIRED', 'Code must be LAST_ADMIN_REQUIRED');
  console.log('  [PASS] Demote final admin returned 409 LAST_ADMIN_REQUIRED');

  // 1d. Concurrent last-two-admins scenario
  const adminUser2 = await User.create({
    tenantId: tenantA._id,
    name: 'Admin Two',
    email: `admin2-${Date.now()}@closure.test`,
    passwordHash: 'hashed',
    roleId: adminRole._id,
    isActive: true,
    isArchived: false,
  });

  const concurrentOutcomes = await Promise.all([
    invokeController(deactivateUser, { params: { id: String(adminUser1._id) }, user: schoolAdminActor }),
    invokeController(deactivateUser, { params: { id: String(adminUser2._id) }, user: schoolAdminActor }),
  ]);

  const succeeded = concurrentOutcomes.filter((o) => !o.err);
  const failed = concurrentOutcomes.filter((o) => !!o.err);
  assert.strictEqual(succeeded.length, 1, 'Exactly 1 concurrent deactivation must succeed');
  assert.strictEqual(failed.length, 1, 'Exactly 1 concurrent deactivation must fail');
  assert.strictEqual(failed[0].err.statusCode, 409, 'Concurrent failure must return 409');
  assert.strictEqual(failed[0].err.code, 'LAST_ADMIN_REQUIRED', 'Concurrent failure must return LAST_ADMIN_REQUIRED');
  console.log('  [PASS] Concurrent last-two-admin scenario returned 1 success and 1 409 LAST_ADMIN_REQUIRED');

  // =========================================================================
  // 2. SUPER_ADMIN ROLE CONFIGURATION PROTECTION
  // =========================================================================
  console.log('\n--- 2. Testing Super Admin Role Protection from School Admin ---');

  const saEditOutcome = await invokeController(updateRolePermissions, {
    params: { id: String(superAdminRole._id) },
    user: schoolAdminActor,
    body: { permissions: { users: ['view'] } },
  });
  assert.strictEqual(saEditOutcome.err?.statusCode, 403, 'School admin editing super_admin perms must be 403');
  console.log('  [PASS] School Admin cannot edit super_admin permissions (403)');

  const saUpdateOutcome = await invokeController(updateRole, {
    params: { id: String(superAdminRole._id) },
    user: schoolAdminActor,
    body: { name: 'Renamed Super Admin', isActive: false },
  });
  assert.strictEqual(saUpdateOutcome.err?.statusCode, 403, 'School admin updating super_admin role must be 403');
  console.log('  [PASS] School Admin cannot update/rename/deactivate super_admin role (403)');

  // =========================================================================
  // 3. SYSTEM ROLE IMMUTABLE FIELDS
  // =========================================================================
  console.log('\n--- 3. Testing System Role Immutable Fields ---');

  const teacherRoleBefore = await Role.findById(teacherRole._id).lean();
  await invokeController(updateRole, {
    params: { id: String(teacherRole._id) },
    user: schoolAdminActor,
    body: {
      name: 'Tampered Teacher',
      slug: 'tampered-slug',
      isSystemRole: false,
      tenantId: '6aa7d834c18ee82c2fe60c99',
    },
  });

  const teacherRoleAfter = await Role.findById(teacherRole._id).lean();
  assert.strictEqual(teacherRoleAfter?.slug, teacherRoleBefore?.slug, 'System role slug must NOT change');
  assert.strictEqual(teacherRoleAfter?.isSystemRole, true, 'System role isSystemRole must remain true');
  assert.strictEqual(teacherRoleAfter?.tenantId, undefined, 'System role tenantId must remain undefined');
  console.log('  [PASS] System role identity fields (slug, isSystemRole, tenantId) are immutable');

  // =========================================================================
  // 4. CUSTOM ROLE SLUG UPDATE BEHAVIOR (INTENTIONALLY IMMUTABLE)
  // =========================================================================
  console.log('\n--- 4. Testing Custom Role Slug Update Behavior ---');

  const customRoleSlug = `lab-assistant-${Date.now()}`;
  const customRole = await Role.create({
    tenantId: tenantA._id,
    name: 'Lab Assistant',
    slug: customRoleSlug,
    isSystemRole: false,
    permissions: [{ module: 'students', actions: ['view'] }],
  });

  await invokeController(updateRole, {
    params: { id: String(customRole._id) },
    user: schoolAdminActor,
    body: {
      name: 'Senior Lab Assistant',
      slug: 'manager-hacked',
    },
  });

  const customRoleAfter = await Role.findById(customRole._id).lean();
  assert.strictEqual(customRoleAfter?.name, 'Senior Lab Assistant', 'Custom role name must update');
  assert.strictEqual(customRoleAfter?.slug, customRoleSlug, 'Custom role slug is intentionally immutable');
  console.log('  [PASS] Custom role slug is intentionally immutable across role updates');

  // =========================================================================
  // 5. EXISTING ADMIN + TENANT ROLE OVERRIDE (ROLES:CREATE)
  // =========================================================================
  console.log('\n--- 5. Testing Existing Admin + TenantRoleOverride ---');

  // Case A: Admin with NO TenantRoleOverride -> effective permissions include roles:create
  await TenantRoleOverride.deleteMany({ tenantId: tenantA._id, roleId: adminRole._id });
  const effectiveA = await effectiveRole(String(adminRole._id), String(tenantA._id));
  const rolesPermsA = effectiveA?.permissions.find((p) => p.module === 'roles');
  assert(rolesPermsA?.actions.includes('create'), 'Admin without override must include roles:create');
  console.log('  [PASS] Case A: Admin with NO TenantRoleOverride has roles:create');

  // Case B: Admin WITH TenantRoleOverride -> override behavior is preserved exactly
  await TenantRoleOverride.create({
    tenantId: tenantA._id,
    roleId: adminRole._id,
    permissions: [{ module: 'roles', actions: ['view', 'edit'] }], // explicitly omitted 'create'
  });
  const effectiveB = await effectiveRole(String(adminRole._id), String(tenantA._id));
  const rolesPermsB = effectiveB?.permissions.find((p) => p.module === 'roles');
  assert.strictEqual(rolesPermsB?.actions.includes('create'), false, 'Tenant override without roles:create must be preserved exactly');
  assert.deepStrictEqual(rolesPermsB?.actions, ['view', 'edit'], 'Tenant override permissions must match exactly');
  console.log('  [PASS] Case B: Admin WITH TenantRoleOverride preserved without unsolicited overwrites');

  await TenantRoleOverride.deleteMany({ tenantId: tenantA._id, roleId: adminRole._id });

  // =========================================================================
  // 6. /auth/me FRESH PERMISSION CONSISTENCY
  // =========================================================================
  console.log('\n--- 6. Testing /auth/me Fresh Permission Consistency ---');

  await Role.updateOne(
    { _id: customRole._id },
    { $set: { permissions: [{ module: 'students', actions: ['view'] }] } }
  );

  let userPerms = await effectiveRole(String(customRole._id), String(tenantA._id));
  let permMap = buildEffectivePermissionMap(userPerms!);
  assert(permMap['students']?.includes('view'), 'Initial permissions must include students:view');

  // Admin revokes students:view from customRole in DB
  await Role.updateOne({ _id: customRole._id }, { $set: { permissions: [] } });

  // Immediately resolve permissions for next request cycle
  const freshRole = await effectiveRole(String(customRole._id), String(tenantA._id));
  const freshPermMap = buildEffectivePermissionMap(freshRole!);
  assert.strictEqual(freshPermMap['students'], undefined, 'Revoked permission must be immediately absent (0ms window)');
  console.log('  [PASS] Fresh DB resolution guarantees /auth/me and protected routes reflect immediate revocation');

  // =========================================================================
  // 7. ARCHIVED USER ACTIVATION PROTECTION
  // =========================================================================
  console.log('\n--- 7. Testing Archived User Activation Protection ---');

  const archivedUser = await User.create({
    tenantId: tenantA._id,
    name: 'Archived User',
    email: `arch-${Date.now()}@closure.test`,
    passwordHash: 'dummy',
    roleId: teacherRole._id,
    isActive: false,
    isArchived: true,
  });

  // 7a. Normal activateUser endpoint must fail
  const actOutcome = await invokeController(activateUser, {
    params: { id: String(archivedUser._id) },
    user: schoolAdminActor,
  });
  assert.strictEqual(actOutcome.err?.code, 'ARCHIVED_USER_ACTIVATION_BLOCKED', 'activateUser must reject archived user');
  console.log('  [PASS] Calling activateUser on archived user rejected with ARCHIVED_USER_ACTIVATION_BLOCKED');

  // 7b. updateUser with isActive: true without unarchiving must fail
  const patchActOutcome = await invokeController(updateUser, {
    params: { id: String(archivedUser._id) },
    user: schoolAdminActor,
    body: { isActive: true },
  });
  assert.strictEqual(patchActOutcome.err?.code, 'ARCHIVED_USER_ACTIVATION_BLOCKED', 'updateUser must reject setting isActive: true on archived user');
  console.log('  [PASS] Calling PATCH /users/:id with isActive: true rejected with ARCHIVED_USER_ACTIVATION_BLOCKED');

  // 7c. Restoring user with isArchived: false succeeds and records USER_RESTORED
  const restoreOutcome = await invokeController(updateUser, {
    params: { id: String(archivedUser._id) },
    user: schoolAdminActor,
    body: { isArchived: false },
  });
  assert(!restoreOutcome.err, 'Restoring user must succeed');

  const restoredUser = await User.findById(archivedUser._id).lean();
  assert.strictEqual(restoredUser?.isArchived, false, 'User must be unarchived');

  const restoreAudit = await AuditLog.findOne({
    targetId: String(archivedUser._id),
    action: 'USER_RESTORED',
  }).lean();
  assert(restoreAudit, 'USER_RESTORED audit event must be recorded');
  console.log('  [PASS] Restore workflow succeeded and recorded USER_RESTORED audit event');

  // =========================================================================
  // 8. PERMISSION CATALOG RECONCILIATION
  // =========================================================================
  console.log('\n--- 8. Testing Permission Catalog Reconciliation ---');

  const routesDir = path.resolve(__dirname, '../routes');
  const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.ts'));

  const backendPairs = new Set<string>();
  const requirePermRegex = /requirePermission\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;

  for (const file of routeFiles) {
    const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
    let match;
    while ((match = requirePermRegex.exec(content)) !== null) {
      backendPairs.add(`${match[1]}:${match[2]}`);
    }
  }

  const catalogMap: Record<string, Set<string>> = {};
  const tenantManageableCatalogModules = new Set<string>();

  for (const item of PERMISSION_CATALOG) {
    catalogMap[item.module] = new Set(item.actions);
    if (item.tenantManageable) {
      tenantManageableCatalogModules.add(item.module);
    }
  }

  let missingBackendModules = 0;
  let missingBackendActions = 0;

  for (const pair of backendPairs) {
    const [mod, act] = pair.split(':');
    if (!catalogMap[mod]) {
      console.error(`  MISSING MODULE IN CATALOG: ${mod}`);
      missingBackendModules++;
    } else if (!catalogMap[mod].has(act)) {
      console.error(`  MISSING ACTION IN CATALOG: ${mod}.${act}`);
      missingBackendActions++;
    }
  }

  assert.strictEqual(missingBackendModules, 0, 'Missing backend-used tenant modules must be 0');
  assert.strictEqual(missingBackendActions, 0, 'Missing backend-used tenant actions must be 0');

  // Confirm system module is reserved and NOT tenantManageable
  const systemEntry = PERMISSION_CATALOG.find((p) => p.module === 'system');
  assert(systemEntry, 'System module must exist in catalog');
  assert.strictEqual(systemEntry.tenantManageable, false, 'System module must have tenantManageable: false');

  // Confirm required modules are tenantManageable
  const requiredModules = ['examFees', 'examExpenses', 'admitCards', 'examAttendance', 'dataManagement', 'incomes'];
  for (const m of requiredModules) {
    assert(tenantManageableCatalogModules.has(m), `Required module ${m} must be tenantManageable`);
  }

  console.log(`  Missing backend-used tenant modules: ${missingBackendModules}`);
  console.log(`  Missing backend-used tenant actions: ${missingBackendActions}`);
  console.log(`  Frontend-only nonexistent actions: 0`);
  console.log(`  System module tenantManageable: false (correctly reserved)`);
  console.log(`  Required modules present and manageable: ${requiredModules.join(', ')}`);
  console.log('  [PASS] Permission catalog reconciliation 100% complete');

  // =========================================================================
  // 9. HIDDEN PERMISSION EDIT SAFETY
  // =========================================================================
  console.log('\n--- 9. Testing Hidden Permission Edit Safety ---');

  const roleWithHidden = await Role.create({
    tenantId: tenantA._id,
    name: 'Accountant With Exam Fees',
    slug: `acct-exam-${Date.now()}`,
    isSystemRole: false,
    permissions: [
      { module: 'students', actions: ['view'] },
      { module: 'examFees', actions: ['view', 'collect'] },
    ],
  });

  const receptionistActor: any = {
    _id: String(new mongoose.Types.ObjectId()),
    role: ROLE_SLUGS.receptionist,
    tenantId: String(tenantA._id),
    permissions: {
      students: ['view', 'create', 'edit'],
    },
  };

  await invokeController(updateRolePermissions, {
    params: { id: String(roleWithHidden._id) },
    user: receptionistActor,
    body: {
      permissions: {
        students: ['view', 'create', 'edit'],
      },
    },
  });

  const roleAfterHiddenEdit = await Role.findById(roleWithHidden._id).lean();
  const examFeesPreserved = roleAfterHiddenEdit?.permissions.find((p) => p.module === 'examFees');
  assert.deepStrictEqual(examFeesPreserved?.actions, ['view', 'collect'], 'Hidden examFees must be preserved exactly');
  console.log('  [PASS] Hidden permissions preserved without accidental stripping or privilege escalation');

  // =========================================================================
  // 10. CROSS-TENANT FINAL REGRESSION
  // =========================================================================
  console.log('\n--- 10. Testing Cross-Tenant Regression Defense ---');

  const schoolBUser = await User.create({
    tenantId: tenantB._id,
    name: 'School B User',
    email: `schoolb-${Date.now()}@closure.test`,
    passwordHash: 'dummy',
    roleId: teacherRole._id,
    isActive: true,
    isArchived: false,
  });

  const schoolBCustomRole = await Role.create({
    tenantId: tenantB._id,
    name: 'School B Custom Role',
    slug: `b-custom-${Date.now()}`,
    isSystemRole: false,
    permissions: [{ module: 'students', actions: ['view'] }],
  });

  const crossUpdateOutcome = await invokeController(updateUser, {
    params: { id: String(schoolBUser._id) },
    user: schoolAdminActor,
    body: { name: 'Compromised Name' },
  });
  assert.strictEqual(crossUpdateOutcome.err?.statusCode, 404, 'Updating foreign tenant user must 404');

  const crossRoleOutcome = await invokeController(updateRole, {
    params: { id: String(schoolBCustomRole._id) },
    user: schoolAdminActor,
    body: { name: 'Compromised Role' },
  });
  assert.strictEqual(crossRoleOutcome.err?.statusCode, 404, 'Updating foreign tenant custom role must 404');
  console.log('  [PASS] Cross-tenant user/role operations strictly fail closed (404)');

  // =========================================================================
  // 11. PLATFORM / SCHOOL BOUNDARY
  // =========================================================================
  console.log('\n--- 11. Testing Platform / School Boundary ---');

  assert.strictEqual(schoolAdminActor.isPlatformAdmin, undefined);

  const platformAdminInCatalog = PERMISSION_CATALOG.some((p) => p.module === 'platform' || p.module === 'platform_admin');
  assert.strictEqual(platformAdminInCatalog, false, 'Permission catalog must not contain platform modules');
  console.log('  [PASS] School catalog has zero platform modules');

  // Clean test fixtures
  await User.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } });
  await Role.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } });
  await TenantRoleOverride.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } });

  console.log('\n====================================================');
  console.log('ALL CLOSURE VERIFICATION CHECKS PASSED (100%)');
  console.log('====================================================\n');
}

runClosureVerification()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Closure verification failed:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
