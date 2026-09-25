/**
 * Phase 2 integration tests — auth, sessions, RBAC, permissions, audit logs.
 * Run against a live, seeded backend:
 *   node tests/auth.test.mjs [baseUrl]
 * Expects the dev seed (npm run seed) to have been applied.
 */
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

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 204 etc. */
  }
  return { status: res.status, body: json };
}

const USERS = {
  superadmin: 'superadmin@school.test',
  admin: 'admin@school.test',
  teacher: 'teacher@school.test',
  student: 'student@school.test',
  accountant: 'accountant@school.test',
  receptionist: 'receptionist@school.test',
};
const PW = 'Password123';

async function login(email, password) {
  return api('/api/auth/login', { method: 'POST', body: { email, password } });
}

async function run() {
  console.log(`\nPhase 2 — Auth, RBAC & Audit tests against ${BASE}\n`);

  // ─────────────────────────────────────────────────────────────
  console.log('▶ Authentication basics');
  // ─────────────────────────────────────────────────────────────
  const badPw = await login(USERS.superadmin, 'wrong-password');
  check('wrong password → 401 INVALID_CREDENTIALS', badPw.status === 401 && badPw.body?.error?.code === 'INVALID_CREDENTIALS');

  const unknownUser = await login('nobody@school.test', PW);
  check('unknown email → 401 (same generic code)', unknownUser.status === 401 && unknownUser.body?.error?.code === 'INVALID_CREDENTIALS');
  check('generic error message (no account enumeration)', badPw.body?.error?.message === unknownUser.body?.error?.message);

  const invalidShape = await api('/api/auth/login', { method: 'POST', body: { email: 'not-an-email', password: '' } });
  check('invalid login payload → 422 validation', invalidShape.status === 422);

  const noAuth = await api('/api/auth/me');
  check('GET /api/auth/me without token → 401', noAuth.status === 401);

  const badToken = await api('/api/auth/me', { token: 'garbage.token.value' });
  check('garbage token → 401', badToken.status === 401);

  // Login as every role
  const tokens = {};
  for (const [role, email] of Object.entries(USERS)) {
    const res = await login(email, PW);
    check(`login ${role} → 200`, res.status === 200, `(got ${res.status} ${JSON.stringify(res.body?.error)})`);
    if (res.status === 200) {
      check(`login ${role} returns access + refresh tokens`, !!res.body?.data?.accessToken && !!res.body?.data?.refreshToken);
      check(`login ${role} returns permissions map`, typeof res.body?.data?.user?.permissions === 'object');
      check(`login ${role} never returns passwordHash`, !JSON.stringify(res.body).includes('passwordHash'));
      tokens[role] = { access: res.body.data.accessToken, refresh: res.body.data.refreshToken };
    }
  }

  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ /me + role isolation');
  // ─────────────────────────────────────────────────────────────
  const me = await api('/api/auth/me', { token: tokens.student.access });
  check('GET /api/auth/me returns current user', me.status === 200 && me.body?.data?.user?.email === USERS.student);
  check('/me role = student', me.body?.data?.user?.role === 'student');

  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ Refresh & logout flow');
  // ─────────────────────────────────────────────────────────────
  const refreshed = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: tokens.teacher.refresh } });
  check('refresh → 200 with new tokens', refreshed.status === 200 && refreshed.body?.data?.accessToken);
  const newAccess = refreshed.body?.data?.accessToken;
  const meAfterRefresh = await api('/api/auth/me', { token: newAccess });
  check('new access token works', meAfterRefresh.status === 200);

  // Old refresh token must now be revoked (rotation)
  const reused = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: tokens.teacher.refresh } });
  check('rotated refresh token reused → 401', reused.status === 401, `(got ${reused.status})`);

  const logoutRes = await api('/api/auth/logout', { method: 'POST', body: { refreshToken: refreshed.body?.data?.refreshToken } });
  check('logout → 204', logoutRes.status === 204);
  const afterLogout = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: refreshed.body?.data?.refreshToken } });
  check('refresh after logout → 401', afterLogout.status === 401);

  const invalidRefresh = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: 'invalid-refresh-token-value' } });
  check('invalid refresh token → 401', invalidRefresh.status === 401);

  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ Role-based authorization (backend enforcement)');
  // ─────────────────────────────────────────────────────────────
  const forbiddenFor = async (role, method, path, body, label) => {
    const res = await api(path, { method, token: tokens[role].access, body });
    check(label, res.status === 403, `(got ${res.status})`);
  };

  await forbiddenFor('student', 'GET', '/api/users', undefined, 'student GET /api/users → 403');
  await forbiddenFor('student', 'POST', '/api/users', { name: 'X', email: 'x@y.z', password: 'Password123', roleId: '1' }, 'student POST /api/users → 403');
  await forbiddenFor('teacher', 'GET', '/api/roles', undefined, 'teacher GET /api/roles → 403');
  await forbiddenFor('teacher', 'GET', '/api/audit-logs', undefined, 'teacher GET /api/audit-logs → 403');
  await forbiddenFor('accountant', 'GET', '/api/audit-logs', undefined, 'accountant GET /api/audit-logs → 403');
  await forbiddenFor('accountant', 'GET', '/api/roles', undefined, 'accountant GET /api/roles → 403');
  await forbiddenFor('receptionist', 'GET', '/api/users', undefined, 'receptionist GET /api/users → 403');
  await forbiddenFor('receptionist', 'GET', '/api/audit-logs', undefined, 'receptionist GET /api/audit-logs → 403');
  await forbiddenFor('receptionist', 'PUT', '/api/roles/000000000000000000000000/permissions', { permissions: {} }, 'receptionist PUT role permissions → 403');

  // Teacher has no users.view by default → the permission layer blocks (real endpoint)
  const teacherListStudents = await api('/api/users', { token: tokens.teacher.access });
  check('teacher users.view denied by default → 403', teacherListStudents.status === 403, `(got ${teacherListStudents.status})`);

  // Admin can view audit logs
  const adminAudit = await api('/api/audit-logs?limit=5', { token: tokens.admin.access });
  check('admin GET /api/audit-logs → 200', adminAudit.status === 200, `(got ${adminAudit.status})`);

  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ User management');
  // ─────────────────────────────────────────────────────────────
  const roleList = await api('/api/roles', { token: tokens.admin.access });
  check('admin GET /api/roles → 200', roleList.status === 200 && roleList.body?.data?.length >= 6);
  const teacherRole = roleList.body.data.find((r) => r.slug === 'teacher');
  check('teacher role exists with permission entries', !!teacherRole && Array.isArray(teacherRole.permissions));

  // Create a user as admin (unique email per run → idempotent re-runs)
  const TEST_EMAIL = `teacher2-${Date.now()}@school.test`;
  const newUserRes = await api('/api/users', {
    method: 'POST',
    token: tokens.admin.access,
    body: {
      name: 'Test Teacher Two',
      email: TEST_EMAIL,
      password: 'Password123',
      roleId: teacherRole._id,
    },
  });
  check('admin creates user → 201', newUserRes.status === 201, `(got ${newUserRes.status} ${JSON.stringify(newUserRes.body?.error)})`);
  const newUserId = newUserRes.body?.data?.user?._id;

  const dupEmail = await api('/api/users', {
    method: 'POST',
    token: tokens.admin.access,
    body: { name: 'Dup', email: TEST_EMAIL, password: 'Password123', roleId: teacherRole._id },
  });
  check('duplicate email → 409', dupEmail.status === 409);

  const newUserLogin = await login(TEST_EMAIL, 'Password123');
  check('new user can log in', newUserLogin.status === 200);

  // List users with filters
  const listUsers = await api('/api/users?search=teacher&limit=10', { token: tokens.admin.access });
  check('user list search works + paginated', listUsers.status === 200 && Array.isArray(listUsers.body?.data) && listUsers.body?.pagination?.total >= 1);
  check('user list never leaks passwordHash', !JSON.stringify(listUsers.body).includes('passwordHash'));

  // Deactivate → cannot login, sessions die
  const deact = await api(`/api/users/${newUserId}/deactivate`, { method: 'POST', token: tokens.admin.access });
  check('admin deactivates user → 200', deact.status === 200);
  const loginDeactivated = await login(TEST_EMAIL, 'Password123');
  check('deactivated user cannot log in → 403 ACCOUNT_INACTIVE', loginDeactivated.status === 403 && loginDeactivated.body?.error?.code === 'ACCOUNT_INACTIVE');
  const deactToken = newUserLogin.body?.data?.accessToken;
  const meDeact = await api('/api/auth/me', { token: deactToken });
  // Access token is stateless; account state is re-verified on refresh/me (me returns 403)
  check('deactivated user /me blocked (403)', meDeact.status === 403, `(got ${meDeact.status})`);
  const refreshDeact = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: newUserLogin.body?.data?.refreshToken } });
  check('deactivated user refresh → 401', refreshDeact.status === 401);

  // Reactivate
  const act = await api(`/api/users/${newUserId}/activate`, { method: 'POST', token: tokens.admin.access });
  check('admin reactivates user → 200', act.status === 200);

  // Reset password as admin
  const reset = await api(`/api/users/${newUserId}/reset-password`, { method: 'POST', token: tokens.admin.access, body: { newPassword: 'NewPassword456' } });
  check('admin resets password → 200', reset.status === 200);
  const loginNewPw = await login(TEST_EMAIL, 'NewPassword456');
  check('user logs in with reset password', loginNewPw.status === 200);

  // Change own password (role isolation: user changes own password)
  const changePw = await api('/api/auth/change-password', {
    method: 'POST',
    token: tokens.student.access,
    body: { currentPassword: PW, newPassword: 'StudentPass789' },
  });
  check('change own password → 200', changePw.status === 200, `(got ${changePw.status} ${JSON.stringify(changePw.body?.error)})`);
  const oldPwLogin = await login(USERS.student, PW);
  check('old password no longer works', oldPwLogin.status === 401);
  const newPwLogin = await login(USERS.student, 'StudentPass789');
  check('new password works', newPwLogin.status === 200);
  tokens.student.access = newPwLogin.body?.data?.accessToken;

  // Change password back to keep seed state stable
  const changeBack = await api('/api/auth/change-password', {
    method: 'POST',
    token: tokens.student.access,
    body: { currentPassword: 'StudentPass789', newPassword: PW },
  });
  check('change password back → 200', changeBack.status === 200);

  const badCurrent = await api('/api/auth/change-password', {
    method: 'POST',
    token: tokens.student.access,
    body: { currentPassword: 'wrong-current', newPassword: 'AnotherPass123' },
  });
  check('change password with wrong current → 400', badCurrent.status === 400);

  const weakNew = await api('/api/auth/change-password', {
    method: 'POST',
    token: tokens.student.access,
    body: { currentPassword: PW, newPassword: 'short' },
  });
  check('weak new password → 422 validation', weakNew.status === 422);

  // Cleanup: archive the test user so re-runs don't accumulate records
  const cleanup = await api(`/api/users/${newUserId}`, {
    method: 'PATCH',
    token: tokens.admin.access,
    body: { isArchived: true },
  });
  check('cleanup: test user archived', cleanup.status === 200);

  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ Permission matrix changes (backend enforces immediately)');
  // ─────────────────────────────────────────────────────────────
  const teacherPermsBefore = teacherRole.permissions.map((p) => ({ ...p }));
  const permMapFrom = (entries, mutate) => {
    const map = {};
    for (const e of entries) map[e.module] = mutate ? mutate([...e.actions]) : [...e.actions];
    return map;
  };

  // 1) Grant teacher users.view (real endpoint: GET /api/users)
  const grantedMap = permMapFrom(teacherPermsBefore, (acts) => {
    if (!acts.includes('view')) acts.push('view');
    return acts;
  });
  if (!grantedMap['users']) grantedMap['users'] = ['view'];
  const grantRes = await api(`/api/roles/${teacherRole._id}/permissions`, {
    method: 'PUT',
    token: tokens.superadmin.access,
    body: { permissions: grantedMap },
  });
  check('super admin updates role permissions → 200', grantRes.status === 200, `(got ${grantRes.status} ${JSON.stringify(grantRes.body?.error)})`);

  const teacherUsersGranted = await api('/api/users?limit=5', { token: tokens.teacher.access });
  check('teacher users.view granted → list works (200)', teacherUsersGranted.status === 200, `(got ${teacherUsersGranted.status})`);

  // 2) Remove users.view → backend must block immediately
  const removedMap = permMapFrom(teacherPermsBefore);
  delete removedMap['users'];
  const putPerms = await api(`/api/roles/${teacherRole._id}/permissions`, {
    method: 'PUT',
    token: tokens.superadmin.access,
    body: { permissions: removedMap },
  });
  check('permissions updated (users.view removed) → 200', putPerms.status === 200);

  const teacherUsersBlocked = await api('/api/users?limit=5', { token: tokens.teacher.access });
  check('teacher users.view now blocked → 403', teacherUsersBlocked.status === 403, `(got ${teacherUsersBlocked.status})`);

  // 3) /me reflects the new permission state (fresh from DB)
  const teacherMe = await api('/api/auth/me', { token: tokens.teacher.access });
  const userViewAction = teacherMe.body?.data?.user?.permissions?.users?.includes?.('view') === true;
  check('/me reflects removed permission', userViewAction === false);

  // 4) Admin (roles.edit) can update permissions too
  const adminPermUpdate = await api(`/api/roles/${teacherRole._id}/permissions`, {
    method: 'PUT',
    token: tokens.admin.access,
    body: { permissions: permMapFrom(teacherPermsBefore) },
  });
  check('admin (roles.edit) can update permissions', adminPermUpdate.status === 200);

  // 5) Teacher (no roles.edit) cannot update permissions
  const teacherPermUpdate = await api(`/api/roles/${teacherRole._id}/permissions`, {
    method: 'PUT',
    token: tokens.teacher.access,
    body: { permissions: permMapFrom(teacherPermsBefore) },
  });
  check('teacher cannot update permissions → 403', teacherPermUpdate.status === 403);

  // 6) Restore teacher permissions exactly
  await api(`/api/roles/${teacherRole._id}/permissions`, {
    method: 'PUT',
    token: tokens.superadmin.access,
    body: { permissions: permMapFrom(teacherPermsBefore) },
  });
  const teacherUsersRestored = await api('/api/users?limit=5', { token: tokens.teacher.access });
  check('teacher permissions restored (users.view removed again)', teacherUsersRestored.status === 403);

  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ Audit logs');
  // ─────────────────────────────────────────────────────────────
  const auditList = await api('/api/audit-logs?limit=20', { token: tokens.superadmin.access });
  check('super admin lists audit logs', auditList.status === 200 && auditList.body?.pagination?.total > 0);
  const auditData = auditList.body?.data ?? [];
  const hasUserCreated = auditData.some((l) => l.action === 'USER_CREATED');
  const hasLogin = auditData.some((l) => l.action === 'LOGIN_SUCCESS');
  const hasPermChange = auditData.some((l) => l.action === 'ROLE_PERMISSION_UPDATED');
  check('audit contains USER_CREATED', hasUserCreated);
  check('audit contains LOGIN_SUCCESS', hasLogin);
  check('audit contains ROLE_PERMISSION_UPDATED', hasPermChange);
  check('audit rows are compact (no passwordHash/tokens)', !JSON.stringify(auditData).includes('passwordHash') && !JSON.stringify(auditData).includes('refreshToken'));

  // Filtered audit query
  const auditFiltered = await api('/api/audit-logs?action=USER_CREATED&limit=5', { token: tokens.superadmin.access });
  check('audit filter by action works', auditFiltered.status === 200 && auditFiltered.body.data.every((l) => l.action === 'USER_CREATED'));

  // Non-privileged role cannot view audit logs (already covered above for teacher/accountant/receptionist)

  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ Rate limiting (login)');
  // ─────────────────────────────────────────────────────────────
  // The limit is configurable via env — read it from the response headers.
  const probeRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'probe@school.test', password: 'x' }),
  });
  const policy = probeRes.headers.get('ratelimit-policy') ?? '30;w=900';
  const limitFromHeader = Number.parseInt(policy.split(';')[0], 10) || 30;

  let rateLimited = false;
  for (let i = 0; i < limitFromHeader + 5; i++) {
    const r = await login('ratelimit@school.test', 'bad-password-123');
    if (r.status === 429) {
      rateLimited = true;
      break;
    }
  }
  check(`login endpoint rate limits brute force (429 within ${limitFromHeader + 5} attempts)`, rateLimited);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = (failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exitCode = (1);
});

