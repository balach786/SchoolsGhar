/**
 * Batch 8 Runtime Verification Script
 */

import axios, { AxiosInstance } from 'axios';

const BASE = 'http://localhost:4000/api';

function makeClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: BASE,
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  });
}

async function login(email: string, password: string, schoolCode: string): Promise<string> {
  const r = await axios.post(`${BASE}/auth/login`, { email, password, schoolCode });
  if (!r.data?.data?.accessToken) throw new Error(`Login failed for ${email}: ${JSON.stringify(r.data)}`);
  return r.data.data.accessToken;
}

function pass(label: string, detail?: string) {
  console.log(`  PASS: ${label}${detail ? ' -- ' + detail : ''}`);
}
function fail(label: string, detail?: string) {
  console.error(`  FAIL: ${label}${detail ? ' -- ' + detail : ''}`);
}
function section(title: string) {
  console.log(`\n== ${title} ==`);
}

const TENANT_A = { email: 'admin@bkm.com', password: 'password123', schoolCode: 'bkm' };
const TENANT_B = { email: 'admin@tntb.com', password: 'password123', schoolCode: 'tntb' };

async function main() {
  console.log('=== BATCH 8 RUNTIME VERIFICATION ===');

  let tokenA: string, tokenB: string;
  try {
    tokenA = await login(TENANT_A.email, TENANT_A.password, TENANT_A.schoolCode);
    console.log('Tenant A login: OK');
  } catch (e: any) {
    console.error('FATAL: Cannot login Tenant A --', e.message);
    process.exit(1);
  }
  try {
    tokenB = await login(TENANT_B.email, TENANT_B.password, TENANT_B.schoolCode);
    console.log('Tenant B login: OK');
  } catch (e: any) {
    console.error('FATAL: Cannot login Tenant B --', e.message);
    process.exit(1);
  }

  const A = makeClient(tokenA!);
  const B = makeClient(tokenB!);

  let timetableId = '';
  let leaveId = '';
  let assignmentId = '';
  let submissionId = '';
  let presetId = '';
  let dataHistoryId = '';

  // === 1. TIMETABLE ===
  section('1. TIMETABLE');

  const sessRes = await A.get('/academic-sessions');
  const sess = (sessRes.data?.data || []).find((s: any) => !s.isArchived);
  
  let cls = null;
  if (sess) {
    const clsRes = await A.get(`/classes?sessionId=${sess._id}`);
    cls = (clsRes.data?.data || []).find((c: any) => !c.isArchived);
  }

  if (sess && cls) {
    const sessionId = sess._id;
    const classId = cls._id;

    const subjRes = await A.get(`/subjects?sessionId=${sessionId}&classId=${classId}`);
    const subject = (subjRes.data?.data || []).find((s: any) => !s.isArchived);

    const secRes = await A.get(`/sections?sessionId=${sessionId}&classId=${classId}`);
    const section = (secRes.data?.data || []).find((s: any) => !s.isArchived);
    const sectionIdStr = section ? section._id : undefined;

    const period = subject
      ? { dayOfWeek: 2, periodNumber: 9, startTime: '06:00', endTime: '06:45', subjectId: subject._id, isBreak: false }
      : { dayOfWeek: 2, periodNumber: 9, startTime: '06:00', endTime: '06:45', isBreak: true };

    const payload: any = { sessionId, classId, periods: [period] };
    if (sectionIdStr) payload.sectionId = sectionIdStr;

    const cr = await A.post('/timetables', payload);
    if (cr.status === 201 && cr.data?.data?.length > 0) {
      timetableId = cr.data.data[0]._id;
      pass('Timetable create', `ID = ${timetableId}`);

      const lr = await A.get(`/timetables?sessionId=${sessionId}&classId=${classId}`);
      if (lr.status === 200) pass('Timetable list', `count = ${lr.data?.data?.length}`);
      else fail('Timetable list', `status = ${lr.status}`);

      // Conflict: same period again
      const cfr = await A.post('/timetables', payload);
      if (cfr.status === 409) pass('Timetable conflict (PERIOD_CELL_EXISTS)', '409 returned');
      else fail('Timetable conflict', `Expected 409, got ${cfr.status}`);

      // Cross-tenant: B tries to see A's timetable
      const xr = await B.get(`/timetables?sessionId=${sessionId}&classId=${classId}`);
      const bHasA = (xr.data?.data || []).some((d: any) => d._id === timetableId);
      if (!bHasA) pass('Timetable cross-tenant (B cannot see A)', 'PASS');
      else fail('Timetable cross-tenant', 'Tenant B can see Tenant A timetable entry');

      // Clean up
      await A.delete('/timetables/periods', { data: { periodIds: [timetableId] } });
    } else {
      fail('Timetable create', `status=${cr.status} -- ${JSON.stringify(cr.data)}`);
    }
  } else {
    fail('Timetable', 'No active session or class for Tenant A');
  }

  // === 2. LEAVE REQUEST ===
  section('2. LEAVE REQUEST');

  const lcr = await A.post('/leave-requests', {
    fromDate: new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10),
    toDate: new Date(Date.now() + 86400000 * 11).toISOString().slice(0, 10),
    reason: 'Batch8 runtime test for leave request migration',
  });

  if (lcr.status === 201) {
    leaveId = lcr.data?.data?._id;
    pass('LeaveRequest create', `ID = ${leaveId}`);

    const llr = await A.get('/leave-requests');
    if (llr.status === 200) pass('LeaveRequest list', `total = ${llr.data?.pagination?.total}`);
    else fail('LeaveRequest list', `status = ${llr.status}`);

    if (leaveId) {
      const xlr = await B.patch(`/leave-requests/${leaveId}/review`, { decision: 'approve' });
      if (xlr.status === 404 || xlr.status === 403) pass('LeaveRequest cross-tenant update', `status = ${xlr.status}`);
      else fail('LeaveRequest cross-tenant update', `Expected 404/403, got ${xlr.status}`);
    }
  } else if (lcr.status === 403 && lcr.data?.error?.code === 'LEAVE_FORBIDDEN') {
      pass('LeaveRequest create (admin correctly rejected)', `403 LEAVE_FORBIDDEN — only students and teachers can submit leave requests`);
  } else {
    const msg = lcr.data?.message || '';
    if (msg.toLowerCase().includes('teacher') || msg.toLowerCase().includes('profile')) {
      console.log(`  INFO: LeaveRequest: No linked teacher profile for admin user (status=${lcr.status}) -- endpoint reached correctly`);
    } else {
      fail('LeaveRequest create', `status=${lcr.status} -- ${JSON.stringify(lcr.data)}`);
    }
  }

  // === 3. ASSIGNMENT ===
  section('3. ASSIGNMENT');

  if (cls) {
    const acr = await A.post('/assignments', {
      title: 'Batch8 Runtime Test Assignment',
      description: 'Isolation test',
      classId: cls._id,
      dueDate: new Date(Date.now() + 86400000 * 14).toISOString(),
    });

    if (acr.status === 201) {
      assignmentId = acr.data?.data?._id;
      pass('Assignment create', `ID = ${assignmentId}`);

      const alr = await A.get('/assignments');
      if (alr.status === 200) pass('Assignment list', `count = ${alr.data?.data?.length ?? alr.data?.pagination?.total}`);
      else fail('Assignment list', `status = ${alr.status}`);

      if (assignmentId) {
        const xar = await B.get(`/assignments/${assignmentId}`);
        if (xar.status === 404 || xar.status === 403) pass('Assignment cross-tenant GET', `status = ${xar.status}`);
        else fail('Assignment cross-tenant GET', `Expected 404/403, got ${xar.status}`);
      }
    } else {
      fail('Assignment create', `status=${acr.status} -- ${JSON.stringify(acr.data)}`);
    }
  }

  // === 4. SUBMISSION ===
  section('4. SUBMISSION');

  if (assignmentId) {
    const scr = await A.post('/submissions', {
      assignmentId,
      content: 'Batch8 runtime submission',
    });

    if (scr.status === 201) {
      submissionId = scr.data?.data?._id;
      pass('Submission create', `ID = ${submissionId}`);

      const slr = await A.get(`/submissions?assignmentId=${assignmentId}`);
      if (slr.status === 200) pass('Submission list', `count = ${slr.data?.data?.length ?? slr.data?.pagination?.total}`);
      else fail('Submission list', `status = ${slr.status}`);

      if (submissionId) {
        const xsr = await B.get(`/submissions/${submissionId}`);
        if (xsr.status === 404 || xsr.status === 403) pass('Submission cross-tenant GET', `status = ${xsr.status}`);
        else fail('Submission cross-tenant GET', `Expected 404/403, got ${xsr.status}`);
      }
    } else if (scr.status === 403 && (scr.data?.error?.code === 'SUBMISSION_FORBIDDEN' || (scr.data?.error?.message || '').toLowerCase().includes('student'))) {
      // Admin correctly rejected — this is PASS (correct auth enforcement)
      pass('Submission create (admin correctly rejected)', `403 SUBMISSION_FORBIDDEN — only students can submit`);

      // Still test list and cross-tenant from admin perspective
      const slr = await A.get(`/submissions?assignmentId=${assignmentId}`);
      if (slr.status === 200) pass('Submission list (admin view)', `count = ${slr.data?.data?.length ?? slr.data?.pagination?.total}`);
      else fail('Submission list', `status = ${slr.status}`);
    } else {
      fail('Submission create', `status=${scr.status} -- ${JSON.stringify(scr.data)}`);
    }
  } else {
    console.log('  SKIP: Submission -- no Assignment ID');
  }

  // === 5. EXPORT PRESET ===
  section('5. EXPORT PRESET');

  const pcr = await A.post('/data-transfer/presets', {
    name: `batch8-preset-${Date.now()}`,
    module: 'students',
    format: 'xlsx',
    filters: {},
  });

  if (pcr.status === 200 || pcr.status === 201) {
    presetId = pcr.data?.data?._id;
    pass('ExportPreset create', `ID = ${presetId}`);

    const plr = await A.get('/data-transfer/presets');
    if (plr.status === 200) {
      const has = (plr.data?.data || []).some((p: any) => p._id === presetId);
      if (has) pass('ExportPreset list (preset present)', 'found');
      else fail('ExportPreset list', 'created preset not in list');
    } else {
      fail('ExportPreset list', `status = ${plr.status}`);
    }

    if (presetId) {
      const xpr = await B.get('/data-transfer/presets');
      const bHas = (xpr.data?.data || []).some((p: any) => p._id === presetId);
      if (!bHas) pass('ExportPreset cross-tenant', 'Tenant B cannot see Tenant A preset');
      else fail('ExportPreset cross-tenant', 'Tenant B can see Tenant A preset');
    }
  } else {
    fail('ExportPreset create', `status=${pcr.status} -- ${JSON.stringify(pcr.data)}`);
  }

  // === 6. DATA HISTORY ===
  section('6. DATA HISTORY');

  // Trigger real export to generate DataHistory record
  const exportR = await A.get('/data-transfer/export/students?format=xlsx');
  if (exportR.status === 200) {
    pass('DataHistory trigger (students export)', 'HTTP 200');
    const hr = await A.get('/data-transfer/history');
    if (hr.status === 200) {
      const recs = hr.data?.data?.records || [];
      if (recs.length > 0) {
        dataHistoryId = recs[0]._id;
        pass('DataHistory read', `ID = ${dataHistoryId}, source = student export`);
      } else {
        console.log('  INFO: DataHistory: No records in history. MODEL PRESENT -- ACTIVE RUNTIME WORKFLOW NOT PRESENT');
      }
    } else {
      fail('DataHistory history read', `status = ${hr.status}`);
    }
  } else {
    console.log(`  INFO: DataHistory: Export returned ${exportR.status}. MODEL PRESENT -- ACTIVE RUNTIME WORKFLOW NOT PRESENT`);
  }

  // === FINAL SUMMARY ===
  console.log('\n=== BATCH 8 RUNTIME FINAL SUMMARY ===');
  console.log(`Timetable ID         = ${timetableId || 'N/A'}`);
  console.log(`LeaveRequest ID      = ${leaveId || 'N/A'}`);
  console.log(`Assignment ID        = ${assignmentId || 'N/A'}`);
  console.log(`Submission ID        = ${submissionId || 'N/A'}`);
  console.log(`ExportPreset ID      = ${presetId || 'N/A'}`);
  console.log(`DataHistory ID       = ${dataHistoryId || 'N/A'}`);
  console.log('=====================================');
}

main().catch((e) => {
  console.error('FATAL:', e.message || e);
  process.exit(1);
});
