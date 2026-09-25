import axios from 'axios';

const BASE = 'http://localhost:4000/api';

async function main() {
  console.log('=== BATCH 8 FOCUSED REGRESSION ===\n');

  // Login
  const loginRes = await axios.post(`${BASE}/auth/login`, {
    email: 'admin@bkm.com',
    password: 'password123',
    schoolCode: 'bkm'
  });
  const token = loginRes.data.data.accessToken;
  const A = axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true });

  // 1. Academic Regression
  console.log('--- Academic Core ---');
  let res = await A.get('/academic-sessions');
  console.log(`GET /academic-sessions: ${res.status === 200 ? 'PASS' : 'FAIL'} (${res.data?.data?.length} found)`);
  
  res = await A.get('/classes');
  console.log(`GET /classes: ${res.status === 200 ? 'PASS' : 'FAIL'} (${res.data?.data?.length} found)`);

  res = await A.get('/students');
  console.log(`GET /students: ${res.status === 200 ? 'PASS' : 'FAIL'} (${res.data?.pagination?.total || 0} found)`);

  res = await A.get('/teachers');
  console.log(`GET /teachers: ${res.status === 200 ? 'PASS' : 'FAIL'} (${res.data?.pagination?.total || 0} found)`);

  // 2. Finance Regression
  console.log('\n--- Finance Core ---');
  res = await A.get('/fees/regular');
  console.log(`GET /fees/regular: ${res.status === 200 ? 'PASS' : 'FAIL'} (${res.data?.data?.length || 0} found)`);

  res = await A.get('/payments');
  console.log(`GET /payments: ${res.status === 200 ? 'PASS' : 'FAIL'} (${res.data?.pagination?.total || 0} found)`);
  
  res = await A.get('/expenses');
  console.log(`GET /expenses: ${res.status === 200 ? 'PASS' : 'FAIL'} (${res.data?.data?.length || 0} found)`);

  console.log('\nRegression checks completed.');
}

main().catch(console.error);
