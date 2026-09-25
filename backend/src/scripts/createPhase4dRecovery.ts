import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

dotenv.config();

async function createRecoveryPackage() {
  const timestamp = '20260913-173000';
  const backupDir = path.resolve(__dirname, `../../backups/migration-phase4d-${timestamp}`);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  await mongoose.connect(process.env.MONGODB_URI || '');
  const db = mongoose.connection.db!;

  // 1. collection-counts-before.json
  const collections = await db.listCollections().toArray();
  const counts: Record<string, number> = {};
  for (const c of collections) {
    counts[c.name] = await db.collection(c.name).countDocuments();
  }
  fs.writeFileSync(path.join(backupDir, 'collection-counts-before.json'), JSON.stringify(counts, null, 2));

  // 2. index-state-before.json
  const indexState: Record<string, any[]> = {};
  for (const c of collections) {
    const idxs = await db.collection(c.name).indexes();
    indexState[c.name] = idxs.map(i => ({ name: i.name, key: i.key, unique: i.unique }));
  }
  fs.writeFileSync(path.join(backupDir, 'index-state-before.json'), JSON.stringify(indexState, null, 2));

  // 3. upload-reference-audit-before.json
  const uploadChecks = [
    { col: 'payments', fields: ['receiptPdfUrl'] },
    { col: 'subscriptionpayments', fields: ['paymentProofUrl'] },
    { col: 'assignments', fields: ['attachments', 'attachmentUrl'] },
    { col: 'submissions', fields: ['attachments', 'fileUrl'] },
    { col: 'notices', fields: ['attachments', 'attachmentUrl'] },
    { col: 'users', fields: ['profilePhotoUrl'] },
    { col: 'students', fields: ['profilePhotoUrl', 'documents'] },
    { col: 'staff', fields: ['profilePhotoUrl', 'documents'] },
    { col: 'schoolsettings', fields: ['logoUrl', 'faviconUrl'] },
  ];
  const uploadInventory: any[] = [];
  for (const item of uploadChecks) {
    for (const f of item.fields) {
      const q: any = {};
      q[f] = { $exists: true, $ne: null };
      const c = await db.collection(item.col).countDocuments(q);
      const samples = c > 0 ? await db.collection(item.col).find(q).limit(3).toArray() : [];
      uploadInventory.push({
        collection: item.col,
        field: f,
        referenceCount: c,
        sampleValues: samples.map((s: any) => s[f]),
      });
    }
  }
  fs.writeFileSync(path.join(backupDir, 'upload-reference-audit-before.json'), JSON.stringify(uploadInventory, null, 2));

  // 4. security-config-before.json
  const securityConfig = {
    authRateLimitMax: process.env.AUTH_RATE_LIMIT_MAX || 30,
    authRateLimitWindowMs: process.env.AUTH_RATE_LIMIT_WINDOW_MS || 900000,
    apiRateLimitMax: process.env.API_RATE_LIMIT_MAX || 240,
    apiRateLimitWindowMs: process.env.API_RATE_LIMIT_WINDOW_MS || 60000,
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    paymentProofMaxSize: process.env.PAYMENT_PROOF_MAX_SIZE || 5242880,
    hasStaticUploadMount: true,
  };
  fs.writeFileSync(path.join(backupDir, 'security-config-before.json'), JSON.stringify(securityConfig, null, 2));

  // 5. route-security-before.json
  const routeSecurity = {
    publicUploadsPath: '/uploads',
    authRoutesMount: '/api/auth',
    hasDedicatedAuthLimiter: false,
    hasGlobalLimiter: true,
    hasLivenessEndpoint: false,
    hasReadinessEndpoint: false,
    hasCombinedHealth: true,
  };
  fs.writeFileSync(path.join(backupDir, 'route-security-before.json'), JSON.stringify(routeSecurity, null, 2));

  // 6. auth-config-before.json
  const authConfig = {
    jwtAlgorithm: 'HS256',
    passwordHash: 'bcryptjs (10 rounds)',
    frontendTokenStorage: 'localStorage (sms_access_token, sms_refresh_token)',
    transport: 'Authorization: Bearer <token> header',
    authSessionTtl: 'TTL index on expiresAt (expires: 0)',
  };
  fs.writeFileSync(path.join(backupDir, 'auth-config-before.json'), JSON.stringify(authConfig, null, 2));

  // 7. code-version-before.json
  let gitCommit = 'unknown';
  try {
    gitCommit = execSync('git rev-parse HEAD').toString().trim();
  } catch (e) {}
  fs.writeFileSync(path.join(backupDir, 'code-version-before.json'), JSON.stringify({ gitCommit }, null, 2));

  // 8. planned-actions.json
  const plannedActions = {
    phase: 'PHASE 4D — PRODUCTION SECURITY & OPERATIONAL HARDENING',
    actions: [
      'Implement private authorized file streaming endpoint',
      'Remove unauthenticated app.use(/uploads, express.static)',
      'Add magic byte validation for uploads (JPEG, PNG, WebP, PDF)',
      'Add dedicated auth rate limiter on sensitive endpoints',
      'Implement graceful shutdown with HTTP draining and database disconnect',
      'Expose /api/health/liveness and /api/health/readiness',
      'Add correlation ID and structured logger support',
      'Harden CSV formula injection protection',
      'Harden startup production secrets validation',
      'Prepare evidence-based index optimization report (no deletions)',
    ],
  };
  fs.writeFileSync(path.join(backupDir, 'planned-actions.json'), JSON.stringify(plannedActions, null, 2));

  // 9. rollback-instructions.md
  const rollbackInstructions = `# PHASE 4D ROLLBACK INSTRUCTIONS
1. Revert application code to git commit: ${gitCommit}
2. Re-verify TypeScript typecheck: npm run typecheck
3. Note: Phase 4D does not modify database schemas, records, or indexes.
`;
  fs.writeFileSync(path.join(backupDir, 'rollback-instructions.md'), rollbackInstructions);

  // 10. manifest.json
  const manifest = {
    phase: '4D',
    runId: timestamp,
    createdAt: new Date().toISOString(),
    gitCommit,
    totalCollections: collections.length,
    databaseName: db.databaseName,
  };
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('RECOVERY_PACKAGE_CREATED_SUCCESSFULLY:', backupDir);
  await mongoose.disconnect();
}

createRecoveryPackage().catch(console.error);
