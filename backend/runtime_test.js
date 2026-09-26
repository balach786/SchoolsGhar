const API_URL = 'http://localhost:4000/api';
const SCHOOL_CODE = 'bkm-school';
const ADMIN_EMAIL = 'balach937@gmail.com';
const ADMIN_PASSWORD = 'password123'; 

async function runTests() {
  console.log('--- STARTING RUNTIME TEST ---');

  // 1. Admin Login
  let adminToken, adminRefreshToken;
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolCode: SCHOOL_CODE,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
      })
    });
    const data = await res.json();
    console.log('Admin Login:', res.ok ? 'SUCCESS' : 'FAILED', data.message || data.error?.message || '');
    if (res.ok) {
      adminToken = data.data.accessToken;
      adminRefreshToken = data.data.refreshToken;
    }
  } catch (err) {
    console.error('Admin Login Error:', err.message);
    return;
  }

  if (!adminToken) return;

  // 2. /auth/me for Admin
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('/auth/me (Admin):', res.ok ? 'SUCCESS' : 'FAILED');
  } catch (err) {
    console.error('/auth/me (Admin) Error:', err.message);
  }

  // 3. Admin Dashboard
  try {
    const res = await fetch(`${API_URL}/dashboard/analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const data = await res.json();
    console.log('Dashboard (Admin):', res.ok ? 'SUCCESS' : 'FAILED', data.error?.message || '');
  } catch (err) {
    console.error('Dashboard (Admin) Error:', err.message);
  }

  // 4. Refresh Token
  let newAdminToken;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: adminRefreshToken })
    });
    const data = await res.json();
    console.log('Token Refresh:', res.ok ? 'SUCCESS' : 'FAILED', data.message || data.error?.message || '');
    if (res.ok) {
      newAdminToken = data.data.accessToken;
    }
  } catch (err) {
    console.error('Token Refresh Error:', err.message);
  }

  // 5. Check role permissions
  console.log('Attempting to check role permissions...');
  let accountantRole;
  try {
    const res = await fetch(`${API_URL}/roles`, {
      headers: { Authorization: `Bearer ${newAdminToken || adminToken}` }
    });
    const data = await res.json();
    const roles = data.data;
    accountantRole = roles.find(r => r.slug === 'accountant');
    console.log('Roles fetched:', res.ok ? 'SUCCESS' : 'FAILED');
  } catch (err) {
    console.error('Fetch Roles Error:', err.message);
  }

  if (accountantRole) {
    try {
      const res = await fetch(`${API_URL}/staff`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newAdminToken || adminToken}`
        },
        body: JSON.stringify({
          fullName: 'Demo Accountant',
          email: 'accountant@bkm.test',
          password: 'password123',
          roleId: accountantRole._id,
          staffType: 'non_teaching',
          joiningDate: new Date().toISOString().split('T')[0],
          employeeId: 'ACC-' + Math.floor(Math.random() * 10000),
          fatherName: 'Test Father',
          caste: 'Test Caste',
          designation: 'Accountant'
        })
      });
      const data = await res.json();
      if (res.ok) {
        console.log('Accountant Created: SUCCESS');
        const staffId = data.data._id;
        // Now create the user account
        const uRes = await fetch(`${API_URL}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${newAdminToken || adminToken}`
          },
          body: JSON.stringify({
            email: 'accountant@bkm.test',
            password: 'password123',
            roleId: accountantRole._id,
            isActive: true,
            personType: 'staff',
            personId: staffId
          })
        });
        const uData = await uRes.json();
        console.log('Accountant User Created:', uRes.ok ? 'SUCCESS' : 'FAILED', uData.message || uData.error?.message || '');
      } else {
        console.log('Accountant Creation FAILED:', JSON.stringify(data));
      }
    } catch (err) {
      console.error('Accountant Creation Error:', err.message);
    }
  }

  // 6. Logout Admin
  try {
    const res = await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newAdminToken || adminToken}` 
      },
      body: JSON.stringify({ refreshToken: adminRefreshToken })
    });
    console.log('Admin Logout:', res.ok ? 'SUCCESS' : 'FAILED');
  } catch (err) {
    console.error('Admin Logout Error:', err.message);
  }

  // 7. Accountant Login
  let accToken;
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schoolCode: SCHOOL_CODE,
        email: 'accountant@bkm.test',
        password: 'password123'
      })
    });
    const data = await res.json();
    console.log('Accountant Login:', res.ok ? 'SUCCESS' : 'FAILED', data.error?.message || '');
    if (res.ok) {
      accToken = data.data.accessToken;
    }
  } catch (err) {
    console.error('Accountant Login Error:', err.message);
  }

  // 8. Accountant Dashboard
  if (accToken) {
    try {
      const res = await fetch(`${API_URL}/dashboard/analytics`, {
        headers: { Authorization: `Bearer ${accToken}` }
      });
      console.log('Dashboard (Accountant):', res.ok ? 'SUCCESS' : 'FAILED');
    } catch (err) {
      console.error('Dashboard (Accountant) Error:', err.message);
    }
  }

  console.log('--- TEST FINISHED ---');
}

runTests();
