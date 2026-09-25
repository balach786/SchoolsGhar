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
import { Role } from '../models/Role';
import { signAccessToken } from '../utils/security';
import { ReceiptCounter } from '../models/ReceiptCounter';

async function testAdmissionsApi() {
  console.log('=== TESTING ADMISSIONS API ENDPOINTS ===');
  await mongoose.connect(process.env.MONGODB_URI as string);

  const tenantA = await Tenant.findOne({ slug: 'greenfield-academy' });
  assert(tenantA, 'Greenfield Academy tenant must exist');

  const adminRole = await Role.findOne({ slug: 'admin' });
  assert(adminRole, 'Admin role must exist');

  const adminUser = await User.findOne({ tenantId: tenantA._id, roleId: adminRole._id });
  assert(adminUser, 'Admin user must exist for greenfield');

  const token = signAccessToken({
    sub: String(adminUser._id),
    email: adminUser.email,
    name: adminUser.name || 'Admin User',
    role: 'admin',
    roleId: String(adminRole._id),
    tenantId: String(tenantA._id),
    type: 'access',
  });

  const session = await AcademicSession.findOne({ tenantId: tenantA._id, isActive: true, isArchived: false });
  assert(session, 'Active academic session must exist for greenfield');

  const cls = await Class.findOne({ tenantId: tenantA._id, isArchived: false });
  assert(cls, 'Class must exist for greenfield');

  const sec = await Section.findOne({ tenantId: tenantA._id, classId: cls._id, isArchived: false });

  // Clean up any previous test students
  await Student.deleteMany({ fullName: 'Admission Test Student' });
  await Student.deleteMany({ admissionNumber: /^ADM-2026-TEST-/ });

  // 1. Test GET /api/students/suggested-admission-number
  console.log('\n--- 1. Testing GET /api/students/suggested-admission-number ---');
  const resSuggest1 = await fetch('http://localhost:4000/api/students/suggested-admission-number', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(resSuggest1.status, 200, 'Suggested admission number endpoint must return 200');
  const dataSuggest1 = await resSuggest1.json() as any;
  console.log('Suggested admission number 1:', dataSuggest1.data.suggestedAdmissionNumber);
  assert(dataSuggest1.data.suggestedAdmissionNumber.startsWith('ADM-2026-'), 'Must follow ADM-2026-NNNN format');

  // Call it again: must be identical (non-destructive, does not increment counter)
  const resSuggest2 = await fetch('http://localhost:4000/api/students/suggested-admission-number', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataSuggest2 = await resSuggest2.json() as any;
  assert.strictEqual(
    dataSuggest1.data.suggestedAdmissionNumber,
    dataSuggest2.data.suggestedAdmissionNumber,
    'Repeated preview must not advance sequence'
  );
  console.log('✓ Non-destructive preview verified');

  // 2. Test Admission with Suggested Number
  console.log('\n--- 2. Testing Admission Creation ---');
  const testAdmissionNum = `ADM-2026-TEST-${Date.now().toString().slice(-4)}`;
  const testStudentPayload = {
    admissionNumber: testAdmissionNum,
    rollNumber: '999',
    fullName: 'Admission Test Student',
    gender: 'male',
    dateOfBirth: '2016-04-12',
    admissionDate: '2026-09-14',
    guardianName: 'Test Father',
    guardianPhone: '0300-1234567',
    guardianRelationship: 'Father',
    sessionId: String(session._id),
    classId: String(cls._id),
    sectionId: sec ? String(sec._id) : undefined,
  };

  const createRes = await fetch('http://localhost:4000/api/students', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(testStudentPayload),
  });
  assert.strictEqual(createRes.status, 201, 'Student creation must return 201');
  const createData = await createRes.json() as any;
  console.log('Created student id:', createData.data._id);
  assert.strictEqual(createData.data.admissionNumber, testAdmissionNum);

  // Verify StudentHistory was created
  const history = await StudentHistory.find({ studentId: createData.data._id }).lean();
  assert.strictEqual(history.length, 1, 'Exactly 1 StudentHistory record must be created');
  assert.strictEqual(history[0].status, 'admitted', 'History status must be admitted');
  console.log('✓ StudentHistory record verified');

  // 3. Test Soft Duplicate Warning (same FullName + DOB)
  console.log('\n--- 3. Testing Soft Duplicate Warning ---');
  const dupPayload = {
    ...testStudentPayload,
    admissionNumber: `ADM-2026-TEST-${(Date.now() + 1).toString().slice(-4)}`,
    rollNumber: '998',
  };

  const dupRes = await fetch('http://localhost:4000/api/students', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(dupPayload),
  });
  assert.strictEqual(dupRes.status, 400, 'Duplicate without confirmation must return 400');
  const dupData = await dupRes.json() as any;
  assert.strictEqual(dupData.error.code, 'POSSIBLE_DUPLICATE_STUDENT', 'Must return POSSIBLE_DUPLICATE_STUDENT code');
  console.log('Received expected duplicate warning:', dupData.error.message);

  // Confirm and proceed with confirmDuplicate: true
  const confirmRes = await fetch('http://localhost:4000/api/students', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...dupPayload, confirmDuplicate: true }),
  });
  assert.strictEqual(confirmRes.status, 201, 'Duplicate with explicit confirmation must succeed');
  const confirmData = await confirmRes.json() as any;
  console.log('Confirmed student admitted with ID:', confirmData.data._id);
  console.log('✓ Soft duplicate confirmation verified');

  // 4. Test Cross-Tenant Security Fail-Closed
  console.log('\n--- 4. Testing Multi-Tenant Resource Isolation ---');
  const otherTenant = await Tenant.findOne({ slug: { $ne: 'greenfield-academy' } });
  if (otherTenant) {
    const foreignSession = await AcademicSession.findOne({ tenantId: otherTenant._id });
    if (foreignSession) {
      const foreignRes = await fetch('http://localhost:4000/api/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...testStudentPayload,
          admissionNumber: `ADM-FOR-${Date.now().toString().slice(-6)}`,
          sessionId: String(foreignSession._id),
          confirmDuplicate: true,
        }),
      });
      console.log('foreignRes status:', foreignRes.status);
      const foreignBody = await foreignRes.text();
      console.log('foreignRes body:', foreignBody);
      assert(foreignRes.status === 404, 'Foreign sessionId must fail closed with 404');
      console.log('✓ Cross-tenant foreign session strictly rejected with status 404');
    }
  }

  // Cleanup created test students
  await Student.deleteMany({ _id: { $in: [createData.data._id, confirmData.data._id] } });
  await StudentHistory.deleteMany(
    { studentId: { $in: [createData.data._id, confirmData.data._id] } },
    { allowAdministrativeHistoryMutation: true } as any
  );
  await mongoose.disconnect();
  console.log('\n=== ALL API TESTS PASSED SUCCESSFULLY ===');
}

testAdmissionsApi().catch((err) => {
  console.error('API test execution failed:', err);
  process.exit(1);
});
