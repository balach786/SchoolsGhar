/**
 * Phase 3 integration tests — academic core.
 * Requires a fresh server (rate limits) with the dev seed applied.
 *   node tests/academic.test.mjs [baseUrl]
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
  return { status: res.status, body: json };
}

async function login(email, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  return { status: r.status, token: r.body?.data?.accessToken, user: r.body?.data?.user };
}

async function run() {
  console.log(`\nPhase 3 — Academic core tests against ${BASE}\n`);

  const admin = await login('admin@school.test', 'Password123');
  const teacher = await login('teacher@school.test', 'Password123');
  const student = await login('student@school.test', 'Password123');
  const receptionist = await login('receptionist@school.test', 'Password123');
  check('admin login', admin.status === 200);
  check('teacher login', teacher.status === 200);

  const A = (t) => t;

  // ── Sessions ─────────────────────────────────────────
  console.log('▶ Academic sessions');
  const sessions = await api('/api/academic-sessions', { token: admin.token });
  check('list sessions → 200 paginated', sessions.status === 200 && sessions.body.pagination.total >= 3);
  const active = await api('/api/academic-sessions/active', { token: admin.token });
  check('active session exists', active.status === 200 && active.body.data?.name === '2026–2027');

  const newSession = await api('/api/academic-sessions', { method: 'POST', token: admin.token, body: { name: `Test ${String(Date.now()).slice(-5)}`, startDate: '2028-04-01', endDate: '2029-03-31' } });
  check('create session → 201', newSession.status === 201, `(${newSession.status})`);
  const badRange = await api('/api/academic-sessions', { method: 'POST', token: admin.token, body: { name: 'Bad', startDate: '2029-04-01', endDate: '2029-03-31' } });
  check('invalid date range → 400', badRange.status === 400);

  const activate = await api(`/api/academic-sessions/${newSession.body.data._id}/activate`, { method: 'POST', token: admin.token });
  check('activate new session → 200', activate.status === 200);
  const activeNow = await api('/api/academic-sessions/active', { token: admin.token });
  check('only ONE active session after switch', activeNow.body.data?._id === newSession.body.data._id);
  const allSessions = await api('/api/academic-sessions', { token: admin.token });
  const activeCount = allSessions.body.data.filter((s) => s.isActive).length;
  check('exactly one active session in list', activeCount === 1);
  // Restore 2026–2027 as active
  const s2627 = allSessions.body.data.find((s) => s.name === '2026–2027');
  await api(`/api/academic-sessions/${s2627._id}/activate`, { method: 'POST', token: admin.token });

  // ── Classes ──────────────────────────────────────────
  console.log('\n▶ Classes');
  const classes = await api('/api/academic-sessions/active', { token: admin.token }).then(async (a) =>
    api(`/api/classes?sessionId=${a.body.data._id}`, { token: admin.token })
  );
  check('classes list by session → 200', classes.status === 200 && classes.body.data.length >= 6);
  check('class student strength present', typeof classes.body.data[0].studentCount === 'number');

  const newClass = await api('/api/classes', { method: 'POST', token: admin.token, body: { name: 'Grade 7', code: 'G7', sessionId: s2627._id } });
  check('create class → 201', newClass.status === 201);
  const clsDetail = await api(`/api/classes/${newClass.body.data._id}`, { token: admin.token });
  check('class detail with sections', clsDetail.status === 200 && Array.isArray(clsDetail.body.data.sections));

  // ── Sections ─────────────────────────────────────────
  console.log('\n▶ Sections');
  const g1 = classes.body.data.find((c) => c.name === 'Grade 1');
  // Unique section name per run keeps the test idempotent
  const UNIQ_SEC = `S${String(Date.now()).slice(-4)}`;
  const secB = await api('/api/sections', { method: 'POST', token: admin.token, body: { name: UNIQ_SEC, classId: g1._id } });
  check('create section → 201', secB.status === 201, `(got ${secB.status})`);
  const dupSection = await api('/api/sections', { method: 'POST', token: admin.token, body: { name: 'A', classId: g1._id } });
  check('duplicate section name in class → 409', dupSection.status === 409);
  const badSection = await api('/api/sections', { method: 'POST', token: admin.token, body: { name: 'X', classId: '000000000000000000000000' } });
  check('section with invalid class → 404', badSection.status === 404);

  const sectionsList = await api(`/api/sections?classId=${g1._id}`, { token: admin.token });
  check('sections filtered by class', sectionsList.status === 200 && sectionsList.body.data.length >= 3);

  // ── Subjects ─────────────────────────────────────────
  console.log('\n▶ Subjects');
  const subjects = await api(`/api/subjects?sessionId=${s2627._id}`, { token: admin.token });
  check('subjects list → 200', subjects.status === 200 && subjects.body.data.length >= 5);
  const subj = subjects.body.data[0];
  const updateSubj = await api(`/api/subjects/${subj._id}`, { method: 'PATCH', token: admin.token, body: { classIds: [g1._id], teacherIds: [] } });
  check('update subject assignments → 200', updateSubj.status === 200);
  const badSubjSession = await api('/api/subjects', { method: 'POST', token: admin.token, body: { name: 'Invalid Session Subject', code: 'XXX', sessionId: '000000000000000000000000', classIds: [] } });
  check('subject with invalid session → 404', badSubjSession.status === 404);

  // ── Students ─────────────────────────────────────────
  console.log('\n▶ Students');
  const students = await api(`/api/students?limit=10&classId=${g1._id}`, { token: admin.token });
  check('students list → 200 paginated', students.status === 200 && students.body.pagination.total >= 12);
  check('student rows carry class/section names', !!students.body.data[0]?.className);

  const dupAdmission = await api('/api/students', { method: 'POST', token: admin.token, body: { admissionNumber: students.body.data[0].admissionNumber, rollNumber: '99', fullName: 'Dup Student', gender: 'male', dateOfBirth: '2015-01-01', guardianName: 'Mr X', admissionDate: '2026-04-01', sessionId: s2627._id, classId: g1._id, sectionId: students.body.data[0].sectionId } });
  check('duplicate admission number → 409', dupAdmission.status === 409);

  const secA = sectionsList.body.data.find((s) => s.name === 'A');
  const dupRoll = await api('/api/students', { method: 'POST', token: admin.token, body: { admissionNumber: `ADM-TEST-${Date.now()}`, rollNumber: '1', fullName: 'Roll Dup', gender: 'male', dateOfBirth: '2015-01-01', guardianName: 'Mr Y', admissionDate: '2026-04-01', sessionId: s2627._id, classId: g1._id, sectionId: secA._id } });
  check('duplicate roll number in class/section → 409', dupRoll.status === 409);

  // Section from a DIFFERENT class (Grade 2) used with Grade 1 → must be rejected
  const g2ForRel = classes.body.data.find((c) => c.name === 'Grade 2');
  const g2SectionsForRel = await api(`/api/sections?classId=${g2ForRel._id}`, { token: admin.token });
  const otherClassSection = g2SectionsForRel.body.data[0];
  const badRel = await api('/api/students', { method: 'POST', token: admin.token, body: { admissionNumber: `ADM-TEST-${Date.now()}`, rollNumber: '98', fullName: 'Rel Test', gender: 'male', dateOfBirth: '2015-01-01', guardianName: 'Mr Z', admissionDate: '2026-04-01', sessionId: s2627._id, classId: g1._id, sectionId: otherClassSection._id } });
  check('section not belonging to class → 400', badRel.status === 400);

  const newStudent = await api('/api/students', { method: 'POST', token: admin.token, body: { admissionNumber: `ADM-TEST-${Date.now()}`, rollNumber: String(100 + (Date.now() % 900)), fullName: 'Promotion Test Student', gender: 'female', dateOfBirth: '2015-06-15', guardianName: 'Mr Guardian', guardianPhone: '0300-1234567', admissionDate: '2026-04-01', sessionId: s2627._id, classId: g1._id, sectionId: secA._id, documents: [{ name: 'birth-cert.pdf', fileUrl: 'https://storage.example/bc-1.pdf', mimeType: 'application/pdf', fileSize: 120000, storageKey: 'docs/bc-1.pdf' }] } });
  check('create student → 201', newStudent.status === 201, `(${newStudent.status} ${JSON.stringify(newStudent.body?.error)})`);
  const stuId = newStudent.body.data._id;

  const profile = await api(`/api/students/${stuId}`, { token: admin.token });
  check('student profile → 200 with context names', profile.status === 200 && profile.body.data.className && profile.body.data.sessionName);
  check('profile includes academic history (admitted)', profile.body.data.history?.some((h) => h.status === 'admitted'));

  // search + filters
  const searchRes = await api(`/api/students?search=${encodeURIComponent('Promotion Test')}`, { token: admin.token });
  check('student search works', searchRes.status === 200 && searchRes.body.data.some((s) => s._id === stuId));
  const genderFilter = await api(`/api/students?gender=female&classId=${g1._id}`, { token: admin.token });
  check('gender filter works', genderFilter.status === 200 && genderFilter.body.data.every((s) => s.gender === 'female'));
  const sortRes = await api('/api/students?sort=fullName&limit=5', { token: admin.token });
  check('sorting works', sortRes.status === 200);

  const patchStu = await api(`/api/students/${stuId}`, { method: 'PATCH', token: admin.token, body: { phone: '0300-9999999' } });
  check('edit student → 200', patchStu.status === 200 && patchStu.body.data.phone === '0300-9999999');

  // archive / restore
  const archiveStu = await api(`/api/students/${stuId}/archive`, { method: 'POST', token: admin.token });
  check('archive student → 200', archiveStu.status === 200 && archiveStu.body.data.isArchived === true);
  const listAfterArchive = await api(`/api/students?search=${encodeURIComponent('Promotion Test')}`, { token: admin.token });
  check('archived student hidden from default list', listAfterArchive.body.data.every((s) => s._id !== stuId));
  const restoreStu = await api(`/api/students/${stuId}/restore`, { method: 'POST', token: admin.token });
  check('restore student → 200', restoreStu.status === 200 && restoreStu.body.data.isArchived === false);

  // ── Teachers ─────────────────────────────────────────
  console.log('\n▶ Teachers');
  const teachers = await api('/api/teachers?limit=10', { token: admin.token });
  check('teachers list → 200', teachers.status === 200 && teachers.body.pagination.total >= 4);
  check('admin sees salary', typeof teachers.body.data[0].salary === 'number');
  const teacherView = await api('/api/teachers?limit=5', { token: teacher.token });
  check('teacher list hides salary for teachers', teacherView.status === 200 && teacherView.body.data.every((t) => t.salary === undefined));

  const dupEmp = await api('/api/teachers', { method: 'POST', token: admin.token, body: { employeeId: 'T-1001', fullName: 'Dup', joiningDate: '2020-01-01' } });
  check('duplicate employee id → 409', dupEmp.status === 409);

  const newTeacher = await api('/api/teachers', { method: 'POST', token: admin.token, body: { employeeId: `T-9${Date.now() % 1000}`, fullName: 'New Teacher', email: 'nt@school.test', phone: '0300-1112223', qualification: 'M.A.', joiningDate: '2023-05-01', assignedClasses: [g1._id], assignedSubjects: [subj._id], salary: 70000_00 } });
  check('create teacher → 201', newTeacher.status === 201, `(${newTeacher.status} ${JSON.stringify(newTeacher.body?.error)})`);
  const teacherProfile = await api(`/api/teachers/${newTeacher.body.data._id}`, { token: admin.token });
  check('teacher profile with assignment details', teacherProfile.status === 200 && teacherProfile.body.data.assignedClassesDetail?.length === 1);

  const negSalary = await api('/api/teachers', { method: 'POST', token: admin.token, body: { employeeId: `T-8${Date.now() % 1000}`, fullName: 'Neg', joiningDate: '2023-05-01', salary: -5 } });
  check('negative salary rejected → 422', negSalary.status === 422);

  // class teacher assignment
  const assignCT = await api(`/api/classes/${g1._id}/teacher`, { method: 'PUT', token: admin.token, body: { teacherId: newTeacher.body.data._id } });
  check('assign class teacher → 200', assignCT.status === 200 && assignCT.body.data.classTeacherId === newTeacher.body.data._id);
  // Restore Grade 1's class teacher so later suites see the seeded state.
  const allTeachers = (await api('/api/teachers?limit=100', { token: admin.token })).body.data;
  const ahmed = allTeachers.find((t) => t.employeeId === 'T-1001');
  if (ahmed) await api(`/api/classes/${g1._id}/teacher`, { method: 'PUT', token: admin.token, body: { teacherId: ahmed._id } });
  const badTeacherAssign = await api(`/api/classes/${g1._id}/teacher`, { method: 'PUT', token: admin.token, body: { teacherId: '0'.repeat(24) } });
  check('assign invalid teacher → 404', badTeacherAssign.status === 404);

  // ── Promotion ────────────────────────────────────────
  console.log('\n▶ Promotion');
  const g2 = classes.body.data.find((c) => c.name === 'Grade 2');
  const g2sections = await api(`/api/sections?classId=${g2._id}`, { token: admin.token });
  const g2secA = g2sections.body.data.find((s) => s.name === 'A');

  const preview = await api(`/api/promotions/preview?sessionId=${s2627._id}&classId=${g1._id}&sectionId=${secA._id}&toSessionId=${s2627._id}&toClassId=${g2._id}&toSectionId=${g2secA._id}`, { token: admin.token });
  check('promotion preview → 200 with eligible students', preview.status === 200 && preview.body.data.total >= 6);

  const promoteOne = await api('/api/promotions', { method: 'POST', token: admin.token, body: { source: { sessionId: s2627._id, classId: g1._id, sectionId: secA._id }, destination: { sessionId: s2627._id, classId: g2._id, sectionId: g2secA._id }, studentIds: [stuId] } });
  check('promote selected student → 200', promoteOne.status === 200 && promoteOne.body.data.promoted === 1, `(${promoteOne.status} ${JSON.stringify(promoteOne.body?.error)})`);

  const afterPromo = await api(`/api/students/${stuId}`, { token: admin.token });
  check('student moved to destination class/section', afterPromo.body.data.classId === g2._id && afterPromo.body.data.sectionId === g2secA._id);
  check('new roll number auto-assigned', !!afterPromo.body.data.rollNumber);

  // Cross-session promotion → second history record (previous enrollment preserved)
  const currentSessions = await api('/api/academic-sessions?limit=50', { token: admin.token });
  const s2728 = currentSessions.body.data.find((s) => s.name.includes('2027'));
  let nextClass = (await api(`/api/classes?sessionId=${s2728._id}`, { token: admin.token })).body.data.find((c) => c.name === 'Grade 3');
  if (!nextClass) {
    const created = await api('/api/classes', { method: 'POST', token: admin.token, body: { name: 'Grade 3', code: 'G3-N', sessionId: s2728._id } });
    nextClass = created.body.data;
  }
  let nextSection = (await api(`/api/sections?classId=${nextClass._id}`, { token: admin.token })).body.data.find((s) => s.name === 'A');
  if (!nextSection) {
    const created = await api('/api/sections', { method: 'POST', token: admin.token, body: { name: 'A', classId: nextClass._id } });
    nextSection = created.body.data;
  }
  const promoteCross = await api('/api/promotions', { method: 'POST', token: admin.token, body: { source: { sessionId: s2627._id, classId: g2._id, sectionId: g2secA._id }, destination: { sessionId: s2728._id, classId: nextClass._id, sectionId: nextSection._id }, studentIds: [stuId] } });
  check('cross-session promotion → 200', promoteCross.status === 200 && promoteCross.body.data.promoted === 1, `(${promoteCross.status} ${JSON.stringify(promoteCross.body?.error)})`);
  const afterCross = await api(`/api/students/${stuId}`, { token: admin.token });
  check('student now in 2027–2028 session', afterCross.body.data.sessionId === s2728._id);
  const promotedRecords = afterCross.body.data.history.filter((h) => h.status === 'promoted');
  check('student history preserved (≥2 records, source session intact)', afterCross.body.data.history.length >= 2 && promotedRecords.some((h) => h.sessionId === s2728._id));

  const invalidDest = await api('/api/promotions', { method: 'POST', token: admin.token, body: { source: { sessionId: s2627._id, classId: g1._id, sectionId: secA._id }, destination: { sessionId: s2627._id, classId: g1._id, sectionId: '0'.repeat(24) }, studentIds: [stuId] } });
  check('invalid destination section → 404', invalidDest.status === 404);

  // ── Permissions ──────────────────────────────────────
  console.log('\n▶ Academic permissions');
  const studentCreatesSession = await api('/api/academic-sessions', { method: 'POST', token: student.token, body: { name: 'X', startDate: '2029-01-01', endDate: '2029-12-31' } });
  check('student cannot create session → 403', studentCreatesSession.status === 403);
  const studentCreatesClass = await api('/api/classes', { method: 'POST', token: student.token, body: { name: 'X', sessionId: s2627._id } });
  check('student cannot create class → 403', studentCreatesClass.status === 403);
  const studentListStudents = await api('/api/students', { token: student.token });
  check('student cannot list all students → 403', studentListStudents.status === 403);
  const teacherCreatesStudent = await api('/api/students', { method: 'POST', token: teacher.token, body: {} });
  check('teacher cannot create students → 403', teacherCreatesStudent.status === 403);
  const teacherCreatesTeacher = await api('/api/teachers', { method: 'POST', token: teacher.token, body: {} });
  check('teacher cannot create teachers → 403', teacherCreatesTeacher.status === 403);
  const receptionistViewsStudents = await api('/api/students?limit=5', { token: receptionist.token });
  check('receptionist CAN view students', receptionistViewsStudents.status === 200);
  const receptionistPromotes = await api('/api/promotions', { method: 'POST', token: receptionist.token, body: {} });
  check('receptionist cannot promote → 403', receptionistPromotes.status === 403);
  const accountantCreatesClass = await api('/api/classes', { method: 'POST', token: (await login('accountant@school.test', 'Password123')).token, body: {} });
  check('accountant cannot create classes → 403', accountantCreatesClass.status === 403);

  // ── Pagination guard ─────────────────────────────────
  const huge = await api('/api/students?limit=1000', { token: admin.token });
  check('limit capped at 100', huge.status === 200 && huge.body.pagination.limit === 100);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = (failed > 0 ? 1 : 0);
}

run().catch((err) => { console.error('Test runner crashed:', err); process.exitCode = (1); });

