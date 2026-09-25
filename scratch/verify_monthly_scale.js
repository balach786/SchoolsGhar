const http = require('http');

function apiCall(path, method = 'GET', data = null, customToken = null) {
  return new Promise((resolve, reject) => {
    const defaultToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2YWE1YTNhMjc3MWE2ODM3NjMxODM5MGQiLCJyb2xlIjoiYWRtaW4iLCJyb2xlSWQiOiI2YTliMTgxYjUxZjJkMmVmNzEyZDQ2MWEiLCJlbWFpbCI6ImJhbGFjaDkzN0BnbWFpbC5jb20iLCJuYW1lIjoiTXVoYW1tZWQgTXV6YW1pbCIsInRlbmFudElkIjoiNmFhNWEzYTI3NzFhNjgzNzYzMTgzOTBjIiwiaXNQbGF0Zm9ybUFkbWluIjpmYWxzZSwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc4OTMyODIwMiwiZXhwIjoxNzg5OTMzMDAyfQ.81A8AP_8XL6FIeVuDhqENX6qEyQOfeiE9Y76e80yJhA';
    const token = customToken || defaultToken;
    const payload = data ? JSON.stringify(data) : null;
    const req = http.request({
      host: '127.0.0.1',
      port: 4000,
      path: '/api' + path,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runScaleTests() {
  console.log('==================================================');
  console.log('TESTING MONTHLY ATTENDANCE SUMMARY DATA-CORRECTNESS & SCALE');
  console.log('==================================================\n');

  // 1. Get active session
  const sessionRes = await apiCall('/academic-sessions');
  const sessions = sessionRes.body.data || sessionRes.body;
  const activeSession = Array.isArray(sessions) ? sessions.find(s => s.isCurrent || s.status === 'active') || sessions[0] : null;
  console.log('Active Session:', activeSession?._id, activeSession?.name);

  // 2. Create a test class for large-scale student testing
  const largeClassRes = await apiCall('/classes', 'POST', {
    name: 'Large Scale Test Class ' + Date.now(),
    code: 'LSC' + Math.floor(Math.random()*1000),
    sessionId: activeSession._id
  });
  const largeClass = largeClassRes.body.data;
  console.log('Created Large Scale Test Class:', largeClass._id, largeClass.name);

  // 3. Check current student count in the tenant
  const countCheck = await apiCall('/students?limit=1');
  const totalExisting = countCheck.body.pagination?.total || 0;
  console.log(`Current existing students in tenant: ${totalExisting}`);

  // Create active students up to 305 students so we cross the 300 threshold
  const targetCount = 305;
  const needed = targetCount - totalExisting;
  console.log(`Need to create ${needed > 0 ? needed : 0} additional students to test 301+ threshold...`);

  if (needed > 0) {
    const BATCH_SIZE = 50;
    let created = 0;
    while (created < needed) {
      const batchToCreate = Math.min(BATCH_SIZE, needed - created);
      const promises = [];
      for (let i = 0; i < batchToCreate; i++) {
        const idx = totalExisting + created + i + 1;
        promises.push(apiCall('/students', 'POST', {
          fullName: `Scale Student ${idx}`,
          admissionNumber: `SCA-${idx}-${Math.floor(Math.random()*1000)}`,
          rollNumber: `R-${idx}`,
          sessionId: activeSession._id,
          classId: largeClass._id,
          guardianName: 'Guardian Scale',
          admissionDate: '2026-09-01',
          dateOfBirth: '2015-05-15',
          gender: 'male',
          status: 'active'
        }));
      }
      const results = await Promise.all(promises);
      created += batchToCreate;
      process.stdout.write(`Created ${created}/${needed} students...\r`);
    }
    console.log(`\nCreated ${created} students successfully.`);
  }

  // Verify new total
  const countVerify = await apiCall('/students?limit=1');
  const newTotal = countVerify.body.pagination?.total || 0;
  console.log(`Total active students now in tenant: ${newTotal}`);

  // Add more students directly to largeClass so largeClass has > 300 students
  const currentInLargeClass = await apiCall(`/students?classId=${largeClass._id}&limit=1`);
  const countInLargeClass = currentInLargeClass.body.pagination?.total || 0;
  console.log(`Current students in largeClass: ${countInLargeClass}`);

  const targetInClass = 305;
  if (countInLargeClass < targetInClass) {
    const toAdd = targetInClass - countInLargeClass;
    console.log(`Adding ${toAdd} more students directly to largeClass so it has ${targetInClass} students...`);
    const BATCH_SIZE = 50;
    let added = 0;
    while (added < toAdd) {
      const batch = Math.min(BATCH_SIZE, toAdd - added);
      const p = [];
      for (let i = 0; i < batch; i++) {
        const num = countInLargeClass + added + i + 1;
        p.push(apiCall('/students', 'POST', {
          fullName: `LargeClass Student ${num}`,
          admissionNumber: `LCS-${num}-${Math.floor(Math.random()*1000)}`,
          rollNumber: `R-${num}`,
          sessionId: activeSession._id,
          classId: largeClass._id,
          guardianName: 'Guardian Scale',
          admissionDate: '2026-09-01',
          dateOfBirth: '2015-05-15',
          gender: 'female',
          status: 'active'
        }));
      }
      await Promise.all(p);
      added += batch;
      process.stdout.write(`Added ${added}/${toAdd} students to largeClass...\r`);
    }
    console.log(`\nAdded ${added} students to largeClass.`);
  }

  const finalInLargeClass = (await apiCall(`/students?classId=${largeClass._id}&limit=1`)).body.pagination?.total || 0;
  console.log(`Final students in largeClass: ${finalInLargeClass}`);

  const month = '2026-09';

  // -------------------------------------------------------------
  // TEST SCENARIO 1: UNSCOPED REQUEST WITH 301+ STUDENTS
  // -------------------------------------------------------------
  console.log('\n--- SCENARIO 1: Unscoped request without classId (301+ students) ---');
  const unscopedRes = await apiCall(`/student-attendance/monthly-summary?sessionId=${activeSession._id}&month=${month}`);
  console.log('Status code:', unscopedRes.status);
  console.log('Error code:', unscopedRes.body?.error?.code);
  console.log('Error message:', unscopedRes.body?.error?.message);

  if (unscopedRes.status === 400 && 
      unscopedRes.body?.error?.code === 'MONTHLY_REPORT_SCOPE_REQUIRED' &&
      unscopedRes.body?.error?.message === 'Please select a class to view the monthly attendance register.') {
    console.log('✅ PASS: Unscoped request with 301+ students correctly rejected with MONTHLY_REPORT_SCOPE_REQUIRED (no silent truncation)');
  } else {
    console.error('❌ FAIL: Expected MONTHLY_REPORT_SCOPE_REQUIRED 400, got:', unscopedRes);
  }

  // -------------------------------------------------------------
  // TEST SCENARIO 2: CLASS-SCOPED REQUEST WITH 301+ STUDENTS
  // -------------------------------------------------------------
  console.log('\n--- SCENARIO 2: Class-scoped request with classId (Large class with 301+ students) ---');
  const scopedRes = await apiCall(`/student-attendance/monthly-summary?sessionId=${activeSession._id}&classId=${largeClass._id}&month=${month}`);
  console.log('Status code:', scopedRes.status);
  const scopedData = scopedRes.body?.data;
  console.log(`Total students returned in monthly matrix: ${scopedData?.rows?.length}`);
  console.log(`Report totalStudents property: ${scopedData?.totalStudents}`);

  if (scopedRes.status === 200 && scopedData?.rows?.length >= 301 && scopedData?.rows?.length === scopedData?.totalStudents) {
    console.log(`✅ PASS: Class-scoped report returned ALL ${scopedData?.rows?.length} students without any silent .limit(300) truncation!`);
  } else {
    console.error('❌ FAIL: Silent truncation or mismatch detected:', {
      status: scopedRes.status,
      rowsCount: scopedData?.rows?.length,
      totalStudents: scopedData?.totalStudents
    });
  }

  // -------------------------------------------------------------
  // TEST SCENARIO 3: CLASS-SCOPED REQUEST WITH <= 300 STUDENTS (e.g. 50 students)
  // -------------------------------------------------------------
  console.log('\n--- SCENARIO 3: Request where <= 300 students match (e.g. CLASS 01 with 40 students) ---');
  // Get CLASS 01
  const classesRes = await apiCall('/classes');
  const class01 = classesRes.body.data?.find(c => c.name === 'CLASS 01');
  if (class01) {
    const class01Res = await apiCall(`/student-attendance/monthly-summary?sessionId=${activeSession._id}&classId=${class01._id}&month=${month}`);
    console.log('Status code:', class01Res.status);
    const class01Data = class01Res.body?.data;
    console.log(`CLASS 01 students count: ${class01Data?.rows?.length}`);
    if (class01Res.status === 200 && class01Data?.rows?.length === class01Data?.totalStudents && class01Data?.rows?.length <= 300) {
      console.log(`✅ PASS: Class with <= 300 students loaded completely (${class01Data?.rows?.length} students), 0 omitted.`);
    } else {
      console.error('❌ FAIL: CLASS 01 monthly check failed:', class01Res);
    }
  }

  // -------------------------------------------------------------
  // TEST SCENARIO 4: CSV EXPORT WITH LARGE CLASS (301+ STUDENTS)
  // -------------------------------------------------------------
  console.log('\n--- SCENARIO 4: CSV export completeness for 301+ students ---');
  const csvRes = await apiCall(`/student-attendance/monthly-summary?sessionId=${activeSession._id}&classId=${largeClass._id}&month=${month}&format=csv`);
  console.log('CSV Export status code:', csvRes.status);
  const csvText = csvRes.raw || '';
  const csvLines = csvText.trim().split('\n');
  console.log(`CSV total lines (header + students): ${csvLines.length}`);
  if (csvRes.status === 200 && csvLines.length >= 302) { // 1 header + >= 301 student rows
    console.log(`✅ PASS: CSV export contains all ${csvLines.length - 1} students without silent truncation.`);
  } else {
    console.error('❌ FAIL: CSV export lines mismatch:', csvLines.length);
  }

  // -------------------------------------------------------------
  // TEST SCENARIO 5: CSV EXPORT UNSCOPED WITH 301+ STUDENTS
  // -------------------------------------------------------------
  console.log('\n--- SCENARIO 5: CSV export unscoped with 301+ students ---');
  const unscopedCsvRes = await apiCall(`/student-attendance/monthly-summary?sessionId=${activeSession._id}&month=${month}&format=csv`);
  console.log('Unscoped CSV Export status code:', unscopedCsvRes.status);
  if (unscopedCsvRes.status === 400) {
    console.log('✅ PASS: Unscoped CSV export safely rejected with 400 MONTHLY_REPORT_SCOPE_REQUIRED.');
  } else {
    console.error('❌ FAIL: Unscoped CSV export was not rejected:', unscopedCsvRes);
  }

  // -------------------------------------------------------------
  // TEST SCENARIO 6: TENANT ISOLATION
  // -------------------------------------------------------------
  console.log('\n--- SCENARIO 6: Tenant isolation for monthly summary ---');
  const foreignRes = await apiCall(`/student-attendance/monthly-summary?sessionId=${activeSession._id}&classId=507f1f77bcf86cd799439011&month=${month}`);
  console.log('Foreign class monthly status:', foreignRes.status);
  const foreignData = foreignRes.body?.data;
  console.log('Foreign class students count:', foreignData?.rows?.length);
  if (foreignData?.rows?.length === 0) {
    console.log('✅ PASS: Foreign class returns 0 students (tenant isolation intact).');
  } else {
    console.error('❌ FAIL: Foreign class returned students:', foreignData);
  }

  console.log('\n==================================================');
  console.log('SCALE & DATA-CORRECTNESS VERIFICATION COMPLETE');
  console.log('==================================================');
}

runScaleTests().catch(err => {
  console.error('Scale test error:', err);
  process.exit(1);
});
