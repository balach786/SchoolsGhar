/**
 * Phase 1 integration tests — run against a live server.
 *   node tests/foundation.test.mjs [baseUrl]
 * Requires: backend running with MongoDB connected.
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

async function run() {
  console.log(`\nFoundation tests against ${BASE}\n`);

  // 1. Health endpoint
  const health = await fetch(`${BASE}/api/health`);
  const healthBody = await health.json();
  check('GET /api/health returns 200', health.status === 200, `(got ${health.status})`);
  check('health: success=true', healthBody.success === true);
  check('health: server=healthy', healthBody.data?.server === 'healthy');
  check('health: database=connected', healthBody.data?.database === 'connected');
  check('health: no secrets exposed', !JSON.stringify(healthBody).includes('SECRET') && !JSON.stringify(healthBody).includes('mongodbUri'));

  // 2. Unknown route → 404 envelope
  const nf = await fetch(`${BASE}/api/definitely-not-a-route`);
  const nfBody = await nf.json();
  check('unknown route returns 404 envelope', nf.status === 404 && nfBody.success === false && nfBody.error?.code === 'ROUTE_NOT_FOUND');

  // 3. Malformed JSON → 400, no crash
  const badJson = await fetch(`${BASE}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not valid json',
  });
  const badJsonBody = await badJson.json();
  check('malformed JSON handled gracefully', badJson.status === 400 && badJsonBody.error?.code === 'INVALID_JSON');

  // 4. Helmet security headers
  const sec = await fetch(`${BASE}/api/health`);
  check('X-Content-Type-Options present', sec.headers.get('x-content-type-options') === 'nosniff');
  check('X-Frame-Options present', !!sec.headers.get('x-frame-options'));

  // 5. Rate limiting headers (draft-7: single `ratelimit` header)
  check('rate limit headers present', !!sec.headers.get('ratelimit') && !!sec.headers.get('ratelimit-policy'));

  // 6. CORS preflight
  const preflight = await fetch(`${BASE}/api/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET',
    },
  });
  check('CORS preflight allowed for frontend origin', preflight.status === 204 || preflight.status === 200);

  // 7. CORS blocked for unknown origin
  const corsBlocked = await fetch(`${BASE}/api/health`, {
    headers: { Origin: 'http://evil.example.com' },
  });
  check('CORS rejects unknown origin', !corsBlocked.headers.get('access-control-allow-origin'));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = (failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exitCode = (1);
});

