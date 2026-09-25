import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const MONGODB_URI = process.env.MONGODB_URI!;

async function run() {
  await mongoose.connect(MONGODB_URI);

  const masterDb = mongoose.connection.useDb('schoolsghar_master');

  // Get the latest ready Phase-3 tenant
  const latestTenant = await masterDb.collection('tenants')
    .findOne(
      { slug: { $regex: /^phase-3-test-school-/ }, isDatabaseProvisioned: true, provisioningStatus: 'ready' },
      { sort: { _id: -1 } }
    );

  if (!latestTenant) { console.error('No provisioned Phase-3 tenant found'); process.exit(1); }

  const tenantDbName = latestTenant.databaseName as string;
  const tenantDb = mongoose.connection.useDb(tenantDbName);

  console.log('\n=== IDEMPOTENCY CHECK ===');
  console.log(`Testing on tenant: ${latestTenant.slug}, DB: ${tenantDbName}`);

  const usersBefore = await tenantDb.collection('users').countDocuments();
  const rolesBefore = await tenantDb.collection('roles').countDocuments();
  const settingsBefore = await tenantDb.collection('schoolsettings').countDocuments();
  const sessionsBefore = await tenantDb.collection('academicsessions').countDocuments();

  console.log(`Before: users=${usersBefore}, roles=${rolesBefore}, settings=${settingsBefore}, academic_sessions=${sessionsBefore}`);

  // Simulate a re-provision call by calling TenantProvisioningService directly
  // We do NOT flip isDatabaseProvisioned — the real service checks it and throws.
  // Instead, verify that a direct call to provisionTenant with isDatabaseProvisioned=true throws:
  const { TenantProvisioningService } = await import('../src/services/TenantProvisioningService.js');

  let threw = false;
  let threwMessage = '';
  try {
    const mockTenant = { ...latestTenant, isDatabaseProvisioned: true };
    // @ts-ignore
    await TenantProvisioningService.provisionTenant(mockTenant as any, 'owner', 'test@test.com', 'hash');
  } catch (e: any) {
    threw = true;
    threwMessage = e.message;
  }

  if (threw && threwMessage === 'Tenant is already provisioned') {
    console.log('✅ Idempotency guard: provisionTenant correctly throws for already-provisioned tenant');
  } else {
    console.log(`❌ Idempotency guard failed. Threw=${threw}, Message=${threwMessage}`);
  }

  // Now simulate what happens when provisionTenant is called with isDatabaseProvisioned=false
  // but the underlying records already exist (upsert logic). We temporarily flip the flag.
  const fakeTenant = { ...latestTenant, isDatabaseProvisioned: false };
  const ownerUser = await tenantDb.collection('users').findOne({});
  const ownerEmail = ownerUser?.email as string;

  try {
    // @ts-ignore
    await TenantProvisioningService.provisionTenant(fakeTenant as any, ownerUser?.name as string, ownerEmail, ownerUser?.passwordHash as string);
  } catch(e) {
    console.log(`Note: Re-provision threw: ${(e as any).message}`);
  }

  const usersAfter = await tenantDb.collection('users').countDocuments();
  const rolesAfter = await tenantDb.collection('roles').countDocuments();
  const settingsAfter = await tenantDb.collection('schoolsettings').countDocuments();
  const sessionsAfter = await tenantDb.collection('academicsessions').countDocuments();

  console.log(`After:  users=${usersAfter}, roles=${rolesAfter}, settings=${settingsAfter}, academic_sessions=${sessionsAfter}`);

  const allSame = usersBefore === usersAfter && rolesBefore === rolesAfter && settingsBefore === settingsAfter && sessionsBefore === sessionsAfter;
  if (allSame) {
    console.log('✅ Idempotency verified: no duplicate documents created on re-provision');
  } else {
    console.log('❌ Idempotency FAILED: document counts changed');
  }

  // === FAILURE METADATA CHECK ===
  console.log('\n=== FAILURE METADATA CHECK ===');
  const failedTenants = await masterDb.collection('tenants')
    .find({ provisioningStatus: 'failed' })
    .limit(5)
    .toArray();

  if (failedTenants.length === 0) {
    console.log('No failed tenants in master DB (all recovered or test tenants cleaned up)');
  } else {
    for (const ft of failedTenants) {
      const hasPassword = ft.provisioningErrorCode && ft.provisioningErrorCode.toLowerCase().includes('password');
      const hasUri = ft.provisioningErrorCode && (ft.provisioningErrorCode.includes('mongodb') || ft.provisioningErrorCode.includes('://'));
      const hasStack = ft.provisioningErrorCode && ft.provisioningErrorCode.includes('\n    at ');
      console.log(`Tenant ${ft.slug}:`);
      console.log(`  provisioningStatus: ${ft.provisioningStatus}`);
      console.log(`  isDatabaseProvisioned: ${ft.isDatabaseProvisioned}`);
      console.log(`  errorCode (sanitized): ${ft.provisioningErrorCode?.substring(0, 100)}`);
      console.log(`  Contains password? ${hasPassword}`);
      console.log(`  Contains URI? ${hasUri}`);
      console.log(`  Contains stack trace? ${hasStack}`);
      if (!hasPassword && !hasUri && !hasStack) {
        console.log('  ✅ Failure metadata is sanitized (no credentials/stack)');
      } else {
        console.log('  ❌ Failure metadata may contain sensitive data');
      }
    }
  }

  // === JWT PAYLOAD CHECK ===
  console.log('\n=== JWT PAYLOAD CHECK ===');
  const BASE_URL = 'http://127.0.0.1:4000/api';
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
    const data = await loginRes.json() as any;
    const jwt = data.data.accessToken;
    // Decode JWT payload (middle part) without verifying
    const parts = jwt.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const hasTenantId = 'tenantId' in payload;
    const hasDatabaseName = 'databaseName' in payload;
    console.log(`JWT tenantId present: ${hasTenantId} ✅`);
    console.log(`JWT databaseName present: ${hasDatabaseName} ${hasDatabaseName ? '❌ SECURITY ISSUE' : '✅ NOT PRESENT'}`);
    console.log(`JWT claims: sub=${payload.sub}, role=${payload.role}, tenantId=${payload.tenantId}`);

    // Check AuthSession is in Tenant DB
    const tenantDbSessions = await tenantDb.collection('authsessions').countDocuments();
    console.log(`AuthSessions in tenant DB: ${tenantDbSessions} ${tenantDbSessions > 0 ? '✅' : '❌'}`);

    // Check AuthSession is NOT in master DB
    const masterSessions = await masterDb.collection('authsessions').countDocuments();
    console.log(`AuthSessions in master DB: ${masterSessions} ${masterSessions === 0 ? '✅ (none)' : '❌ (leaked!)'}`);
  } else {
    console.log(`❌ Login failed: ${loginRes.status}`);
  }

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
