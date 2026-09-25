/**
 * Phase 3 Gap-Check Script
 * - Reads MONGODB_URI from .env only — never prints credentials
 * - Tests legacy bkm tenant with actual seeded user from DB
 * - Audits master DB registration metadata
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set in .env'); process.exit(1); }

const BASE_URL = 'http://127.0.0.1:4000/api';

async function run() {
  console.log('--- Phase 3 Gap Check ---\n');

  await mongoose.connect(MONGODB_URI!);

  // === STEP 1: Find actual seeded user in bkm legacy tenant ===
  const legacyDb = mongoose.connection.useDb('schoolsghar');

  const bkmTenant = await legacyDb.collection('tenants').findOne({ slug: 'bkm' });
  if (!bkmTenant) { console.error('❌ Legacy bkm tenant not found in schoolsghar'); process.exit(1); }
  console.log(`Found legacy tenant: ${bkmTenant.slug} (ID: ${bkmTenant._id})`);

  // Find any active user for this tenant that has a known test password
  // seed.ts uses 'Password123' for all demo users
  const legacyUser = await legacyDb.collection('users').findOne({
    tenantId: bkmTenant._id,
    isArchived: false,
    isActive: true,
  });

  if (!legacyUser) {
    console.error('❌ No active users found in bkm tenant');
    process.exit(1);
  }
  console.log(`Found legacy user: ${legacyUser.email}`);

  // === STEP 2: Test Legacy Login via API ===
  console.log('\n=== LEGACY TENANT LOGIN ===');

  // Try with seed password
  const SEED_PASSWORDS = ['Password123', 'password123', 'Password1234'];
  let legacyLoginOk = false;
  let legacyAccessToken = '';

  for (const pwd of SEED_PASSWORDS) {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolCode: 'bkm',
        email: legacyUser.email,
        password: pwd,
      }),
    });

    if (loginRes.status === 200) {
      const data = await loginRes.json() as any;
      legacyAccessToken = data.data.accessToken;
      legacyLoginOk = true;
      console.log(`✅ Legacy login succeeded with email: ${legacyUser.email}`);
      break;
    } else if (loginRes.status === 401) {
      // Try next password
      continue;
    } else {
      const data = await loginRes.json() as any;
      console.log(`Note: ${loginRes.status} → ${data.error?.message}`);
    }
  }

  if (!legacyLoginOk) {
    console.log(`❌ Legacy login FAILED for ${legacyUser.email} with all tried passwords`);
    console.log('Attempting bkm with seed email admin@school.test...');
    // Try seed.ts default users
    const seedEmails = ['admin@school.test', 'superadmin@school.test'];
    for (const seedEmail of seedEmails) {
      const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolCode: 'bkm', email: seedEmail, password: 'Password123' }),
      });
      if (loginRes.status === 200) {
        const data = await loginRes.json() as any;
        legacyAccessToken = data.data.accessToken;
        legacyLoginOk = true;
        console.log(`✅ Legacy login succeeded with seed email: ${seedEmail}`);
        break;
      }
    }
  }

  // === STEP 3: /auth/me for legacy user ===
  let legacyMeOk = false;
  let legacyTenantIdInJwt = '';
  if (legacyAccessToken) {
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${legacyAccessToken}` },
    });
    if (meRes.status === 200) {
      legacyMeOk = true;
      console.log('✅ Legacy /auth/me succeeded');

      // Decode JWT — check tenantId and absence of databaseName
      const parts = legacyAccessToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      legacyTenantIdInJwt = payload.tenantId || '';
      console.log(`  JWT tenantId: ${payload.tenantId}`);
      console.log(`  JWT databaseName present: ${!!payload.databaseName} ${!!payload.databaseName ? '❌' : '✅'}`);
    } else {
      const d = await meRes.json() as any;
      console.log(`❌ Legacy /auth/me failed: ${d.error?.message}`);
    }
  }

  // Verify routing stays on legacy schoolsghar
  if (legacyTenantIdInJwt) {
    const tenantInLegacy = await legacyDb.collection('tenants').findOne({ _id: bkmTenant._id });
    const tenantInMaster = await mongoose.connection.useDb('schoolsghar_master').collection('tenants').findOne({ _id: bkmTenant._id });
    console.log(`  Tenant found in legacy schoolsghar: ${!!tenantInLegacy} ${tenantInLegacy ? '✅' : '❌'}`);
    console.log(`  Tenant found in master DB: ${!!tenantInMaster} ${!tenantInMaster ? '✅ (correct — not in master)' : '❌ (unexpected)'}`);
  }

  // === STEP 4: Master DB Registration Metadata Audit ===
  console.log('\n=== MASTER DB REGISTRATION METADATA ===');
  const masterDb = mongoose.connection.useDb('schoolsghar_master');

  const latestTenant = await masterDb.collection('tenants').findOne(
    { slug: { $regex: /^phase-3-test-school-/ }, isDatabaseProvisioned: true },
    { sort: { _id: -1 } }
  );

  if (!latestTenant) { console.error('❌ No provisioned Phase-3 tenant found'); process.exit(1); }
  console.log(`Auditing tenant: ${latestTenant.slug}`);

  const tenantCount = await masterDb.collection('tenants').countDocuments({ _id: latestTenant._id });
  const subHistoryCount = await masterDb.collection('subscriptionhistories').countDocuments({ tenantId: latestTenant._id });
  const platformNotifCount = await masterDb.collection('platformnotifications').countDocuments({ tenantId: latestTenant._id });

  console.log(`  Tenant records in master: ${tenantCount}`);
  console.log(`  SubscriptionHistory records: ${subHistoryCount}`);
  console.log(`  PlatformNotification records: ${platformNotifCount}`);

  // Peek at one SubscriptionHistory record for this tenant
  if (subHistoryCount > 0) {
    const sub = await masterDb.collection('subscriptionhistories').findOne({ tenantId: latestTenant._id });
    console.log(`  SubscriptionHistory sample: action=${sub?.action}, status=${sub?.newStatus}`);
  }
  if (platformNotifCount > 0) {
    const notif = await masterDb.collection('platformnotifications').findOne({ tenantId: latestTenant._id });
    console.log(`  PlatformNotification sample: type=${notif?.type}, title=${notif?.title}`);
  }

  process.exit(0);
}

run().catch(e => { console.error('Script error:', e.message); process.exit(1); });
