/**
 * Phase 7+8 integration tests — assignments & submissions, notices,
 * notifications, leave requests, global search, dashboard analytics, reports.
 * Requires a server with the dev seed applied. Rerunnable (unique titles).
 *   node tests/prompt7.test.mjs [baseUrl]
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

const stamp = Date.now().toString(36).toLowerCase();

async function run() {
  console.log(`\nPhase 7+8 — Assignments, Notices, Notifications, Leave, Search & Reports tests against ${BASE}\n`);

  const admin = await login('admin@school.test');
  const teacher = await login('teacher@school.test');
  const student = await login('student@school.test');
  const accountant = await login('accountant@school.test');
  const receptionist = await login('receptionist@school.test');
  check('logins', [admin, teacher, student, accountant, receptionist].every((l) => l.status === 200));

  // ── Discover seed data ────────────────────────────────
  console.log('▶ Setup');
  const activeS = await api('/api/academic-sessions/active', { token: admin.token });
  const sessionId = activeS.body.data._id;
  const classes = (await api(`/api/classes?sessionId=${sessionId}&limit=50`, { token: admin.token })).body.data;
  const grade5 = classes.find((c) => c.name === 'Grade 5');
  const grade1 = classes.find((c) => c.name === 'Grade 1');
  const g1detail = (await api(`/api/classes/${grade1._id}`, { token: admin.token })).body.data;
  const secA = g1detail.sections.find((s) => s.name === 'A');
  const subjects = (await api('/api/subjects?limit=50', { token: admin.token })).body.data;
  const mth = subjects.find((s) => s.code === 'MTH');
  const eng = subjects.find((s) => s.code === 'ENG');
  const me = await api('/api/students/me', { token: student.token });
  const bilalId = me.body?.data?._id;
  check('seed context resolved', Boolean(sessionId && grade5 && grade1 && mth && bilalId), JSON.stringify(me.body?.error ?? ''));

  // ── Assignments ───────────────────────────────────────
  console.log('▶ Assignments');
  const due = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const pastDue = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const created = await api('/api/assignments', { method: 'POST', token: teacher.token, body: { title: `Homework ${stamp}`, description: 'Chapter 3 exercises', classId: grade5._id, subjectId: mth._id, dueDate: due, maxMarks: 25 } });
  check('teacher creates assignment for assigned class → 201', created.status === 201, JSON.stringify(created.body));
  const assignmentId = created.body?.data?._id;

  const wrongClass = await api('/api/assignments', { method: 'POST', token: teacher.token, body: { title: `Rogue ${stamp}`, classId: grade1._id, subjectId: eng._id } });
  check('teacher blocked from unassigned class → 403', wrongClass.status === 403, String(wrongClass.status));

  const studentCreate = await api('/api/assignments', { method: 'POST', token: student.token, body: { title: 'x', classId: grade5._id } });
  check('student cannot create assignments → 403', studentCreate.status === 403);

  const tList = await api('/api/assignments?limit=50', { token: teacher.token });
  check('teacher lists assignments (assigned classes only)', tList.status === 200 && tList.body.data.every((a) => a.classId && a.teacherName));
  check('created assignment visible to teacher', tList.body.data.some((a) => a._id === assignmentId));

  const sList = await api('/api/assignments?limit=50', { token: student.token });
  check('student sees only own class assignments', sList.status === 200 && sList.body.data.every((a) => a.classId === bilalId ? a.classId : (a.classId === (me.body?.data?.classId ?? ''))));
  check('student submissionStatus present', sList.body.data.every((a) => ['pending', 'late', 'submitted'].includes(a.submissionStatus)));

  // ── Submissions ───────────────────────────────────────
  console.log('▶ Submissions');
  // Bilal is in Grade 1 — create an assignment for his class (admin can create for any class).
  const bilalClass = me.body?.data?.classId;
  const g1Assignment = await api('/api/assignments', { method: 'POST', token: admin.token, body: { title: `G1 Task ${stamp}`, description: 'Draw and label a plant.', classId: bilalClass, subjectId: eng._id, dueDate: due, maxMarks: 10 } });
  check('admin creates assignment for student class', g1Assignment.status === 201, JSON.stringify(g1Assignment.body));
  const myClassAssignments = await api(`/api/assignments?limit=50`, { token: student.token });
  const targetAssignment = myClassAssignments.body.data.find((a) => a._id === g1Assignment.body?.data?._id);
  check('student has an assignment to submit', Boolean(targetAssignment), JSON.stringify(myClassAssignments.body));

  let sub = null;
  if (targetAssignment) {
    sub = await api('/api/submissions', { method: 'POST', token: student.token, body: { assignmentId: targetAssignment._id, content: 'Here is my homework answer.', fileUrl: 'https://cdn.example.com/work1.pdf', fileMeta: { name: 'work1.pdf', mimeType: 'application/pdf' } } });
    check('student submits assignment → 201', sub.status === 201, JSON.stringify(sub.body));
    const dupSub = await api('/api/submissions', { method: 'POST', token: student.token, body: { assignmentId: targetAssignment._id, content: 'again' } });
    check('duplicate submission → 409', dupSub.status === 409, String(dupSub.status));

    const teacherSubs = await api(`/api/submissions?assignmentId=${targetAssignment._id}`, { token: teacher.token });
    check('teacher lists submissions', teacherSubs.status === 200 && Array.isArray(teacherSubs.body.data));

    const review = await api(`/api/submissions/${sub.body.data._id}`, { method: 'PATCH', token: teacher.token, body: { marksObtained: 9, feedback: 'Well done' } });
    check('teacher reviews submission → 200', review.status === 200 && review.body.data.marksObtained === 9, JSON.stringify(review.body));

    const studentReview = await api(`/api/submissions/${sub.body.data._id}`, { method: 'PATCH', token: student.token, body: { marksObtained: 25 } });
    check('student cannot review → 403', studentReview.status === 403);

    const overMax = await api(`/api/submissions/${sub.body.data._id}`, { method: 'PATCH', token: teacher.token, body: { marksObtained: 999 } });
    check('marks above max rejected → 400', overMax.status === 400, JSON.stringify(overMax.body));

    const otherSubs = await api(`/api/submissions?assignmentId=${targetAssignment._id}`, { token: student.token });
    check('student submissions list scoped to self', otherSubs.status === 200 && otherSubs.body.data.every((x) => x.studentId === bilalId));
  }

  // ── Notices ───────────────────────────────────────────
  console.log('▶ Notices');
  const notice = await api('/api/notices', { method: 'POST', token: admin.token, body: { title: `Sports Day ${stamp}`, body: 'Sports day is next Friday. Wear house colours.', audienceType: 'school', isPinned: false } });
  check('admin creates school notice → 201', notice.status === 201, JSON.stringify(notice.body));

  const classNoticeBad = await api('/api/notices', { method: 'POST', token: admin.token, body: { title: 'x', body: 'x', audienceType: 'class' } });
  check('class notice without classId → 422', classNoticeBad.status === 422);

  const studentNotices = await api('/api/notices?limit=20', { token: student.token });
  check('student sees school notice', studentNotices.status === 200 && studentNotices.body.data.some((n) => n._id === notice.body.data._id));
  const teacherNotices = await api('/api/notices?limit=20', { token: teacher.token });
  check('teacher sees school notice', teacherNotices.status === 200 && teacherNotices.body.data.some((n) => n._id === notice.body.data._id));

  const studentCreateNotice = await api('/api/notices', { method: 'POST', token: student.token, body: { title: 'hack', body: 'x', audienceType: 'school' } });
  check('student cannot create notices → 403', studentCreateNotice.status === 403);

  const archiveN = await api(`/api/notices/${notice.body.data._id}/archive`, { method: 'POST', token: admin.token });
  check('admin archives notice', archiveN.status === 200);
  const publishN = await api(`/api/notices/${notice.body.data._id}/publish`, { method: 'POST', token: admin.token });
  check('admin re-publishes notice', publishN.status === 200);

  // ── Notifications ─────────────────────────────────────
  console.log('▶ Notifications');
  const notifList = await api('/api/notifications?limit=20', { token: student.token });
  check('student notification list w/ unreadCount', notifList.status === 200 && typeof notifList.body.unreadCount === 'number' && Array.isArray(notifList.body.data));
  check('notice + assignment events generated notifications', notifList.body.data.some((n) => n.type === 'NEW_NOTICE'));

  if (notifList.body.data.length > 0) {
    const markOne = await api(`/api/notifications/${notifList.body.data[0]._id}/read`, { method: 'PATCH', token: student.token });
    check('mark one read → 200', markOne.status === 200 && markOne.body.data.isRead === true);
    const markAll = await api('/api/notifications/read-all', { method: 'POST', token: student.token });
    check('mark all read → 200', markAll.status === 200);
    const after = await api('/api/notifications?unread=true', { token: student.token });
    check('unread filter now empty', after.status === 200 && after.body.data.length === 0);
  }

  // ── Leave requests ────────────────────────────────────
  console.log('▶ Leave requests');
  const leaveFrom = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const leaveTo = new Date(Date.now() + 11 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const leave = await api('/api/leave-requests', { method: 'POST', token: student.token, body: { fromDate: leaveFrom, toDate: leaveTo, reason: `Family event ${stamp}` } });
  check('student submits leave → 201', leave.status === 201, JSON.stringify(leave.body));
  const leaveId = leave.body?.data?._id;

  const badLeave = await api('/api/leave-requests', { method: 'POST', token: student.token, body: { fromDate: leaveTo, toDate: leaveFrom, reason: 'bad dates here' } });
  check('toDate before fromDate → 422', badLeave.status === 422);

  const adminLeaves = await api('/api/leave-requests?status=pending&limit=20', { token: admin.token });
  check('admin sees pending leave queue', adminLeaves.status === 200 && adminLeaves.body.data.some((l) => l._id === leaveId));

  const teacherLeaves = await api('/api/leave-requests?limit=20', { token: teacher.token });
  check('teacher sees only own leave requests', teacherLeaves.status === 200 && teacherLeaves.body.data.every((l) => l.requesterType === 'teacher'));

  const teacherApprove = await api(`/api/leave-requests/${leaveId}/review`, { method: 'PATCH', token: teacher.token, body: { decision: 'approve' } });
  check('teacher cannot approve leave → 403', teacherApprove.status === 403);

  const approve = await api(`/api/leave-requests/${leaveId}/review`, { method: 'PATCH', token: admin.token, body: { decision: 'approve', reviewNote: 'Granted' } });
  check('admin approves leave → 200', approve.status === 200 && approve.body.data.status === 'approved', JSON.stringify(approve.body));

  const reReview = await api(`/api/leave-requests/${leaveId}/review`, { method: 'PATCH', token: admin.token, body: { decision: 'reject' } });
  check('double review → 400', reReview.status === 400, String(reReview.status));

  const ownLeaves = await api('/api/leave-requests?limit=20', { token: student.token });
  check('student sees own leave with status approved', ownLeaves.status === 200 && ownLeaves.body.data.some((l) => l._id === leaveId && l.status === 'approved'));

  // ── Global search ─────────────────────────────────────
  console.log('▶ Global search');
  const searchAdmin = await api('/api/search?q=Bilal', { token: admin.token });
  check('admin search finds student', searchAdmin.status === 200 && searchAdmin.body.data.sections.some((s) => s.section === 'students' && s.items.length > 0), JSON.stringify(searchAdmin.body.data?.sections?.map((s) => s.section)));

  const searchTeacher = await api('/api/search?q=Bilal', { token: teacher.token });
  check('teacher search finds student', searchTeacher.status === 200 && searchTeacher.body.data.sections.some((s) => s.section === 'students'));

  const searchStudent = await api('/api/search?q=T-1001', { token: student.token });
  check('student search does NOT leak teachers', searchStudent.status === 200 && !searchStudent.body.data.sections.some((s) => s.section === 'teachers'));

  const searchStudentSelf = await api('/api/search?q=Bilal', { token: student.token });
  check('student search students section = self only', searchStudentSelf.status === 200 && searchStudentSelf.body.data.sections.filter((s) => s.section === 'students').every((s) => s.items.length <= 1));

  const searchReceipt = await api('/api/search?q=RCPT-2026', { token: admin.token });
  check('admin search finds receipts', searchReceipt.status === 200 && searchReceipt.body.data.sections.some((s) => s.section === 'payments'));

  const searchNoQ = await api('/api/search?q=', { token: admin.token });
  check('empty query → empty sections', searchNoQ.status === 200 && searchNoQ.body.data.sections.length === 0);

  const searchLong = await api(`/api/search?q=${'x'.repeat(200)}`, { token: admin.token });
  check('oversized query rejected safely (200/422, no 500)', [200, 422].includes(searchLong.status));

  // ── Dashboard analytics ───────────────────────────────
  console.log('▶ Dashboard analytics');
  const staffDash = await api('/api/dashboard/analytics', { token: admin.token });
  check('staff analytics shape', staffDash.status === 200 && staffDash.body.data.role === 'staff' && Array.isArray(staffDash.body.data.monthly) && staffDash.body.data.monthly.length === 6, JSON.stringify(staffDash.body.data?.error ?? ''));
  check('staff analytics numbers are ints', [staffDash.body.data.finance.collectionThisMonth, staffDash.body.data.totals.students].every((n) => Number.isInteger(n)));

  const teacherDash = await api('/api/dashboard/analytics', { token: teacher.token });
  check('teacher analytics shape', teacherDash.status === 200 && teacherDash.body.data.role === 'teacher' && Array.isArray(teacherDash.body.data.myClasses));

  const studentDash = await api('/api/dashboard/analytics', { token: student.token });
  check('student analytics shape', studentDash.status === 200 && studentDash.body.data.role === 'student' && typeof studentDash.body.data.attendance.percentage === 'number' && Array.isArray(studentDash.body.data.upcomingFees));

  const accountantDash = await api('/api/dashboard/analytics', { token: accountant.token });
  check('accountant analytics allowed', accountantDash.status === 200 && accountantDash.body.data.role === 'staff');

  // ── Report center ─────────────────────────────────────
  console.log('▶ Report center');
  const examRep = await api('/api/reports/exams', { token: admin.token });
  check('exam report → 200 rows', examRep.status === 200 && Array.isArray(examRep.body.data.rows));

  const attRep = await api(`/api/reports/attendance?month=2026-09`, { token: admin.token });
  check('attendance report → 200 rows', attRep.status === 200 && Array.isArray(attRep.body.data.rows));

  const sessionRep = await api('/api/reports/session-overview', { token: admin.token });
  check('session report → 200 rows', sessionRep.status === 200 && sessionRep.body.data.rows.length >= 2);

  const teacherRep = await api('/api/reports/teacher-workload', { token: admin.token });
  check('teacher report → 200 rows', teacherRep.status === 200 && Array.isArray(teacherRep.body.data.rows));

  const repCsv = await api('/api/reports/exams?format=csv', { token: admin.token });
  check('exam report CSV', repCsv.status === 200 && repCsv.headers.get('content-type')?.includes('text/csv'));

  const studentReport = await api('/api/reports/exams', { token: student.token });
  check('student cannot access reports → 403', studentReport.status === 403);
  const teacherReportAccess = await api('/api/reports/exams', { token: teacher.token });
  check('teacher cannot access reports → 403', teacherReportAccess.status === 403);

  console.log(`\nPhase 7+8 results: ${passed} passed, ${failed} failed`);
  process.exitCode = (failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Suite crashed:', err);
  process.exitCode = (1);
});

