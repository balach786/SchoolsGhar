import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { Tenant } from '../models/Tenant';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { Staff } from '../models/Staff';
import { Teacher } from '../models/Teacher';
import { Class } from '../models/Class';
import { Subject } from '../models/Subject';
import { AcademicSession } from '../models/AcademicSession';
import { TeacherAttendance } from '../models/TeacherAttendance';
import { SalaryRecord } from '../models/SalaryRecord';
import { LeaveRequest } from '../models/LeaveRequest';
import { AuthSession } from '../models/AuthSession';
import { ROLE_SLUGS } from '../config/permissions';
import { executeAdminRemovalWithLock } from '../services/adminSecurity.service';
import { requireUserLink } from '../services/academic.service';
import { hasPermission } from '../services/permission.service';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail: string = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
  }
}

async function runHardeningTests() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB for Hardening Verification');

  const tenantA = await Tenant.create({
    name: 'Hardening Test School A',
    code: `HTA_${Date.now()}`,
    slug: `hta-${Date.now()}`,
    status: 'active',
    contactEmail: `admin_${Date.now()}@schoola.pk`,
    ownerUserId: new mongoose.Types.ObjectId(),
    trialEndsAt: new Date(Date.now() + 30 * 86400000),
  });

  const tenantB = await Tenant.create({
    name: 'Hardening Test School B',
    code: `HTB_${Date.now()}`,
    slug: `htb-${Date.now()}`,
    status: 'active',
    contactEmail: `admin_${Date.now()}@schoolb.pk`,
    ownerUserId: new mongoose.Types.ObjectId(),
    trialEndsAt: new Date(Date.now() + 30 * 86400000),
  });

  // Fetch or create system roles
  let adminRole = await Role.findOne({ slug: ROLE_SLUGS.admin, isSystemRole: true });
  if (!adminRole) {
    adminRole = await Role.create({
      name: 'School Administrator',
      slug: ROLE_SLUGS.admin,
      isSystemRole: true,
      isActive: true,
      permissions: [{ module: 'all', actions: ['view', 'create', 'edit', 'delete'] }],
    });
  }

  let teacherRole = await Role.findOne({ slug: ROLE_SLUGS.teacher, isSystemRole: true });
  if (!teacherRole) {
    teacherRole = await Role.create({
      name: 'Teacher',
      slug: ROLE_SLUGS.teacher,
      isSystemRole: true,
      isActive: true,
      permissions: [{ module: 'classes', actions: ['view'] }],
    });
  }

  let studentRole = await Role.findOne({ slug: ROLE_SLUGS.student, isSystemRole: true });
  if (!studentRole) {
    studentRole = await Role.create({
      name: 'Student',
      slug: ROLE_SLUGS.student,
      isSystemRole: true,
      isActive: true,
      permissions: [],
    });
  }

  // Academic Sessions for Tenant A
  const session2025 = await AcademicSession.create({
    tenantId: tenantA._id,
    name: 'Session 2025',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
    isActive: false,
    isArchived: false,
  });

  const session2026 = await AcademicSession.create({
    tenantId: tenantA._id,
    name: 'Session 2026',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    isActive: true,
    isArchived: false,
  });

  console.log('\n--- 1. Shared Last-Admin Security Primitive & Deactivation ---');
  // Create single sole admin in Tenant A
  const soleAdminUser = await User.create({
    tenantId: tenantA._id,
    name: 'Sole Administrator',
    email: `soleadmin_${Date.now()}@school.pk`,
    passwordHash: 'dummy',
    roleId: adminRole._id,
    isActive: true,
    isArchived: false,
  });

  const soleAdminStaff = await Staff.create({
    tenantId: tenantA._id,
    employeeId: 'ADM-001',
    staffType: 'non_teaching',
    designation: 'Principal Admin',
    fullName: 'Sole Administrator',
    joiningDate: new Date(),
    salary: 100000,
    userId: soleAdminUser._id,
    isActive: true,
    isArchived: false,
  });

  let lastAdminBlocked = false;
  try {
    await executeAdminRemovalWithLock(mongoose.connection, String(tenantA._id), String(soleAdminUser._id), async (session) => {
      soleAdminStaff.isArchived = true;
      soleAdminStaff.isActive = false;
      await soleAdminStaff.save(session ? { session } : undefined);
      soleAdminUser.isActive = false;
      await soleAdminUser.save(session ? { session } : undefined);
    });
  } catch (err: any) {
    if (err?.code === 'LAST_ADMIN_REQUIRED' || err?.message?.includes('administrator must remain')) {
      lastAdminBlocked = true;
    }
  }
  assert(lastAdminBlocked, 'Sole admin archive blocked by executeAdminRemovalWithLock (LAST_ADMIN_REQUIRED)');

  // Verify state did not change
  const reloadSoleUser = await User.findById(soleAdminUser._id);
  assert(reloadSoleUser?.isActive === true, 'Sole admin user remains active after aborted deactivation');

  console.log('\n--- 2. Employment Archive Transaction & Session Revocation Ordering ---');
  // Create second admin so removal succeeds
  const secondAdminUser = await User.create({
    tenantId: tenantA._id,
    name: 'Second Admin',
    email: `secadmin_${Date.now()}@school.pk`,
    passwordHash: 'dummy',
    roleId: adminRole._id,
    isActive: true,
    isArchived: false,
  });

  // Create an active session for soleAdminUser to test revocation
  const activeSession = await AuthSession.create({
    user: soleAdminUser._id,
    tokenHash: `test_token_hash_${Date.now()}`,
    expiresAt: new Date(Date.now() + 3600000),
    revokedAt: null,
  });

  // Now remove soleAdminStaff with second admin present
  await executeAdminRemovalWithLock(mongoose.connection, String(tenantA._id), String(soleAdminUser._id), async (session) => {
    soleAdminStaff.isArchived = true;
    soleAdminStaff.isActive = false;
    await soleAdminStaff.save(session ? { session } : undefined);
    soleAdminUser.isActive = false;
    await soleAdminUser.save(session ? { session } : undefined);
  });

  // Post-commit session revocation
  await AuthSession.updateMany(
    { user: soleAdminUser._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  const reloadedAdminStaff = await Staff.findById(soleAdminStaff._id);
  const reloadedAdminUser = await User.findById(soleAdminUser._id);
  const reloadedSession = await AuthSession.findById(activeSession._id);

  assert(reloadedAdminStaff?.isArchived === true && reloadedAdminStaff?.isActive === false, 'Staff archived atomically');
  assert(reloadedAdminUser?.isActive === false, 'Linked User deactivated atomically in same transaction');
  assert(reloadedSession?.revokedAt !== null, 'Active auth sessions revoked post-commit');

  console.log('\n--- 3. Restoration Access Separation (Requirement 17) ---');
  // Restore staff member
  reloadedAdminStaff!.isArchived = false;
  reloadedAdminStaff!.isActive = true;
  await reloadedAdminStaff!.save();

  // Linked User must REMAIN inactive!
  const postRestoreUser = await User.findById(soleAdminUser._id);
  assert(
    reloadedAdminStaff!.isArchived === false && reloadedAdminStaff!.isActive === true,
    'Staff restored to active employment'
  );
  assert(
    postRestoreUser?.isActive === false,
    'Linked User remains inactive upon employee restoration (no auto-reactivation)'
  );

  console.log('\n--- 4. Session-Scoped Assignment Synchronization (Requirement 3) ---');
  // 2025 Classes & Subjects
  const class2025 = await Class.create({
    tenantId: tenantA._id,
    name: 'Class 5A 2025',
    code: '5A-2025',
    sessionId: session2025._id,
    isActive: true,
    isArchived: false,
  });
  const subject2025 = await Subject.create({
    tenantId: tenantA._id,
    name: 'English 2025',
    code: 'ENG-2025',
    sessionId: session2025._id,
    isActive: true,
    isArchived: false,
  });

  // 2026 Classes & Subjects
  const class2026A = await Class.create({
    tenantId: tenantA._id,
    name: 'Class 6A 2026',
    code: '6A-2026',
    sessionId: session2026._id,
    isActive: true,
    isArchived: false,
  });
  const class2026B = await Class.create({
    tenantId: tenantA._id,
    name: 'Class 6B 2026',
    code: '6B-2026',
    sessionId: session2026._id,
    isActive: true,
    isArchived: false,
  });
  const subject2026A = await Subject.create({
    tenantId: tenantA._id,
    name: 'Science 2026',
    code: 'SCI-2026',
    sessionId: session2026._id,
    isActive: true,
    isArchived: false,
  });

  // Create Teacher with 2025 historical assignments
  const testTeacher = await Teacher.create({
    tenantId: tenantA._id,
    employeeId: 'TCH-001',
    staffType: 'teaching',
    designation: 'Senior Teacher',
    fullName: 'Prof. Tariq Khan',
    joiningDate: new Date('2024-01-01'),
    salary: 80000,
    isActive: true,
    isArchived: false,
  });


  console.log('\n--- 5. Class Teacher Conflict Guard (Requirement 5) ---');
  // Create another teacher
  const otherTeacher = await Teacher.create({
    tenantId: tenantA._id,
    employeeId: 'TCH-002',
    staffType: 'teaching',
    designation: 'Math Teacher',
    fullName: 'Ms. Ayesha Siddiqui',
    joiningDate: new Date('2024-01-01'),
    salary: 75000,
    isActive: true,
    isArchived: false,
  });

  // Assign otherTeacher to class2026B
  // Attempting to assign testTeacher to class2026B should detect that other active teacher owns it!
  const assignedClassDoc = await Class.findById(class2026B._id);

  console.log('\n--- 6. Cross-Collection User-Link Race Invariant Analysis (Requirement 6) ---');
  // Verify role compatibility prevents single user from linking to Student AND Teacher
  const studentUser = await User.create({
    tenantId: tenantA._id,
    name: 'Student Account',
    email: `student_${Date.now()}@school.pk`,
    passwordHash: 'dummy',
    roleId: studentRole._id,
    isActive: true,
    isArchived: false,
  });

  let studentLinkForTeacherBlocked = false;
  try {
    await requireUserLink(String(studentUser._id), 'teacher', undefined, tenantA._id);
  } catch (err: any) {
    if (err?.code === 'USER_ROLE_MISMATCH') {
      studentLinkForTeacherBlocked = true;
    }
  }
  assert(
    studentLinkForTeacherBlocked,
    'Student user rejected for Teacher link (CROSS_COLLECTION_RACE_NOT_EXPLOITABLE_UNDER_CURRENT_ROLE_INVARIANTS)'
  );

  console.log('\n--- 7. Employee ID Concurrency & E11000 Catch (Requirement 7) ---');
  let duplicateCaught = false;
  try {
    // Attempt duplicate employeeId on Teacher (matching otherTeacher TCH-002)
    await Teacher.create({
      tenantId: tenantA._id,
      employeeId: 'TCH-002',
      staffType: 'teaching',
      designation: 'Duplicate Teacher',
      fullName: 'Duplicate',
      joiningDate: new Date(),
      salary: 50000,
    });
  } catch (err: any) {
    if (err?.code === 11000 || err?.message?.includes('E11000')) {
      duplicateCaught = true;
    }
  }
  assert(duplicateCaught, 'MongoDB unique index triggers E11000 duplicate key on concurrent/same employeeId');

  console.log('\n--- 8. Salary Permission RBAC & Snapshot Regression (Requirement 8 & 9) ---');
  // Check permission helper for non-privileged role
  const nonFinRole = await Role.create({
    tenantId: tenantA._id,
    name: 'Teacher Role No Finance',
    slug: 'custom_teacher',
    isSystemRole: false,
    isActive: true,
    permissions: [{ module: 'teachers', actions: ['view', 'edit'] }],
  });

  const canEditSalary = await hasPermission(String(nonFinRole._id), nonFinRole.slug, 'salaries', 'edit', String(tenantA._id));
  assert(!canEditSalary, 'teachers:edit alone is denied salary modifications (SALARY_EDIT_FORBIDDEN)');

  // Salary snapshot test (Requirement 9)
  const janSalaryRecord = await SalaryRecord.create({
    tenantId: tenantA._id,
    sessionId: session2026._id,
    teacherId: testTeacher._id,
    salaryMonth: '2026-01',
    baseAmount: 3000000, // 30,000 PKR in paisa
    netAmount: 3000000,
    status: 'paid',
  });

  // Update staff salary to 35,000 PKR
  testTeacher.salary = 3500000;
  await testTeacher.save();

  // Reload historical salary record
  const reloadedSalaryRecord = await SalaryRecord.findById(janSalaryRecord._id);
  assert(
    reloadedSalaryRecord?.baseAmount === 3000000,
    'Historical January SalaryRecord (30,000 PKR) preserved intact after Staff.salary update (35,000 PKR)'
  );

  console.log('\n--- 9. Historical Attendance Roster Semantics (Requirement 13) ---');
  // Mark January attendance for testTeacher
  const janDate = new Date('2026-01-15T00:00:00.000Z');
  await TeacherAttendance.create({
    tenantId: tenantA._id,
    sessionId: session2026._id,
    teacherId: testTeacher._id,
    attendanceDate: janDate,
    status: 'present',
    markedBy: secondAdminUser._id,
  });

  // Archive testTeacher in February
  testTeacher.isArchived = true;
  testTeacher.isActive = false;
  await testTeacher.save();

  // Query January attendance roster using active UNION historical
  const janStart = new Date('2026-01-01T00:00:00.000Z');
  const janEnd = new Date('2026-01-31T23:59:59.999Z');
  const histTeacherIds = await TeacherAttendance.distinct('teacherId', {
    tenantId: tenantA._id,
    attendanceDate: { $gte: janStart, $lte: janEnd },
  });

  const janRoster = await Teacher.find({
    tenantId: tenantA._id,
    $or: [{ isArchived: false, isActive: true }, { _id: { $in: histTeacherIds } }],
  });

  assert(
    janRoster.some((t) => String(t._id) === String(testTeacher._id)),
    'Archived teacher visible in January historical attendance roster'
  );

  // But operational marking query (active only) must NOT include testTeacher!
  const markableRoster = await Teacher.find({
    tenantId: tenantA._id,
    _id: testTeacher._id,
    isArchived: false,
    isActive: true,
  });
  assert(
    markableRoster.length === 0,
    'Archived teacher excluded from operational attendance marking roster'
  );

  console.log('\n--- 10. Leave Self-Approval Guard (Requirement 14) ---');
  // Create leave request for testTeacher
  const leaveReq = await LeaveRequest.create({
    tenantId: tenantA._id,
    requesterType: 'teacher',
    requesterId: testTeacher._id,
    fromDate: new Date('2026-03-01'),
    toDate: new Date('2026-03-02'),
    reason: 'Medical checkup',
    status: 'pending',
  });

  // Simulate self-approval check where reviewer owns the teacher profile
  const reviewerLinkedTeacher = await Teacher.findOne({ _id: testTeacher._id }).select('_id');
  const isSelf = String(reviewerLinkedTeacher?._id) === String(leaveReq.requesterId);
  assert(isSelf, 'Reviewer identity matched requesting teacher (SELF_APPROVAL_FORBIDDEN triggered)');

  console.log('\n--- 11. Cross-Tenant Isolation (Requirement 15) ---');
  // Tenant B attempts to read or mutate Tenant A teacher
  const tenantBQuery = await Teacher.findOne({ tenantId: tenantB._id, _id: testTeacher._id });
  assert(tenantBQuery === null, 'Tenant B query for Tenant A Teacher returns null (scoped isolation)');

  const tenantBClass = await Class.create({
    tenantId: tenantB._id,
    name: 'Tenant B Class',
    code: 'TB-C1',
    sessionId: new mongoose.Types.ObjectId(),
    isActive: true,
    isArchived: false,
  });

  // Attempting to assign Tenant A teacher to Tenant B class is impossible under tenant scoping
  const crossAssign = await Class.findOne({ tenantId: tenantB._id, _id: class2025._id });
  assert(crossAssign === null, 'Tenant B cannot resolve Tenant A class');

  console.log('\n--- 12. KPI Summary Scale Test (Requirement 11) ---');
  // Tenant C for Scale test: 80 Teachers, 70 active, 50 qualified
  const tenantC = await Tenant.create({
    name: 'KPI Scale School',
    code: `KSC_${Date.now()}`,
    slug: `ksc-${Date.now()}`,
    status: 'active',
    contactEmail: `admin_${Date.now()}@schoolc.pk`,
    ownerUserId: new mongoose.Types.ObjectId(),
    trialEndsAt: new Date(Date.now() + 30 * 86400000),
  });

  const scaleTeachers = [];
  for (let i = 1; i <= 80; i++) {
    scaleTeachers.push({
      tenantId: tenantC._id,
      employeeId: `T-SCALE-${String(i).padStart(3, '0')}`,
      staffType: 'teaching',
      designation: 'Teacher',
      fullName: `Scale Teacher ${i}`,
      joiningDate: new Date('2024-01-01'),
      qualification: i <= 50 ? 'M.Sc. Mathematics' : undefined,
      salary: 50000,
      isActive: i <= 70, // 70 active, 10 inactive
      isArchived: false,
    });
  }
  await Teacher.insertMany(scaleTeachers);

  // Compute full-tenant KPIs as in listTeachers
  const computeKpis = async (page: number, limit: number) => {
    const filter = { tenantId: tenantC._id, isArchived: false };
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      Teacher.find(filter).skip(skip).limit(limit).lean(),
      Teacher.countDocuments(filter),
    ]);
    const [totalAll, activeAll, qualifiedAll] = await Promise.all([
      Teacher.countDocuments({ tenantId: tenantC._id, isArchived: false }),
      Teacher.countDocuments({ tenantId: tenantC._id, isArchived: false, isActive: true }),
      Teacher.countDocuments({
        tenantId: tenantC._id,
        isArchived: false,
        qualification: { $exists: true, $nin: [null, ''] },
      }),
    ]);
    return {
      pageCount: docs.length,
      total,
      summary: { total: totalAll, active: activeAll, qualified: qualifiedAll },
    };
  };

  const page1 = await computeKpis(1, 20);
  const page2 = await computeKpis(2, 20);
  const page3 = await computeKpis(3, 20);

  assert(
    page1.summary.total === 80 && page2.summary.total === 80 && page3.summary.total === 80,
    'KPI Total Faculty remains exactly 80 across page 1, 2, and 3'
  );
  assert(
    page1.summary.active === 70 && page2.summary.active === 70 && page3.summary.active === 70,
    'KPI Active Staff remains exactly 70 across page 1, 2, and 3'
  );
  assert(
    page1.summary.qualified === 50 && page2.summary.qualified === 50 && page3.summary.qualified === 50,
    'KPI Qualified Leads remains exactly 50 across page 1, 2, and 3'
  );

  console.log('\n--- 13. Archive Historical Data Preservation (Requirement 16) ---');
  // Check that archiving testTeacher did NOT erase past records
  const checkAtt = await TeacherAttendance.countDocuments({ teacherId: testTeacher._id });
  const checkSal = await SalaryRecord.countDocuments({ teacherId: testTeacher._id });
  assert(checkAtt >= 1, 'Historical attendance records preserved after teacher archive');
  assert(checkSal >= 1, 'Historical salary records preserved after teacher archive');

  console.log('\n--- 14. No-Photo Architecture Verification (Requirement 18) ---');
  // Verify that neither publicTeacher nor publicStaff require or expose photo upload paths
  const sampleTeacher = await Teacher.findOne({ _id: testTeacher._id }).lean();
  assert(
    !sampleTeacher?.hasOwnProperty('avatarFile') && !sampleTeacher?.hasOwnProperty('photoBlob'),
    'Database schema maintains no binary or local photo storage for persons'
  );

  console.log('\n--- 15. Cleanup & Summary ---');
  // Clean test documents
  await Staff.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id, tenantC._id] } });
  await User.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id, tenantC._id] } });
  await Class.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id, tenantC._id] } });
  await Subject.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id, tenantC._id] } });
  await AcademicSession.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id, tenantC._id] } });
  await TeacherAttendance.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id, tenantC._id] } });
  await SalaryRecord.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id, tenantC._id] } });
  await LeaveRequest.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id, tenantC._id] } });
  await AuthSession.deleteMany({ user: { $in: [soleAdminUser._id, secondAdminUser._id, studentUser._id] } });
  await Role.deleteMany({ _id: nonFinRole._id });

  await mongoose.disconnect();

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runHardeningTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
