/**
 * Tenant Isolation & Billing Verification Test Suite
 * Tests Issue 1, 2, 3, 4 compliance:
 * - Brand new registered school has 0 students, 0 teachers, 0 classes, 0 fees.
 * - Al-Huda School's existing data remains intact and strictly isolated.
 * - Cross-tenant queries return 404 / empty lists.
 * - Billing endpoints return complete, uncorrupted data without crashing.
 * - Subscription history timeline records all lifecycle transitions.
 */
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:4000';

let passed = 0;
let failed = 0;

function check(name, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function api(path, { method = 'GET', token, body, headers = {} } = {}) {
  const reqHeaders = { ...headers };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData) && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: reqHeaders,
    body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 204 etc */
  }
  return { status: res.status, body: json };
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`TEST SUITE: Strict Tenant Isolation & Billing Lifecycle`);
  console.log(`Target: ${BASE}`);
  console.log(`======================================================\n`);

  // -----------------------------------------------------------
  // 1. Log in as Al-Huda Admin (Existing School - Tenant A)
  // -----------------------------------------------------------
  console.log('▶ STEP 1: Inspecting Existing Tenant A ("Al-Huda School")');
  const alHudaLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@school.test', password: 'Password123' },
  });
  check('Al-Huda Admin logs in successfully → 200', alHudaLogin.status === 200);
  const alHudaToken = alHudaLogin.body?.data?.accessToken;
  const alHudaUser = alHudaLogin.body?.data?.user;
  check('Al-Huda token and tenantId present', !!alHudaToken && !!alHudaUser?.tenantId);

  // Measure Al-Huda's data count
  const alHudaStudentsRes = await api('/api/students', { token: alHudaToken });
  const alHudaInitialStudentCount = alHudaStudentsRes.body?.pagination?.total ?? alHudaStudentsRes.body?.data?.length ?? 0;
  console.log(`  ℹ Al-Huda existing student count: ${alHudaInitialStudentCount}`);

  const alHudaTeachersRes = await api('/api/teachers', { token: alHudaToken });
  const alHudaInitialTeacherCount = alHudaTeachersRes.body?.pagination?.total ?? alHudaTeachersRes.body?.data?.length ?? 0;
  console.log(`  ℹ Al-Huda existing teacher count: ${alHudaInitialTeacherCount}`);

  const alHudaClassesRes = await api('/api/classes', { token: alHudaToken });
  const alHudaInitialClassCount = alHudaClassesRes.body?.pagination?.total ?? alHudaClassesRes.body?.data?.length ?? 0;
  console.log(`  ℹ Al-Huda existing class count: ${alHudaInitialClassCount}`);

  const alHudaFirstStudent = alHudaStudentsRes.body?.data?.[0];

  // -----------------------------------------------------------
  // 2. Register New Tenant B ("Beacon Academy")
  // -----------------------------------------------------------
  console.log('\n▶ STEP 2: Registering Brand New School Tenant B ("Beacon Academy")');
  const randomSuffix = Math.floor(Math.random() * 90000) + 10000;
  const beaconEmail = `admin_${randomSuffix}@beacon-academy.test`;
  const beaconPassword = 'Password123';
  const beaconSchoolName = `Beacon Academy ${randomSuffix}`;

  const regRes = await api('/api/public/register', {
    method: 'POST',
    body: {
      schoolName: beaconSchoolName,
      ownerName: 'Principal Tariq Mehmood',
      email: beaconEmail,
      phone: '+92 300 9876543',
      city: 'Islamabad',
      country: 'Pakistan',
      password: beaconPassword,
      confirmPassword: beaconPassword,
    },
  });
  check('Tenant B registration returns 201 Created', regRes.status === 201);
  const beaconToken = regRes.body?.data?.accessToken;
  const beaconTenant = regRes.body?.data?.tenant;
  check('Tenant B received access token & tenant object', !!beaconToken && !!beaconTenant?._id);

  // -----------------------------------------------------------
  // 3. Verify Tenant B Starts with Zero Data
  // -----------------------------------------------------------
  console.log('\n▶ STEP 3: Verifying Tenant B Starts with Zero Data Across Modules');
  
  // Students
  const beaconStudentsRes = await api('/api/students', { token: beaconToken });
  check('Tenant B students list is empty (count = 0)', (beaconStudentsRes.body?.data?.length ?? 0) === 0);
  check('Tenant B students total is 0', (beaconStudentsRes.body?.pagination?.total ?? 0) === 0);

  // Teachers
  const beaconTeachersRes = await api('/api/teachers', { token: beaconToken });
  check('Tenant B teachers list is empty (count = 0)', (beaconTeachersRes.body?.data?.length ?? 0) === 0);

  // Classes
  const beaconClassesRes = await api('/api/classes', { token: beaconToken });
  check('Tenant B classes list is empty (count = 0)', (beaconClassesRes.body?.data?.length ?? 0) === 0);

  // Finance Dashboard
  const beaconFinanceRes = await api('/api/finance/dashboard', { token: beaconToken });
  check('Tenant B finance dashboard returns 200', beaconFinanceRes.status === 200);
  check('Tenant B collections are 0', (beaconFinanceRes.body?.data?.collectionThisMonth ?? 0) === 0);

  // Dashboard Analytics
  const beaconDashRes = await api('/api/dashboard/analytics', { token: beaconToken });
  check('Tenant B dashboard analytics returns 200', beaconDashRes.status === 200);
  check('Tenant B totals.students is 0', beaconDashRes.body?.data?.totals?.students === 0);
  check('Tenant B totals.teachers is 0', beaconDashRes.body?.data?.totals?.teachers === 0);
  check('Tenant B totals.classes is 0', beaconDashRes.body?.data?.totals?.classes === 0);

  // Notices
  const beaconNoticesRes = await api('/api/notices', { token: beaconToken });
  check('Tenant B notices list is empty (count = 0)', (beaconNoticesRes.body?.data?.length ?? 0) === 0);

  // -----------------------------------------------------------
  // 4. Cross-Tenant ID Direct Access Prevention
  // -----------------------------------------------------------
  console.log('\n▶ STEP 4: Testing Cross-Tenant Direct ID Access Rejection');
  if (alHudaFirstStudent?._id) {
    const crossAccessStudent = await api(`/api/students/${alHudaFirstStudent._id}`, { token: beaconToken });
    check('Tenant B querying Tenant A student ID returns 404', crossAccessStudent.status === 404);
  }

  // -----------------------------------------------------------
  // 5. Tenant B Mutation Isolation: Create Student in Tenant B
  // -----------------------------------------------------------
  console.log('\n▶ STEP 5: Mutating Tenant B and Verifying Tenant A Remains Untouched');

  // Create an academic session in Tenant B
  const sessionRes = await api('/api/academic-sessions', {
    method: 'POST',
    token: beaconToken,
    body: {
      name: '2026-2027 Academic Year',
      code: `AY-${randomSuffix}`,
      startDate: '2026-04-01',
      endDate: '2027-03-31',
    },
  });
  check('Tenant B creates academic session → 201', sessionRes.status === 201);
  const beaconSessionId = sessionRes.body?.data?._id;

  // Activate session
  await api(`/api/academic-sessions/${beaconSessionId}/activate`, { method: 'POST', token: beaconToken });

  // Create a class in Tenant B
  const classRes = await api('/api/classes', {
    method: 'POST',
    token: beaconToken,
    body: {
      name: 'Grade 1-Emerald',
      code: `G1-${randomSuffix}`,
      sessionId: beaconSessionId,
    },
  });
  check('Tenant B creates class → 201', classRes.status === 201, `(got ${classRes.status} ${JSON.stringify(classRes.body?.error)})`);
  const beaconClassId = classRes.body?.data?._id;

  // Create a section in Tenant B
  const sectionRes = await api('/api/sections', {
    method: 'POST',
    token: beaconToken,
    body: {
      name: 'Rose',
      classId: beaconClassId,
      sessionId: beaconSessionId,
      capacity: 30,
    },
  });
  check('Tenant B creates section → 201', sectionRes.status === 201, `(got ${sectionRes.status} ${JSON.stringify(sectionRes.body?.error)})`);
  const beaconSectionId = sectionRes.body?.data?._id;

  // Enroll 1 student in Tenant B
  const studentRes = await api('/api/students', {
    method: 'POST',
    token: beaconToken,
    body: {
      admissionNumber: `BCN-${randomSuffix}`,
      rollNumber: '1',
      fullName: 'Hamza Khan',
      gender: 'male',
      dateOfBirth: '2015-05-12',
      admissionDate: '2026-04-01',
      classId: beaconClassId,
      sectionId: beaconSectionId,
      sessionId: beaconSessionId,
      guardianName: 'Khalid Khan',
      guardianPhone: '+92 300 1112233',
      guardianRelationship: 'father',
    },
  });
  check('Tenant B enrolls student → 201', studentRes.status === 201, `(got ${studentRes.status} ${JSON.stringify(studentRes.body?.error)})`);
  const beaconStudent = studentRes.body?.data;

  // Verify Tenant B now has 1 student
  const beaconStudentsAfter = await api('/api/students', { token: beaconToken });
  check('Tenant B student count is now 1', (beaconStudentsAfter.body?.data?.length ?? 0) === 1);

  // Verify Tenant A ("Al-Huda") student count is STILL EXACTLY identical
  const alHudaStudentsAfter = await api('/api/students', { token: alHudaToken });
  const alHudaCountAfter = alHudaStudentsAfter.body?.pagination?.total ?? alHudaStudentsAfter.body?.data?.length ?? 0;
  check('Tenant A ("Al-Huda") student count is strictly identical', alHudaCountAfter === alHudaInitialStudentCount);

  // Verify Tenant A querying Tenant B student returns 404
  if (beaconStudent?._id) {
    const crossAccessFromAlHuda = await api(`/api/students/${beaconStudent._id}`, { token: alHudaToken });
    check('Tenant A querying Tenant B student ID returns 404', crossAccessFromAlHuda.status === 404);
  }

  // -----------------------------------------------------------
  // 6. Test Billing Endpoints for Tenant B
  // -----------------------------------------------------------
  console.log('\n▶ STEP 6: Testing Billing Endpoints Resilience for Tenant B');

  // /subscription/me
  const subMe = await api('/api/subscription/me', { token: beaconToken });
  check('GET /api/subscription/me returns 200', subMe.status === 200);
  check('Tenant B subscription status is trial', subMe.body?.data?.status === 'trial');
  check('Tenant B trial days remaining > 0', (subMe.body?.data?.daysRemaining ?? 0) >= 6);
  check('Tenant B pending payment is null', subMe.body?.data?.pendingPayment === null);

  // /subscription/plans
  const subPlans = await api('/api/subscription/plans');
  check('GET /api/subscription/plans returns 200', subPlans.status === 200);
  check('Plans list is non-empty array', Array.isArray(subPlans.body?.data) && subPlans.body?.data.length > 0);

  // /subscription/payment-methods
  const subMethods = await api('/api/subscription/payment-methods');
  check('GET /api/subscription/payment-methods returns 200', subMethods.status === 200);
  check('Payment methods list is an array', Array.isArray(subMethods.body?.data));

  // /subscription/payments (empty for new tenant)
  const subPayments = await api('/api/subscription/payments', { token: beaconToken });
  check('GET /api/subscription/payments returns 200 with empty array for new tenant', subPayments.status === 200 && Array.isArray(subPayments.body?.data) && subPayments.body.data.length === 0);

  // /subscription/history (contains trial_started)
  const subHistory = await api('/api/subscription/history', { token: beaconToken });
  check('GET /api/subscription/history returns 200', subHistory.status === 200);
  check('Subscription history has at least 1 initial event', Array.isArray(subHistory.body?.data) && subHistory.body.data.length >= 1);
  const trialEvent = subHistory.body?.data?.find((h) => h.action === 'trial_started');
  check('Trial started event is present in history', !!trialEvent);

  // -----------------------------------------------------------
  // 7. Submit Payment Proof & Verify Approval
  // -----------------------------------------------------------
  console.log('\n▶ STEP 7: Submit Payment Proof & Platform Admin Verification');
  const targetPlan = subPlans.body?.data?.[0];
  const targetMethod = subMethods.body?.data?.[0] || { _id: 'manual', name: 'Direct Bank Transfer' };

  // 1x1 PNG image
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const buffer = Buffer.from(pngBase64, 'base64');
  const blob = new Blob([buffer], { type: 'image/png' });

  const formData = new FormData();
  formData.append('planId', targetPlan._id);
  formData.append('paymentMethod', targetMethod.name);
  formData.append('paymentMethodId', targetMethod._id);
  formData.append('transactionReference', `TXN-REF-${Date.now()}`);
  formData.append('amount', String(targetPlan.price));
  formData.append('notes', 'Payment receipt verification test');
  formData.append('proof', blob, 'slip.png');

  const paySubmitRes = await api('/api/subscription/payments', {
    method: 'POST',
    token: beaconToken,
    body: formData,
  });
  check('Submit payment proof returns 201', paySubmitRes.status === 201);
  const submittedPaymentId = paySubmitRes.body?.data?._id;

  // Verify /subscription/me now has pendingPayment populated
  const subMeWithPending = await api('/api/subscription/me', { token: beaconToken });
  check('Pending payment now reflects in /subscription/me', subMeWithPending.body?.data?.pendingPayment?._id === submittedPaymentId);

  // Platform Admin approves
  const adminLogin = await api('/api/platform/auth/login', {
    method: 'POST',
    body: { email: 'platformadmin@saas.school', password: 'PlatformAdmin2026!' },
  });
  const platformToken = adminLogin.body?.data?.accessToken;

  if (platformToken && submittedPaymentId) {
    const approveRes = await api(`/api/platform/payments/${submittedPaymentId}/approve`, {
      method: 'POST',
      token: platformToken,
      body: { notes: 'Bank statement confirmed' },
    });
    check('Platform Admin approves payment → 200', approveRes.status === 200);

    // Verify tenant is now active with active commercial subscription
    const subMeActive = await api('/api/subscription/me', { token: beaconToken });
    check('Tenant B status updated to active', subMeActive.body?.data?.status === 'active');
    check('Tenant B currentPlan is set', subMeActive.body?.data?.currentPlan?.name === targetPlan.name);
    check('Tenant B pendingPayment is cleared back to null', subMeActive.body?.data?.pendingPayment === null);

    // Verify history now contains payment_approved
    const subHistoryUpdated = await api('/api/subscription/history', { token: beaconToken });
    const approvedEvent = subHistoryUpdated.body?.data?.find((h) => h.action === 'payment_approved');
    check('Subscription history now contains payment_approved event', !!approvedEvent);
  }

  // -----------------------------------------------------------
  // Summary
  // -----------------------------------------------------------
  console.log(`\n======================================================`);
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exitCode = (1);
  }
}

run().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exitCode = (1);
});

