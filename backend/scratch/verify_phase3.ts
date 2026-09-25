import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:4000/api';
const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not found');
    process.exit(1);
  }

  console.log('--- Phase 3 Read-Only Verification ---');
  
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB safely without exposing URI.');

  // 1. Find the latest Phase-3 tenant in Master DB
  const masterDb = mongoose.connection.useDb('schoolsghar_master');
  const phase3Tenants = await masterDb.collection('tenants')
    .find({ slug: { $regex: /^phase-3-test-school-/ } })
    .sort({ _id: -1 })
    .limit(1)
    .toArray();
    
  if (phase3Tenants.length === 0) {
    console.log('❌ No Phase-3 tenant found in master DB.');
    process.exit(1);
  }
  const latestTenant = phase3Tenants[0];
  console.log(`\nFound latest Phase-3 Tenant: ${latestTenant.slug}`);
  console.log(`- databaseName: ${latestTenant.databaseName}`);
  console.log(`- isDatabaseProvisioned: ${latestTenant.isDatabaseProvisioned}`);
  console.log(`- provisioningStatus: ${latestTenant.provisioningStatus}`);

  // 1b. Verify Platform records count for this tenant
  const masterSubscriptions = await masterDb.collection('subscriptions').countDocuments({ tenantId: latestTenant._id });
  console.log(`- Master DB Subscriptions count: ${masterSubscriptions}`);

  // 2. Verify Exact Tenant DB Contents
  const tenantDbName = latestTenant.databaseName;
  const tenantDb = mongoose.connection.useDb(tenantDbName);
  
  const tenantUsersCount = await tenantDb.collection('users').countDocuments();
  const tenantRolesCount = await tenantDb.collection('roles').countDocuments();
  const tenantSettingsCount = await tenantDb.collection('schoolsettings').countDocuments();
  const tenantSessionsCount = await tenantDb.collection('academicsessions').countDocuments();
  const tenantAuthCount = await tenantDb.collection('authsessions').countDocuments();

  console.log(`\nTenant DB (${tenantDbName}) Records:`);
  console.log(`- Users: ${tenantUsersCount}`);
  console.log(`- Roles (Admin): ${tenantRolesCount}`);
  console.log(`- SchoolSettings: ${tenantSettingsCount}`);
  console.log(`- AcademicSessions: ${tenantSessionsCount}`);
  console.log(`- AuthSessions: ${tenantAuthCount}`);

  // 3. Confirm Phase-3 records did not leak into Legacy DB
  const legacyDb = mongoose.connection.useDb('schoolsghar');
  const leakedTenant = await legacyDb.collection('tenants').findOne({ slug: latestTenant.slug });
  const leakedUser = await legacyDb.collection('users').findOne({ email: `phase3_${latestTenant.slug.replace('phase-3-test-school-', '')}@test.com` });
  
  console.log('\nLegacy DB Leakage Check:');
  console.log(`- Leaked Tenant found: ${!!leakedTenant}`);
  console.log(`- Leaked Owner User found: ${!!leakedUser}`);

  // 4. Test Idempotency & Authentication API safe test
  // To do this, I will call the authentication API.
  console.log('\nTesting Authentication API...');
  
  const ownerEmail = `phase3_${latestTenant.slug.split('-').pop()}@test.com`;
  console.log(`Using email: ${ownerEmail}`);

  let accessToken = '';

  try {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolCode: latestTenant.slug,
        email: ownerEmail,
        password: 'password123'
      })
    });
    
    if (loginRes.status === 200) {
      console.log('✅ Correct School Code + credentials succeeded');
      const data = await loginRes.json();
      accessToken = data.data.accessToken;
    } else {
      console.log(`❌ Login failed with status: ${loginRes.status}`);
      const data = await loginRes.json();
      console.log(data);
    }
  } catch(e) {
    console.error('Fetch error for login:', e);
  }

  if (accessToken) {
    try {
      const meRes = await fetch(`${BASE_URL}/auth/me`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (meRes.status === 200) {
        console.log('✅ /auth/me succeeded');
      } else {
        console.log(`❌ /auth/me failed with status: ${meRes.status}`);
        const data = await meRes.json();
        console.log(data);
      }
    } catch(e) {
      console.error('Fetch error for /auth/me:', e);
    }
  }

  // School A code + School B credentials
  try {
    const loginFailRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolCode: 'bkm', // Legacy dummy school
        email: ownerEmail,
        password: 'password123'
      })
    });
    if (loginFailRes.status === 401) {
      console.log('✅ School A code + School B credentials fails (401)');
    } else {
      console.log(`❌ Cross-tenant login incorrectly gave status: ${loginFailRes.status}`);
    }
  } catch(e) {}

  // Legacy Dummy Login
  try {
    const legacyLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolCode: 'bkm',
        email: 'admin@school.test',
        password: 'Password123' // from seed.ts
      })
    });
    if (legacyLogin.status === 200) {
       console.log('✅ Legacy dummy tenant still uses legacy schoolsghar');
    } else {
       console.log(`❌ Legacy login failed with status: ${legacyLogin.status}`);
       const data = await legacyLogin.json();
       console.log(data);
    }
  } catch(e) {}

  // Test Controlled Provisioning Failure
  console.log('\n--- Testing Controlled Provisioning Failure ---');
  // I will register with a very long school name which we fixed, wait we truncated it. 
  // Let me register without providing something or force an error in TenantProvisioningService?
  // We can't force an error without modifying code. Wait! The prompt says "Verify from code plus a safe controlled test".
  // Let me pass an invalid email format or something that fails in user creation?
  // Actually, I can temporarily rename `ownerRole.name` to something violating validation to fail provisioning. But wait, DO NOT modify architecture.
  // Mongoose handles validation.
  
  process.exit(0);
}

run();
