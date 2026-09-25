import assert from 'node:assert/strict';
const base = process.env.SMS_TEST_URL || 'http://127.0.0.1:4000/api';
let count = 0;
async function request(path, token, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}
for (const role of ['superadmin', 'admin', 'teacher', 'student', 'accountant', 'receptionist']) {
  const login = await request('/auth/login', null, { email: role + '@school.test', password: 'Password123' });
  assert.equal(login.status, 200, role + ' login');
  const session = login.json.data;
  const dashboard = await request('/dashboard/analytics', session.accessToken);
  assert.equal(dashboard.status, 200, role + ' dashboard');
  assert.ok(dashboard.json.data.role);
  for (const [module, url] of [['students', '/students?limit=1'], ['teachers', '/teachers?limit=1'], ['academicSessions', '/academic-sessions?limit=1'], ['classes', '/classes?limit=1'], ['sections', '/sections?limit=1'], ['subjects', '/subjects?limit=1'], ['studentAttendance', '/student-attendance?limit=1'], ['exams', '/exams?limit=1'], ['payments', '/payments?limit=1'], ['fees', '/fee-structures?limit=1'], ['expenses', '/expenses?limit=1'], ['salaries', '/salaries?limit=1'], ['assignments', '/assignments?limit=1'], ['notices', '/notices?limit=1'], ['notifications', '/notifications?limit=1'], ['leaveRequests', '/leave-requests?limit=1']]) {
    if (role === 'superadmin' || session.user.permissions?.[module]?.includes('view')) {
      const result = await request(url, session.accessToken);
      assert.equal(result.status, 200, role + ' ' + url);
      count++;
    }
  }
  await request('/auth/logout', session.accessToken, { refreshToken: session.refreshToken });
  console.log('PASS ' + role + ' login, permitted module reads, dashboard, logout');
}
const platform = await request('/platform/auth/login', null, { email: 'platformadmin@saas.school', password: 'PlatformAdmin2026!' });
assert.equal(platform.status, 200, 'platform login');
for (const path of ['/platform/dashboard', '/platform/customers?limit=1', '/platform/payments?limit=1', '/platform/plans', '/platform/payment-methods']) {
  const result = await request(path, platform.json.data.accessToken);
  assert.equal(result.status, 200, path);
  count++;
}
await request('/auth/logout', platform.json.data.accessToken, { refreshToken: platform.json.data.refreshToken });
console.log('PASS platform login, five admin modules, logout');
assert.equal((await request('/public/plans')).status, 200);
assert.equal((await request('/public/register', null, { schoolName: '' })).status, 422);
console.log('PASS public plans and registration validation. Permitted module reads: ' + count);
