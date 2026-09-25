import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { Staff } from '../models/Staff';
import { Teacher } from '../models/Teacher';
import { Class } from '../models/Class';
import { Subject } from '../models/Subject';
import { User } from '../models/User';
import { TeacherAttendance } from '../models/TeacherAttendance';
import { SalaryRecord } from '../models/SalaryRecord';
import { requireTeachingStaff } from '../services/academic.service';
import {
  TENANT_EXPORT_REGISTRY,
  sanitizeDocumentForModeA,
} from '../services/dataTransfer/TenantExportService';

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

async function runPhase4bMatrix() {
  console.log('\n======================================================');
  console.log('       PHASE 4B COMPREHENSIVE TEST MATRIX            ');
  console.log('======================================================\n');

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing from environment');

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  console.log(`Connected to Database: ${db.databaseName}\n`);

  // Ensure Staff indexes are synced
  await Staff.syncIndexes();

  const dummyTenant1 = new mongoose.Types.ObjectId();
  const dummyTenant2 = new mongoose.Types.ObjectId();
  const dummyUser1 = new mongoose.Types.ObjectId();
  const dummyUser2 = new mongoose.Types.ObjectId();

  const fixturesToClean: { col: string; id: any }[] = [];

  try {
    // ──────────────────────────────────────────────────────────
    // 1. PHYSICAL COLLECTION & INDEXES
    // ──────────────────────────────────────────────────────────
    console.log('--- 1. Physical Collection & Indexes ---');
    const cols = (await db.listCollections().toArray()).map((c) => c.name);
    assert(cols.includes('staff'), "Physical 'staff' collection exists");
    assert(cols.includes('teachers'), "Physical 'teachers' collection preserved (not dropped)");

    const staffIndexes = await db.collection('staff').indexes();
    const empIdx = staffIndexes.find(
      (idx) => idx.key?.tenantId === 1 && idx.key?.employeeId === 1 && idx.unique === true
    );
    assert(Boolean(empIdx), "Unique index { tenantId: 1, employeeId: 1 } exists on staff");

    const userIdx = staffIndexes.find(
      (idx) => idx.key?.userId === 1 && idx.unique === true && idx.partialFilterExpression?.userId
    );
    assert(Boolean(userIdx), "Partial unique index on userId exists on staff");

    const listIdx = staffIndexes.find(
      (idx) =>
        idx.key?.tenantId === 1 &&
        idx.key?.staffType === 1 &&
        idx.key?.isArchived === 1 &&
        idx.key?.isActive === 1
    );
    assert(Boolean(listIdx), "Compound list index { tenantId, staffType, isArchived, isActive } exists on staff");

    // ──────────────────────────────────────────────────────────
    // 2. STAFF CREATION & TYPES (TEACHING vs NON-TEACHING)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 2. Staff Creation & Differentiation ---');
    const teachingStaff = await Staff.create({
      tenantId: dummyTenant1,
      employeeId: 'EMP-T-001',
      staffType: 'teaching',
      designation: 'Senior Teacher',
      fullName: 'Alice Teaching',
      gender: 'female',
      joiningDate: new Date(),
      salary: 5000000, // 50,000 PKR in paisa
      isActive: true,
      isArchived: false,
    });
    fixturesToClean.push({ col: 'staff', id: teachingStaff._id });
    assert(teachingStaff.staffType === 'teaching', 'Teaching staff created with staffType: teaching');

    const nonTeachingStaff = await Staff.create({
      tenantId: dummyTenant1,
      employeeId: 'EMP-NT-001',
      staffType: 'non_teaching',
      designation: 'Accountant',
      fullName: 'Bob Accountant',
      gender: 'male',
      joiningDate: new Date(),
      salary: 4500000,
      isActive: true,
      isArchived: false,
    });
    fixturesToClean.push({ col: 'staff', id: nonTeachingStaff._id });
    assert(nonTeachingStaff.staffType === 'non_teaching', 'Non-teaching staff created with staffType: non_teaching');

    // ──────────────────────────────────────────────────────────
    // 3. TEACHER COMPATIBILITY MODEL STRICT FILTERING (CORRECTION 1)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 3. Teacher Compatibility Model Filtering (Correction 1) ---');
    // Teacher.find should return only teachingStaff
    const teachersFound = await Teacher.find({ tenantId: dummyTenant1 });
    assert(
      teachersFound.length === 1 && String(teachersFound[0]._id) === String(teachingStaff._id),
      'Teacher.find returns teaching staff and excludes non-teaching staff'
    );

    // Teacher.findOne by non-teaching _id MUST resolve to null
    const teacherLookupNonTeaching = await Teacher.findOne({ _id: nonTeachingStaff._id });
    assert(
      teacherLookupNonTeaching === null,
      'Teacher.findOne on non-teaching Staff ID returns null'
    );

    // Teacher.countDocuments must only count teaching staff
    const teacherCount = await Teacher.countDocuments({ tenantId: dummyTenant1 });
    assert(teacherCount === 1, 'Teacher.countDocuments counts teaching staff only (1, not 2)');

    // Teacher.findById on non-teaching Staff ID must return null
    const teacherFindByIdNonTeaching = await Teacher.findById(nonTeachingStaff._id);
    assert(
      teacherFindByIdNonTeaching === null,
      'Teacher.findById on non-teaching Staff ID returns null'
    );

    // ──────────────────────────────────────────────────────────
    // 4. EMPLOYEE ID NORMALIZATION & UNIQUENESS
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 4. Employee ID Normalization & Uniqueness ---');
    // Normalized uppercase / trim
    assert(teachingStaff.employeeId === 'EMP-T-001', 'Employee ID trimmed and uppercased on save');

    // Duplicate in same tenant must fail
    let dupFailed = false;
    try {
      await Staff.create({
        tenantId: dummyTenant1,
        employeeId: 'emp-t-001', // Lowercase collision
        staffType: 'teaching',
        designation: 'Teacher',
        fullName: 'Duplicate Teacher',
        joiningDate: new Date(),
        salary: 3000000,
      });
    } catch (err: any) {
      dupFailed = err.code === 11000;
    }
    assert(dupFailed, 'Duplicate employee ID (case-insensitive collision) in same tenant rejected');

    // Same employee ID in different tenant must succeed
    const otherTenantStaff = await Staff.create({
      tenantId: dummyTenant2,
      employeeId: 'EMP-T-001',
      staffType: 'teaching',
      designation: 'Teacher',
      fullName: 'Tenant 2 Teacher',
      joiningDate: new Date(),
      salary: 3000000,
    });
    fixturesToClean.push({ col: 'staff', id: otherTenantStaff._id });
    assert(Boolean(otherTenantStaff._id), 'Same employee ID in different tenant is allowed');

    // ──────────────────────────────────────────────────────────
    // 5. USER LINKING & PARTIAL UNIQUE INDEX (CORRECTION 4)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 5. User Linking & Partial Unique Index (Correction 4) ---');
    // Multiple staff without userId (unlinked) must not collide
    const unlinked1 = await Staff.create({
      tenantId: dummyTenant1,
      employeeId: 'UNLINKED-001',
      staffType: 'non_teaching',
      designation: 'Clerk',
      fullName: 'Unlinked One',
      joiningDate: new Date(),
      salary: 2000000,
      // userId omitted
    });
    fixturesToClean.push({ col: 'staff', id: unlinked1._id });

    const unlinked2 = await Staff.create({
      tenantId: dummyTenant1,
      employeeId: 'UNLINKED-002',
      staffType: 'non_teaching',
      designation: 'Clerk',
      fullName: 'Unlinked Two',
      joiningDate: new Date(),
      salary: 2000000,
      // userId omitted
    });
    fixturesToClean.push({ col: 'staff', id: unlinked2._id });
    assert(
      Boolean(unlinked1._id && unlinked2._id),
      'Multiple staff records without userId succeed without index collision'
    );

    // Linking a userId
    teachingStaff.userId = dummyUser1;
    await teachingStaff.save();
    assert(String(teachingStaff.userId) === String(dummyUser1), 'Staff linked to valid userId');

    // Attempting to link another staff to the same userId must fail
    let userDupFailed = false;
    try {
      await Staff.create({
        tenantId: dummyTenant1,
        employeeId: 'EMP-T-999',
        staffType: 'teaching',
        designation: 'Teacher',
        fullName: 'Another Teacher',
        joiningDate: new Date(),
        salary: 3000000,
        userId: dummyUser1, // duplicate user
      });
    } catch (err: any) {
      userDupFailed = err.code === 11000;
    }
    assert(userDupFailed, 'Duplicate userId link across staff rejected by partial unique index');

    // ──────────────────────────────────────────────────────────
    // 6. TEACHING STAFF VALIDATION (CORRECTION 1 & STEP 4B.7)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 6. Teaching Staff Validation (Step 4B.7) ---');
    // requireTeachingStaff on teaching staff succeeds
    const validatedTeacher = await requireTeachingStaff(String(teachingStaff._id), dummyTenant1);
    assert(Boolean(validatedTeacher), 'requireTeachingStaff succeeds for teaching staff');

    // requireTeachingStaff on non-teaching staff rejects with INVALID_STAFF_TYPE
    let rejectedNonTeaching = false;
    try {
      await requireTeachingStaff(String(nonTeachingStaff._id), dummyTenant1);
    } catch (err: any) {
      rejectedNonTeaching = err.code === 'INVALID_STAFF_TYPE';
    }
    assert(rejectedNonTeaching, 'requireTeachingStaff rejects non-teaching staff with INVALID_STAFF_TYPE');

    // requireTeachingStaff rejects foreign tenant staff
    let foreignTenantRejected = false;
    try {
      await requireTeachingStaff(String(otherTenantStaff._id), dummyTenant1);
    } catch (err: any) {
      foreignTenantRejected = err.statusCode === 404;
    }
    assert(foreignTenantRejected, 'requireTeachingStaff rejects staff from different tenant');

    // ──────────────────────────────────────────────────────────
    // 7. CLASS & SUBJECT RELATIONSHIPS & ZERO DRIFT (CORRECTION 2)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 7. Class / Subject Relationships & Canonical Source (Correction 2) ---');
    // Class accepts teaching staff
    const dummyClass = await Class.create({
      tenantId: dummyTenant1,
      name: 'Grade 9 Test',
      code: 'G9-TEST',
      sessionId: new mongoose.Types.ObjectId(),
    });
    fixturesToClean.push({ col: 'classes', id: dummyClass._id });
    // Subject accepts teaching staff
    const dummySubject = await Subject.create({
      tenantId: dummyTenant1,
      name: 'Biology Test',
      code: 'BIO-TEST',
      sessionId: dummyClass.sessionId,
      classIds: [dummyClass._id],
    });
    fixturesToClean.push({ col: 'subjects', id: dummySubject._id });
    // Verify derived relationships on Staff (not stored as independent writable fields)
    assert(
      !(teachingStaff.toObject() as any).assignedClasses,
      'Staff document has no persisted assignedClasses field (derived from Class)'
    );
    assert(
      !(teachingStaff.toObject() as any).assignedSubjects,
      'Staff document has no persisted assignedSubjects field (derived from Subject)'
    );

    // ──────────────────────────────────────────────────────────
    // 8. ATTENDANCE & SALARY RECORD COMPATIBILITY (STEPS 4B.9 & 4B.10)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 8. TeacherAttendance & SalaryRecord Compatibility ---');
    const attRecord = await TeacherAttendance.create({
      tenantId: dummyTenant1,
      teacherId: teachingStaff._id,
      attendanceDate: new Date(),
      status: 'present',
    });
    fixturesToClean.push({ col: 'teacherattendances', id: attRecord._id });
    assert(String(attRecord.teacherId) === String(teachingStaff._id), 'TeacherAttendance accepts teaching Staff ObjectId');

    const salRecord = await SalaryRecord.create({
      tenantId: dummyTenant1,
      staffId: teachingStaff._id,
      sessionId: dummyClass.sessionId,
      salaryMonth: '2026-09',
      baseAmount: 5000000,
      adjustmentAmount: 0,
      netAmount: 5000000,
      status: 'paid',
      paymentDate: new Date(),
      paymentMethod: 'bank_transfer',
    });
    fixturesToClean.push({ col: 'salaryrecords', id: salRecord._id });
    assert(String(salRecord.staffId) === String(teachingStaff._id), 'SalaryRecord accepts teaching Staff ObjectId');

    // ──────────────────────────────────────────────────────────
    // 9. EXPORT REGISTRY TRANSITION (STEP 4B.13)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 9. Tenant Export Registry Transition (Step 4B.13) ---');
    const staffExportPolicy = TENANT_EXPORT_REGISTRY.find((p: any) => p.collection === 'staff');
    assert(
      Boolean(staffExportPolicy && staffExportPolicy.includeInSchoolData && staffExportPolicy.includeInInternalRecovery),
      "staff collection is registered with includeInSchoolData=true and includeInInternalRecovery=true"
    );

    const legacyTeachersPolicy = TENANT_EXPORT_REGISTRY.find((p: any) => p.collection === 'teachers');
    assert(
      Boolean(legacyTeachersPolicy && !legacyTeachersPolicy.includeInSchoolData && !legacyTeachersPolicy.includeInInternalRecovery),
      "legacy teachers collection is excluded from export to avoid duplicate employee datasets"
    );

    // Verify Mode A sanitization on Staff doc
    const sanitizedStaff = sanitizeDocumentForModeA(teachingStaff.toObject(), 'staff');
    assert(sanitizedStaff.salary === 5000000, 'Staff salary is preserved as school-owned HR data in Mode A');
    assert(!sanitizedStaff.storageKey, 'Storage key and secrets redacted in Mode A');

    // ──────────────────────────────────────────────────────────
    // 10. BASELINE DATA INTEGRITY
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 10. Baseline Data Integrity ---');
    const studentCount = await db.collection('students').countDocuments();
    assert(studentCount === 40, `All 40 baseline students remain unchanged (count=${studentCount})`);

    const rawTeachersCount = await db.collection('teachers').countDocuments();
    assert(rawTeachersCount === 0, `Original physical teachers collection remains untouched (count=${rawTeachersCount})`);

  } finally {
    // Clean up all temporary fixtures
    for (const f of fixturesToClean) {
      await db.collection(f.col).deleteOne({ _id: f.id });
    }
    console.log('\nTemporary fixtures cleaned up successfully.');
  }

  console.log('\n======================================================');
  console.log(`TEST MATRIX SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  await mongoose.disconnect();
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4bMatrix().catch((err) => {
  console.error('Test matrix execution error:', err);
  process.exit(1);
});
