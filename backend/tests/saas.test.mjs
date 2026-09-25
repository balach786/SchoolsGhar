/**
 * SaaS Multi-Tenancy & Platform Admin Integration Tests
 * Run with: node tests/saas.test.mjs [baseUrl]
 */
import fs from 'node:fs';
import path from 'node:path';

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
  console.log(`\nTesting Multi-Tenant SaaS & Platform Admin against ${BASE}\n`);

  // 1. Platform Admin Login
  console.log('▶ Platform Admin Authentication');
  const platformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL || 'platformadmin@saas.school';
  const platformAdminPassword = process.env.PLATFORM_ADMIN_INITIAL_PASSWORD || 'PlatformAdmin2026!';

  const adminLogin = await api('/api/platform/auth/login', {
    method: 'POST',
    body: { email: platformAdminEmail, password: platformAdminPassword },
  });
  check('Platform Admin logs in successfully → 200', adminLogin.status === 200);
  const platformToken = adminLogin.body?.data?.accessToken;
  check('Platform Admin token received', !!platformToken);

  // 2. Public Plans & Payment Methods
  console.log('\n▶ Public SaaS Endpoints');
  const plansRes = await api('/api/public/plans');
  check('GET /api/public/plans returns 200', plansRes.status === 200);
  const plans = plansRes.body?.data || [];
  check('At least 3 subscription plans available', plans.length >= 3);
  const starterPlan = plans.find((p) => p.slug === 'starter') || plans[0];

  const methodsRes = await api('/api/public/payment-methods');
  check('GET /api/public/payment-methods returns 200', methodsRes.status === 200);
  const paymentMethods = methodsRes.body?.data || [];
  check('At least 1 active payment method available', paymentMethods.length >= 1);
  const firstMethod = paymentMethods[0];

  // 3. Customer Self-Service Registration (Tenant Creation)
  console.log('\n▶ Customer SaaS Registration (7-Day Trial)');
  const randomSuffix = Math.floor(Math.random() * 90000) + 10000;
  const tenantEmail = `principal_${randomSuffix}@beaconhouse.test`;
  const tenantPassword = 'Password123';
  const schoolName = `Beaconhouse School System ${randomSuffix}`;

  const registerRes = await api('/api/public/register', {
    method: 'POST',
    body: {
      schoolName,
      ownerName: 'Dr. Ayesha Khan',
      email: tenantEmail,
      phone: '+92 300 1234567',
      city: 'Lahore',
      country: 'Pakistan',
      password: tenantPassword,
      confirmPassword: tenantPassword,
    },
  });

  check('Self-service registration returns 201 Created', registerRes.status === 201, `(got ${registerRes.status} ${JSON.stringify(registerRes.body?.error)})`);
  const tenantData = registerRes.body?.data?.tenant;
  const ownerToken = registerRes.body?.data?.accessToken;
  check('Registration returned tenant data', !!tenantData?._id);
  check('Tenant status is trial', tenantData?.status === 'trial');
  check('Registration returned owner access token', !!ownerToken);

  // Verify duplicate registration rejection
  const dupRes = await api('/api/public/register', {
    method: 'POST',
    body: {
      schoolName: 'Duplicate School',
      ownerName: 'Duplicate User',
      email: tenantEmail,
      phone: '+92 300 0000000',
      password: tenantPassword,
      confirmPassword: tenantPassword,
    },
  });
  check('Duplicate email registration rejected with 409', dupRes.status === 409);

  // 4. Subscription Status for Newly Registered Tenant
  console.log('\n▶ Subscription Status & Trial Enforcement');
  const subStatusRes = await api('/api/subscription/status', { token: ownerToken });
  check('GET /api/subscription/status returns 200', subStatusRes.status === 200);
  check('Status reports trial active', subStatusRes.body?.data?.status === 'trial');
  check('Trial days remaining is calculated (> 0)', (subStatusRes.body?.data?.daysRemaining ?? 0) >= 6);

  // 5. Submit Payment Proof (Manual Bank Transfer)
  console.log('\n▶ Manual Payment Submission with Proof Screenshot');
  // 1x1 PNG image
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const buffer = Buffer.from(pngBase64, 'base64');
  const blob = new Blob([buffer], { type: 'image/png' });

  const formData = new FormData();
  formData.append('planId', starterPlan._id);
  formData.append('paymentMethod', firstMethod.name || 'Bank Transfer');
  formData.append('paymentMethodId', firstMethod._id);
  formData.append('transactionReference', `TXN-PROOF-${Date.now()}`);
  formData.append('transactionId', `TXN-PROOF-${Date.now()}`);
  formData.append('amount', String(starterPlan.price));
  formData.append('amountPaid', String(starterPlan.price));
  formData.append('notes', 'Payment sent via ATM receipt');
  formData.append('proof', blob, 'receipt.png');

  const submitPayRes = await api('/api/subscription/payments', {
    method: 'POST',
    token: ownerToken,
    body: formData,
  });

  check('Customer submitted payment proof returns 201', submitPayRes.status === 201, `(got ${submitPayRes.status} ${JSON.stringify(submitPayRes.body?.error)})`);
  const paymentRecord = submitPayRes.body?.data;
  check('Payment record has status pending', paymentRecord?.status === 'pending');
  check('Proof URL is generated and saved as static path', typeof paymentRecord?.proofUrl === 'string' && paymentRecord.proofUrl.includes('/uploads/proofs/'));

  // 6. Platform Admin Review & Approval
  console.log('\n▶ Platform Admin Payment Review & Atomic Approval');
  const pendingPayments = await api('/api/platform/payments?status=pending', { token: platformToken });
  check('Platform Admin lists pending payments', pendingPayments.status === 200 && Array.isArray(pendingPayments.body?.data));
  const foundPending = pendingPayments.body?.data?.find((p) => p._id === paymentRecord?._id);
  check('Submitted payment appears in Platform Admin pending queue', !!foundPending);

  if (paymentRecord?._id) {
    // Approve payment
    const approveRes = await api(`/api/platform/payments/${paymentRecord._id}/approve`, {
      method: 'POST',
      token: platformToken,
      body: { notes: 'Verified in bank account statement' },
    });
    check('Platform Admin approves payment → 200', approveRes.status === 200);
    check('Approved payment record status is approved', approveRes.body?.data?.payment?.status === 'approved');

    // Double approval prevention
    const doubleApprove = await api(`/api/platform/payments/${paymentRecord._id}/approve`, {
      method: 'POST',
      token: platformToken,
    });
    check('Double-approval prevented with 400', doubleApprove.status === 400);

    // Verify tenant is now active with active subscription
    const customerDetails = await api(`/api/platform/customers/${tenantData._id}`, { token: platformToken });
    check('Tenant status is now active', customerDetails.body?.data?.tenant?.status === 'active');
    check('Tenant subscription ends in the future', new Date(customerDetails.body?.data?.tenant?.subscriptionEndsAt) > new Date());
  }

  // 7. Platform Admin Dashboard Metrics
  console.log('\n▶ Platform Admin Dashboard Metrics');
  const metricsRes = await api('/api/platform/dashboard', { token: platformToken });
  check('GET /api/platform/dashboard returns 200', metricsRes.status === 200);
  const metrics = metricsRes.body?.data;
  check('Metrics include totalCustomers >= 2', (metrics?.totalCustomers ?? 0) >= 2);
  check('Metrics include activeSubscriptions >= 1', (metrics?.activeSubscriptions ?? 0) >= 1);
  check('Metrics include totalRecordedRevenue > 0', (metrics?.totalRecordedRevenue ?? 0) >= starterPlan.price);

  // 8. Platform Admin Suspension & Unsuspension
  console.log('\n▶ Platform Admin Suspension Controls');
  const suspendRes = await api(`/api/platform/customers/${tenantData._id}/suspend`, {
    method: 'POST',
    token: platformToken,
    body: { reason: 'Violation of Terms of Service' },
  });
  check('Customer suspended returns 200', suspendRes.status === 200);

  // Verify suspended customer access is blocked (403 ACCOUNT_SUSPENDED)
  const blockedRes = await api('/api/subscription/status', { token: ownerToken });
  const isSuspendedError = blockedRes.status === 403 && (blockedRes.body?.error?.code === 'ACCOUNT_SUSPENDED' || blockedRes.body?.error?.code === 'TENANT_SUSPENDED');
  check('Suspended customer blocked with 403 suspension code', isSuspendedError);

  // Unsuspend
  const unsuspendRes = await api(`/api/platform/customers/${tenantData._id}/unsuspend`, {
    method: 'POST',
    token: platformToken,
  });
  check('Customer unsuspended returns 200', unsuspendRes.status === 200);

  const restoredRes = await api('/api/subscription/status', { token: ownerToken });
  check('Customer restored access returns 200', restoredRes.status === 200);

  // 9. Multi-Tenant Data Isolation Enforcement
  console.log('\n▶ Multi-Tenant Data Isolation');
  const tenantUsersRes = await api('/api/users', { token: ownerToken });
  check('Tenant owner can list own users → 200', tenantUsersRes.status === 200);
  const tenantUsers = tenantUsersRes.body?.data || [];
  // Tenant A only has 1 user created during registration
  check('Tenant A user list is isolated (only 1 user, no cross-tenant leakage)', tenantUsers.length === 1 && tenantUsers[0].email === tenantEmail);

  // Summary
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (failed > 0) {
    process.exitCode = (1);
  }
}

run().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exitCode = (1);
});

