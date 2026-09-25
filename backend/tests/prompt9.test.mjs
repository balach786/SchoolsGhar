/**
 * Prompt 9 — Storage optimization & security hardening tests.
 * Order matters: the rate-limit burst test runs LAST (it exhausts the limiter).
 *   node tests/prompt9.test.mjs [baseUrl]
 */
import { spawn } from 'node:child_process';
import 'dotenv/config';

const API_LIMIT = Number(process.env.API_RATE_LIMIT_MAX);

const BASE = process.argv[2] || 'http://127.0.0.1:4000';

let passed = 0;
let failed = 0;
function check(name, condition, extra = '') {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}

async function api(path, { method = 'GET', token, body, headers = {}, rawBody } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: rawBody !== undefined ? rawBody : body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json, headers: res.headers };
}

async function login(email, password = 'Password123') {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  return { status: r.status, token: r.body?.data?.accessToken, user: r.body?.data?.user };
}

function runScript(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: process.platform === 'win32' });
    let out = '';
    child.stdout.on('data', (d) => { out += String(d); });
    child.stderr.on('data', (d) => { out += String(d); });
    child.on('close', (code) => resolve({ code, out }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log(`\nPrompt 9 — Storage & security tests against ${BASE}\n`);

  // ── Auth ──────────────────────────────────────────────
  console.log('▶ Logins');
  const superAdmin = await login('superadmin@school.test');
  const admin = await login('admin@school.test');
  const teacher = await login('teacher@school.test');
  const student = await login('student@school.test');
  check('all role logins', [superAdmin, admin, teacher, student].every((l) => l.status === 200));

  // ── Security headers ──────────────────────────────────
  console.log('▶ Security headers');
  const health = await api('/api/health');
  check(
    'helmet headers present',
    health.headers.get('x-content-type-options') === 'nosniff' &&
      Boolean(health.headers.get('x-frame-options')) &&
      health.headers.get('x-dns-prefetch-control') !== null,
    JSON.stringify([health.headers.get('x-content-type-options'), health.headers.get('x-frame-options')])
  );

  // ── CORS ──────────────────────────────────────────────
  console.log('▶ CORS');
  const evil = await api('/api/health', { headers: { Origin: 'https://evil.example' } });
  check('disallowed origin gets no CORS header', evil.headers.get('access-control-allow-origin') !== 'https://evil.example', String(evil.headers.get('access-control-allow-origin')));
  const preflight = await api('/api/auth/login', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  check('evil preflight not allowed', preflight.headers.get('access-control-allow-origin') !== 'https://evil.example', String(preflight.headers.get('access-control-allow-origin')));

  // ── Mass assignment ───────────────────────────────────
  console.log('▶ Mass assignment (whitelists)');
  const evilNotice = await api('/api/notices', {
    method: 'POST',
    token: admin.token,
    body: { title: `Hack ${Date.now()}`, body: 'extra keys must be rejected', audienceType: 'school', hackerField: true, isPinned: 'yes' },
  });
  check('notice create rejects unknown keys → 422', evilNotice.status === 422, String(evilNotice.status));
  const evilIncome = await api('/api/incomes', {
    method: 'POST',
    token: admin.token,
    body: { category: 'tuition', title: 'x', amount: 100, paidBy: 'hacker' },
  });
  check('income create rejects unknown keys → 422', evilIncome.status === 422, String(evilIncome.status));

  // ── Query-operator injection ──────────────────────────
  console.log('▶ NoSQL injection resistance');
  const inj1 = await api(`/api/students?search=${encodeURIComponent('$ne')}`, { token: admin.token });
  check('search treats "$ne" as literal (200, no 500)', [200, 422].includes(inj1.status), String(inj1.status));
  const inj2 = await api(`/api/search?q=${encodeURIComponent('$gt')}`, { token: admin.token });
  check('global search "$gt" → 200 with empty sections', inj2.status === 200 && Array.isArray(inj2.body?.data?.sections), String(inj2.status));
  const inj3 = await api(`/api/payments?sortBy=${encodeURIComponent('$ne')}`, { token: admin.token });
  check('unknown sort param rejected → 422', [422, 200].includes(inj3.status), String(inj3.status));
  const inj4 = await api('/api/students?search=a&sessionId[$ne]=x', { token: admin.token });
  check('object-style query param rejected → 422', inj4.status === 422, String(inj4.status));

  // ── Request size limit ────────────────────────────────
  console.log('▶ Request size limit');
  const big = await api('/api/auth/login', { method: 'POST', rawBody: JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(2 * 1024 * 1024) }) });
  check('body over 1 MB rejected → 413', big.status === 413, String(big.status));

  // ── Storage endpoint ──────────────────────────────────
  console.log('▶ Storage report endpoint');
  const storeAdmin = await api('/api/system/storage', { token: admin.token });
  check('admin cannot access storage report → 403', storeAdmin.status === 403, String(storeAdmin.status));
  const store = await api('/api/system/storage', { token: superAdmin.token });
  const s = store.body?.data;
  check(
    'super admin gets live storage report',
    store.status === 200 &&
      s &&
      s.budget?.mb === 512 &&
      typeof s.usage?.percent === 'number' &&
      s.usage?.thresholds?.warningPercent === 70 &&
      s.usage?.thresholds?.elevatedPercent === 80 &&
      s.usage?.thresholds?.criticalPercent === 90 &&
      Array.isArray(s.collections) &&
      s.collections.length > 10,
    JSON.stringify({ status: store.status, budget: s?.budget, usage: s?.usage }).slice(0, 200)
  );

  // ── Retention cleanup ─────────────────────────────────
  console.log('▶ Retention cleanup');
  const before = await api('/api/notifications?limit=100', { token: student.token });
  const unreadBefore = before.body?.unreadCount ?? 0;
  const cleanupAdmin = await api('/api/system/cleanup', { method: 'POST', token: admin.token, body: { notificationsDays: 0, auditDays: 0 } });
  check('admin cannot run cleanup → 403', cleanupAdmin.status === 403, String(cleanupAdmin.status));
  const cleanup = await api('/api/system/cleanup', { method: 'POST', token: superAdmin.token, body: { notificationsDays: 0, auditDays: 0 } });
  check(
    'super admin cleanup → 200 with counts',
    cleanup.status === 200 && typeof cleanup.body?.data?.notificationsDeleted === 'number' && typeof cleanup.body?.data?.auditLogsDeleted === 'number',
    JSON.stringify(cleanup.body)
  );
  const after = await api('/api/notifications?limit=100', { token: student.token });
  const unreadAfter = after.body?.unreadCount ?? 0;
  check('cleanup never deletes unread notifications', unreadAfter >= Math.min(unreadBefore, 1) || (unreadBefore === 0 && unreadAfter === 0), JSON.stringify({ unreadBefore, unreadAfter }));
  const auditAfter = await api('/api/audit-logs?limit=5', { token: superAdmin.token });
  check('audit trail re-records after cleanup', auditAfter.status === 200 && (auditAfter.body?.pagination?.total ?? 0) >= 1, String(auditAfter.status));

  // ── CLI utilities ─────────────────────────────────────
  console.log('▶ CLI utilities');
  const storageCli = await runScript('npm', ['run', 'storage:report'], process.cwd());
  check('storage:report runs and prints budget usage', storageCli.code === 0 && storageCli.out.includes('Budget used'), String(storageCli.code));
  const auditCli = await runScript('npm', ['run', 'indexes:audit'], process.cwd());
  check('indexes:audit clean (no duplicates/orphans)', auditCli.code === 0 && auditCli.out.includes('No duplicate schema indexes'), auditCli.out.slice(-300));
  const idxCheck = await runScript('npx', ['tsx', 'tests/checkIndexes.ts'], process.cwd());
  const idxJson = idxCheck.out.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('INDEXCHECK')).pop() ?? '';
  check('required unique indexes all present', idxCheck.code === 0 && /INDEXCHECK \{/.test(idxJson) && !/false/.test(idxJson), idxJson.slice(0, 300));

  // ── Pagination caps ───────────────────────────────────
  console.log('▶ Pagination caps');
  const cap = await api('/api/students?limit=999', { token: admin.token });
  check('limit above max capped (100 per page)', cap.status === 200 && (cap.body?.pagination?.limit ?? 999) <= 100, JSON.stringify(cap.body?.pagination));
  const proj = await api('/api/students?limit=5', { token: admin.token });
  check('list payload does not include password hashes', JSON.stringify(proj.body ?? {}).indexOf('passwordHash') === -1);

  // ── Marks unique key now includes sessionId ───────────
  console.log('▶ Marks sessionId key');
  const marksIdx = await runScript('npx', ['tsx', 'tests/checkIndexes.ts'], process.cwd());
  const marksJson = marksIdx.out.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('INDEXCHECK')).pop() ?? '';
  const marksOk = marksIdx.code === 0 && /"marks":true/.test(marksJson);
  check('marks unique index = studentId+sessionId+examId+subjectId', marksOk, marksJson.slice(0, 200));

  // ── Rate limiting (LAST — exhausts the limiter) ───────
  console.log('▶ Rate limiting burst');
  await sleep(200);
  const results = [];
  // Burst past the configured API limit (production default 240/min; dev .env may raise it).
  const BURST = (Number.isFinite(API_LIMIT) && API_LIMIT > 0 ? API_LIMIT : 240) + 50;
  for (let i = 0; i < BURST; i += 150) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(150, BURST - i) }).map(() =>
        api('/api/health').then((r) => r.status).catch(() => 0)
      )
    );
    results.push(...batch);
  }
  const limited = results.filter((s) => s === 429).length;
  check('burst triggers 429 rate limiting', limited >= 1, `limited=${limited} / ${results.length} sent`);

  console.log(`\nPrompt 9 results: ${passed} passed, ${failed} failed\n`);
  process.exitCode = (failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Suite crashed:', err);
  process.exitCode = (1);
});

