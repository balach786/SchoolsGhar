/**
 * Phase 4 integration tests — attendance (student + teacher) and timetable.
 * Requires a fresh server (rate limits) with the dev seed applied.
 *   node tests/attendance.test.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:4000';

let passed = 0;
let failed = 0;
function check(name, condition, extra = '') {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json, headers: res.headers };
}

async function login(email, password = 'Password123') {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  return { status: r.status, token: r.body?.data?.accessToken, user: r.body?.data?.user };
}

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);

async function run() {
  console.log(`\nPhase 4 — Attendance & Timetable tests against ${BASE}\n`);

  const admin = await login('admin@school.test');
  const teacher = await login('teacher@school.test');
  const student = await login('student@school.test');
  const receptionist = await login('receptionist@school.test');
  const accountant = await login('accountant@school.test');
  check('admin login', admin.status === 200);
  check('teacher login', teacher.status === 200);
  check('student login', student.status === 200);
  check('receptionist login', receptionist.status === 200);

  // ── Discover seed data ────────────────────────────────
  console.log('▶ Setup (discover seed data)');
  const activeS = await api('/api/academic-sessions/active', { token: admin.token });
  const sessionId = activeS.body.data._id;
  const classes = (await api(`/api/classes?sessionId=${sessionId}&limit=50`, { token: admin.token })).body.data;
  const grade1 = classes.find((c) => c.name === 'Grade 1');
  const grade2 = classes.find((c) => c.name === 'Grade 2');
  const sections = (await api('/api/classes', { token: admin.token })).body.data;
  const g1 = await api(`/api/classes/${grade1._id}`, { token: admin.token });
  const g1sections = g1.body.data.sections ?? [];
  const secA = g1sections.find((s) => s.name === 'A');
  const secB = g1sections.find((s) => s.name === 'B');
  const g2sec = (await api(`/api/classes/${grade2._id}`, { token: admin.token })).body.data.sections?.[0];
  const studentsA = (await api(`/api/students?sessionId=${sessionId}&classId=${grade1._id}&sectionId=${secA._id}&limit=50`, { token: admin.token })).body.data;
  const bilal = studentsA.find((s) => s.fullName.startsWith('Bilal'));
  const other = studentsA.find((s) => !s.fullName.startsWith('Bilal'));
  const teachers = (await api('/api/teachers?limit=50', { token: admin.token })).body.data;
  const ahmed = teachers.find((t) => t.employeeId === 'T-1001');
  const fatima = teachers.find((t) => t.employeeId === 'T-1002');
  const subjects = (await api('/api/subjects', { token: admin.token })).body.data;
  const mth = subjects.find((s) => s.code === 'MTH');
  const eng = subjects.find((s) => s.code === 'ENG');
  check('seed context resolved', grade1 && secA && bilal && ahmed && mth && eng);

  // ── Student attendance ────────────────────────────────
  console.log('▶ Student attendance');
  const todayIso = iso(today);
  const markBody = (sectionId, studentIds) => ({
    sessionId, classId: grade1._id, sectionId, attendanceDate: todayIso,
    records: studentIds.map((sid, i) => ({ studentId: sid, status: i % 3 === 0 ? 'absent' : 'present' })),
  });

  // Teacher marks own class (Grade 1 A — class teacher + MTH)
  const mark1 = await api('/api/student-attendance/bulk', { method: 'POST', token: teacher.token, body: { ...markBody(secA._id, studentsA.map((s) => s._id)), overwrite: true } });
  check('teacher marks own class → 200', mark1.status === 200, `(${mark1.status})`);

  // Duplicate prevention
  const dup = await api('/api/student-attendance/bulk', { method: 'POST', token: teacher.token, body: markBody(secA._id, studentsA.map((s) => s._id)) });
  check('duplicate same-day marking → 409', dup.status === 409 && dup.body.error?.code === 'ATTENDANCE_ALREADY_MARKED', `(${dup.status} ${dup.body?.error?.code})`);

  // Overwrite allowed
  const overwrite = await api('/api/student-attendance/bulk', { method: 'POST', token: teacher.token, body: { ...markBody(secA._id, studentsA.map((s) => s._id)), overwrite: true } });
  check('overwrite same-day marking → 200', overwrite.status === 200);

  // Receptionist marks Grade 1 B
  const studentsB = (await api(`/api/students?sessionId=${sessionId}&classId=${grade1._id}&sectionId=${secB._id}&limit=50`, { token: admin.token })).body.data;
  const markB = await api('/api/student-attendance/bulk', { method: 'POST', token: receptionist.token, body: { ...markBody(secB._id, studentsB.map((s) => s._id)), overwrite: true } });
  check('receptionist marks any section → 200', markB.status === 200, `(${markB.status})`);

  // Future date rejected
  const future = new Date(); future.setDate(future.getDate() + 2);
  const futureMark = await api('/api/student-attendance/bulk', { method: 'POST', token: admin.token, body: { ...markBody(secA._id, [bilal._id]), attendanceDate: iso(future) } });
  check('future date rejected → 400', futureMark.status === 400 && futureMark.body.error?.code === 'FUTURE_DATE');

  // Wrong-section student rejected
  const badStudent = await api('/api/student-attendance/bulk', { method: 'POST', token: admin.token, body: { ...markBody(secA._id, [studentsB[0]?._id].filter(Boolean)), attendanceDate: iso(new Date(today.getTime() - 86400000)) } });
  check('student outside section rejected → 400', badStudent.status === 400 && badStudent.body.error?.code === 'INVALID_STUDENT_LIST', `(${badStudent.status} ${badStudent.body?.error?.code})`);

  // Teacher cannot mark unassigned class: create a fresh class+section
  const ts = Date.now().toString().slice(-8);
  const newClass = await api('/api/classes', { method: 'POST', token: admin.token, body: { name: `TT-${ts}`, sessionId, isActive: true } });
  const newSection = await api('/api/sections', { method: 'POST', token: admin.token, body: { name: `TS-${ts}`, classId: newClass.body.data._id, sessionId, isActive: true } });
  check('test class+section created', newClass.status === 201 && newSection.status === 201);
  const foreignMark = await api('/api/student-attendance/bulk', { method: 'POST', token: teacher.token, body: { sessionId, classId: newClass.body.data._id, sectionId: newSection.body.data._id, attendanceDate: todayIso, records: [{ studentId: bilal._id, status: 'present' }] } });
  check('teacher blocked from unassigned class → 403', foreignMark.status === 403, `(${foreignMark.status})`);

  // Student sees own records only
  const studentList = await api('/api/student-attendance?limit=100', { token: student.token });
  const allOwn = studentList.status === 200 && studentList.body.data.length > 0 && studentList.body.data.every((r) => r.studentId === bilal._id);
  check('student list = own records only', allOwn);

  // Student cannot edit
  const recs = studentList.body.data;
  const studentEdit = await api(`/api/student-attendance/records/${recs[0]._id}`, { method: 'PATCH', token: student.token, body: { status: 'absent' } });
  check('student cannot edit attendance → 403', studentEdit.status === 403);

  // Student cannot view another student's record
  const othersRec = (await api(`/api/student-attendance?studentId=${other._id}&limit=1`, { token: admin.token })).body.data[0];
  const foreignRec = await api(`/api/student-attendance/records/${othersRec._id}`, { token: student.token });
  check("student cannot view other's record → 403", foreignRec.status === 403);

  // Accountant has no attendance access
  const accList = await api('/api/student-attendance', { token: accountant.token });
  check('accountant blocked from attendance → 403', accList.status === 403);

  // Pagination
  const p1 = await api(`/api/student-attendance?sessionId=${sessionId}&limit=2`, { token: admin.token });
  check('pagination: limit respected', p1.status === 200 && p1.body.data.length === 2 && p1.body.pagination.limit === 2);
  const p2 = await api(`/api/student-attendance?sessionId=${sessionId}&limit=2&page=2`, { token: admin.token });
  check('pagination: page 2 works', p2.status === 200 && p2.body.pagination.page === 2);

  // Summary (class-section rollup)
  const sum = await api(`/api/student-attendance/summary?sessionId=${sessionId}&from=${todayIso}&to=${todayIso}`, { token: admin.token });
  const g1row = sum.body.data?.find((r) => String(r.classId) === String(grade1._id) && String(r.sectionId) === String(secA._id));
  check('summary has Grade 1 A row with totals', sum.status === 200 && g1row && g1row.total > 0);

  // Per-student summary
  const stSum = await api(`/api/student-attendance/student-summary?studentId=${bilal._id}&from=${todayIso}&to=${todayIso}`, { token: admin.token });
  check('student-summary returns totals', stSum.status === 200 && stSum.body.data.total >= 1);
  const stSumOwn = await api(`/api/student-attendance/student-summary?studentId=${bilal._id}&from=${todayIso}&to=${todayIso}`, { token: student.token });
  check('student can fetch own summary', stSumOwn.status === 200);
  const stSumOther = await api(`/api/student-attendance/student-summary?studentId=${other._id}&from=${todayIso}&to=${todayIso}`, { token: student.token });
  check("student cannot fetch other's summary → 403", stSumOther.status === 403);

  // CSV export
  const csv = await api(`/api/student-attendance/download?sessionId=${sessionId}&from=${todayIso}&to=${todayIso}`, { token: admin.token });
  check('CSV export → 200 text/csv', csv.status === 200 && (csv.headers.get('content-type') || '').includes('text/csv'));

  // ── Teacher attendance ────────────────────────────────
  console.log('▶ Teacher attendance');
  const tBody = { attendanceDate: todayIso, records: [{ teacherId: ahmed._id, status: 'present' }, { teacherId: fatima._id, status: 'late' }] };
  const tMark = await api('/api/teacher-attendance/bulk', { method: 'POST', token: admin.token, body: { ...tBody, overwrite: true } });
  check('admin marks teacher attendance → 200', tMark.status === 200, `(${tMark.status})`);
  const tDup = await api('/api/teacher-attendance/bulk', { method: 'POST', token: admin.token, body: tBody });
  check('duplicate teacher attendance → 409', tDup.status === 409);
  const tMarkB = await api('/api/teacher-attendance/bulk', { method: 'POST', token: receptionist.token, body: { ...tBody, overwrite: true } });
  check('receptionist marks teacher attendance → 200', tMarkB.status === 200);

  const tList = await api(`/api/teacher-attendance?from=${todayIso}&to=${todayIso}&limit=50`, { token: teacher.token });
  const tAllOwn = tList.status === 200 && tList.body.data.length > 0 && tList.body.data.every((r) => r.teacherId === ahmed._id);
  check('teacher list = own records only', tAllOwn);
  const fatimaRec = (await api(`/api/teacher-attendance?teacherId=${fatima._id}&limit=1`, { token: admin.token })).body.data[0];
  const tForeign = await api(`/api/teacher-attendance/records/${fatimaRec._id}`, { token: teacher.token });
  check("teacher cannot view other's teacher-attendance → 403", tForeign.status === 403);
  const tEdit = await api(`/api/teacher-attendance/records/${fatimaRec._id}`, { method: 'PATCH', token: teacher.token, body: { status: 'absent' } });
  check('teacher cannot edit teacher attendance → 403', tEdit.status === 403);
  const tSum = await api(`/api/teacher-attendance/summary?from=${todayIso}&to=${todayIso}`, { token: admin.token });
  check('teacher summary works', tSum.status === 200 && tSum.body.data.length >= 2);
  const tCsv = await api(`/api/teacher-attendance/download?from=${todayIso}&to=${todayIso}`, { token: admin.token });
  check('teacher CSV export → 200', tCsv.status === 200);

  // ── Timetable ─────────────────────────────────────────
  console.log('▶ Timetable');
  // Reset any previous Grade 1 A periods for idempotency
  const existingTT = await api(`/api/timetables?sessionId=${sessionId}&classId=${grade1._id}&sectionId=${secA._id}`, { token: admin.token });
  if (existingTT.body.data?.length) {
    await api('/api/timetables/periods', { method: 'DELETE', token: admin.token, body: { periodIds: existingTT.body.data.map((p) => p._id) } });
  }

  const createTT = await api('/api/timetables', { method: 'POST', token: admin.token, body: {
    sessionId, classId: grade1._id, sectionId: secA._id,
    periods: [
      { dayOfWeek: 1, periodNumber: 1, startTime: '08:00', endTime: '08:45', subjectId: mth._id, teacherId: ahmed._id },
      { dayOfWeek: 1, periodNumber: 2, startTime: '08:45', endTime: '09:30', subjectId: eng._id, teacherId: fatima._id },
      { dayOfWeek: 1, periodNumber: 3, startTime: '09:30', endTime: '10:15', isBreak: true },
      { dayOfWeek: 1, periodNumber: 4, startTime: '10:15', endTime: '11:00', subjectId: mth._id, teacherId: ahmed._id },
    ],
  } });
  check('create timetable → 201 (4 periods)', createTT.status === 201 && createTT.body.data.length === 4, `(${createTT.status})`);

  const cellDup = await api('/api/timetables', { method: 'POST', token: admin.token, body: {
    sessionId, classId: grade1._id, sectionId: secA._id,
    periods: [{ dayOfWeek: 1, periodNumber: 1, startTime: '08:00', endTime: '08:45', subjectId: mth._id, teacherId: ahmed._id }],
  } });
  check('duplicate cell → 409', cellDup.status === 409 && cellDup.body.error?.code === 'PERIOD_CELL_EXISTS');

  // Teacher double-booking: Grade 2 A period 2 with Ahmed while Ahmed teaches Grade 1 A P2
  const g2tt = await api('/api/timetables', { method: 'POST', token: admin.token, body: {
    sessionId, classId: grade2._id, sectionId: g2sec._id,
    periods: [
      { dayOfWeek: 1, periodNumber: 1, startTime: '08:00', endTime: '08:45', subjectId: mth._id, teacherId: fatima._id },
      { dayOfWeek: 1, periodNumber: 2, startTime: '08:45', endTime: '09:30', subjectId: mth._id, teacherId: ahmed._id },
    ],
  } });
  check('Grade 2 timetable created', g2tt.status === 201, `(${g2tt.status})`);
  const tConflict = await api('/api/timetables', { method: 'POST', token: admin.token, body: {
    sessionId, classId: grade2._id, sectionId: g2sec._id,
    periods: [{ dayOfWeek: 1, periodNumber: 3, startTime: '08:50', endTime: '09:20', subjectId: eng._id, teacherId: ahmed._id }],
  } });
  check('teacher double-booked → 409', tConflict.status === 409 && tConflict.body.error?.code === 'TEACHER_TIME_CONFLICT');

  // Class double-booking: Grade 1 B same time as Grade 1 A P1
  const cConflict = await api('/api/timetables', { method: 'POST', token: admin.token, body: {
    sessionId, classId: grade1._id, sectionId: secB._id,
    periods: [{ dayOfWeek: 1, periodNumber: 1, startTime: '08:00', endTime: '08:45', subjectId: eng._id }],
  } });
  check('class double-booked → 409', cConflict.status === 409 && cConflict.body.error?.code === 'CLASS_TIME_CONFLICT');

  // Break with teacher → 400
  const breakBad = await api('/api/timetables', { method: 'POST', token: admin.token, body: {
    sessionId, classId: grade1._id, sectionId: secB._id,
    periods: [{ dayOfWeek: 2, periodNumber: 1, startTime: '08:00', endTime: '08:45', isBreak: true, teacherId: ahmed._id }],
  } });
  check('break with teacher → 400', breakBad.status === 400 && breakBad.body.error?.code === 'BREAK_PERIOD_INVALID');

  // No subject → 400
  const noSubj = await api('/api/timetables', { method: 'POST', token: admin.token, body: {
    sessionId, classId: grade1._id, sectionId: secB._id,
    periods: [{ dayOfWeek: 2, periodNumber: 1, startTime: '08:00', endTime: '08:45' }],
  } });
  check('period without subject → 400', noSubj.status === 400);

  // Swap conflict: Ahmed is in Grade 2 A P2 (08:45-09:30). Swapping Grade 1 A P1/P2 moves Ahmed to 08:45 → conflict.
  const swapFail = await api('/api/timetables/swap', { method: 'POST', token: admin.token, body: { sessionId, classId: grade1._id, sectionId: secA._id, dayOfWeek: 1, periodA: 1, periodB: 2 } });
  check('swap with teacher conflict → 409', swapFail.status === 409 && swapFail.body.error?.code === 'TEACHER_TIME_CONFLICT');

  // Free Ahmed's Grade 2 periods, then swap succeeds
  const g2list = await api(`/api/timetables?sessionId=${sessionId}&classId=${grade2._id}&sectionId=${g2sec._id}`, { token: admin.token });
  const g2periods = g2list.body.data.map((p) => p._id);
  if (g2periods.length) {
    await api('/api/timetables/periods', { method: 'DELETE', token: admin.token, body: { periodIds: g2periods } });
  }
  const swapOk = await api('/api/timetables/swap', { method: 'POST', token: admin.token, body: { sessionId, classId: grade1._id, sectionId: secA._id, dayOfWeek: 1, periodA: 1, periodB: 2 } });
  const p1Now = swapOk.body.data?.find((p) => p.periodNumber === 1);
  check('swap succeeds after conflict cleared', swapOk.status === 200 && p1Now && p1Now.teacherId === fatima._id);

  // Update period with time overlap conflict (P1 08:30-09:15 overlaps P2 08:45-09:30, Ahmed teaching P2)
  const p1Id = p1Now._id;
  const updConflict = await api(`/api/timetables/periods/${p1Id}`, { method: 'PATCH', token: admin.token, body: { startTime: '08:30', endTime: '09:15' } });
  check('update with overlap → 409', updConflict.status === 409, `(${updConflict.status})`);
  const updOk = await api(`/api/timetables/periods/${p1Id}`, { method: 'PATCH', token: admin.token, body: { teacherId: ahmed._id } });
  check('update period (teacher change) → 200', updOk.status === 200 && updOk.body.data.teacherId === ahmed._id);

  // Add period back (P5) + remove
  const addP = await api('/api/timetables/periods', { method: 'POST', token: admin.token, body: { sessionId, classId: grade1._id, sectionId: secA._id, dayOfWeek: 1, periodNumber: 5, startTime: '11:00', endTime: '11:45', subjectId: eng._id, teacherId: fatima._id } });
  check('add single period → 201', addP.status === 201);
  const delP = await api('/api/timetables/periods', { method: 'DELETE', token: admin.token, body: { periodIds: [addP.body.data._id] } });
  check('remove period → 200', delP.status === 200 && delP.body.data.removed === 1);

  // Teacher view scoping: sees own teaching + class-teacher classes
  const tView = await api(`/api/timetables?sessionId=${sessionId}`, { token: teacher.token });
  check('teacher timetable view → 200', tView.status === 200 && tView.body.data.length > 0);
  const tForeignView = await api(`/api/timetables?sessionId=${sessionId}&classId=${newClass.body.data._id}`, { token: teacher.token });
  check("teacher blocked from unrelated class view → 403", tForeignView.status === 403);

  // Student view scoping: own section only
  const sView = await api(`/api/timetables?sessionId=${sessionId}`, { token: student.token });
  const sAllOwn = sView.status === 200 && sView.body.data.every((p) => String(p.sectionId) === String(bilal.sectionId));
  check('student timetable = own section only', sAllOwn);
  const sForeign = await api(`/api/timetables?sessionId=${sessionId}&classId=${grade2._id}`, { token: student.token });
  check('student blocked from other class timetable → 403', sForeign.status === 403);

  // Print endpoint
  const printT = await api(`/api/timetables/print?sessionId=${sessionId}&classId=${grade1._id}&sectionId=${secA._id}`, { token: teacher.token });
  check('teacher prints timetable → 200 grouped', printT.status === 200 && Array.isArray(printT.body.data?.days) && printT.body.data.days.length >= 1);
  const printS = await api(`/api/timetables/print?sessionId=${sessionId}&classId=${grade1._id}&sectionId=${secA._id}`, { token: student.token });
  check('student print blocked (no print action) → 403', printS.status === 403);

  // Receptionist cannot create timetable
  const rCreate = await api('/api/timetables', { method: 'POST', token: receptionist.token, body: { sessionId, classId: grade1._id, sectionId: secA._id, periods: [{ dayOfWeek: 3, periodNumber: 1, startTime: '08:00', endTime: '08:45', subjectId: mth._id }] } });
  check('receptionist cannot create timetable → 403', rCreate.status === 403);

  console.log(`\nPhase 4 results: ${passed} passed, ${failed} failed\n`);
  process.exitCode = (failed ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exitCode = (1); });

