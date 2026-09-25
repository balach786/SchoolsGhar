/**
 * Complete Exam Management Module Integration Tests
 * Run with: node tests/exam_management_complete.test.mjs [baseUrl]
 */
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

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, body: json, headers: res.headers };
}

async function login(email, password = 'Password123') {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  return { status: r.status, token: r.body?.data?.accessToken, user: r.body?.data?.user };
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`COMPLETE EXAM MANAGEMENT MODULE TEST SUITE`);
  console.log(`Testing against: ${BASE}`);
  console.log(`======================================================\n`);

  // 1. Auth setup
  console.log('▶ Authenticating Test Accounts');
  const admin = await login('admin@school.test');
  const accountant = await login('accountant@school.test');
  const teacher = await login('teacher@school.test');
  check('admin login successful', admin.status === 200 && !!admin.token);
  check('accountant login successful', accountant.status === 200 && !!accountant.token);
  check('teacher login successful', teacher.status === 200 && !!teacher.token);

  // 2. Discover seed data
  console.log('\n▶ Discovering Academic Session and Classes');
  const activeS = await api('/api/academic-sessions/active', { token: admin.token });
  const sessionId = activeS.body?.data?._id;
  check('found active academic session', !!sessionId);

  const classesRes = await api(`/api/classes?sessionId=${sessionId}&limit=10`, { token: admin.token });
  const testClass = classesRes.body?.data?.find((c) => c.name === 'Grade 1') || classesRes.body?.data?.[0];
  check('found test class', !!testClass);
  const classId = testClass?._id;

  const subjectsRes = await api('/api/subjects?limit=5', { token: admin.token });
  const testSubject1 = subjectsRes.body?.data?.[0];
  const testSubject2 = subjectsRes.body?.data?.[1] || testSubject1;
  check('found test subject 1', !!testSubject1);
  check('found test subject 2', !!testSubject2);

  const studentsRes = await api(`/api/students?sessionId=${sessionId}&classId=${classId}&limit=10`, { token: admin.token });
  const students = studentsRes.body?.data || [];
  check('found enrolled students in class', students.length >= 2);
  const student1 = students[0];
  const student2 = students[1] || students[0];

  // 3. Exam Types
  console.log('\n▶ Testing Exam Types (Seeding & Custom Types)');
  const examTypesRes = await api('/api/exams/types', { token: admin.token });
  check('GET /api/exams/types returns default types', examTypesRes.status === 200 && examTypesRes.body?.data?.length > 0);
  const defaultType = examTypesRes.body?.data?.[0];

  const customTypeRes = await api('/api/exams/types', {
    method: 'POST',
    token: admin.token,
    body: {
      name: `Pre-Board Assessment ${Date.now()}`,
      description: 'Mock board practice exams',
      weightage: 20,
    },
  });
  check('POST /api/exams/types creates custom exam type', customTypeRes.status === 201 && !!customTypeRes.body?.data?._id);
  const examTypeId = customTypeRes.body?.data?._id || defaultType._id;

  // 4. Create Full Examination
  console.log('\n▶ Testing Multi-Class Exam Creation with Fee Clearance Flag');
  const examPayload = {
    name: `Mid-Term Examination ${Date.now()}`,
    sessionId,
    classId, // backward compatibility
    classIds: [classId],
    examTypeId,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 10 * 86400000).toISOString(),
    requireExamFeeForAdmitCard: true,
    subjects: [
      { subjectId: testSubject1._id, maxMarks: 100, passMarks: 40 },
      { subjectId: testSubject2._id, maxMarks: 100, passMarks: 40 },
    ],
  };

  const createExamRes = await api('/api/exams', {
    method: 'POST',
    token: admin.token,
    body: examPayload,
  });
  check('POST /api/exams creates exam with extended properties', createExamRes.status === 201);
  const examId = createExamRes.body?.data?._id;
  check('exam created with valid ID', !!examId);

  // 5. Exam Schedules
  console.log('\n▶ Testing Exam Schedules & Timetable');
  const schedDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const sched1 = await api('/api/exams/schedules', {
    method: 'POST',
    token: admin.token,
    body: {
      examId,
      classId,
      subjectId: testSubject1._id,
      examDate: schedDate,
      startTime: '09:00',
      endTime: '12:00',
      roomNumber: 'Hall A',
      maxMarks: 100,
      passMarks: 40,
    },
  });
  check('POST /api/exams/schedules creates subject schedule', sched1.status === 201);
  const scheduleId1 = sched1.body?.data?._id;

  // Duplicate schedule for same subject/class/exam should be rejected
  const schedDup = await api('/api/exams/schedules', {
    method: 'POST',
    token: admin.token,
    body: {
      examId,
      classId,
      subjectId: testSubject1._id,
      examDate: schedDate,
      startTime: '09:00',
      endTime: '12:00',
    },
  });
  check('POST /api/exams/schedules prevents duplicate subject in same exam', schedDup.status === 409);

  // Printable schedule
  const printSched = await api(`/api/exams/schedules/printable?examId=${examId}&classId=${classId}`, {
    token: admin.token,
  });
  check('GET /api/exams/schedules/printable returns timetable structure', printSched.status === 200 && Array.isArray(printSched.body?.data?.timetable));

  // 6. Exam Fees (Independent from Tuition)
  console.log('\n▶ Testing Separate Exam Fees: Setup, Bulk Generation, and Collection');
  const feeSetupRes = await api('/api/exams/fees/setup', {
    method: 'POST',
    token: accountant.token,
    body: {
      examId,
      classId,
      amount: 150000, // 1500 PKR in paisa
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      description: 'Midterm paper & lab fee',
    },
  });
  check('POST /api/exams/fees/setup sets class fee amount', feeSetupRes.status === 200 || feeSetupRes.status === 201);

  // Generate student fee records
  const feeGenRes = await api('/api/exams/fees/generate', {
    method: 'POST',
    token: accountant.token,
    body: { examId, classId },
  });
  check('POST /api/exams/fees/generate creates student exam fee records', feeGenRes.status === 200 || feeGenRes.status === 201);

  // Second generate should report 0 new created or handle gracefully (idempotency)
  const feeGenDup = await api('/api/exams/fees/generate', {
    method: 'POST',
    token: accountant.token,
    body: { examId, classId },
  });
  check('fee generation handles duplicate existing records gracefully', (feeGenDup.status === 200 || feeGenDup.status === 201) && (feeGenDup.body?.data?.createdCount === 0 || feeGenDup.body?.data?.generated === 0));

  // Partial Payment Collection
  console.log('\n▶ Testing Partial & Full Payment Collection with Atomic Receipt Generation');
  const studentFeeListRes = await api(`/api/exams/fees/students?examId=${examId}&classId=${classId}`, {
    token: accountant.token,
  });
  const stFee1 = studentFeeListRes.body?.data?.find((f) => f.studentId?._id === student1._id || f.studentId === student1._id || String(f.studentId) === String(student1._id));
  check('found student1 exam fee record', !!stFee1 && (stFee1.status === 'pending' || stFee1.status === 'unpaid'));

  const payPartialRes = await api('/api/exams/fees/collect', {
    method: 'POST',
    token: accountant.token,
    body: {
      studentExamFeeId: stFee1._id,
      amountPaid: 50000, // 500 PKR
      paymentMethod: 'Cash',
      remarks: 'First installment',
    },
  });
  check('partial exam fee payment records successfully', payPartialRes.status === 200 || payPartialRes.status === 201);
  check('status transitioned to partial', payPartialRes.body?.data?.studentFee?.status === 'partial');
  check('due amount updated correctly', payPartialRes.body?.data?.studentFee?.dueAmount === 100000 || payPartialRes.body?.data?.studentFee?.remainingBalance === 100000);
  const receiptNumber = payPartialRes.body?.data?.payment?.receiptNumber;
  check('atomic receipt generated with EXM-RCPT format', typeof receiptNumber === 'string' && receiptNumber.startsWith('EXM-RCPT-'));

  // Settle remainder of student 1
  const payFullRes = await api('/api/exams/fees/collect', {
    method: 'POST',
    token: accountant.token,
    body: {
      studentExamFeeId: stFee1._id,
      amountPaid: 100000, // 1000 PKR remaining
      paymentMethod: 'Bank Transfer',
    },
  });
  check('full payment settles remaining dues', payFullRes.status === 200 || payFullRes.status === 201);
  check('student1 status is now paid', payFullRes.body?.data?.studentFee?.status === 'paid');
  check('due amount is 0', payFullRes.body?.data?.studentFee?.dueAmount === 0 || payFullRes.body?.data?.studentFee?.remainingBalance === 0);

  // Student 2 remains unpaid/pending for admit card check!

  // 7. Exam Expenses & Net Exam Balance
  console.log('\n💳  Testing Dedicated Exam Expenses & Isolated Net Balance');
  const expenseRes = await api('/api/expenses', {
    method: 'POST',
    token: accountant.token,
    body: {
      examId,
      title: 'Question Paper Printing & Envelopes',
      category: 'Exam Expense',
      amount: 40000, // 400 PKR
      date: new Date().toISOString().slice(0, 10),
      paymentMethod: 'Cash',
      receiptNumber: 'VCH-EXM-001',
    },
  });
  check('POST /api/expenses logs exam operational cost', expenseRes.status === 201);

  // Net Exam Balance check: (Fees collected: 1500) - (Expenses: 400) = 1100 surplus
  const netBalanceRes = await api(`/api/exams/reports/net-balance?examId=${examId}`, {
    token: admin.token,
  });
  check('GET /api/exams/reports/net-balance calculated successfully', netBalanceRes.status === 200);
  const netBal = netBalanceRes.body?.data;
  check('collectedFees matches actual exam fee receipts', netBal?.collectedFees === 150000);
  check('totalExpenses matches exam expenses', netBal?.totalExpenses === 40000);
  check('netBalance equals collectedFees - totalExpenses (isolated from tuition)', netBal?.netBalance === 110000);
  check('status reports surplus', netBal?.status === 'surplus');

  // 8. Admit Card Eligibility Rule & Admin Override
  console.log('\n▶ Testing Admit Card Eligibility & Emergency Admin Override');
  const admitRosterRes = await api(`/api/exams/admit-cards/students?examId=${examId}&classId=${classId}`, {
    token: admin.token,
  });
  check('GET /api/exams/admit-cards/students returns roster', admitRosterRes.status === 200);
  const admitRoster = admitRosterRes.body?.data?.cards || admitRosterRes.body?.data || [];

  const admitSt1 = admitRoster.find((r) => r.studentId === student1._id || r.student?._id === student1._id);
  check('fully paid student1 is ELIGIBLE for admit card', admitSt1?.isEligible === true && (admitSt1?.status === 'eligible' || admitSt1?.statusText?.toLowerCase().includes('eligible')));

  if (student2 && student2._id !== student1._id) {
    const admitSt2 = admitRoster.find((r) => r.studentId === student2._id || r.student?._id === student2._id);
    check('unpaid student2 is BLOCKED from admit card', admitSt2?.isEligible === false && (admitSt2?.status === 'pending_fees' || admitSt2?.statusText?.toLowerCase().includes('blocked') || admitSt2?.statusText?.toLowerCase().includes('pending')));

    // Admin Emergency Override
    console.log('  Testing Emergency Admin Override for unpaid student...');
    const overrideRes = await api('/api/exams/admit-cards/override', {
      method: 'POST',
      token: admin.token,
      body: {
        examId,
        studentId: student2._id,
        reason: 'Principal special permission: parent promised clearance next week.',
      },
    });
    check('admin override granted', overrideRes.status === 200 || overrideRes.status === 201);

    // Re-verify eligibility after override
    const admitRosterAfterRes = await api(`/api/exams/admit-cards/students?examId=${examId}&classId=${classId}`, {
      token: admin.token,
    });
    const admitRosterAfter = admitRosterAfterRes.body?.data?.cards || admitRosterAfterRes.body?.data || [];
    const admitSt2After = admitRosterAfter.find((r) => r.studentId === student2._id || r.student?._id === student2._id);
    check('student2 now ELIGIBLE due to admin override', admitSt2After?.isEligible === true && (admitSt2After?.status === 'overridden' || admitSt2After?.statusText?.toLowerCase().includes('overridden')));

    // Print Admit Card
    const printCardRes = await api(`/api/exams/admit-cards/print?examId=${examId}&studentId=${student2._id}`, {
      token: admin.token,
    });
    check('printable admit card generated with timetable & rules', printCardRes.status === 200 && !!printCardRes.body?.data?.exam);
  }

  // 9. Exam Attendance
  console.log('\n▶ Testing Exam Session Attendance');
  const attSaveRes = await api('/api/exams/attendance', {
    method: 'POST',
    token: teacher.token,
    body: {
      examId,
      scheduleId: scheduleId1,
      records: [
        { studentId: student1._id, status: 'present', remarks: 'On time' },
        ...(student2 && student2._id !== student1._id ? [{ studentId: student2._id, status: 'absent', remarks: 'Sick leave' }] : []),
      ],
    },
  });
  check('POST /api/exams/attendance records student session presence', attSaveRes.status === 200);

  const attSheetRes = await api(`/api/exams/attendance/sheet?examId=${examId}&scheduleId=${scheduleId1}`, {
    token: teacher.token,
  });
  check('GET /api/exams/attendance/sheet returns marked session roster', attSheetRes.status === 200 && attSheetRes.body?.data?.records?.length >= 1);

  // 10. Marks Entry with Distinct Absent Status
  console.log('\n▶ Testing Marks Entry with isAbsent Distinction');
  const marksBulkRes = await api('/api/marks/bulk', {
    method: 'POST',
    token: teacher.token,
    body: {
      examId,
      overwrite: true,
      records: [
        { studentId: student1._id, subjectId: testSubject1._id, marksObtained: 85, isAbsent: false },
        { studentId: student1._id, subjectId: testSubject2._id, marksObtained: 90, isAbsent: false },
        ...(student2 && student2._id !== student1._id ? [
          { studentId: student2._id, subjectId: testSubject1._id, marksObtained: 0, isAbsent: true },
          { studentId: student2._id, subjectId: testSubject2._id, marksObtained: 45, isAbsent: false },
        ] : []),
      ],
    },
  });
  check('POST /api/marks/bulk records marks and distinct isAbsent status', marksBulkRes.status === 200 || marksBulkRes.status === 201);

  // 11. Results & Ranking (No GPA, percentage & grade scales)
  console.log('\n▶ Testing Results Calculation, Ties, and Publishing');
  const summaryRes = await api(`/api/results/exam-summary?examId=${examId}`, { token: admin.token });
  check('GET /api/results/exam-summary calculates class ranks', summaryRes.status === 200);
  const rankedStudents = summaryRes.body?.data?.students || [];
  check('first rank awarded to highest percentage student', rankedStudents[0]?.studentId === student1._id && rankedStudents[0]?.rank === 1);

  // Publish exam
  const publishRes = await api(`/api/exams/${examId}/publish`, {
    method: 'PATCH',
    token: admin.token,
    body: { isPublished: true },
  });
  check('PATCH /api/exams/:id/publish successfully publishes results', publishRes.status === 200 && publishRes.body?.data?.isPublished === true);

  // 12. Exam Reports & Finance Integration
  console.log('\n▶ Testing Comprehensive Exam Reports & Finance Separation');
  const repSummary = await api(`/api/exams/reports/summary?examId=${examId}`, { token: admin.token });
  check('GET /api/exams/reports/summary returns overall metrics', repSummary.status === 200 && repSummary.body?.data?.totalStudents > 0);

  const repFees = await api(`/api/exams/reports/fees?examId=${examId}`, { token: admin.token });
  check('GET /api/exams/reports/fees returns fee clearance audit', repFees.status === 200 && repFees.body?.data?.totalCollected > 0);

  const repFin = await api(`/api/exams/reports/financial-summary?examId=${examId}`, { token: admin.token });
  check('GET /api/exams/reports/financial-summary returns isolated financial statement', repFin.status === 200 && repFin.body?.data?.netBalance > 0);

  console.log(`\n======================================================`);
  console.log(`TEST RESULTS SUMMARY`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Test run failed with unhandled error:', err);
  process.exit(1);
});
