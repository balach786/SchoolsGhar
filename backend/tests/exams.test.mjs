/**
 * Phase 5 integration tests — exams, marks, results (grade scales, ranking with
 * ties, publish flow, printable result card, no GPA).
 * Requires a server with the dev seed applied. Rerunnable (unique names/ids).
 *   node tests/exams.test.mjs [baseUrl]
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

async function run() {
  console.log(`\nPhase 5 — Exams, Marks & Results tests against ${BASE}\n`);

  const admin = await login('admin@school.test');
  const teacher = await login('teacher@school.test');
  const student = await login('student@school.test');
  const receptionist = await login('receptionist@school.test');
  const accountant = await login('accountant@school.test');
  check('admin login', admin.status === 200);
  check('teacher login', teacher.status === 200);
  check('student login', student.status === 200);

  // ── Discover seed data ────────────────────────────────
  console.log('▶ Setup (discover seed data)');
  const activeS = await api('/api/academic-sessions/active', { token: admin.token });
  const sessionId = activeS.body.data._id;
  const classes = (await api(`/api/classes?sessionId=${sessionId}&limit=50`, { token: admin.token })).body.data;
  const grade1 = classes.find((c) => c.name === 'Grade 1');
  const grade5 = classes.find((c) => c.name === 'Grade 5');
  const g1detail = (await api(`/api/classes/${grade1._id}`, { token: admin.token })).body.data;
  const secA = g1detail.sections.find((s) => s.name === 'A');
  const g5detail = (await api(`/api/classes/${grade5._id}`, { token: admin.token })).body.data;
  const g5sec = g5detail.sections[0];
  const subjects = (await api('/api/subjects?limit=50', { token: admin.token })).body.data;
  const mth = subjects.find((s) => s.code === 'MTH');
  const eng = subjects.find((s) => s.code === 'ENG');
  const sci = subjects.find((s) => s.code === 'SCI');
  const studentsA = (await api(`/api/students?sessionId=${sessionId}&classId=${grade1._id}&sectionId=${secA._id}&limit=100`, { token: admin.token })).body.data;
  const secB = g1detail.sections.find((s) => s.name === 'B');
  const studentsB = secB ? (await api(`/api/students?sessionId=${sessionId}&classId=${grade1._id}&sectionId=${secB._id}&limit=100`, { token: admin.token })).body.data : [];
  const studentsG5 = (await api(`/api/students?sessionId=${sessionId}&classId=${grade5._id}&sectionId=${g5sec._id}&limit=50`, { token: admin.token })).body.data;

  // The signed-in student discovers their own profile via /api/students/me.
  const me = await api('/api/students/me', { token: student.token });
  const bilalId = me.body?.data?._id;
  const bilalClassId = me.body?.data?.classId;
  const roster = [...studentsA, ...studentsB];
  const N = roster.length;
  check('seed context resolved', Boolean(sessionId && grade1 && grade5 && mth && eng && bilalId && studentsG5.length >= 2 && N >= 12), `N=${N}`);
  check('student own profile via /students/me', me.status === 200 && bilalClassId === grade1._id);
  check('roster contains the linked student', roster.some((s) => s._id === bilalId));

  const std = { mth: mth._id, eng: eng._id, sci: sci._id };

  // ── Grade scales ──────────────────────────────────────
  console.log('▶ Grade scales');
  const scalesList = await api('/api/grade-scales?limit=50', { token: admin.token });
  const defScale = scalesList.body.data.find((s) => s.isDefault);
  check('list grade scales → 200 with default', scalesList.status === 200 && defScale !== undefined);
  check('default scale has descending boundaries', defScale.boundaries[0].minPercentage > defScale.boundaries[1].minPercentage);

  const newScale = await api('/api/grade-scales', { method: 'POST', token: admin.token, body: { name: `Custom ${Date.now() % 10000}`, boundaries: [{ grade: 'A+', minPercentage: 85 }, { grade: 'B', minPercentage: 50 }, { grade: 'F', minPercentage: 0 }] } });
  check('create grade scale → 201', newScale.status === 201 && newScale.body.data.boundaries.length === 3);

  const badSorted = await api('/api/grade-scales', { method: 'POST', token: admin.token, body: { name: 'Unsorted Scale', boundaries: [{ grade: 'A', minPercentage: 50 }, { grade: 'B', minPercentage: 70 }] } });
  check('unsorted boundaries → 422', badSorted.status === 422 && badSorted.body?.error?.code === 'GRADE_BOUNDARIES_UNSORTED');

  const dupScale = await api('/api/grade-scales', { method: 'POST', token: admin.token, body: { name: newScale.body.data.name.toUpperCase(), boundaries: [{ grade: 'A', minPercentage: 50 }] } });
  check('duplicate scale name → 409', dupScale.status === 409 && dupScale.body?.error?.code === 'GRADE_SCALE_EXISTS');

  const setDefault = await api(`/api/grade-scales/${newScale.body.data._id}/set-default`, { method: 'POST', token: admin.token });
  const afterFlip = (await api('/api/grade-scales?limit=50', { token: admin.token })).body.data;
  check('set-default flips the old default', setDefault.status === 200 && afterFlip.filter((s) => s.isDefault).length === 1 && afterFlip.find((s) => s.isDefault)._id === newScale.body.data._id);

  // Restore the seeded default scale (determinism for the rest of the suite).
  await api(`/api/grade-scales/${defScale._id}/set-default`, { method: 'POST', token: admin.token });

  const teacherScaleEdit = await api('/api/grade-scales', { method: 'POST', token: teacher.token, body: { name: 'Teacher Scale', boundaries: [{ grade: 'A', minPercentage: 50 }] } });
  check('teacher cannot manage grade scales → 403', teacherScaleEdit.status === 403);

  // ── Exams ─────────────────────────────────────────────
  console.log('▶ Exams');
  const g5ExamName = `G5 Test ${Date.now() % 100000}`;
  const g5Exam = await api('/api/exams', { method: 'POST', token: admin.token, body: { name: g5ExamName, sessionId, classId: grade5._id, subjects: [{ subjectId: std.mth, maxMarks: 100, passMarks: 33 }, { subjectId: std.eng, maxMarks: 100, passMarks: 33 }] } });
  check('create exam → 201', g5Exam.status === 201 && g5Exam.body.data.subjects.length === 2);
  const g5ExamId = g5Exam.body.data._id;

  const dupSubject = await api('/api/exams', { method: 'POST', token: admin.token, body: { name: `DupSub ${Date.now()}`, sessionId, classId: grade5._id, subjects: [{ subjectId: std.mth, maxMarks: 100 }, { subjectId: std.mth, maxMarks: 100 }] } });
  check('duplicate subject in request → 422', dupSubject.status === 422 && dupSubject.body?.error?.code === 'SUBJECT_DUPLICATE_IN_EXAM');

  // Subject not assigned to Grade 5 (create one for Grade 1 only).
  const oddSubject = await api('/api/subjects', { method: 'POST', token: admin.token, body: { name: `Odd ${Date.now() % 10000}`, code: `ODD${Date.now() % 1000}`, sessionId, classIds: [grade1._id], teacherIds: [] } });
  const badSubjectClass = await api('/api/exams', { method: 'POST', token: admin.token, body: { name: `BadSub ${Date.now()}`, sessionId, classId: grade5._id, subjects: [{ subjectId: oddSubject.body.data._id, maxMarks: 100 }] } });
  check('subject not assigned to class → 400', badSubjectClass.status === 400 && badSubjectClass.body?.error?.code === 'INVALID_SUBJECT_CLASS');

  const dupExam = await api('/api/exams', { method: 'POST', token: admin.token, body: { name: g5ExamName, sessionId, classId: grade5._id, subjects: [{ subjectId: std.mth, maxMarks: 100 }] } });
  check('duplicate exam name → 409', dupExam.status === 409 && dupExam.body?.error?.code === 'EXAM_ALREADY_EXISTS');

  const badSessionExam = await api('/api/exams', { method: 'POST', token: admin.token, body: { name: `BadSess ${Date.now()}`, sessionId: '0'.repeat(24), classId: grade5._id, subjects: [{ subjectId: std.mth, maxMarks: 100 }] } });
  check('invalid session → 404', badSessionExam.status === 404);

  const zeroMax = await api('/api/exams', { method: 'POST', token: admin.token, body: { name: `ZeroMax ${Date.now()}`, sessionId, classId: grade5._id, subjects: [{ subjectId: std.mth, maxMarks: 0 }] } });
  check('maxMarks 0 → 422', zeroMax.status === 422);

  const passOverMax = await api('/api/exams', { method: 'POST', token: admin.token, body: { name: `PassOver ${Date.now()}`, sessionId, classId: grade5._id, subjects: [{ subjectId: std.mth, maxMarks: 50, passMarks: 60 }] } });
  check('passMarks > maxMarks → 422', passOverMax.status === 422);

  const filteredList = await api(`/api/exams?sessionId=${sessionId}&classId=${grade5._id}&published=false&limit=50`, { token: admin.token });
  check('exam list filter published=false', filteredList.status === 200 && filteredList.body.data.some((e) => e._id === g5ExamId));

  const teacherExamCreate = await api('/api/exams', { method: 'POST', token: teacher.token, body: { name: `TExam ${Date.now()}`, sessionId, classId: grade5._id, subjects: [{ subjectId: std.mth, maxMarks: 100 }] } });
  check('teacher cannot create exams → 403', teacherExamCreate.status === 403);

  const archiveExam = await api(`/api/exams/${g5ExamId}/archive`, { method: 'POST', token: admin.token });
  const restoreExam = await api(`/api/exams/${g5ExamId}/restore`, { method: 'POST', token: admin.token });
  check('archive → restore roundtrip', archiveExam.status === 200 && archiveExam.body.data.isArchived === true && restoreExam.status === 200 && restoreExam.body.data.isArchived === false);

  // Grade 1 exam for the student-visible flow (unpublished at first).
  const g1ExamName = `G1 Test ${Date.now() % 100000}`;
  const g1Exam = await api('/api/exams', { method: 'POST', token: admin.token, body: { name: g1ExamName, sessionId, classId: grade1._id, subjects: [{ subjectId: std.mth, maxMarks: 100, passMarks: 33 }, { subjectId: std.eng, maxMarks: 100, passMarks: 33 }] } });
  check('create Grade 1 exam → 201', g1Exam.status === 201);
  const g1ExamId = g1Exam.body.data._id;

  // ── Results visibility before publish ─────────────────
  console.log('▶ Publish flow');
  const beforePublish = await api(`/api/results/student?examId=${g1ExamId}&studentId=${bilalId}`, { token: student.token });
  check('student result before publish → 403 RESULTS_NOT_PUBLISHED', beforePublish.status === 403 && beforePublish.body?.error?.code === 'RESULTS_NOT_PUBLISHED');

  const adminPreview = await api(`/api/results/exam-summary?examId=${g1ExamId}`, { token: admin.token });
  check('admin preview of unpublished summary → 200', adminPreview.status === 200 && adminPreview.body.data.classStrength === N);

  const teacherPublish = await api(`/api/exams/${g1ExamId}/publish`, { method: 'POST', token: teacher.token });
  check('teacher cannot publish → 403', teacherPublish.status === 403);

  // ── Marks entry ───────────────────────────────────────
  console.log('▶ Marks');
  const marksG5 = [
    { studentId: studentsG5[0]._id, subjectId: std.mth, marksObtained: 75 },
    { studentId: studentsG5[0]._id, subjectId: std.eng, marksObtained: 65 },
    { studentId: studentsG5[1]._id, subjectId: std.mth, marksObtained: 55 },
  ];
  const bulk = await api('/api/marks/bulk', { method: 'POST', token: teacher.token, body: { examId: g5ExamId, records: marksG5 } });
  check('teacher marks own-subject exam → 201', bulk.status === 201 && bulk.body.data.length === 3);

  const bulkDup = await api('/api/marks/bulk', { method: 'POST', token: teacher.token, body: { examId: g5ExamId, records: marksG5 } });
  check('duplicate marks → 409 MARK_ALREADY_EXISTS', bulkDup.status === 409 && bulkDup.body?.error?.code === 'MARK_ALREADY_EXISTS');

  const bulkOver = await api('/api/marks/bulk', { method: 'POST', token: teacher.token, body: { examId: g5ExamId, overwrite: true, records: [{ studentId: studentsG5[0]._id, subjectId: std.mth, marksObtained: 80 }] } });
  check('overwrite marks → 201', bulkOver.status === 201 && bulkOver.body.data.length === 1 && bulkOver.body.data[0].marksObtained === 80);

  const overMax = await api('/api/marks/bulk', { method: 'POST', token: teacher.token, body: { examId: g5ExamId, records: [{ studentId: studentsG5[1]._id, subjectId: std.mth, marksObtained: 101 }] } });
  check('marks exceed subject max → 422', overMax.status === 422 && overMax.body?.error?.code === 'MARKS_EXCEED_MAX');

  const badSubject = await api('/api/marks/bulk', { method: 'POST', token: teacher.token, body: { examId: g5ExamId, records: [{ studentId: studentsG5[0]._id, subjectId: std.sci, marksObtained: 50 }] } });
  check('subject not in exam → 422', badSubject.status === 422 && badSubject.body?.error?.code === 'INVALID_SUBJECT_IN_EXAM');

  const wrongClassStudent = await api('/api/marks/bulk', { method: 'POST', token: teacher.token, body: { examId: g5ExamId, records: [{ studentId: bilalId, subjectId: std.mth, marksObtained: 50 }] } });
  check('student not in exam class → 400', wrongClassStudent.status === 400 && wrongClassStudent.body?.error?.code === 'INVALID_STUDENT_CLASS');

  const dupPair = await api('/api/marks/bulk', { method: 'POST', token: teacher.token, body: { examId: g5ExamId, records: [{ studentId: studentsG5[0]._id, subjectId: std.eng, marksObtained: 50 }, { studentId: studentsG5[0]._id, subjectId: std.eng, marksObtained: 60 }] } });
  check('duplicate pair in request → 422', dupPair.status === 422 && dupPair.body?.error?.code === 'MARK_DUPLICATE_IN_REQUEST');

  const patchMark = await api(`/api/marks/records/${bulk.body.data[2]._id}`, { method: 'PATCH', token: teacher.token, body: { marksObtained: 60 } });
  check('PATCH mark record → 200', patchMark.status === 200 && patchMark.body.data.marksObtained === 60);

  const patchOverMax = await api(`/api/marks/records/${bulk.body.data[2]._id}`, { method: 'PATCH', token: teacher.token, body: { marksObtained: 999 } });
  check('PATCH above max → 422', patchOverMax.status === 422);

  const receptionistMarks = await api('/api/marks/bulk', { method: 'POST', token: receptionist.token, body: { examId: g5ExamId, records: [{ studentId: studentsG5[0]._id, subjectId: std.eng, marksObtained: 40 }] } });
  check('receptionist cannot enter marks → 403', receptionistMarks.status === 403);

  // Unassigned teacher must be locked out of marks entry.
  const roles = (await api('/api/roles?limit=50', { token: admin.token })).body.data;
  const teacherRole = roles.find((r) => r.slug === 'teacher');
  const stamp = Date.now() % 1000000;
  const newUser = await api('/api/users', { method: 'POST', token: admin.token, body: { name: 'New Staff Teacher', email: `newteacher${stamp}@school.test`, password: 'Password123', roleId: teacherRole._id } });
  const newUserId = newUser.body?.data?.user?._id ?? newUser.body?.data?._id;
  const newTeacher = await api('/api/teachers', { method: 'POST', token: admin.token, body: { employeeId: `T-9${stamp % 10000}`, fullName: 'New Staff Teacher', email: `newteacher${stamp}@school.test`, joiningDate: '2026-01-10', userId: newUserId } });
  check('create unassigned teacher user+profile', newUser.status === 201 && newTeacher.status === 201 && Boolean(newUserId));
  const newTeacherLogin = await login(`newteacher${stamp}@school.test`);
  const unassignedMarks = await api('/api/marks/bulk', { method: 'POST', token: newTeacherLogin.token, body: { examId: g5ExamId, records: [{ studentId: studentsG5[0]._id, subjectId: std.eng, marksObtained: 40 }] } });
  check('unassigned teacher cannot enter marks → 403', unassignedMarks.status === 403 && unassignedMarks.body?.error?.code === 'CLASS_NOT_ASSIGNED');

  // ── Marks lock after publish ──────────────────────────
  const pubG5 = await api(`/api/exams/${g5ExamId}/publish`, { method: 'POST', token: admin.token });
  check('admin publishes Grade 5 exam', pubG5.status === 200 && pubG5.body.data.isPublished === true);

  const lockedMarks = await api('/api/marks/bulk', { method: 'POST', token: teacher.token, body: { examId: g5ExamId, records: [{ studentId: studentsG5[1]._id, subjectId: std.eng, marksObtained: 40 }] } });
  check('marks locked after publish for teacher → 409', lockedMarks.status === 409 && lockedMarks.body?.error?.code === 'MARKS_LOCKED');

  const adminOverwrite = await api('/api/marks/bulk', { method: 'POST', token: admin.token, body: { examId: g5ExamId, overwrite: true, records: [{ studentId: studentsG5[1]._id, subjectId: std.eng, marksObtained: 45 }] } });
  check('admin may adjust marks after publish → 201', adminOverwrite.status === 201);

  const accountantExams = await api('/api/exams?limit=5', { token: accountant.token });
  check('accountant cannot view exams → 403', accountantExams.status === 403);

  // ── Results: ranking with ties + result card ──────────
  console.log('▶ Results & ranking');
  // Roster engineering (dynamic on N):
  //   bilal 90+90 → 90% A+ rank 1; two others 80+80 → 80% A rank 2 (tie);
  //   six others 70+70 → 70% B rank 4 (six-way tie, rank 3 skipped);
  //   one 60+60 → 60% C rank 10; one 50+50 → 50% D rank 11;
  //   the rest absent → 0% F, shared last rank (N - absentees + 1).
  const others = roster.filter((s) => s._id !== bilalId);
  const pair80 = others.slice(0, 2);
  const group70 = others.slice(2, 8);
  const one60 = others[8];
  const one50 = others[9];
  const absentees = others.slice(10);

  // bilal gets both subjects; helper to build pairs per student.
  const pair = (sid, m) => [
    { studentId: sid, subjectId: std.mth, marksObtained: m },
    { studentId: sid, subjectId: std.eng, marksObtained: m },
  ];
  const g1Records = [
    ...pair(bilalId, 90),
    ...pair80.flatMap((s) => pair(s._id, 80)),
    ...group70.flatMap((s) => pair(s._id, 70)),
    ...pair(one60._id, 60),
    ...pair(one50._id, 50),
  ];
  const bulkG1 = await api('/api/marks/bulk', { method: 'POST', token: teacher.token, body: { examId: g1ExamId, records: g1Records } });
  check('teacher (class teacher) marks Grade 1 exam → 201', bulkG1.status === 201 && bulkG1.body.data.length === g1Records.length, `(${bulkG1.status} ${bulkG1.body?.error?.code})`);

  const publishG1 = await api(`/api/exams/${g1ExamId}/publish`, { method: 'POST', token: admin.token });
  check('admin publishes Grade 1 exam', publishG1.status === 200 && publishG1.body.data.isPublished === true);

  const summary = await api(`/api/results/exam-summary?examId=${g1ExamId}`, { token: admin.token });
  const rows = summary.body?.data?.students ?? [];
  const byId = new Map(rows.map((r) => [r.studentId, r]));
  check('exam summary → 200 with class strength', summary.status === 200 && summary.body.data.classStrength === N && rows.length === N);

  const expectedRanks = [1, 2, 2, 4, 4, 4, 4, 4, 4, 10, 11, ...absentees.map(() => 12)];
  const ranks = rows.sort((a, b) => a.rank - b.rank).map((r) => r.rank);
  check('ranking with ties + skip (competition ranking)', JSON.stringify(ranks) === JSON.stringify(expectedRanks), `got ${JSON.stringify(ranks)}`);
  check('tie ranks share percentage', byId.get(pair80[0]._id)?.rank === 2 && byId.get(pair80[1]._id)?.rank === 2 && group70.every((s) => byId.get(s._id)?.rank === 4));
  check('percentages computed backend-side', byId.get(bilalId)?.percentage === 90 && byId.get(pair80[0]._id)?.percentage === 80 && byId.get(group70[0]._id)?.percentage === 70 && byId.get(one60._id)?.percentage === 60);
  check('grades from configured scale', byId.get(bilalId)?.grade === 'A+' && byId.get(pair80[0]._id)?.grade === 'A' && byId.get(group70[0]._id)?.grade === 'B' && byId.get(one60._id)?.grade === 'C' && byId.get(one50._id)?.grade === 'D');

  // Student's own printable result card.
  const card = await api(`/api/results/student?examId=${g1ExamId}&studentId=${bilalId}`, { token: student.token });
  check('student own result card → 200', card.status === 200 && card.body.data.student._id === bilalId);
  check('card has totals + percentage + grade + rank', card.body.data.percentage === 90 && card.body.data.grade === 'A+' && card.body.data.rank === 1 && card.body.data.total.obtained === 180 && card.body.data.total.max === 200 && card.body.data.classStrength === N);
  check('card subject rows with pass status', card.body.data.subjects.length === 2 && card.body.data.subjects.every((s) => s.status === 'pass'));

  const printCard = await api(`/api/results/print?examId=${g1ExamId}&studentId=${bilalId}`, { token: student.token });
  check('print result card data → 200', printCard.status === 200 && printCard.body.data.rank === 1);

  const otherCard = await api(`/api/results/student?examId=${g1ExamId}&studentId=${pair80[0]._id}`, { token: student.token });
  check('student cannot view another student card → 403', otherCard.status === 403);

  const studentSummary = await api(`/api/results/exam-summary?examId=${g1ExamId}`, { token: student.token });
  check('student sees own class ranking after publish', studentSummary.status === 200 && studentSummary.body.data.classStrength === N);

  const wrongClassSummary = await api(`/api/results/exam-summary?examId=${g5ExamId}`, { token: student.token });
  check('student blocked from other class results → 403', wrongClassSummary.status === 403 && wrongClassSummary.body?.error?.code === 'RESULTS_FORBIDDEN');

  // Absent student card (no marks recorded).
  const absentCard = await api(`/api/results/student?examId=${g1ExamId}&studentId=${absentees[0]._id}`, { token: admin.token });
  check('absent student: null marks + absent status', absentCard.status === 200 && absentCard.body.data.subjects.every((s) => s.status === 'absent' && s.marksObtained === null) && absentCard.body.data.rank === 12);

  // Students cannot use the staff marks endpoints (permission boundary).
  const studentMarksList = await api(`/api/marks?examId=${g1ExamId}&limit=50`, { token: student.token });
  check('students cannot access staff marks list → 403', studentMarksList.status === 403);
  const studentSheet = await api(`/api/exams/${g1ExamId}/marks`, { token: student.token });
  check('students cannot access staff marks sheet → 403', studentSheet.status === 403);

  // Student exam list: published + own class only.
  const studentExams = await api('/api/exams?limit=50', { token: student.token });
  check('student exam list → published own-class only', studentExams.status === 200 && studentExams.body.data.length >= 1 && studentExams.body.data.every((e) => e.isPublished === true && e.classId === bilalClassId));

  // NO GPA anywhere.
  const summaryText = JSON.stringify(summary.body).toLowerCase();
  const cardText = JSON.stringify(card.body).toLowerCase();
  check('no GPA in any response', !summaryText.includes('gpa') && !cardText.includes('gpa'));

  // ── Unpublish hides again ─────────────────────────────
  const unpub = await api(`/api/exams/${g1ExamId}/unpublish`, { method: 'POST', token: admin.token });
  const afterUnpub = await api(`/api/results/student?examId=${g1ExamId}&studentId=${bilalId}`, { token: student.token });
  check('unpublish hides results from students again', unpub.status === 200 && afterUnpub.status === 403 && afterUnpub.body?.error?.code === 'RESULTS_NOT_PUBLISHED');
  const repub = await api(`/api/exams/${g1ExamId}/publish`, { method: 'POST', token: admin.token });
  check('re-publish restores visibility', repub.status === 200);

  console.log(`\nPhase 5 results: ${passed} passed, ${failed} failed\n`);
  process.exitCode = (failed ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exitCode = (1);
});

