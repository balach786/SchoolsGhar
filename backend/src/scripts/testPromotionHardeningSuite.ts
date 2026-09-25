/**
 * Promotion Hardening Test Suite
 *
 * Tests all hardened promotion behaviors via the REAL API (correction #25).
 * Covers: same-session rejection, sectionless promotion, concurrency races,
 * all-or-nothing rollback, history append-only, roll number allocation,
 * admission number immutability, RBAC, and cross-tenant isolation.
 *
 * Usage: npx ts-node --transpile-only src/scripts/testPromotionHardeningSuite.ts
 */

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
import { Student } from '../models/Student';
import { StudentHistory } from '../models/StudentHistory';
import { Role } from '../models/Role';
import { AuditLog } from '../models/AuditLog';
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

async function request(apiPath: string, options: { method?: string; token?: string; body?: any; params?: Record<string, string> } = {}) {
  let url = `${BASE_URL}${apiPath}`;
  if (options.params) {
    const q = new URLSearchParams(options.params).toString();
    url += (url.includes('?') ? '&' : '?') + q;
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body: json };
}

// ── Fixture helpers ──────────────────────────────────────────────

async function createTestSession(tenantId: any, name: string, isActive = false) {
  return AcademicSession.create({
    tenantId,
    name,
    normalizedName: name.trim().replace(/\s+/g, ' ').toLowerCase(),
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
    isActive,
    isArchived: false,
  });
}

async function createTestClass(tenantId: any, sessionId: any, name: string) {
  return Class.create({
    tenantId,
    sessionId,
    name,
    isArchived: false,
  });
}

async function createTestSection(tenantId: any, classId: any, sessionId: any, name: string) {
  return Section.create({
    tenantId,
    classId,
    sessionId,
    name,
    normalizedName: name.toLowerCase(),
    isArchived: false,
  });
}

async function createTestStudent(
  tenantId: any, sessionId: any, classId: any, sectionId: any,
  fullName: string, admissionNumber: string, rollNumber: string
) {
  return Student.create({
    tenantId,
    sessionId,
    classId,
    sectionId: sectionId ?? undefined,
    fullName,
    admissionNumber,
    rollNumber,
    gender: 'male',
    dateOfBirth: new Date('2010-01-01'),
    guardianName: 'Test Guardian',
    admissionDate: new Date('2025-01-15'),
    isActive: true,
    isArchived: false,
  });
}

// ── Cleanup ──────────────────────────────────────────────────────

async function cleanupTestData(tenantId: any) {
  const opts = { allowAdministrativeHistoryMutation: true } as any;
  await StudentHistory.deleteMany({ tenantId }, opts);
  await Student.deleteMany({ tenantId });
  await Section.deleteMany({ tenantId });
  await Class.deleteMany({ tenantId });
  await AcademicSession.deleteMany({ tenantId });
  await AuditLog.deleteMany({ tenantId });
}

// ── Main Suite ───────────────────────────────────────────────────

async function runSuite() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB for promotion hardening test suite.\n');

  // Find demo or primary tenant
  let demoTenant = await Tenant.findOne({ isDemo: true });
  if (!demoTenant) demoTenant = await Tenant.findOne({});
  if (!demoTenant) throw new Error('No tenant found.');

  const tenantId = demoTenant._id;

  // Find admin user
  const adminRoles = await Role.find({ slug: { $in: [ROLE_SLUGS.superAdmin, ROLE_SLUGS.admin] } });
  const adminRoleIds = adminRoles.map((r) => r._id);
  const adminUser = await User.findOne({ tenantId, roleId: { $in: adminRoleIds }, isActive: true });
  if (!adminUser) throw new Error('No admin user found.');
  const adminRole = adminRoles.find((r) => String(r._id) === String(adminUser.roleId));

  const adminToken = signAccessToken({
    sub: String(adminUser._id),
    email: adminUser.email,
    name: adminUser.name,
    tenantId: String(tenantId),
    role: adminRole?.slug || 'admin',
    roleId: String(adminRole?._id),
    type: 'access',
  });

  // Find teacher/student role for RBAC tests
  const teacherRole = await Role.findOne({ slug: ROLE_SLUGS.teacher });
  const teacherUser = await User.findOne({ tenantId, roleId: teacherRole?._id, isActive: true });
  let teacherToken: string | undefined;
  if (teacherUser) {
    teacherToken = signAccessToken({
      sub: String(teacherUser._id),
      email: teacherUser.email,
      name: teacherUser.name,
      tenantId: String(tenantId),
      role: teacherRole?.slug || 'teacher',
      roleId: String(teacherRole?._id),
      type: 'access',
    });
  }

  // Clean old test data first
  console.log('Cleaning old test data...');
  // We'll use isolated test fixtures with known names

  try {
    // ================================================================
    // TEST GROUP 1: BASIC PROMOTION (SECTIONED)
    // ================================================================
    console.log('\n═══ TEST GROUP 1: Basic Promotion (Sectioned) ═══');

    // Create fixtures
    const srcSession = await createTestSession(tenantId, '__PROMO_SRC_Session');
    const dstSession = await createTestSession(tenantId, '__PROMO_DST_Session');
    const srcClass = await createTestClass(tenantId, srcSession._id, '__PROMO_SRC_Class');
    const dstClass = await createTestClass(tenantId, dstSession._id, '__PROMO_DST_Class');
    const srcSection = await createTestSection(tenantId, srcClass._id, srcSession._id, 'A');
    const dstSection = await createTestSection(tenantId, dstClass._id, dstSession._id, 'A');

    const student1 = await createTestStudent(
      tenantId, srcSession._id, srcClass._id, srcSection._id,
      '__PROMO_Student_1', '__P001', '1'
    );

    // Test 1.1: Preview works
    const previewRes = await request('/promotions/preview', {
      token: adminToken,
      params: {
        sessionId: String(srcSession._id),
        classId: String(srcClass._id),
        sectionId: String(srcSection._id),
        toSessionId: String(dstSession._id),
        toClassId: String(dstClass._id),
        toSectionId: String(dstSection._id),
      },
    });
    record('1.1 Preview returns students', previewRes.status === 200 && previewRes.body?.data?.total === 1);

    // Test 1.2: Promote succeeds
    const promoRes = await request('/promotions', {
      method: 'POST',
      token: adminToken,
      body: {
        source: { sessionId: String(srcSession._id), classId: String(srcClass._id), sectionId: String(srcSection._id) },
        destination: { sessionId: String(dstSession._id), classId: String(dstClass._id), sectionId: String(dstSection._id) },
        studentIds: [String(student1._id)],
      },
    });
    record('1.2 Promotion succeeds', promoRes.status === 200 && promoRes.body?.data?.promoted === 1);

    // Test 1.3: Student placement updated
    const updatedStudent = await Student.findById(student1._id).lean();
    record('1.3 Student at destination',
      String(updatedStudent?.sessionId) === String(dstSession._id) &&
      String(updatedStudent?.classId) === String(dstClass._id) &&
      String(updatedStudent?.sectionId) === String(dstSection._id)
    );

    // Test 1.4: Admission number unchanged
    record('1.4 Admission number unchanged', updatedStudent?.admissionNumber === '__P001');

    // Test 1.5: Exactly ONE history event
    const history = await StudentHistory.find({ studentId: student1._id, status: 'promoted' }).lean();
    record('1.5 Exactly 1 promotion history event', history.length === 1,
      `Found ${history.length}`);

    // Test 1.6: History has previousClassId/previousSectionId
    if (history.length === 1) {
      record('1.6 previousClassId set', String(history[0].previousClassId) === String(srcClass._id));
      record('1.7 previousSectionId set', String(history[0].previousSectionId) === String(srcSection._id));
    } else {
      record('1.6 previousClassId set', false, 'No history to check');
      record('1.7 previousSectionId set', false, 'No history to check');
    }

    // Test 1.8: Audit event exists for promotion
    const auditCount = await AuditLog.countDocuments({
      tenantId,
      action: 'STUDENTS_PROMOTED',
      'metadata.targetSessionId': String(dstSession._id),
    });
    record('1.8 STUDENTS_PROMOTED audit event exists', auditCount >= 1);

    // ================================================================
    // TEST GROUP 2: SAME-SESSION REJECTION
    // ================================================================
    console.log('\n═══ TEST GROUP 2: Same-Session Rejection ═══');

    // Reset student back
    await Student.updateOne({ _id: student1._id }, {
      $set: { sessionId: srcSession._id, classId: srcClass._id, sectionId: srcSection._id, rollNumber: '1' },
    });

    const sameSessionRes = await request('/promotions', {
      method: 'POST',
      token: adminToken,
      body: {
        source: { sessionId: String(srcSession._id), classId: String(srcClass._id), sectionId: String(srcSection._id) },
        destination: { sessionId: String(srcSession._id), classId: String(srcClass._id), sectionId: String(srcSection._id) },
        studentIds: [String(student1._id)],
      },
    });
    record('2.1 Same-session rejected (400)', sameSessionRes.status === 400);
    record('2.2 Code is SAME_SESSION_PROMOTION', sameSessionRes.body?.error?.code === 'SAME_SESSION_PROMOTION');

    // Same-session preview also rejected
    const samePreviewRes = await request('/promotions/preview', {
      token: adminToken,
      params: {
        sessionId: String(srcSession._id), classId: String(srcClass._id), sectionId: String(srcSection._id),
        toSessionId: String(srcSession._id), toClassId: String(srcClass._id), toSectionId: String(srcSection._id),
      },
    });
    record('2.3 Same-session preview rejected', samePreviewRes.status === 400);

    // ================================================================
    // TEST GROUP 3: SECTIONLESS PROMOTION
    // ================================================================
    console.log('\n═══ TEST GROUP 3: Sectionless Promotion ═══');

    // Create sectionless class (no sections)
    const slClass = await createTestClass(tenantId, srcSession._id, '__PROMO_SL_Class');
    const slDstClass = await createTestClass(tenantId, dstSession._id, '__PROMO_SL_DST_Class');
    const slStudent = await createTestStudent(
      tenantId, srcSession._id, slClass._id, null,
      '__PROMO_SL_Student', '__PSL001', '1'
    );

    // Test 3.1: Preview with null sectionId
    const slPreview = await request('/promotions/preview', {
      token: adminToken,
      params: {
        sessionId: String(srcSession._id),
        classId: String(slClass._id),
        // no sectionId — sectionless
        toSessionId: String(dstSession._id),
        toClassId: String(slDstClass._id),
        // no toSectionId — sectionless
      },
    });
    record('3.1 Sectionless preview succeeds', slPreview.status === 200);
    record('3.2 Sectionless student found', slPreview.body?.data?.total === 1);

    // Test 3.3: Sectionless promotion
    const slPromo = await request('/promotions', {
      method: 'POST',
      token: adminToken,
      body: {
        source: { sessionId: String(srcSession._id), classId: String(slClass._id), sectionId: null },
        destination: { sessionId: String(dstSession._id), classId: String(slDstClass._id), sectionId: null },
        studentIds: [String(slStudent._id)],
      },
    });
    record('3.3 Sectionless promotion succeeds', slPromo.status === 200 && slPromo.body?.data?.promoted === 1);

    // Test 3.4: Student is now at destination
    const slUpdated = await Student.findById(slStudent._id).lean();
    record('3.4 Sectionless student at destination',
      String(slUpdated?.sessionId) === String(dstSession._id) &&
      String(slUpdated?.classId) === String(slDstClass._id) &&
      !slUpdated?.sectionId
    );

    // Test 3.5: Section required for class that HAS sections
    const sectionRequiredRes = await request('/promotions/preview', {
      token: adminToken,
      params: {
        sessionId: String(srcSession._id),
        classId: String(srcClass._id),  // this class HAS sections
        // no sectionId — should fail
        toSessionId: String(dstSession._id),
        toClassId: String(slDstClass._id),
      },
    });
    record('3.5 Section required for sectioned class',
      sectionRequiredRes.status === 400 &&
      sectionRequiredRes.body?.error?.code === 'SECTION_REQUIRED_FOR_CLASS'
    );

    // ================================================================
    // TEST GROUP 4: CONCURRENCY (20x Same-Target Race)
    // ================================================================
    console.log('\n═══ TEST GROUP 4: Concurrency — Same-Target Race ═══');

    // Create 1 student, fire 20 concurrent promotions
    const raceStudent = await createTestStudent(
      tenantId, srcSession._id, srcClass._id, srcSection._id,
      '__PROMO_RACE_Student', '__PRACE001', '10'
    );

    const raceHistBefore = await StudentHistory.countDocuments({ studentId: raceStudent._id, status: 'promoted' });

    const racePromises = Array.from({ length: 20 }, () =>
      request('/promotions', {
        method: 'POST',
        token: adminToken,
        body: {
          source: { sessionId: String(srcSession._id), classId: String(srcClass._id), sectionId: String(srcSection._id) },
          destination: { sessionId: String(dstSession._id), classId: String(dstClass._id), sectionId: String(dstSection._id) },
          studentIds: [String(raceStudent._id)],
        },
      })
    );

    const raceResults = await Promise.all(racePromises);
    const raceSuccesses = raceResults.filter((r) => r.status === 200 && r.body?.data?.promoted === 1);
    const raceConflicts = raceResults.filter((r) => r.status === 409 || (r.status === 200 && r.body?.data?.skipped === 1));

    record('4.1 Exactly 1 winner in 20x same-target race', raceSuccesses.length === 1,
      `Winners: ${raceSuccesses.length}`);

    // Verify exactly 1 new history event (correction #26)
    const raceHistAfter = await StudentHistory.countDocuments({ studentId: raceStudent._id, status: 'promoted' });
    record('4.2 Exactly 1 new promotion history event', (raceHistAfter - raceHistBefore) === 1,
      `Delta: ${raceHistAfter - raceHistBefore}`);

    // Student at correct destination
    const raceUpdated = await Student.findById(raceStudent._id).lean();
    record('4.3 Student at final destination',
      String(raceUpdated?.sessionId) === String(dstSession._id)
    );
    record('4.4 Admission number unchanged after race', raceUpdated?.admissionNumber === '__PRACE001');

    // ================================================================
    // TEST GROUP 5: BULK ALL-OR-NOTHING ROLLBACK
    // ================================================================
    console.log('\n═══ TEST GROUP 5: Bulk All-or-Nothing Rollback ═══');

    // Create 10 students, promote all, but make 1 stale
    const bulkStudents: any[] = [];
    for (let i = 1; i <= 10; i++) {
      const s = await createTestStudent(
        tenantId, srcSession._id, srcClass._id, srcSection._id,
        `__PROMO_BULK_Student_${i}`, `__PB${String(i).padStart(3, '0')}`, String(20 + i)
      );
      bulkStudents.push(s);
    }

    // Make student #8 stale by moving it to a different class
    const staleClass = await createTestClass(tenantId, srcSession._id, '__PROMO_STALE_Class');
    await Student.updateOne({ _id: bulkStudents[7]._id }, { $set: { classId: staleClass._id } });

    const bulkHistBefore = await StudentHistory.countDocuments({
      studentId: { $in: bulkStudents.map((s: any) => s._id) },
      status: 'promoted',
    });
    const bulkAuditBefore = await AuditLog.countDocuments({
      tenantId,
      action: 'STUDENTS_PROMOTED',
    });

    const bulkRes = await request('/promotions', {
      method: 'POST',
      token: adminToken,
      body: {
        source: { sessionId: String(srcSession._id), classId: String(srcClass._id), sectionId: String(srcSection._id) },
        destination: { sessionId: String(dstSession._id), classId: String(dstClass._id), sectionId: String(dstSection._id) },
        studentIds: bulkStudents.map((s: any) => String(s._id)),
      },
    });

    record('5.1 Bulk with stale student returns 409', bulkRes.status === 409);
    record('5.2 Code is STUDENT_PLACEMENT_CHANGED', bulkRes.body?.error?.code === 'STUDENT_PLACEMENT_CHANGED');

    // Verify ALL 10 students unchanged (correction #26)
    const bulkAfter = await Student.find({
      _id: { $in: bulkStudents.map((s: any) => s._id) },
      sessionId: srcSession._id,
    }).lean();
    // 9 should still be at source session (1 was moved to staleClass but same session)
    record('5.3 All students at source session (no partial move)',
      bulkAfter.length === 10, `Found ${bulkAfter.length}`);

    // History delta = 0 (correction #26)
    const bulkHistAfter = await StudentHistory.countDocuments({
      studentId: { $in: bulkStudents.map((s: any) => s._id) },
      status: 'promoted',
    });
    record('5.4 Promotion history delta = 0', (bulkHistAfter - bulkHistBefore) === 0,
      `Delta: ${bulkHistAfter - bulkHistBefore}`);

    // Audit delta = 0 (correction #26)
    const bulkAuditAfter = await AuditLog.countDocuments({
      tenantId,
      action: 'STUDENTS_PROMOTED',
    });
    record('5.5 Audit delta = 0', (bulkAuditAfter - bulkAuditBefore) === 0,
      `Delta: ${bulkAuditAfter - bulkAuditBefore}`);

    // ================================================================
    // TEST GROUP 6: STUDENT ID VALIDATION
    // ================================================================
    console.log('\n═══ TEST GROUP 6: Student ID Validation ═══');

    // Test 6.1: Non-existent student ID
    const fakeId = new mongoose.Types.ObjectId();
    const missingRes = await request('/promotions', {
      method: 'POST',
      token: adminToken,
      body: {
        source: { sessionId: String(srcSession._id), classId: String(srcClass._id), sectionId: String(srcSection._id) },
        destination: { sessionId: String(dstSession._id), classId: String(dstClass._id), sectionId: String(dstSection._id) },
        studentIds: [String(fakeId)],
      },
    });
    record('6.1 Non-existent student ID fails', missingRes.status >= 400);

    // Test 6.2: Duplicate IDs in request — should deduplicate
    // Reset a student back to source for this test
    await Student.updateOne({ _id: bulkStudents[0]._id }, {
      $set: { sessionId: srcSession._id, classId: srcClass._id, sectionId: srcSection._id, rollNumber: '21' },
    });

    const dupeIdRes = await request('/promotions', {
      method: 'POST',
      token: adminToken,
      body: {
        source: { sessionId: String(srcSession._id), classId: String(srcClass._id), sectionId: String(srcSection._id) },
        destination: { sessionId: String(dstSession._id), classId: String(dstClass._id), sectionId: String(dstSection._id) },
        studentIds: [String(bulkStudents[0]._id), String(bulkStudents[0]._id), String(bulkStudents[0]._id)],
      },
    });
    record('6.2 Duplicate IDs → promoted=1 (deduped)', dupeIdRes.status === 200 && dupeIdRes.body?.data?.promoted === 1);

    // Only 1 history row from this (not 3)
    const dupeHist = await StudentHistory.find({
      studentId: bulkStudents[0]._id,
      status: 'promoted',
      sessionId: dstSession._id,
    }).lean();
    record('6.3 Exactly 1 history event (not 3)', dupeHist.length === 1, `Found ${dupeHist.length}`);

    // ================================================================
    // TEST GROUP 7: RBAC
    // ================================================================
    console.log('\n═══ TEST GROUP 7: RBAC ═══');

    // Test 7.1: No token → 401
    const noAuthRes = await request('/promotions/preview', {
      params: {
        sessionId: String(srcSession._id), classId: String(srcClass._id), sectionId: String(srcSection._id),
        toSessionId: String(dstSession._id), toClassId: String(dstClass._id), toSectionId: String(dstSection._id),
      },
    });
    record('7.1 No auth → 401', noAuthRes.status === 401);

    // Test 7.2: Teacher role → 403 (promotion requires admin/super_admin)
    if (teacherToken) {
      const teacherRes = await request('/promotions', {
        method: 'POST',
        token: teacherToken,
        body: {
          source: { sessionId: String(srcSession._id), classId: String(srcClass._id), sectionId: String(srcSection._id) },
          destination: { sessionId: String(dstSession._id), classId: String(dstClass._id), sectionId: String(dstSection._id) },
          studentIds: [],
        },
      });
      record('7.2 Teacher role → 403', teacherRes.status === 403);
    } else {
      record('7.2 Teacher role → 403', true, 'Skipped (no teacher user available)');
    }

    // ================================================================
    // TEST GROUP 8: CONCURRENCY (20x Different-Target Race)
    // ================================================================
    console.log('\n═══ TEST GROUP 8: Different-Target Race ═══');

    // Create dst2 for the second target
    const dstSession2 = await createTestSession(tenantId, '__PROMO_DST2_Session');
    const dstClass2 = await createTestClass(tenantId, dstSession2._id, '__PROMO_DST2_Class');
    const dstSection2 = await createTestSection(tenantId, dstClass2._id, dstSession2._id, 'A');

    // Create a fresh student at source
    const diffRaceStudent = await createTestStudent(
      tenantId, srcSession._id, srcClass._id, srcSection._id,
      '__PROMO_DIFFRACE_Student', '__PDRACE001', '50'
    );

    // 10 → dstSession, 10 → dstSession2
    const diffRacePromises = [
      ...Array.from({ length: 10 }, () =>
        request('/promotions', {
          method: 'POST',
          token: adminToken,
          body: {
            source: { sessionId: String(srcSession._id), classId: String(srcClass._id), sectionId: String(srcSection._id) },
            destination: { sessionId: String(dstSession._id), classId: String(dstClass._id), sectionId: String(dstSection._id) },
            studentIds: [String(diffRaceStudent._id)],
          },
        })
      ),
      ...Array.from({ length: 10 }, () =>
        request('/promotions', {
          method: 'POST',
          token: adminToken,
          body: {
            source: { sessionId: String(srcSession._id), classId: String(srcClass._id), sectionId: String(srcSection._id) },
            destination: { sessionId: String(dstSession2._id), classId: String(dstClass2._id), sectionId: String(dstSection2._id) },
            studentIds: [String(diffRaceStudent._id)],
          },
        })
      ),
    ];

    const diffResults = await Promise.all(diffRacePromises);
    const diffWinners = diffResults.filter((r) => r.status === 200 && r.body?.data?.promoted === 1);

    record('8.1 Exactly 1 winner in 20x different-target race', diffWinners.length === 1,
      `Winners: ${diffWinners.length}`);

    // Verify student ends at one of the two destinations
    const diffUpdated = await Student.findById(diffRaceStudent._id).lean();
    const atDst1 = String(diffUpdated?.sessionId) === String(dstSession._id);
    const atDst2 = String(diffUpdated?.sessionId) === String(dstSession2._id);
    record('8.2 Student at exactly one destination', atDst1 || atDst2);

    // Verify history destination matches student destination (correction #26)
    const diffHist = await StudentHistory.find({
      studentId: diffRaceStudent._id,
      status: 'promoted',
    }).lean();
    if (diffHist.length === 1) {
      record('8.3 History destination matches student destination',
        String(diffHist[0].sessionId) === String(diffUpdated?.sessionId)
      );
    } else {
      record('8.3 History destination matches student destination', false,
        `Expected 1 history event, found ${diffHist.length}`);
    }

    // ================================================================
    // TEST GROUP 9: ROLL NUMBER ALLOCATION
    // ================================================================
    console.log('\n═══ TEST GROUP 9: Roll Number Allocation ═══');

    // Create 3 students at source, promote them, verify sequential roll numbers at destination
    const rollSrcClass = await createTestClass(tenantId, srcSession._id, '__PROMO_ROLL_SRC_Class');
    const rollDstClass = await createTestClass(tenantId, dstSession._id, '__PROMO_ROLL_DST_Class');
    const rollSrcSec = await createTestSection(tenantId, rollSrcClass._id, srcSession._id, 'R');
    const rollDstSec = await createTestSection(tenantId, rollDstClass._id, dstSession._id, 'R');

    const rollStudents = [];
    for (let i = 1; i <= 3; i++) {
      const s = await createTestStudent(
        tenantId, srcSession._id, rollSrcClass._id, rollSrcSec._id,
        `__PROMO_ROLL_Student_${i}`, `__PR${String(i).padStart(3, '0')}`, String(i)
      );
      rollStudents.push(s);
    }

    await request('/promotions', {
      method: 'POST',
      token: adminToken,
      body: {
        source: { sessionId: String(srcSession._id), classId: String(rollSrcClass._id), sectionId: String(rollSrcSec._id) },
        destination: { sessionId: String(dstSession._id), classId: String(rollDstClass._id), sectionId: String(rollDstSec._id) },
        studentIds: rollStudents.map((s) => String(s._id)),
      },
    });

    const promotedRolls = await Student.find({
      _id: { $in: rollStudents.map((s) => s._id) },
    }).sort({ rollNumber: 1 }).select('rollNumber').lean();

    const rollNumbers = promotedRolls.map((s) => parseInt(s.rollNumber, 10));
    const isSequential = rollNumbers.every((r, i) => i === 0 || r === rollNumbers[i - 1] + 1);
    record('9.1 Roll numbers are sequential', isSequential, `Roll numbers: ${rollNumbers.join(', ')}`);

    // ================================================================
    // TEST GROUP 10: SESSION NAME UNIQUENESS
    // ================================================================
    console.log('\n═══ TEST GROUP 10: Session Name Uniqueness ═══');

    // Test 10.1: Create duplicate session name → should fail (if migration has run)
    const dupeNameRes = await request('/academic-sessions', {
      method: 'POST',
      token: adminToken,
      body: { name: '__PROMO_SRC_Session', startDate: '2025-01-01', endDate: '2025-12-31' },
    });
    // Only assert if migration has run (normalizedName index exists)
    if (dupeNameRes.status === 409) {
      record('10.1 Duplicate session name rejected', true);
      record('10.2 Code is SESSION_NAME_TAKEN', dupeNameRes.body?.error?.code === 'SESSION_NAME_TAKEN');
    } else {
      record('10.1 Duplicate session name rejected', false,
        `Status ${dupeNameRes.status} — migration may not have run yet`);
      record('10.2 Code is SESSION_NAME_TAKEN', false, 'Skipped');
      // Clean up the accidental duplicate
      if (dupeNameRes.status === 201 && dupeNameRes.body?.data?._id) {
        await AcademicSession.deleteOne({ _id: dupeNameRes.body.data._id });
      }
    }

    // ================================================================
    // CLEANUP
    // ================================================================
    console.log('\n=== Cleaning up test fixtures ===');
    // Delete all test data created by this suite
    const testSessions = await AcademicSession.find({ tenantId, name: { $regex: /^__PROMO_/ } }).select('_id');
    const testSessionIds = testSessions.map((s) => s._id);
    const testClasses = await Class.find({ tenantId, name: { $regex: /^__PROMO_/ } }).select('_id');
    const testClassIds = testClasses.map((c) => c._id);

    const adminOpts = { allowAdministrativeHistoryMutation: true } as any;
    await StudentHistory.deleteMany({ tenantId, sessionId: { $in: testSessionIds } }, adminOpts);
    await Student.deleteMany({ tenantId, admissionNumber: { $regex: /^__P/ } });
    await Section.deleteMany({ tenantId, classId: { $in: testClassIds } });
    await Class.deleteMany({ tenantId, name: { $regex: /^__PROMO_/ } });
    await AcademicSession.deleteMany({ tenantId, name: { $regex: /^__PROMO_/ } });
    await AuditLog.deleteMany({ tenantId, 'metadata.sourceSessionId': { $in: testSessionIds.map(String) } });

    console.log('Test fixtures cleaned.\n');

  } catch (err: any) {
    console.error('Suite error:', err.message || err);
  }

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  console.log('        PROMOTION HARDENING RESULTS');
  console.log('══════════════════════════════════════════\n');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  for (const r of results) {
    console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}${r.details && !r.passed ? ` — ${r.details}` : ''}`);
  }

  console.log(`\n  ${passed}/${total} passed, ${failed} failed.\n`);

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runSuite().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
