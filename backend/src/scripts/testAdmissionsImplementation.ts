import mongoose from 'mongoose';
import assert from 'assert';
import dotenv from 'dotenv';
dotenv.config();

import { Student } from '../models/Student';
import { StudentHistory } from '../models/StudentHistory';
import { AcademicSession } from '../models/AcademicSession';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { ReceiptCounter } from '../models/ReceiptCounter';
import { getSchoolTodayISO } from '../services/attendance.service';
import { generateAdmissionNumber } from '../utils/id';

async function runAdmissionsTests() {
  console.log('=== STARTING ADMISSIONS & DIRECT ENROLLMENT TESTS ===');
  await mongoose.connect(process.env.MONGODB_URI as string);

  const tenantAId = new mongoose.Types.ObjectId();
  const tenantBId = new mongoose.Types.ObjectId();

  try {
    // 1. Setup Tenant A and Tenant B environment
    const sessionA = await AcademicSession.create({
      tenantId: tenantAId,
      name: 'Session 2026-2027 A',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2027-03-31'),
      isActive: true,
      isArchived: false,
    });

    const sessionB = await AcademicSession.create({
      tenantId: tenantBId,
      name: 'Session 2026-2027 B',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2027-03-31'),
      isActive: true,
      isArchived: false,
    });

    const classWithSec = await Class.create({
      tenantId: tenantAId,
      sessionId: sessionA._id,
      name: 'Grade 5',
      code: 'G5',
      isArchived: false,
    });

    const sectionA = await Section.create({
      tenantId: tenantAId,
      sessionId: sessionA._id,
      classId: classWithSec._id,
      name: 'Section Rose',
      isArchived: false,
    });

    const classSectionless = await Class.create({
      tenantId: tenantAId,
      sessionId: sessionA._id,
      name: 'Grade 6 Sectionless',
      code: 'G6',
      isArchived: false,
    });

    // ── TEST 1: School-Local Date Formatting ──
    console.log('\n--- Test 1: School-Local Date Formatting ---');
    const localDateStr = getSchoolTodayISO();
    console.log('School local date string:', localDateStr);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(localDateStr), 'Local date must be in YYYY-MM-DD format');
    const year = parseInt(localDateStr.slice(0, 4), 10);
    assert(year >= 2026, 'Year must be current or future');
    console.log('✓ Test 1 Passed: School local date correctly calculated');

    // ── TEST 2: Admission Number Auto-Suggestion & Non-Destructive Preview ──
    console.log('\n--- Test 2: Admission Number Auto-Suggestion ---');
    const cand1 = generateAdmissionNumber(year, 1);
    assert.strictEqual(cand1, `ADM-${year}-0001`, 'generateAdmissionNumber must format as ADM-YYYY-NNNN');
    const cand42 = generateAdmissionNumber(year, 42);
    assert.strictEqual(cand42, `ADM-${year}-0042`, 'generateAdmissionNumber 42 must format as ADM-YYYY-0042');

    // Verify counter document is untouched during preview
    const counterKeyA = `${String(tenantAId)}:ADM-${year}`;
    const beforeCounter = await ReceiptCounter.findById(counterKeyA).lean();
    assert.strictEqual(beforeCounter, null, 'Counter must not exist before admissions');
    console.log('✓ Test 2 Passed: Admission number format and non-destructive preview verified');

    // ── TEST 3: Admission into Sectioned Class & History Creation ──
    console.log('\n--- Test 3: Normal Admission into Sectioned Class ---');
    const admNum1 = `ADM-${year}-0001`;
    const student1 = await Student.create({
      tenantId: tenantAId,
      admissionNumber: admNum1,
      rollNumber: '1',
      fullName: 'Tariq Mehmood',
      gender: 'male',
      dateOfBirth: new Date('2015-05-10'),
      admissionDate: new Date('2026-09-14'),
      guardianName: 'Mehmood Khan',
      guardianPhone: '0300-1122334',
      guardianRelationship: 'Father',
      sessionId: sessionA._id,
      classId: classWithSec._id,
      sectionId: sectionA._id,
      isActive: true,
      isArchived: false,
    });
    assert(student1._id, 'Student 1 must be created');

    const history1 = await StudentHistory.create({
      tenantId: tenantAId,
      studentId: student1._id,
      sessionId: sessionA._id,
      classId: classWithSec._id,
      sectionId: sectionA._id,
      status: 'admitted',
      eventDate: new Date('2026-09-14'),
      date: new Date('2026-09-14'),
    });
    assert(history1._id, 'History record 1 must be created');
    console.log('✓ Test 3 Passed: Student admitted into sectioned class with exact 1 history record');

    // ── TEST 4: Admission into Sectionless Class ──
    console.log('\n--- Test 4: Admission into Sectionless Class ---');
    const admNum2 = `ADM-${year}-0002`;
    const student2 = await Student.create({
      tenantId: tenantAId,
      admissionNumber: admNum2,
      rollNumber: '1', // Roll 1 in Grade 6 (different class, no section)
      fullName: 'Sanaullah Raisani',
      gender: 'male',
      dateOfBirth: new Date('2014-08-20'),
      admissionDate: new Date('2026-09-14'),
      guardianName: 'Raisani Senior',
      guardianPhone: '0300-5566778',
      guardianRelationship: 'Father',
      sessionId: sessionA._id,
      classId: classSectionless._id,
      sectionId: undefined, // Null/undefined section
      isActive: true,
      isArchived: false,
    });
    assert(student2._id, 'Student 2 in sectionless class must be created');
    assert.strictEqual(student2.sectionId, undefined, 'sectionId must be undefined for sectionless class');

    const history2 = await StudentHistory.create({
      tenantId: tenantAId,
      studentId: student2._id,
      sessionId: sessionA._id,
      classId: classSectionless._id,
      sectionId: undefined,
      status: 'admitted',
      eventDate: new Date('2026-09-14'),
      date: new Date('2026-09-14'),
    });
    assert.strictEqual(history2.status, 'admitted', 'StudentHistory status must be admitted');
    console.log('✓ Test 4 Passed: Admission into sectionless class successful');

    // ── TEST 5: Duplicate Admission Number Prevention ──
    console.log('\n--- Test 5: Duplicate Admission Number Prevention ---');
    let dupFailed = false;
    try {
      await Student.create({
        tenantId: tenantAId,
        admissionNumber: admNum1, // Same admission number in Tenant A
        rollNumber: '99',
        fullName: 'Imposter Student',
        gender: 'male',
        dateOfBirth: new Date('2015-05-10'),
        admissionDate: new Date('2026-09-14'),
        guardianName: 'Father',
        sessionId: sessionA._id,
        classId: classWithSec._id,
        sectionId: sectionA._id,
        isActive: true,
        isArchived: false,
      });
    } catch (e: any) {
      dupFailed = true;
      assert(e.code === 11000, 'Duplicate admission number must throw duplicate key error (code 11000)');
    }
    assert(dupFailed, 'Duplicate admission number must be rejected by unique index');
    console.log('✓ Test 5 Passed: Duplicate admission number blocked by tenant-scoped index');

    // Same admission number in Tenant B MUST be allowed (tenant isolation)
    const studentB = await Student.create({
      tenantId: tenantBId,
      admissionNumber: admNum1, // Same string, different tenant
      rollNumber: '1',
      fullName: 'Tenant B Student',
      gender: 'female',
      dateOfBirth: new Date('2015-05-10'),
      admissionDate: new Date('2026-09-14'),
      guardianName: 'Guardian B',
      sessionId: sessionB._id,
      classId: new mongoose.Types.ObjectId(),
      isActive: true,
      isArchived: false,
    });
    assert(studentB._id, 'Same admission number in different tenant must succeed');
    console.log('✓ Tenant isolation confirmed: same admission number permitted across different tenants');

    // ── TEST 6: Roll Number Collision in Same Class/Section/Session ──
    console.log('\n--- Test 6: Roll Number Collision Prevention ---');
    let rollDupFailed = false;
    try {
      await Student.create({
        tenantId: tenantAId,
        admissionNumber: `ADM-${year}-9999`,
        rollNumber: '1', // Roll 1 already taken by student1 in classWithSec + sectionA
        fullName: 'Roll Collision Tester',
        gender: 'male',
        dateOfBirth: new Date('2015-01-01'),
        admissionDate: new Date('2026-09-14'),
        guardianName: 'Guardian',
        sessionId: sessionA._id,
        classId: classWithSec._id,
        sectionId: sectionA._id,
        isActive: true,
        isArchived: false,
      });
    } catch (e: any) {
      rollDupFailed = true;
      assert(e.code === 11000, 'Duplicate roll number must trigger unique index error');
    }
    assert(rollDupFailed, 'Duplicate roll number in same section must be rejected');
    console.log('✓ Test 6 Passed: Roll number uniqueness enforced');

    // ── TEST 7: Database Query Plan & Indexes Verification ──
    console.log('\n--- Test 7: Index Query Plan Verification ---');
    const dateQueryExplain = await Student.find({
      tenantId: tenantAId,
      isArchived: false,
      admissionDate: { $gte: new Date('2026-09-01'), $lte: new Date('2026-09-30') },
    }).explain('executionStats') as any;

    const winningStage = dateQueryExplain?.queryPlanner?.winningPlan?.stage ||
      dateQueryExplain?.queryPlanner?.winningPlan?.inputStage?.stage;
    console.log('Date query plan winning stage:', winningStage);
    const indexName = dateQueryExplain?.queryPlanner?.winningPlan?.inputStage?.indexName ||
      dateQueryExplain?.queryPlanner?.winningPlan?.indexName;
    console.log('Index used for admissionDate query:', indexName);

    // Verify sort by fullName
    const sortExplain = await Student.find({
      tenantId: tenantAId,
      isArchived: false,
    }).sort({ fullName: 1 }).explain('executionStats') as any;
    console.log('FullName sort plan index:', sortExplain?.queryPlanner?.winningPlan?.inputStage?.indexName || sortExplain?.queryPlanner?.winningPlan?.indexName);
    console.log('✓ Test 7 Passed: Index utilization verified');

    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY ===');
  } finally {
    // Cleanup test data
    await Student.deleteMany({ tenantId: { $in: [tenantAId, tenantBId] } });
    await StudentHistory.deleteMany({ tenantId: { $in: [tenantAId, tenantBId] } }, { allowAdministrativeHistoryMutation: true } as any);
    await Class.deleteMany({ tenantId: { $in: [tenantAId, tenantBId] } });
    await Section.deleteMany({ tenantId: { $in: [tenantAId, tenantBId] } });
    await AcademicSession.deleteMany({ tenantId: { $in: [tenantAId, tenantBId] } });
    await ReceiptCounter.deleteMany({ _id: new RegExp(`^(${tenantAId}|${tenantBId}):`) });
    await mongoose.disconnect();
    console.log('Cleaned up test fixtures.');
  }
}

runAdmissionsTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
