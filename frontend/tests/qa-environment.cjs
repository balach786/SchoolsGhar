// Isolated QA database: never seed or run mutation suites against the working school database.
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const backend = path.resolve(__dirname, '../../backend');
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env'), quiet: true });
const uri = new URL(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school_management');
uri.pathname = '/school_motion_permission_qa_20260909';
const env = { ...process.env, MONGODB_URI: uri.toString(), NODE_ENV: 'test', PORT: '4001', AUTH_RATE_LIMIT_MAX: '10000', API_RATE_LIMIT_MAX: '20000', UPLOAD_DIR: path.join(__dirname, 'qa-uploads'), PLATFORM_ADMIN_EMAIL: 'platformadmin@saas.school', PLATFORM_ADMIN_INITIAL_PASSWORD: 'PlatformAdmin2026!' };
const tsx = path.join(backend, 'node_modules/tsx/dist/cli.mjs');
if (process.argv.includes('--prepare')) {
  for (const script of ['seed', 'migrateSaas', 'bootstrapPlatformAdmin']) {
    const result = spawnSync(process.execPath, [tsx, `src/scripts/${script}.ts`], { cwd: backend, env, encoding: 'utf8' });
    console.log(`${script}: ${result.status === 0 ? 'PASS' : 'FAILED'}`);
    if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
  }
}
if (process.argv.includes('--serve')) {
  const child = spawn(process.execPath, [tsx, 'watch', 'src/server.ts'], { cwd: backend, env, stdio: 'inherit' });
  process.on('SIGINT', () => child.kill());
} else if (process.argv.includes('--suite')) {
  const name = process.argv[process.argv.indexOf('--suite') + 1];
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Invalid suite');
  const result = spawnSync(process.execPath, [`tests/${name}.test.mjs`, 'http://127.0.0.1:4001'], { cwd: backend, env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
