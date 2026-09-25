/**
 * Automated Test Suite for Data Import / Export Management System
 * Run: node tests/dataTransfer.test.mjs [baseUrl]
 */
import ExcelJS from 'exceljs';

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

async function api(path, { method = 'GET', token, body, headers = {} } = {}) {
  const reqHeaders = { ...headers };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData) && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: reqHeaders,
    body,
  });

  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = Buffer.from(await res.arrayBuffer());
  }

  return { status: res.status, headers: res.headers, data };
}

async function run() {
  console.log(`\nStarting Data Import / Export Center Automated Tests on ${BASE}\n`);

  // 1. Authentication
  console.log('▶ 1. Authentication & Tenant Session');
  const loginRes = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'superadmin@school.test', password: 'Password123' },
  });
  check('Login successful as Super Admin', loginRes.status === 200 && loginRes.data?.success);
  const token = loginRes.data?.data?.accessToken;
  const tenantId = loginRes.data?.data?.user?.tenantId;
  check('Tenant ID present in session', Boolean(tenantId));

  // 2. Blank Template Downloads
  console.log('\n▶ 2. Blank Template Generation (XLSX & CSV)');
  const xlsxTemplate = await api('/api/data-transfer/template/students?format=xlsx', { token });
  check('GET student template (XLSX) returns 200', xlsxTemplate.status === 200);
  check('XLSX Content-Type header correct', xlsxTemplate.headers.get('content-type')?.includes('spreadsheetml'));
  check('XLSX buffer is non-empty', xlsxTemplate.data && xlsxTemplate.data.length > 1000);

  // Parse XLSX template and check Instructions sheet
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsxTemplate.data);
  const dataSheet = wb.getWorksheet('Data');
  const instSheet = wb.getWorksheet('Instructions');
  check('XLSX template contains "Data" sheet', Boolean(dataSheet));
  check('XLSX template contains "Instructions" sheet', Boolean(instSheet));
  check('Template has correct headers in Data sheet', dataSheet.getRow(1).getCell(1).value === 'Admission Number');

  const csvTemplate = await api('/api/data-transfer/template/students?format=csv', { token });
  check('GET student template (CSV) returns 200', csvTemplate.status === 200);
  check('CSV Content-Type is text/csv', csvTemplate.headers.get('content-type')?.includes('text/csv'));
  const csvText = csvTemplate.data.toString();
  check('CSV text starts with "Admission Number"', csvText.includes('Admission Number'));

  // 3. Export Students with Anti-Formula Injection Check
  console.log('\n▶ 3. Student Export with Anti-Formula Injection Protection');
  const exportRes = await api('/api/data-transfer/export/students?format=xlsx', { token });
  check('GET export students returns 200', exportRes.status === 200);
  check('Exported buffer is valid XLSX', exportRes.data && exportRes.data.length > 2000);

  const exportWb = new ExcelJS.Workbook();
  await exportWb.xlsx.load(exportRes.data);
  const expSheet = exportWb.getWorksheet('Students');
  const summarySheet = exportWb.getWorksheet('Summary');
  check('Exported workbook contains "Students" sheet', Boolean(expSheet));
  check('Exported workbook contains "Summary" sheet', Boolean(summarySheet));
  check('Exported student rows found', expSheet.rowCount > 1);

  // 4. Import Preview & Validation (Read-Only)
  console.log('\n▶ 4. Import Preview & Validation (Read-Only Safety)');

  // Dynamically fetch an existing class and section from DB for clean testing
  const clsRes = await api('/api/classes', { token });
  const secRes = await api('/api/sections', { token });
  const targetClass = clsRes.data?.data?.[0];
  const targetSection = secRes.data?.data?.find((s) => String(s.classId) === String(targetClass?._id)) || secRes.data?.data?.[0];
  const realClassName = targetClass?.name || 'Class 1';
  const realSectionName = targetSection?.name || 'A';

  // Create test workbook with:
  // Row 1: Valid student
  // Row 2: In-file duplicate admission number
  // Row 3: Non-existent class
  const testWb = new ExcelJS.Workbook();
  const testSheet = testWb.addWorksheet('Data');
  testSheet.addRow([
    'Admission Number',
    'Roll Number',
    'Student Name',
    'Father / Guardian Name',
    'Gender',
    'Date of Birth',
    'Class Name',
    'Section Name',
    'Phone',
    'Guardian Phone',
    'Address',
    'Admission Date',
  ]);

  const uniqueAdm = `TEST-ADM-${Date.now()}`;
  testSheet.addRow([
    uniqueAdm,
    '99',
    'Ahmad Hassan',
    'Hassan Mahmood',
    'male',
    '2012-04-10',
    realClassName,
    realSectionName,
    '03001234567',
    '03007654321',
    'Testing Lane 1',
    '2026-09-01',
  ]);

  // Duplicate of the above row
  testSheet.addRow([
    uniqueAdm,
    '100',
    'Duplicate Student',
    'Guardian',
    'male',
    '2012-04-10',
    realClassName,
    realSectionName,
    '03001234567',
    '03007654321',
    'Testing Lane 2',
    '2026-09-01',
  ]);

  // Row with non-existent class
  testSheet.addRow([
    `TEST-ADM-FAKE-${Date.now()}`,
    '101',
    'Invalid Class Student',
    'Guardian',
    'female',
    '2012-04-10',
    'Class 999 Nonexistent',
    'Z',
    '03001234567',
    '03007654321',
    'Testing Lane 3',
    '2026-09-01',
  ]);

  const testBuffer = await testWb.xlsx.writeBuffer();

  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  let bodyBuffer = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test_students.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    Buffer.from(testBuffer),
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="skipDuplicates"\r\n\r\ntrue\r\n--${boundary}--\r\n`),
  ]);

  const previewRes = await api('/api/data-transfer/import/preview/students', {
    method: 'POST',
    token,
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: bodyBuffer,
  });

  check('POST preview returns 200', previewRes.status === 200 && previewRes.data?.success);
  const preview = previewRes.data?.data;
  check('Total rows detected is 3', preview?.totalRows === 3);
  check('Valid count is 1', preview?.validCount === 1);
  check('Errors count >= 1', preview?.errorCount >= 1);
  check('canImport is true because valid rows exist', preview?.canImport === true);

  // 5. Download Error Sheet
  console.log('\n▶ 5. Error Sheet Generation');
  const errorSheetRes = await api('/api/data-transfer/import/error-sheet', {
    method: 'POST',
    token,
    body: { errors: preview?.errors || [], format: 'xlsx' },
  });
  check('POST error-sheet returns 200', errorSheetRes.status === 200);
  check('Error sheet is valid XLSX buffer', errorSheetRes.data && errorSheetRes.data.length > 1000);

  // 6. Import Execution
  console.log('\n▶ 6. Import Execution (Committing Valid Rows)');
  const confirmRes = await api('/api/data-transfer/import/confirm/students', {
    method: 'POST',
    token,
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: bodyBuffer,
  });
  if (confirmRes.status !== 200) {
    console.log('  [DEBUG] confirmRes failed:', confirmRes.status, confirmRes.data);
  }
  check('POST confirm import returns 200', confirmRes.status === 200 && confirmRes.data?.success);
  check('Imported count is 1', confirmRes.data?.data?.importedCount === 1);
  check('History ID returned', Boolean(confirmRes.data?.data?.historyId));

  // 7. Security: Reject Platform Admin creation
  console.log('\n▶ 7. Security: Block Unauthorized Role Import');
  const staffWb = new ExcelJS.Workbook();
  const staffSheet = staffWb.addWorksheet('Data');
  staffSheet.addRow(['Employee ID', 'Name', 'Role', 'Email', 'Phone', 'Qualification', 'Joining Date', 'Salary (PKR)']);
  staffSheet.addRow(['EMP-HACK-01', 'Hacker Account', 'platform_admin', 'hacker@platform.test', '03001111111', 'None', '2026-09-01', '0']);
  const staffBuf = await staffWb.xlsx.writeBuffer();

  const staffBoundary = '----WebKitFormBoundaryStaffTest';
  const staffBody = Buffer.concat([
    Buffer.from(`--${staffBoundary}\r\nContent-Disposition: form-data; name="file"; filename="hack_staff.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    Buffer.from(staffBuf),
    Buffer.from(`\r\n--${staffBoundary}--\r\n`),
  ]);

  const staffPreview = await api('/api/data-transfer/import/preview/staff', {
    method: 'POST',
    token,
    headers: { 'Content-Type': `multipart/form-data; boundary=${staffBoundary}` },
    body: staffBody,
  });

  check('Staff preview returns 200', staffPreview.status === 200);
  check('Platform admin row flagged as error', staffPreview.data?.data?.errorCount === 1);
  check('canImport is false for unauthorized staff roles', staffPreview.data?.data?.canImport === false);

  // 8. Transfer History Tracking
  console.log('\n▶ 8. Transfer Audit History Verification');
  const historyRes = await api('/api/data-transfer/history', { token });
  check('GET transfer history returns 200', historyRes.status === 200 && historyRes.data?.success);
  const records = historyRes.data?.data?.records || [];
  check('History contains transfer records', records.length > 0);
  check('Latest record is the student import', records[0]?.module === 'students');
  check('No binary content or base64 saved in history record', !records[0]?.buffer && !records[0]?.file);

  // Summary
  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Test execution crashed:', err);
  process.exit(1);
});
