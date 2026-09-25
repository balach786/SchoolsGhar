import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { AcademicSession } from '../models/AcademicSession';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { Subject } from '../models/Subject';
import { Staff } from '../models/Staff';
import { Teacher } from '../models/Teacher';
import { Timetable } from '../models/Timetable';
import { AuditLog } from '../models/AuditLog';
import { Role } from '../models/Role';
import { ROLE_SLUGS } from '../config/permissions';
import { signAccessToken } from '../utils/security';

const BASE_URL = 'http://127.0.0.1:4000/api';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function record(name: string, condition: boolean, details?: string) {
  results.push({ name, passed: condition, details });
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ FAIL: ${name} - ${details || ''}`);
  }
}

async function request(path: string, options: { method?: string; token?: string; body?: any } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // ignore
  }
  return { status: res.status, body: json };
}

async function runSuite() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB for test suite execution.');

  // Find demo or primary tenant
  let demoTenant = await Tenant.findOne({ isDemo: true });
  if (!demoTenant) {
    demoTenant = await Tenant.findOne({});
  }
  if (!demoTenant) {
    throw new Error('No tenant found in database.');
  }

  const tenantId = demoTenant._id;

  // Find super admin or admin user
  const adminRole = await Role.findOne({ slug: { $in: [ROLE_SLUGS.superAdmin, ROLE_SLUGS.admin] } });
  const adminUser = await User.findOne({ tenantId, roleId: adminRole?._id, isActive: true });
  if (!adminUser) {
    throw new Error('No admin user found for tenant.');
  }
  const adminToken = signAccessToken({
    sub: String(adminUser._id),
    email: adminUser.email,
    name: adminUser.name,
    tenantId: String(tenantId),
    role: adminRole?.slug || 'admin',
    roleId: String(adminRole?._id),
    type: 'access',
  });

  // Find or create student user for RBAC test
  let studentRole = await Role.findOne({ slug: ROLE_SLUGS.student });
  if (!studentRole) {
    studentRole = await Role.findOne({ name: /student/i });
  }
  const studentUser = await User.create({
    tenantId,
    name: 'TEST_Student_User',
    email: `test_student_${Date.now()}@test.test`,
    passwordHash: 'dummyhash',
    roleId: studentRole?._id,
    isActive: true,
  });
  const studentToken = signAccessToken({
    sub: String(studentUser._id),
    email: studentUser.email,
    name: studentUser.name,
    tenantId: String(tenantId),
    role: 'student',
    roleId: String(studentRole?._id),
    type: 'access',
  });

  // Create dedicated isolated fixtures with prefix 'TEST_'
  const testSession = await AcademicSession.create({
    tenantId,
    name: 'TEST_Session_2026',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    isActive: false, // Inactive session for upcoming session write test
    isArchived: false,
  });

  const archivedSession = await AcademicSession.create({
    tenantId,
    name: 'TEST_Archived_Session_2025',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
    isActive: false,
    isArchived: true, // Archived session
  });

  // Sectioned Class: 2 primary sections + 20 dedicated sections for race test
  const sectionedClass = await Class.create({
    tenantId,
    sessionId: testSession._id,
    name: 'TEST_Class_Sectioned',
    isArchived: false,
  });

  const sectionA = await Section.create({
    tenantId,
    sessionId: testSession._id,
    classId: sectionedClass._id,
    name: 'TEST_Sec_A',
    isArchived: false,
  });

  const sectionB = await Section.create({
    tenantId,
    sessionId: testSession._id,
    classId: sectionedClass._id,
    name: 'TEST_Sec_B',
    isArchived: false,
  });

  // 20 distinct sections for pure Teacher overlap race
  const raceSections = await Promise.all(
    Array.from({ length: 20 }, (_, idx) =>
      Section.create({
        tenantId,
        sessionId: testSession._id,
        classId: sectionedClass._id,
        name: `RS_${idx}`,
        isArchived: false,
      })
    )
  );

  // Sectionless Class: 0 sections
  const sectionlessClass = await Class.create({
    tenantId,
    sessionId: testSession._id,
    name: 'TEST_Class_Sectionless',
    isArchived: false,
  });

  // Historical class for archived session
  const archivedClass = await Class.create({
    tenantId,
    sessionId: archivedSession._id,
    name: 'TEST_Class_Archived',
    isArchived: false,
  });

  // Teachers
  const teacherUserA = await User.create({
    tenantId,
    name: 'TEST_Teacher_User_A',
    email: `test_teacher_a_${Date.now()}@test.test`,
    passwordHash: 'dummyhash',
    roleId: adminRole?._id,
    isActive: true,
  });
  const teacherA = await Teacher.create({
    tenantId,
    userId: teacherUserA._id,
    fullName: 'TEST_Teacher_User_A',
    designation: 'Senior Teacher',
    joiningDate: new Date('2020-01-01'),
    employeeId: `EMP_A_${Date.now()}`,
    isActive: true,
    isArchived: false,
  });

  const teacherUserB = await User.create({
    tenantId,
    name: 'TEST_Teacher_User_B',
    email: `test_teacher_b_${Date.now()}@test.test`,
    passwordHash: 'dummyhash',
    roleId: adminRole?._id,
    isActive: true,
  });
  const teacherB = await Teacher.create({
    tenantId,
    userId: teacherUserB._id,
    fullName: 'TEST_Teacher_User_B',
    designation: 'Senior Teacher',
    joiningDate: new Date('2020-01-01'),
    employeeId: `EMP_B_${Date.now()}`,
    isActive: true,
    isArchived: false,
  });

  // Non-teaching staff
  const staffUserNT = await User.create({
    tenantId,
    name: 'TEST_Staff_User_NT',
    email: `test_staff_nt_${Date.now()}@test.test`,
    passwordHash: 'dummyhash',
    roleId: adminRole?._id,
    isActive: true,
  });
  const staffNonTeaching = await Staff.create({
    tenantId,
    userId: staffUserNT._id,
    fullName: 'TEST_Staff_NonTeaching',
    designation: 'Staff',
    joiningDate: new Date('2020-01-01'),
    employeeId: `EMP_NT_${Date.now()}`,
    staffType: 'non_teaching',
    isActive: true,
    isArchived: false,
  });

  // Subjects
  const subjectA = await Subject.create({
    tenantId,
    sessionId: testSession._id,
    classIds: [sectionedClass._id, sectionlessClass._id],
    name: 'TEST_Mathematics',
    code: `TMATH_${Date.now()}`,
    isArchived: false,
  });

  const subjectB = await Subject.create({
    tenantId,
    sessionId: testSession._id,
    classIds: [sectionedClass._id, sectionlessClass._id],
    name: 'TEST_English',
    code: `TENG_${Date.now()}`,
    isArchived: false,
  });

  const subjectStaffTest = await Subject.create({
    tenantId,
    sessionId: testSession._id,
    classIds: [sectionedClass._id],
    name: 'TEST_StaffSubject',
    code: `TSTF_${Date.now()}`,
    isArchived: false,
  });

  // Foreign Tenant fixtures for cross-tenant testing
  const foreignTenant = await Tenant.create({
    name: 'TEST_Foreign_Tenant',
    slug: `test-foreign-${Date.now()}`,
    contactEmail: `foreign_${Date.now()}@test.test`,
    ownerUserId: new mongoose.Types.ObjectId(),
    trialEndsAt: new Date(Date.now() + 30 * 86400000),
    isArchived: false,
  });
  const foreignSession = await AcademicSession.create({
    tenantId: foreignTenant._id,
    name: 'TEST_Foreign_Session',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    isActive: true,
    isArchived: false,
  });

  console.log('\n==================================================');
  console.log('PART 1: CONCURRENCY MATRIX VERIFICATION');
  console.log('==================================================\n');

  try {
    // ----------------------------------------------------
    // TEST 1.A: 20x Concurrent Teacher Overlap Race
    // 20 requests attempt to book Teacher A at Monday 09:00 - 10:00 across 20 distinct sections
    // Zero section/class conflict exists -> Exactly 1 must succeed, 19 must fail specifically with TEACHER_TIME_CONFLICT
    // ----------------------------------------------------
    console.log('▶ Test 1.A: 20x Teacher overlap race');
    const teacherRacePromises = Array.from({ length: 20 }, (_, idx) =>
      request('/timetables/periods', {
        method: 'POST',
        token: adminToken,
        body: {
          sessionId: String(testSession._id),
          classId: String(sectionedClass._id),
          sectionId: String(raceSections[idx]._id),
          dayOfWeek: 1,
          periodNumber: 1,
          startTime: '09:00',
          endTime: '10:00',
          subjectId: String(subjectA._id),
          teacherId: String(teacherA._id),
          isBreak: false,
        },
      })
    );

    const teacherRaceResults = await Promise.all(teacherRacePromises);
    const teacherRaceSuccesses = teacherRaceResults.filter((r) => r.status === 201);
    const teacherRaceConflicts = teacherRaceResults.filter(
      (r) => r.status === 409 && r.body?.error?.code === 'TEACHER_TIME_CONFLICT'
    );

    record('20x Teacher race: Exactly 1 succeeds', teacherRaceSuccesses.length === 1, `Successes: ${teacherRaceSuccesses.length}`);
    record('20x Teacher race: Exactly 19 fail with TEACHER_TIME_CONFLICT', teacherRaceConflicts.length === 19, `Conflicts: ${teacherRaceConflicts.length}`);

    const dbTeacher1ACount = await Timetable.countDocuments({
      tenantId,
      teacherId: teacherA._id,
      dayOfWeek: 1,
      startTime: '09:00',
      isArchived: false,
    });
    record('20x Teacher race: Exactly 1 document exists in DB', dbTeacher1ACount === 1, `DB count: ${dbTeacher1ACount}`);

    // Clean up periods created in 1.A
    await Timetable.deleteMany({ tenantId, sessionId: testSession._id });

    // ----------------------------------------------------
    // TEST 1.B: 20x Same Section/Class Overlap Race
    // 20 requests attempt to book same class + section at Monday 10:00 - 11:00 with different periodNumbers
    // Zero teacher collision -> Exactly 1 succeeds, 19 fail specifically with CLASS_TIME_CONFLICT
    // ----------------------------------------------------
    console.log('▶ Test 1.B: 20x SAME Section/Class overlap race');
    const sectionRacePromises = Array.from({ length: 20 }, (_, idx) =>
      request('/timetables/periods', {
        method: 'POST',
        token: adminToken,
        body: {
          sessionId: String(testSession._id),
          classId: String(sectionedClass._id),
          sectionId: String(sectionA._id),
          dayOfWeek: 1,
          periodNumber: idx + 1, // Distinct periodNumber so checkCellConflict passes, checkClassConflicts fires
          startTime: '10:00',
          endTime: '11:00',
          isBreak: true,
        },
      })
    );

    const sectionRaceResults = await Promise.all(sectionRacePromises);
    const sectionRaceSuccesses = sectionRaceResults.filter((r) => r.status === 201);
    const sectionRaceConflicts = sectionRaceResults.filter(
      (r) => r.status === 409 && r.body?.error?.code === 'CLASS_TIME_CONFLICT'
    );

    record('20x Section race: Exactly 1 succeeds', sectionRaceSuccesses.length === 1, `Successes: ${sectionRaceSuccesses.length}`);
    record('20x Section race: Exactly 19 fail with CLASS_TIME_CONFLICT', sectionRaceConflicts.length === 19, `Conflicts: ${sectionRaceConflicts.length}`);

    await Timetable.deleteMany({ tenantId, sessionId: testSession._id });

    // ----------------------------------------------------
    // TEST 1.C: Multi-Section Parallel Scheduling
    // Section A (Teacher A) + Section B (Teacher B) at Monday 11:00 - 12:00 concurrently
    // Both MUST SUCCEED (parallel classes allowed)
    // ----------------------------------------------------
    console.log('▶ Test 1.C: Multi-section parallel race');
    const multiSecPromises = [
      request('/timetables/periods', {
        method: 'POST',
        token: adminToken,
        body: {
          sessionId: String(testSession._id),
          classId: String(sectionedClass._id),
          sectionId: String(sectionA._id),
          dayOfWeek: 1,
          periodNumber: 3,
          startTime: '11:00',
          endTime: '12:00',
          subjectId: String(subjectA._id),
          teacherId: String(teacherA._id),
          isBreak: false,
        },
      }),
      request('/timetables/periods', {
        method: 'POST',
        token: adminToken,
        body: {
          sessionId: String(testSession._id),
          classId: String(sectionedClass._id),
          sectionId: String(sectionB._id),
          dayOfWeek: 1,
          periodNumber: 3,
          startTime: '11:00',
          endTime: '12:00',
          subjectId: String(subjectB._id),
          teacherId: String(teacherB._id),
          isBreak: false,
        },
      }),
    ];

    const multiSecResults = await Promise.all(multiSecPromises);
    record('Multi-section parallel: Section A succeeds (201)', multiSecResults[0].status === 201, `Status: ${multiSecResults[0].status}`);
    record('Multi-section parallel: Section B succeeds (201)', multiSecResults[1].status === 201, `Status: ${multiSecResults[1].status}`);

    await Timetable.deleteMany({ tenantId, sessionId: testSession._id });

    // ----------------------------------------------------
    // TEST 1.D: Sectionless Class Overlap Race
    // 20 requests attempt to book sectionless class at Tuesday 09:00 - 10:00 with distinct periodNumbers
    // Exactly 1 succeeds, 19 fail specifically with CLASS_TIME_CONFLICT
    // ----------------------------------------------------
    console.log('▶ Test 1.D: Sectionless Class overlap race');
    const sectionlessRacePromises = Array.from({ length: 20 }, (_, idx) =>
      request('/timetables/periods', {
        method: 'POST',
        token: adminToken,
        body: {
          sessionId: String(testSession._id),
          classId: String(sectionlessClass._id),
          dayOfWeek: 2,
          periodNumber: idx + 1,
          startTime: '09:00',
          endTime: '10:00',
          isBreak: true,
        },
      })
    );

    const sectionlessRaceResults = await Promise.all(sectionlessRacePromises);
    const sectionlessSuccesses = sectionlessRaceResults.filter((r) => r.status === 201);
    const sectionlessConflicts = sectionlessRaceResults.filter(
      (r) => r.status === 409 && r.body?.error?.code === 'CLASS_TIME_CONFLICT'
    );

    record('20x Sectionless race: Exactly 1 succeeds', sectionlessSuccesses.length === 1, `Successes: ${sectionlessSuccesses.length}`);
    record('20x Sectionless race: Exactly 19 fail with CLASS_TIME_CONFLICT', sectionlessConflicts.length === 19, `Conflicts: ${sectionlessConflicts.length}`);

    await Timetable.deleteMany({ tenantId, sessionId: testSession._id });

    // ----------------------------------------------------
    // TEST 1.E: Concurrent UPDATE Race
    // Period 1 at 09:00-10:00, Period 2 at 10:00-11:00, Period 3 at 11:00-12:00.
    // Concurrently try to update Period 2 and Period 3 to overlap at 10:30-11:30 in same section.
    // Exactly 1 succeeds, 1 fails with conflict.
    // ----------------------------------------------------
    console.log('▶ Test 1.E: Concurrent UPDATE race');
    const createP2 = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 3,
        periodNumber: 1,
        startTime: '09:00',
        endTime: '10:00',
        subjectId: String(subjectA._id),
        teacherId: String(teacherA._id),
        isBreak: false,
      },
    });

    const createP3 = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 3,
        periodNumber: 2,
        startTime: '11:00',
        endTime: '12:00',
        subjectId: String(subjectB._id),
        teacherId: String(teacherB._id),
        isBreak: false,
      },
    });

    const p2Id = createP2.body?.data?._id;
    const p3Id = createP3.body?.data?._id;

    const updateRacePromises = [
      request(`/timetables/periods/${p2Id}`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          startTime: '10:15',
          endTime: '11:15',
        },
      }),
      request(`/timetables/periods/${p3Id}`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          startTime: '10:30',
          endTime: '11:30',
        },
      }),
    ];

    const updateRaceResults = await Promise.all(updateRacePromises);
    const updateSuccesses = updateRaceResults.filter((r) => r.status === 200);
    const updateConflicts = updateRaceResults.filter((r) => r.status === 409);

    record('Concurrent UPDATE race: Exactly 1 succeeds', updateSuccesses.length === 1, `Successes: ${updateSuccesses.length}`);
    record('Concurrent UPDATE race: Exactly 1 fails with conflict', updateConflicts.length === 1, `Conflicts: ${updateConflicts.length}`);

    await Timetable.deleteMany({ tenantId, sessionId: testSession._id });

    console.log('\n==================================================');
    console.log('PART 2: SCHEDULING & CONFLICT LOGIC VERIFICATION');
    console.log('==================================================\n');

    // ----------------------------------------------------
    // TEST 2.1: False periodNumber Collision Test
    // Teacher A assigned to Period 1 (08:00 - 08:45) in Class A,
    // and Period 1 (11:00 - 11:45) in Class B.
    // Times do not overlap. Both MUST SUCCEED.
    // ----------------------------------------------------
    console.log('▶ Test 2.1: False periodNumber collision test');
    const p1 = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 1,
        periodNumber: 1,
        startTime: '08:00',
        endTime: '08:45',
        subjectId: String(subjectA._id),
        teacherId: String(teacherA._id),
        isBreak: false,
      },
    });

    const p2 = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionB._id),
        dayOfWeek: 1,
        periodNumber: 1, // Same periodNumber 1, but different time!
        startTime: '11:00',
        endTime: '11:45',
        subjectId: String(subjectA._id),
        teacherId: String(teacherA._id),
        isBreak: false,
      },
    });

    record('False periodNumber: Period 1 at 08:00 succeeds (201)', p1.status === 201, `Status: ${p1.status}`);
    record('False periodNumber: Period 1 at 11:00 succeeds (201)', p2.status === 201, `Status: ${p2.status}`);

    // ----------------------------------------------------
    // TEST 2.2: Boundary Non-Overlap Test
    // Period 09:00 - 10:00 vs Period 10:00 - 11:00. End of P1 = Start of P2.
    // MUST SUCCEED.
    // ----------------------------------------------------
    console.log('▶ Test 2.2: Boundary non-overlap test');
    const boundaryP1 = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 2,
        periodNumber: 1,
        startTime: '09:00',
        endTime: '10:00',
        subjectId: String(subjectA._id),
        teacherId: String(teacherA._id),
        isBreak: false,
      },
    });

    const boundaryP2 = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 2,
        periodNumber: 2,
        startTime: '10:00',
        endTime: '11:00',
        subjectId: String(subjectB._id),
        teacherId: String(teacherB._id),
        isBreak: false,
      },
    });

    record('Boundary non-overlap: 09:00-10:00 succeeds', boundaryP1.status === 201, `Status: ${boundaryP1.status}`);
    record('Boundary non-overlap: 10:00-11:00 succeeds', boundaryP2.status === 201, `Status: ${boundaryP2.status}`);

    // ----------------------------------------------------
    // TEST 2.3: Partial Overlap Test
    // Attempting 09:30 - 10:30 on same section as break (no teacher) -> MUST FAIL with CLASS_TIME_CONFLICT.
    // ----------------------------------------------------
    console.log('▶ Test 2.3: Partial overlap test');
    const partialOverlap = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 2,
        periodNumber: 3,
        startTime: '09:30',
        endTime: '10:30',
        isBreak: true,
      },
    });
    record(
      'Partial overlap: 09:30-10:30 rejected with CLASS_TIME_CONFLICT (409)',
      partialOverlap.status === 409 && partialOverlap.body?.error?.code === 'CLASS_TIME_CONFLICT',
      `Code: ${partialOverlap.body?.error?.code}`
    );

    // ----------------------------------------------------
    // TEST 2.4: Different Day Test
    // Wednesday 09:00 - 10:00 vs Tuesday 09:00 - 10:00 on same class/section -> MUST SUCCEED
    // ----------------------------------------------------
    console.log('▶ Test 2.4: Different day test');
    const diffDay = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 3,
        periodNumber: 1,
        startTime: '09:00',
        endTime: '10:00',
        subjectId: String(subjectA._id),
        teacherId: String(teacherA._id),
        isBreak: false,
      },
    });
    record('Different day: Wednesday 09:00-10:00 succeeds', diffDay.status === 201);

    // ----------------------------------------------------
    // TEST 2.5: Section Required for Sectioned Class
    // Class has 2 sections; submitting period with sectionId null or missing
    // MUST FAIL with SECTION_REQUIRED_FOR_CLASS
    // ----------------------------------------------------
    console.log('▶ Test 2.5: Section required for sectioned Class');
    const missingSection = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        dayOfWeek: 4,
        periodNumber: 1,
        startTime: '09:00',
        endTime: '10:00',
        subjectId: String(subjectA._id),
        teacherId: String(teacherA._id),
        isBreak: false,
      },
    });
    record(
      'Section required: Omitting sectionId on sectioned class rejected (400)',
      missingSection.status === 400 && missingSection.body?.error?.code === 'SECTION_REQUIRED_FOR_CLASS',
      `Code: ${missingSection.body?.error?.code}`
    );

    // ----------------------------------------------------
    // TEST 2.6: Sectionless Class Scheduling, Edit, List & Print
    // Sectionless class has 0 sections. sectionId null is allowed.
    // ----------------------------------------------------
    console.log('▶ Test 2.6: Sectionless Class scheduling, edit, list & print');
    const createSectionless = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionlessClass._id),
        sectionId: null,
        dayOfWeek: 4,
        periodNumber: 1,
        startTime: '08:00',
        endTime: '08:50',
        subjectId: String(subjectA._id),
        teacherId: String(teacherA._id),
        isBreak: false,
      },
    });
    record('Sectionless create: succeeds with sectionId null (201)', createSectionless.status === 201);
    const sectionlessPeriodId = createSectionless.body?.data?._id;

    // Sectionless edit
    const editSectionless = await request(`/timetables/periods/${sectionlessPeriodId}`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        startTime: '08:05',
        endTime: '08:55',
      },
    });
    record('Sectionless edit: succeeds (200)', editSectionless.status === 200 && editSectionless.body?.data?.startTime === '08:05');

    // Sectionless list query
    const listSectionless = await request(`/timetables?sessionId=${testSession._id}&classId=${sectionlessClass._id}`, {
      method: 'GET',
      token: adminToken,
    });
    record('Sectionless list: returns periods without sectionId (200)', listSectionless.status === 200 && listSectionless.body?.data?.length > 0);

    // Sectionless print query
    const printSectionless = await request(`/timetables/print?sessionId=${testSession._id}&classId=${sectionlessClass._id}`, {
      method: 'GET',
      token: adminToken,
    });
    record('Sectionless print: returns clean payload with empty sectionName (200)', printSectionless.status === 200 && printSectionless.body?.data?.sectionName === '');

    // ----------------------------------------------------
    // TEST 2.7: Subject.classIds Validation
    // Create subject C that only belongs to foreign/different class. Attempting to schedule with SectionedClass
    // MUST FAIL with INVALID_SUBJECT_CLASS
    // ----------------------------------------------------
    console.log('▶ Test 2.7: Subject.classIds validation');
    const subjectWrongClass = await Subject.create({
      tenantId,
      sessionId: testSession._id,
      classIds: [new mongoose.Types.ObjectId()], // Not sectionedClass
      name: 'TEST_Physics',
      code: `TPHYS_${Date.now()}`,
      isArchived: false,
    });

    const invalidSubjectClassRes = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 4,
        periodNumber: 2,
        startTime: '10:00',
        endTime: '11:00',
        subjectId: String(subjectWrongClass._id),
        teacherId: String(teacherA._id),
        isBreak: false,
      },
    });
    record(
      'Subject.classIds: Unassociated class rejected with INVALID_SUBJECT_CLASS (400)',
      invalidSubjectClassRes.status === 400 && invalidSubjectClassRes.body?.error?.code === 'INVALID_SUBJECT_CLASS'
    );

    // ----------------------------------------------------
    // TEST 2.8: Teaching Staff Eligibility
    // 1. Non-teaching staff submitted for subjectStaffTest -> INVALID_SUBJECT_TEACHER
    // 2. Teacherless non-break period -> SUCCEEDS
    // ----------------------------------------------------
    console.log('▶ Test 2.8: Teaching staff validation');
    const nonTeachingRes = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 4,
        periodNumber: 2,
        startTime: '10:00',
        endTime: '11:00',
        subjectId: String(subjectStaffTest._id),
        teacherId: String(staffNonTeaching._id),
        isBreak: false,
      },
    });
    record(
      'Teaching staff requirement: Non-teaching staff rejected (400)',
      nonTeachingRes.status === 400 && nonTeachingRes.body?.error?.code === 'INVALID_STAFF_TYPE',
      `Code: ${nonTeachingRes.body?.error?.code}`
    );

    // Teacherless non-break period
    const teacherlessRes = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 4,
        periodNumber: 2,
        startTime: '10:00',
        endTime: '11:00',
        subjectId: String(subjectA._id),
        // teacherId omitted
        isBreak: false,
      },
    });
    record('Teacherless period: Non-break period with subject and omitted teacher succeeds (201)', teacherlessRes.status === 201);

    // ----------------------------------------------------
    // TEST 2.9: Break Period Occupancy Test
    // Break period at 11:00 - 11:30 (no subject, no teacher).
    // Teaching period attempting to overlap 11:15 - 12:00 in same section MUST FAIL with CLASS_TIME_CONFLICT.
    // ----------------------------------------------------
    console.log('▶ Test 2.9: Break period occupancy test');
    const breakRes = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 4,
        periodNumber: 3,
        startTime: '11:00',
        endTime: '11:30',
        isBreak: true,
      },
    });
    record('Break period created: succeeds without subject/teacher (201)', breakRes.status === 201);

    const breakOverlapRes = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 4,
        periodNumber: 4,
        startTime: '11:15',
        endTime: '12:00',
        subjectId: String(subjectA._id),
        teacherId: String(teacherA._id),
        isBreak: false,
      },
    });
    record(
      'Break occupancy: Overlapping teaching period rejected with CLASS_TIME_CONFLICT (409)',
      breakOverlapRes.status === 409 && breakOverlapRes.body?.error?.code === 'CLASS_TIME_CONFLICT'
    );

    // ----------------------------------------------------
    // TEST 2.10: Edit Unchanged Period / Self-Exclusion & Edit Into Conflict
    // 1. Updating break period notes or unchanged times -> succeeds (no self-conflict)
    // 2. Updating break period time to overlap 10:00 - 11:00 -> fails with CLASS_TIME_CONFLICT
    // ----------------------------------------------------
    console.log('▶ Test 2.10: Edit self-exclusion & edit into conflict');
    const breakId = breakRes.body?.data?._id;
    const editSelfRes = await request(`/timetables/periods/${breakId}`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        startTime: '11:00',
        endTime: '11:30',
      },
    });
    record('Edit self-exclusion: Updating unchanged slot succeeds (200)', editSelfRes.status === 200);

    const editConflictRes = await request(`/timetables/periods/${breakId}`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        startTime: '10:30',
        endTime: '11:15', // Overlaps 10:00-11:00 period
      },
    });
    record('Edit into conflict: Moving period into occupied slot rejected (409)', editConflictRes.status === 409);

    // ----------------------------------------------------
    // TEST 2.11: Bulk 10 Rows With Row 8 Conflict -> Atomic Rollback (0 Committed)
    // ----------------------------------------------------
    console.log('▶ Test 2.11: Bulk create intra-batch conflict atomic rollback');
    const bulkPayload = [
      { dayOfWeek: 5, periodNumber: 1, startTime: '08:00', endTime: '08:45', subjectId: String(subjectA._id), teacherId: String(teacherA._id), isBreak: false },
      { dayOfWeek: 5, periodNumber: 2, startTime: '08:45', endTime: '09:30', subjectId: String(subjectB._id), teacherId: String(teacherB._id), isBreak: false },
      { dayOfWeek: 5, periodNumber: 3, startTime: '09:30', endTime: '10:15', isBreak: true },
      { dayOfWeek: 5, periodNumber: 4, startTime: '10:15', endTime: '11:00', subjectId: String(subjectA._id), teacherId: String(teacherA._id), isBreak: false },
      { dayOfWeek: 5, periodNumber: 5, startTime: '11:00', endTime: '11:45', subjectId: String(subjectB._id), teacherId: String(teacherB._id), isBreak: false },
      { dayOfWeek: 5, periodNumber: 6, startTime: '11:45', endTime: '12:30', subjectId: String(subjectA._id), teacherId: String(teacherA._id), isBreak: false },
      { dayOfWeek: 5, periodNumber: 7, startTime: '12:30', endTime: '13:15', subjectId: String(subjectB._id), teacherId: String(teacherB._id), isBreak: false },
      // Row 8 intentionally conflicts with Row 2 (Friday 09:00 - 09:45 overlaps 08:45 - 09:30)
      { dayOfWeek: 5, periodNumber: 8, startTime: '09:00', endTime: '09:45', subjectId: String(subjectA._id), teacherId: String(teacherA._id), isBreak: false },
      { dayOfWeek: 5, periodNumber: 9, startTime: '14:00', endTime: '14:45', subjectId: String(subjectB._id), teacherId: String(teacherB._id), isBreak: false },
      { dayOfWeek: 5, periodNumber: 10, startTime: '14:45', endTime: '15:30', subjectId: String(subjectA._id), teacherId: String(teacherA._id), isBreak: false },
    ];

    const bulkRes = await request('/timetables', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        periods: bulkPayload,
      },
    });

    record('Bulk create: Batch with row 8 conflict rejected (409)', bulkRes.status === 409);

    const day5Count = await Timetable.countDocuments({
      tenantId,
      sessionId: testSession._id,
      dayOfWeek: 5,
      isArchived: false,
    });
    record('Bulk rollback: 0 rows committed to DB', day5Count === 0, `DB day 5 count: ${day5Count}`);

    // ----------------------------------------------------
    // TEST 2.12: Swap Conflict & Swap Mutual-Exclusion
    // ----------------------------------------------------
    console.log('▶ Test 2.12: Swap conflict & swap mutual-exclusion');
    // Create Period 1 (08:00 - 09:00, Teacher A) and Period 2 (09:00 - 10:00, Teacher B) on Day 6 in Section A
    const createP1 = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 6,
        periodNumber: 1,
        startTime: '08:00',
        endTime: '09:00',
        subjectId: String(subjectA._id),
        teacherId: String(teacherA._id),
        isBreak: false,
      },
    });
    const createP2_6 = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 6,
        periodNumber: 2,
        startTime: '09:00',
        endTime: '10:00',
        subjectId: String(subjectB._id),
        teacherId: String(teacherB._id),
        isBreak: false,
      },
    });
    const p1Id = createP1.body?.data?._id;
    const p2Id_6 = createP2_6.body?.data?._id;

    // Valid swap between Period 1 and Period 2: Both IDs excluded from mutual conflicts -> MUST SUCCEED
    const validSwap = await request('/timetables/swap', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 6,
        periodA: 1,
        periodB: 2,
      },
    });
    record(
      'Swap mutual-exclusion: Valid swap between Period 1 and 2 succeeds (200)',
      validSwap.status === 200,
      JSON.stringify(validSwap.body)
    );

    // Verify swap took effect: Period with ID p1Id now has subjectB
    const verifySwap = await Timetable.findById(p1Id);
    record('Swap verified: Period 1 received Subject B', String(verifySwap?.subjectId) === String(subjectB._id));

    // External conflict:
    // Create Period Z in Section B with Teacher B at Day 6 08:00 - 09:00
    await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionB._id),
        dayOfWeek: 6,
        periodNumber: 1,
        startTime: '08:00',
        endTime: '09:00',
        subjectId: String(subjectA._id),
        teacherId: String(teacherA._id),
        isBreak: false,
      },
    });

    // Now swapping back Period 1 (currently Teacher B at 08:00) and Period 2 (currently Teacher A at 09:00)
    // would move Teacher B to 08:00 in Section A, which conflicts with Period Z in Section B!
    const conflictSwap = await request('/timetables/swap', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 6,
        periodA: 1,
        periodB: 2,
      },
    });
    record('Swap conflict: Swapping into external teacher conflict rejected (409)', conflictSwap.status === 409);

    // ----------------------------------------------------
    // TEST 2.13: Soft Remove Persistence & Slot Re-use
    // ----------------------------------------------------
    console.log('▶ Test 2.13: Soft remove persistence & slot reuse');
    const deleteRes = await request('/timetables/periods', {
      method: 'DELETE',
      token: adminToken,
      body: {
        periodIds: [p1Id],
      },
    });
    record(
      'Soft remove: DELETE endpoint returns 200 with removed = 1',
      deleteRes.status === 200 && deleteRes.body?.data?.removed === 1,
      `Removed: ${deleteRes.body?.data?.removed}`
    );

    const checkArchivedDoc = await Timetable.findById(p1Id);
    record('Soft remove persistence: Document still exists with isArchived = true', checkArchivedDoc !== null && checkArchivedDoc.isArchived === true);

    // List query does not return archived document
    const listCheck = await request(`/timetables?sessionId=${testSession._id}&classId=${sectionedClass._id}&sectionId=${sectionA._id}`, {
      method: 'GET',
      token: adminToken,
    });
    const foundArchivedInList = (listCheck.body?.data || []).some((p: any) => p._id === p1Id);
    record('Archived excluded from list: Document not returned in active list', !foundArchivedInList);

    // Slot reuse: scheduling new period in exact same slot Day 6 08:00 - 09:00 in Section A
    const slotReuseRes = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 6,
        periodNumber: 1,
        startTime: '08:00',
        endTime: '09:00',
        subjectId: String(subjectB._id),
        teacherId: String(teacherB._id),
        isBreak: false,
      },
    });
    record('Slot reuse: Soft-removed period no longer blocks slot (201)', slotReuseRes.status === 201);

    // ----------------------------------------------------
    // TEST 2.14: Session Validation (Inactive vs Archived)
    // 1. Inactive upcoming session write already verified above (testSession is inactive and writes succeeded)
    // 2. Archived session write MUST FAIL with SESSION_ARCHIVED (400)
    // 3. Historical archived session read MUST SUCCEED (200)
    // ----------------------------------------------------
    console.log('▶ Test 2.14: Session write & read rules');
    const archivedSessionWrite = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(archivedSession._id),
        classId: String(archivedClass._id),
        dayOfWeek: 1,
        periodNumber: 1,
        startTime: '08:00',
        endTime: '09:00',
        isBreak: true,
      },
    });
    record(
      'Archived session write: Rejected with SESSION_ARCHIVED (400)',
      archivedSessionWrite.status === 400 && archivedSessionWrite.body?.error?.code === 'SESSION_ARCHIVED',
      `Code: ${archivedSessionWrite.body?.error?.code}`
    );

    // Historical read on archived session
    const archivedSessionRead = await request(`/timetables?sessionId=${archivedSession._id}&classId=${archivedClass._id}`, {
      method: 'GET',
      token: adminToken,
    });
    record('Historical session read: GET on archived session succeeds (200)', archivedSessionRead.status === 200);

    // ----------------------------------------------------
    // TEST 2.15: Cross-Tenant Isolation Matrix
    // Submitting foreign tenant's sessionId, or foreign classId -> MUST FAIL
    // ----------------------------------------------------
    console.log('▶ Test 2.15: Cross-tenant isolation matrix');
    const foreignSessionWrite = await request('/timetables/periods', {
      method: 'POST',
      token: adminToken,
      body: {
        sessionId: String(foreignSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 1,
        periodNumber: 1,
        startTime: '08:00',
        endTime: '09:00',
        isBreak: true,
      },
    });
    record('Cross-tenant: Foreign session rejected (404/400)', foreignSessionWrite.status === 404 || foreignSessionWrite.status === 400);

    // ----------------------------------------------------
    // TEST 2.16: RBAC Verification
    // Student role cannot add periods -> 403 Forbidden
    // ----------------------------------------------------
    console.log('▶ Test 2.16: RBAC authorization verification');
    const studentWrite = await request('/timetables/periods', {
      method: 'POST',
      token: studentToken,
      body: {
        sessionId: String(testSession._id),
        classId: String(sectionedClass._id),
        sectionId: String(sectionA._id),
        dayOfWeek: 1,
        periodNumber: 1,
        startTime: '08:00',
        endTime: '09:00',
        isBreak: true,
      },
    });
    record('RBAC: Student role forbidden from creating periods (403)', studentWrite.status === 403, `Status: ${studentWrite.status}`);

    // ----------------------------------------------------
    // TEST 2.17: Audit Log Verification
    // Verify TIMETABLE_CREATED, TIMETABLE_UPDATED, TIMETABLE_REMOVED, TIMETABLE_SWAPPED exist
    // ----------------------------------------------------
    console.log('▶ Test 2.17: Audit log verification');
    const createdAudit = await AuditLog.findOne({ tenantId, action: 'TIMETABLE_CREATED' });
    const updatedAudit = await AuditLog.findOne({ tenantId, action: 'TIMETABLE_UPDATED' });
    const removedAudit = await AuditLog.findOne({ tenantId, action: 'TIMETABLE_REMOVED' });
    const swappedAudit = await AuditLog.findOne({ tenantId, action: 'TIMETABLE_SWAPPED' });

    record('Audit log: TIMETABLE_CREATED recorded', createdAudit !== null);
    record('Audit log: TIMETABLE_UPDATED recorded', updatedAudit !== null);
    record('Audit log: TIMETABLE_REMOVED recorded', removedAudit !== null);
    record('Audit log: TIMETABLE_SWAPPED recorded', swappedAudit !== null);

    // No success audit for rolled-back transaction
    const rolledBackAudits = await AuditLog.find({
      tenantId,
      action: 'TIMETABLE_CREATED',
      'metadata.startTime': '09:30', // From partial overlap test that rolled back
    });
    record('Audit rollback: No success audit for rolled-back transaction', rolledBackAudits.length === 0);

  } finally {
    // Teardown all TEST_ fixtures so DB is clean (0 timetable records)
    console.log('\n--- Cleaning up test fixtures ---');
    await Timetable.deleteMany({ tenantId, sessionId: testSession._id });
    await Timetable.deleteMany({ tenantId, sessionId: archivedSession._id });
    await Subject.deleteMany({ _id: { $in: [subjectA._id, subjectB._id, subjectStaffTest._id] } });
    await Teacher.deleteMany({ _id: { $in: [teacherA._id, teacherB._id] } });
    await Staff.deleteMany({ _id: staffNonTeaching._id });
    await User.deleteMany({ _id: { $in: [teacherUserA._id, teacherUserB._id, staffUserNT._id, studentUser._id] } });
    await Section.deleteMany({ _id: { $in: [sectionA._id, sectionB._id, ...raceSections.map((s) => s._id)] } });
    await Class.deleteMany({ _id: { $in: [sectionedClass._id, sectionlessClass._id, archivedClass._id] } });
    await AcademicSession.deleteMany({ _id: { $in: [testSession._id, archivedSession._id] } });
    await AcademicSession.deleteMany({ _id: foreignSession._id });
    await Tenant.deleteMany({ _id: foreignTenant._id });

    const remainingTimetables = await Timetable.countDocuments({});
    console.log(`Final remaining Timetable records in DB: ${remainingTimetables} (Expected: 0)`);
    record('Teardown clean: Total DB timetable count returns to 0', remainingTimetables === 0, `Count: ${remainingTimetables}`);
  }

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB.');

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n==================================================');
  console.log(`SUITE SUMMARY: ${passed}/${total} PASSED, ${failed} FAILED`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Test suite runtime error:', err);
  process.exit(1);
});
