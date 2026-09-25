import http from 'http';

const BASE_URL = 'http://127.0.0.1:4000/api';

async function testFreshRegistration() {
  console.log('--- TEST: Fresh Registration ---');
  const payload = {
    schoolName: `Phase 3 Test School ${Date.now()}`,
    ownerName: 'Phase 3 Owner',
    email: `phase3_${Date.now()}@test.com`,
    password: 'password123',
    confirmPassword: 'password123'
  };

  try {
    const res = await fetch(`${BASE_URL}/public/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log('Registration Response Status:', res.status);
    
    if (res.status === 201) {
      console.log('✅ Registration successful.');
      console.log('Tenant:', data.data.tenant.slug, data.data.tenant.databaseName);
      console.log('Provisioning Status:', data.data.tenant.provisioningStatus);
      console.log('Access Token received:', !!data.data.accessToken);

      // Verify login using the new schoolCode
      console.log('\n--- Verifying Login for new school ---');
      const loginPayload = {
        schoolCode: data.data.tenant.slug,
        email: payload.email,
        password: payload.password
      };

      const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginPayload)
      });
      const loginData = await loginRes.json();
      console.log('Login Response Status:', loginRes.status);
      if (loginRes.status === 200) {
        console.log('✅ Login successful for Phase 3 school');
        
        // Check /auth/me
        const meRes = await fetch(`${BASE_URL}/auth/me`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${loginData.data.accessToken}` }
        });
        const meData = await meRes.json();
        console.log('Auth Me Status:', meRes.status);
        if (meRes.status === 200) {
            console.log('✅ /auth/me successful');
            console.log('Tenant ID in payload:', meData.data.tenantId);
        } else {
            console.log('❌ /auth/me failed', meData);
        }
      } else {
        console.log('❌ Login failed', loginData);
      }
    } else {
      console.log('❌ Registration failed:', data);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

async function testLegacyLogin() {
    console.log('\n--- Verifying Login for legacy dummy school ---');
    const loginPayload = {
      schoolCode: 'bkm',
      email: 'admin@bkm.edu.pk',
      password: 'password123'
    };

    try {
        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginPayload)
        });
        const loginData = await loginRes.json();
        console.log('Legacy Login Response Status:', loginRes.status);
        if (loginRes.status === 200) {
            console.log('✅ Login successful for legacy school');
        } else {
            console.log('❌ Legacy login failed', loginData);
        }
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

async function runAll() {
  await testFreshRegistration();
  await testLegacyLogin();
}

runAll();
