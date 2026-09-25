/**
 * Prompt 10 — QA verification: all six roles, role-scoped access (positive +
 * negative), direct API auth checks, live-session invalidation on deactivation,
 * and storage inspection. Rerunnable.
 *   node tests/prompt10.test.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:4000';

let passed = 0;
let failed = 0;
function check(name, condition, extra = '') {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

async function login(email, password = 'Password123') {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  return { status: r.status, token: r.body?.data?.accessToken, user: r.body?.data?.user };
}

const EMAILS = {
  super_admin: 'superadmin@school.test',
  admin: 'admin@school.test',
  teacher: 'teacher@school.test',
  student: 'student@school.test',
  accountant: 'accountant@school.test',
  receptionist: 'receptionist@school.test',
};

async function run() {
  const stamp = Date.now().toString(36);
  console.log(`\nPrompt 10 — Six-role QA verification against ${BASE}\n`);

  // ── All six roles can log in ──────────────────────────
  console.log('▶ Logins (all six roles)');
  const tok = {};
  for (const [role, email] of Object.entries(EMAILS)) {
    const l = await login(email);
    check(`${role} login → 200`, l.status === 200, String(l.status));
    tok[role] = l.token;
  }

  // ── /auth/me + dashboard analytics for every role ─────
  console.log('▶ Identity & role-scoped analytics');
  for (const role of Object.keys(EMAILS)) {
    const me = await api('/api/auth/me', { token: tok[role] });
    check(`${role} /auth/me → 200`, me.status === 200 && me.body?.data?.user?.role === role, String(me.status));
    const an = await api('/api/dashboard/analytics', { token: tok[role] });
    const expectRole = ['super_admin', 'admin', 'accountant', 'receptionist'].includes(role) ? 'staff' : role;
    check(`${role} analytics → ${expectRole} portal`, an.status === 200 && an.body?.data?.role === expectRole, JSON.stringify(an.body?.error ?? an.status));
  }

  // ── Role-scoped positives ─────────────────────────────
  console.log('▶ Role-scoped access (positive)');
  const pos = [
    ['super_admin', '/api/users?limit=5', 200],
    ['super_admin', '/api/system/storage', 200],
    ['super_admin', '/api/roles?limit=5', 200],
    ['super_admin', '/api/audit-logs?limit=5', 200],
    ['admin', '/api/users?limit=5', 200],
    ['admin', '/api/students?limit=5', 200],
    ['admin', '/api/payments?limit=5', 200],
    ['admin', '/api/reports/exams', 200],
    ['teacher', '/api/teachers/me', 200],
    ['teacher', '/api/students?limit=5', 200],
    ['teacher', '/api/exams?limit=5', 200],
    ['teacher', '/api/assignments?limit=5', 200],
    ['student', '/api/students/me', 200],
    ['student', '/api/assignments?limit=5', 200],
    ['student', '/api/notices?limit=5', 200],
    ['student', '/api/notifications?limit=5', 200],
    ['accountant', '/api/payments?limit=5', 200],
    ['accountant', '/api/expenses?limit=5', 200],
    ['accountant', '/api/reports/session-overview', 200],
    ['receptionist', '/api/students?limit=5', 200],
    ['receptionist', '/api/notices?limit=5', 200],
    ['receptionist', '/api/student-attendance?limit=5', 200],
  ];
  for (const [role, path, expected] of pos) {
    const r = await api(path, { token: tok[role] });
    check(`${role} GET ${path} → ${expected}`, r.status === expected, String(r.status));
  }

  // ── Role-scoped negatives (no privilege escalation) ───
  console.log('▶ Role-scoped access (negative)');
  const neg = [
    ['admin', '/api/system/storage', 403],          // storage = super_admin only
    ['teacher', '/api/reports/exams', 403],          // teachers have no reports module
    ['teacher', '/api/users?limit=5', 403],
    ['teacher', '/api/salaries?limit=5', 403],
    ['student', '/api/teachers?limit=5', 403],
    ['student', '/api/users?limit=5', 403],
    ['student', '/api/reports/exams', 403],
    ['student', '/api/exams?limit=5', 200],          // students MAY view exams
    ['accountant', '/api/users?limit=5', 403],
    ['accountant', '/api/students?limit=5', 200],    // accountant can view students
    ['receptionist', '/api/payments?limit=5', 403],
    ['receptionist', '/api/users?limit=5', 403],
    ['receptionist', '/api/salaries?limit=5', 403],
  ];
  for (const [role, path, expected] of neg) {
    const r = await api(path, { token: tok[role] });
    check(`${role} GET ${path} → ${expected}`, r.status === expected, String(r.status));
  }

  const adminCleanup = await api('/api/system/cleanup', { method: 'POST', token: tok.admin, body: { notificationsDays: 30 } });
  check('admin cannot run cleanup (POST) → 403', adminCleanup.status === 403, String(adminCleanup.status));

  // ── Permission matrix shape (students must not carry staff modules) ──
  console.log('▶ Permission matrix sanity');
  const me = await api('/api/auth/me', { token: tok.student });
  const perms = me.body?.data?.user?.permissions ?? {};
  check('student matrix has no staff modules', ['users', 'roles', 'auditLogs', 'salaries', 'expenses', 'teachers', 'schoolSettings'].every((m) => !(m in perms)), JSON.stringify(Object.keys(perms)));
  const adminMe = await api('/api/auth/me', { token: tok.admin });
  const adminPerms = adminMe.body?.data?.user?.permissions ?? {};
  check('admin matrix includes management modules', ['users', 'roles', 'auditLogs', 'schoolSettings', 'reports'].every((m) => m in adminPerms), JSON.stringify(Object.keys(adminPerms)));

  // ── Direct API auth: no token / bad token / inactive ──
  console.log('▶ Direct API auth');
  const noTok = await api('/api/users');
  check('no token → 401', noTok.status === 401, String(noTok.status));
  const badTok = await api('/api/users', { token: 'garbage.token.value' });
  check('malformed token → 401', badTok.status === 401, String(badTok.status));
  const wrongPw = await login('admin@school.test', 'WrongPassword1');
  check('wrong password → 401', wrongPw.status === 401, String(wrongPw.status));

  // ── Live-session invalidation on deactivation ─────────
  console.log('▶ Deactivation invalidates live sessions');
  const roles = await api('/api/roles?limit=50', { token: tok.super_admin });
  const receptionistRole = (roles.body?.data ?? []).find((r) => r.slug === 'receptionist');
  const qaEmail = `qa-deact-${stamp}@school.test`;
  const created = await api('/api/users', {
    method: 'POST',
    token: tok.super_admin,
    body: { name: 'QA Deactivate Probe', email: qaEmail, password: 'Password123', roleId: receptionistRole?._id },
  });
  check('super admin creates QA user → 201', created.status === 201, JSON.stringify(created.body).slice(0, 160));
  const qaId = created.body?.data?.user?._id ?? created.body?.data?._id;

  const qaLogin = await login(qaEmail);
  check('QA user can log in', qaLogin.status === 200, String(qaLogin.status));
  const qaToken = qaLogin.token;

  const deact = await api(`/api/users/${qaId}/deactivate`, { method: 'POST', token: tok.super_admin });
  check('super admin deactivates QA user → 200', deact.status === 200, JSON.stringify(deact.body).slice(0, 120));

  const liveAfter = await api('/api/dashboard/analytics', { token: qaToken });
  check('deactivated user live session fails → 403', [401, 403].includes(liveAfter.status), String(liveAfter.status));
  const loginAfter = await login(qaEmail);
  check('deactivated user cannot log in → 403', loginAfter.status === 403, String(loginAfter.status));

  const react = await api(`/api/users/${qaId}/activate`, { method: 'POST', token: tok.super_admin });
  check('super admin reactivates QA user → 200', react.status === 200, String(react.status));
  const loginBack = await login(qaEmail);
  check('reactivated user can log in again', loginBack.status === 200, String(loginBack.status));

  // ── Storage inspection ────────────────────────────────
  console.log('▶ Storage inspection');
  const store = await api('/api/system/storage', { token: tok.super_admin });
  const s = store.body?.data;
  check(
    'storage report healthy and below thresholds',
    store.status === 200 && typeof s?.usage?.percent === 'number' && s.usage.percent < 70 && Array.isArray(s.collections) && s.collections.length >= 10,
    JSON.stringify({ status: store.status, percent: s?.usage?.percent })
  );

  console.log(`\nPrompt 10 results: ${passed} passed, ${failed} failed\n`);
  process.exitCode = (failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Suite crashed:', err);
  process.exitCode = (1);
});

