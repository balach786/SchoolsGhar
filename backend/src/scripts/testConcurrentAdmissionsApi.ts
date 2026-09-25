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

const API_BASE = 'http://localhost:4000/api';

async function run() {
  console.log('=== TESTING REAL API CONCURRENT ADMISSIONS ===');
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

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const session = await AcademicSession.findOne({ tenantId: tenantA._id, isActive: true, isArchived: false });
  assert(session, 'Active academic session must exist for greenfield');

  const cls = await Class.findOne({ tenantId: tenantA._id, isArchived: false });
  assert(cls, 'Class must exist for greenfield');

  const sec = await Section.findOne({ tenantId: tenantA._id, classId: cls._id, isArchived: false });

  console.log(`Tenant: ${tenantA.name} (${tenantA._id})`);
  console.log(`Session: ${session.name}, Class: ${cls.name}`);

  // --- STEP 1: Fetch Suggested Admission Number Preview ---
  console.log('\n--- 1. Fetching Suggested Admission Number Preview ---');
  const previewRes = await fetch(`${API_BASE}/students/suggested-admission-number`, {
    headers: authHeaders,
  });
  const previewData = (await previewRes.json()) as any;
  const previewNumber = previewData.data.suggestedAdmissionNumber;
  console.log(`Suggested Preview Number: ${previewNumber}`);

  // --- STEP 2: Concurrently Submit Two Admissions with the SAME Preview Number ---
  console.log('\n--- 2. Simulating Concurrent Admissions with Same Preview Number ---');
  const studentPayloadA = {
    fullName: `Concurrent Alpha ${Date.now().toString().slice(-4)}`,
    admissionNumber: previewNumber,
    isAutoAdmissionNumber: true,
    gender: 'male',
    dateOfBirth: '2015-05-10',
    admissionDate: '2026-09-14',
    guardianName: 'Guardian Alpha',
    sessionId: String(session._id),
    classId: String(cls._id),
    sectionId: sec ? String(sec._id) : undefined,
  };

  const studentPayloadB = {
    fullName: `Concurrent Beta ${Date.now().toString().slice(-4)}`,
    admissionNumber: previewNumber,
    isAutoAdmissionNumber: true,
    gender: 'female',
    dateOfBirth: '2016-08-20',
    admissionDate: '2026-09-14',
    guardianName: 'Guardian Beta',
    sessionId: String(session._id),
    classId: String(cls._id),
    sectionId: sec ? String(sec._id) : undefined,
  };

  // Launch both requests concurrently
  const [resA, resB] = await Promise.all([
    fetch(`${API_BASE}/students`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(studentPayloadA),
    }),
    fetch(`${API_BASE}/students`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(studentPayloadB),
    }),
  ]);

  const jsonA = (await resA.json()) as any;
  const jsonB = (await resB.json()) as any;

  console.log(`Student A response status: ${resA.status}`, jsonA.success ? `Assigned: ${jsonA.data.admissionNumber}` : jsonA);
  console.log(`Student B response status: ${resB.status}`, jsonB.success ? `Assigned: ${jsonB.data.admissionNumber}` : jsonB);

  assert(jsonA.success && jsonB.success, 'Both concurrent admissions must succeed');

  const idA = jsonA.data._id;
  const idB = jsonB.data._id;
  const admA = jsonA.data.admissionNumber;
  const admB = jsonB.data.admissionNumber;

  assert.notStrictEqual(admA, admB, 'Both students must have unique admission numbers');
  console.log(`✓ Concurrent admissions succeeded with distinct numbers: Student A (${admA}) and Student B (${admB})`);

  // Check history count
  const histA = await StudentHistory.find({ studentId: idA }).lean();
  const histB = await StudentHistory.find({ studentId: idB }).lean();

  assert.strictEqual(histA.length, 1, 'Student A must have exactly 1 history record');
  assert.strictEqual(histB.length, 1, 'Student B must have exactly 1 history record');
  console.log('✓ Exactly 1 StudentHistory record created for each student');

  // --- STEP 3: Manual Admission Number Validation ---
  console.log('\n--- 3. Testing Manual Admission Number Behavior ---');
  // Attempt to use already assigned admA manually
  const manualDupPayload = {
    fullName: `Manual Duplicate ${Date.now().toString().slice(-4)}`,
    admissionNumber: admA, // Already taken!
    isAutoAdmissionNumber: false, // User manually entered this number
    gender: 'male',
    dateOfBirth: '2014-01-01',
    admissionDate: '2026-09-14',
    guardianName: 'Guardian Manual',
    sessionId: String(session._id),
    classId: String(cls._id),
    sectionId: sec ? String(sec._id) : undefined,
  };

  const manualDupRes = await fetch(`${API_BASE}/students`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(manualDupPayload),
  });
  const manualDupJson = (await manualDupRes.json()) as any;
  console.log('Manual duplicate response status:', manualDupRes.status, manualDupJson.error?.code);

  assert.strictEqual(manualDupRes.status, 409, 'Duplicate manual admission number must return 409 Conflict');
  assert.strictEqual(manualDupJson.error?.code, 'ADMISSION_NUMBER_TAKEN', 'Code must be ADMISSION_NUMBER_TAKEN');
  console.log('✓ Manual duplicate properly rejected with ADMISSION_NUMBER_TAKEN');

  // --- STEP 4: Soft Duplicate Retry Verification ---
  console.log('\n--- 4. Testing Soft Duplicate Retry Workflow ---');
  const dupCandidatePayload = {
    fullName: studentPayloadA.fullName, // same name
    dateOfBirth: studentPayloadA.dateOfBirth, // same dob
    isAutoAdmissionNumber: true,
    gender: 'male',
    admissionDate: '2026-09-14',
    guardianName: 'Guardian Sibling',
    sessionId: String(session._id),
    classId: String(cls._id),
    sectionId: sec ? String(sec._id) : undefined,
  };

  // Attempt 1: Should return POSSIBLE_DUPLICATE_STUDENT
  const dupAttempt1Res = await fetch(`${API_BASE}/students`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(dupCandidatePayload),
  });
  const dupAttempt1Json = (await dupAttempt1Res.json()) as any;
  console.log('Soft duplicate attempt 1 status:', dupAttempt1Res.status, dupAttempt1Json.error?.code);

  assert.strictEqual(dupAttempt1Res.status, 400);
  assert.strictEqual(dupAttempt1Json.error?.code, 'POSSIBLE_DUPLICATE_STUDENT');
  console.log('✓ Soft duplicate candidate caught on first attempt');

  // Attempt 2: Retry with confirmDuplicate: true
  const dupAttempt2Res = await fetch(`${API_BASE}/students`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ ...dupCandidatePayload, confirmDuplicate: true }),
  });
  const dupAttempt2Json = (await dupAttempt2Res.json()) as any;
  console.log('Soft duplicate retry status:', dupAttempt2Res.status, dupAttempt2Json.success ? `Created: ${dupAttempt2Json.data.admissionNumber}` : dupAttempt2Json);

  assert(dupAttempt2Json.success, 'Retry with confirmDuplicate: true must succeed');

  const confirmedId = dupAttempt2Json.data._id;
  const confirmedHist = await StudentHistory.find({ studentId: confirmedId }).lean();
  assert.strictEqual(confirmedHist.length, 1, 'Confirmed duplicate must have exactly 1 history record');
  console.log('✓ Confirmed duplicate admitted with exactly 1 student and exactly 1 StudentHistory record');

  // Verify total student counts
  const studentCount = await Student.countDocuments({ _id: { $in: [idA, idB, confirmedId] } });
  assert.strictEqual(studentCount, 3, 'Exactly 3 students must be created');
  const historyCount = await StudentHistory.countDocuments({ studentId: { $in: [idA, idB, confirmedId] } });
  assert.strictEqual(historyCount, 3, 'Exactly 3 history records must exist in total');

  // --- CLEANUP ---
  await Student.deleteMany({ _id: { $in: [idA, idB, confirmedId] } });
  await StudentHistory.deleteMany({ studentId: { $in: [idA, idB, confirmedId] } }, { allowAdministrativeHistoryMutation: true } as any);
  console.log('✓ Test records cleaned up');

  console.log('\n=== ALL CONCURRENCY AND WORKFLOW TESTS PASSED ===');
  process.exit(0);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
