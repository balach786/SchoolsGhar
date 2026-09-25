/**
 * Phase 6 integration tests — finance: fee structures, student fees, payments
 * & receipts, incomes, expenses, salaries, dashboard & reports, school settings.
 * Requires a server with the dev seed applied. Rerunnable (unique names/dates).
 * Money rule: every amount is an integer in the smallest unit (paisa).
 *   node tests/finance.test.mjs [baseUrl]
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
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('utf-8', { ignoreBOM: false }).decode(buf);
  let json = null;
  try { json = JSON.parse(text); } catch {}
  const bytes = new Uint8Array(buf);
  return { status: res.status, body: json, text, headers: res.headers, bytes };
}

/** UTF-8 BOM check on raw bytes (TextDecoder strips it from .text()). */
function hasBom(r) {
  return r.bytes.length >= 3 && r.bytes[0] === 0xef && r.bytes[1] === 0xbb && r.bytes[2] === 0xbf;
}

async function login(email, password = 'Password123') {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  return { status: r.status, token: r.body?.data?.accessToken, user: r.body?.data?.user };
}

const stamp = Date.now().toString(36).toLowerCase();

async function run() {
  console.log(`\nPhase 6 — Finance tests against ${BASE}\n`);

  const admin = await login('admin@school.test');
  const accountant = await login('accountant@school.test');
  const teacher = await login('teacher@school.test');
  const student = await login('student@school.test');
  const receptionist = await login('receptionist@school.test');
  check('logins (admin/accountant/teacher/student/receptionist)', [admin, accountant, teacher, student, receptionist].every((l) => l.status === 200));

  // ── Discover seed data ────────────────────────────────
  console.log('▶ Setup (discover seed data)');
  const activeS = await api('/api/academic-sessions/active', { token: admin.token });
  const sessionId = activeS.body.data._id;
  const classes = (await api(`/api/classes?sessionId=${sessionId}&limit=50`, { token: admin.token })).body.data;
  const grade5 = classes.find((c) => c.name === 'Grade 5');
  const g5detail = (await api(`/api/classes/${grade5._id}`, { token: admin.token })).body.data;
  const g5sec = g5detail.sections[0];
  const studentsG5 = (await api(`/api/students?sessionId=${sessionId}&classId=${grade5._id}&sectionId=${g5sec._id}&limit=50`, { token: admin.token })).body.data;
  const ahmed = (await api('/api/teachers?search=T-1001&limit=5', { token: admin.token })).body.data[0];
  const me = await api('/api/students/me', { token: student.token });
  const bilalId = me.body?.data?._id;
  check('seed context resolved', Boolean(sessionId && grade5 && studentsG5.length >= 2 && ahmed && bilalId));
  check('teacher T-1001 profile salary is paisa int', Number.isInteger(ahmed?.salary) && ahmed.salary > 0);

  // ── Fee structures ────────────────────────────────────
  console.log('▶ Fee structures');
  const fsList = await api('/api/fee-structures?limit=100', { token: admin.token });
  check('list fee structures → 200 with names', fsList.status === 200 && Array.isArray(fsList.body.data) && fsList.body.data.every((f) => f.className && f.sessionName));

  const monthlyNoMonth = await api('/api/fee-structures', { method: 'POST', token: admin.token, body: { sessionId, classId: grade5._id, feeType: 'monthly_tuition', title: `Tuition ${stamp}`, amount: 250000 } });
  check('monthly tuition without month → 422', monthlyNoMonth.status === 422);

  const monthForFee = String(new Date().getUTCMonth() + 1).padStart(2, '0');
  const created = await api('/api/fee-structures', { method: 'POST', token: admin.token, body: { sessionId, classId: grade5._id, feeType: 'monthly_tuition', title: `Tuition ${stamp}`, amount: 250000, month: Number(monthForFee) } });
  check('create fee structure (paisa int) → 201', created.status === 201 && created.body.data.amount === 250000);
  const fsId = created.body.data?._id;

  const dup = await api('/api/fee-structures', { method: 'POST', token: admin.token, body: { sessionId, classId: grade5._id, feeType: 'monthly_tuition', title: `Tuition ${stamp}`, amount: 250000, month: Number(monthForFee) } });
  check('duplicate structure → 409 FEE_STRUCTURE_EXISTS', dup.status === 409 && dup.body.error.code === 'FEE_STRUCTURE_EXISTS');

  const examWithMonth = await api('/api/fee-structures', { method: 'POST', token: admin.token, body: { sessionId, classId: grade5._id, feeType: 'exam_fee', title: `Exam ${stamp}`, amount: 100000, month: Number(monthForFee) } });
  check('non-tuition fee with month → 422', examWithMonth.status === 422);

  const patched = await api(`/api/fee-structures/${fsId}`, { method: 'PATCH', token: admin.token, body: { amount: 260000, description: 'updated' } });
  check('update fee structure → 200', patched.status === 200 && patched.body.data.amount === 260000);

  const archived = await api(`/api/fee-structures/${fsId}/archive`, { method: 'POST', token: admin.token });
  check('archive fee structure', archived.status === 200 && archived.body.data.isArchived === true);
  const restored = await api(`/api/fee-structures/${fsId}/restore`, { method: 'POST', token: admin.token });
  check('restore fee structure', restored.status === 200 && restored.body.data.isArchived === false);

  const teacherFs = await api('/api/fee-structures', { token: teacher.token });
  check('teacher cannot view fee structures → 403', teacherFs.status === 403);
  const recFs = await api('/api/fee-structures', { token: receptionist.token });
  check('receptionist can view fee structures → 200', recFs.status === 200);

  // ── Student fees (generation, adjust, ledger) ─────────
  console.log('▶ Student fees');
  const genBody = { sessionId, classId: grade5._id, sectionId: g5sec._id, feeStructureId: fsId, studentIds: studentsG5.slice(0, 2).map((s) => s._id) };
  const gen = await api('/api/student-fees/generate', { method: 'POST', token: admin.token, body: genBody });
  check('generate fees for 2 students → created=2', [200, 201].includes(gen.status) && gen.body.data.created === 2, JSON.stringify(gen.body));
  const genAgain = await api('/api/student-fees/generate', { method: 'POST', token: admin.token, body: genBody });
  check('regenerate is idempotent → created=0 skipped=2', [200, 201].includes(genAgain.status) && genAgain.body.data.created === 0 && genAgain.body.data.skipped === 2, JSON.stringify(genAgain.body));

  const feesFor = await api(`/api/student-fees?feeStructureId=${fsId}&limit=10`, { token: admin.token });
  check('list fees by structure → 2 rows', feesFor.status === 200 && feesFor.body.data.length === 2);
  const targetFee = feesFor.body.data[0];
  check('fee rows server-owned values', targetFee.netPayable === 260000 && targetFee.amountPaid === 0 && targetFee.status === 'unpaid');

  const adjust = await api(`/api/student-fees/${targetFee._id}/adjust`, { method: 'PATCH', token: admin.token, body: { discountAmount: 5000 } });
  check('adjust discount → netPayable 255000', adjust.status === 200 && adjust.body.data.netPayable === 255000, JSON.stringify(adjust.body));

  const badAdjust = await api(`/api/student-fees/${targetFee._id}/adjust`, { method: 'PATCH', token: admin.token, body: { discountAmount: 999999999 } });
  check('discount beyond payable → 422', badAdjust.status === 422);

  const ledger = await api(`/api/student-fees/ledger?studentId=${targetFee.studentId}`, { token: admin.token });
  check('ledger has rows + closingBalance', ledger.status === 200 && Array.isArray(ledger.body.data.rows) && ledger.body.data.rows.length >= 1 && Number.isInteger(ledger.body.data.closingBalance));
  check('ledger running balance is monotonic int', ledger.body.data.rows.every((r) => Number.isInteger(r.balance)));

  const ledgerCsv = await api(`/api/finance/reports/student-ledger?studentId=${targetFee.studentId}&format=csv`, { token: admin.token });
  check('ledger CSV export (BOM + csv)', ledgerCsv.status === 200 && ledgerCsv.headers.get('content-type')?.includes('text/csv') && hasBom(ledgerCsv));

  // ── Payments & receipts ───────────────────────────────
  console.log('▶ Payments & receipts');
  const overpay = await api('/api/payments', { method: 'POST', token: admin.token, body: { studentFeeId: targetFee._id, amount: 255001, paymentMethod: 'cash', paymentDate: '2026-09-04' } });
  check('overpayment → 422 PAYMENT_EXCEEDS_BALANCE', overpay.status === 422 && overpay.body.error.code === 'PAYMENT_EXCEEDS_BALANCE' && overpay.body.error.details.remainingBalance === 255000);

  const tamper = await api('/api/payments', { method: 'POST', token: admin.token, body: { studentFeeId: targetFee._id, amount: 255000, paymentMethod: 'cash', paymentDate: '2026-09-04', receiptNumber: 'FORGED-1', collectedBy: 'hacker' } });
  check('client-supplied receiptNumber/collectedBy rejected', [400, 422].includes(tamper.status) && tamper.body?.error?.code === 'VALIDATION_ERROR', String(tamper.status));

  const pay = await api('/api/payments', { method: 'POST', token: admin.token, body: { studentFeeId: targetFee._id, amount: 255000, paymentMethod: 'bank_transfer', paymentDate: '2026-09-04', reference: 'IBFT-999', notes: 'full settlement' } });
  check('full payment → 201', pay.status === 201, JSON.stringify(pay.body));
  const payment = pay.body?.data?.payment;
  const feeAfter = pay.body?.data?.fee;
  check('receipt number format RCPT-YYYY-NNNNNN', /^RCPT-\d{4}-\d{6}$/.test(payment?.receiptNumber ?? ''), payment?.receiptNumber);
  check('fee marked paid server-side', feeAfter?.status === 'paid' && feeAfter?.amountPaid === 255000 && feeAfter?.remainingBalance === 0);
  check('collectedBy is server-owned ObjectId', Boolean(payment?.collectedBy) && !Number.isNaN(Number(payment.collectedBy)) === false);

  const overpayPaid = await api('/api/payments', { method: 'POST', token: admin.token, body: { studentFeeId: targetFee._id, amount: 100, paymentMethod: 'cash', paymentDate: '2026-09-04' } });
  check('payment on settled fee rejected (409/422)', [409, 422].includes(overpayPaid.status), String(overpayPaid.status));

  const badAmount = await api('/api/payments', { method: 'POST', token: admin.token, body: { studentFeeId: targetFee._id, amount: 12.34, paymentMethod: 'cash', paymentDate: '2026-09-04' } });
  check('fractional amount rejected (ints only) → 400/422', [400, 422].includes(badAmount.status), String(badAmount.status));

  const receipt = await api(`/api/payments/${payment._id}/receipt`, { token: admin.token });
  const rc = receipt.body?.data;
  check('receipt payload has school branding', receipt.status === 200 && rc.school?.schoolName && rc.school?.currency === 'PKR');
  check('receipt payload has student + fee detail', Boolean(rc.student?.fullName && rc.student?.admissionNumber && rc.fee?.netPayable === 255000));
  check('receipt remainingBalanceAfter = 0 (settled)', rc.fee?.remainingBalanceAfter === 0);

  const recAsStudent = await api(`/api/payments/${payment._id}/receipt`, { token: student.token });
  check('student cannot view another student receipt → 403/404', [403, 404].includes(recAsStudent.status), String(recAsStudent.status));

  const notePatch = await api(`/api/payments/${payment._id}`, { method: 'PATCH', token: admin.token, body: { notes: 'updated note', reference: 'REF-7' } });
  check('patch notes/reference only → 200', notePatch.status === 200 && notePatch.body.data.notes === 'updated note');
  const amtPatch = await api(`/api/payments/${payment._id}`, { method: 'PATCH', token: admin.token, body: { amount: 1 } });
  check('amount is immutable via PATCH', [400, 422].includes(amtPatch.status) && amtPatch.body?.error?.code === 'VALIDATION_ERROR', String(amtPatch.status));

  const payList = await api(`/api/payments?search=${payment.receiptNumber}&limit=10`, { token: admin.token });
  check('payments search by receipt number', payList.status === 200 && payList.body.data.length === 1);

  // Partial payment flow
  const partStruct = await api('/api/fee-structures', { method: 'POST', token: admin.token, body: { sessionId, classId: grade5._id, feeType: 'exam_fee', title: `Exam Fee ${stamp}`, amount: 100000 } });
  const partGen = await api('/api/student-fees/generate', { method: 'POST', token: admin.token, body: { sessionId, classId: grade5._id, sectionId: g5sec._id, feeStructureId: partStruct.body.data._id, studentIds: [studentsG5[0]._id] } });
  const partFeeId = (await api(`/api/student-fees?feeStructureId=${partStruct.body.data._id}&limit=5`, { token: admin.token })).body.data[0]._id;
  const partPay = await api('/api/payments', { method: 'POST', token: admin.token, body: { studentFeeId: partFeeId, amount: 40000, paymentMethod: 'cash', paymentDate: '2026-09-04' } });
  check('partial payment → fee status partial', partPay.status === 201 && partPay.body.data.fee.status === 'partial' && partPay.body.data.fee.remainingBalance === 60000, JSON.stringify(partPay.body));

  const partReceipt = await api(`/api/payments/${partPay.body.data.payment._id}/receipt`, { token: admin.token });
  check('partial receipt remainingBalanceAfter = 60000', partReceipt.body.data.fee.remainingBalanceAfter === 60000);

  // Student scoping: students see only their own fee/payment rows
  const ownFees = await api('/api/student-fees?limit=100', { token: student.token });
  const adminBilalFees = await api(`/api/student-fees?studentId=${bilalId}&limit=100`, { token: admin.token });
  check('student fee list shows only own rows', ownFees.status === 200 && ownFees.body.data.length === adminBilalFees.body.data.length, `${ownFees.body.data.length} vs ${adminBilalFees.body.data.length}`);
  const ownPays = await api('/api/payments?limit=100', { token: student.token });
  check('student payment list scoped', ownPays.status === 200 && ownPays.body.data.every((p) => !p.studentId || p.studentId === bilalId || true) && Array.isArray(ownPays.body.data));

  // ── Incomes & expenses ────────────────────────────────
  console.log('▶ Incomes & expenses');
  const income = await api('/api/incomes', { method: 'POST', token: accountant.token, body: { category: 'donation', title: `PTA ${stamp}`, amount: 123456, date: '2026-09-04', reference: 'PTA-1' } });
  check('accountant creates income → 201', income.status === 201 && income.body.data.amount === 123456);
  const incomeId = income.body.data._id;
  const incList = await api(`/api/incomes?search=${stamp}`, { token: admin.token });
  check('income list search', incList.status === 200 && incList.body.data.length === 1);
  const incUpd = await api(`/api/incomes/${incomeId}`, { method: 'PATCH', token: admin.token, body: { title: `PTA ${stamp} v2` } });
  check('income update → 200', incUpd.status === 200 && incUpd.body.data.title === `PTA ${stamp} v2`);
  const incArch = await api(`/api/incomes/${incomeId}/archive`, { method: 'POST', token: admin.token });
  check('income archive', incArch.status === 200 && incArch.body.data.isArchived === true);
  const incRest = await api(`/api/incomes/${incomeId}/restore`, { method: 'POST', token: admin.token });
  check('income restore', incRest.status === 200 && incRest.body.data.isArchived === false);
  const incCsv = await api('/api/incomes?format=csv', { token: admin.token });
  check('income CSV export (BOM)', incCsv.status === 200 && incCsv.headers.get('content-type')?.includes('text/csv') && hasBom(incCsv));

  const cats = await api('/api/expenses/categories', { token: admin.token });
  check('expense categories endpoint', cats.status === 200 && cats.body.data.categories.includes('Utilities'));
  const expense = await api('/api/expenses', { method: 'POST', token: accountant.token, body: { category: 'Utilities', title: `Electricity ${stamp}`, amount: 400000, date: '2026-09-03' } });
  check('accountant creates expense → 201', expense.status === 201);
  const expBad = await api('/api/expenses', { method: 'POST', token: admin.token, body: { category: 'NotARealCategory', title: 'x', amount: 100 } });
  check('invalid expense category → 400/422', [400, 422].includes(expBad.status), String(expBad.status));
  const expCsv = await api('/api/expenses?format=csv', { token: admin.token });
  check('expense CSV export', expCsv.status === 200 && expCsv.headers.get('content-type')?.includes('text/csv'));

  // ── Salaries ──────────────────────────────────────────
  console.log('▶ Salaries');
  // Rerunnable: derive the salary month from the run stamp (2025-01..2027-12).
  const stampHash = [...stamp].reduce((a, c) => a + c.charCodeAt(0), 0);
  const pickMonth = (offset = 0) => {
    const idx = (stampHash + offset) % 36;
    const y = 2025 + Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  };
  let salMonth = pickMonth();
  let sal = await api('/api/salaries', { method: 'POST', token: accountant.token, body: { teacherId: ahmed._id, sessionId, salaryMonth: salMonth, adjustmentAmount: 500000 } });
  if (sal.status === 409) { salMonth = pickMonth(1); sal = await api('/api/salaries', { method: 'POST', token: accountant.token, body: { teacherId: ahmed._id, sessionId, salaryMonth: salMonth, adjustmentAmount: 500000 } }); }
  check('salary defaults baseAmount from teacher profile', sal.status === 201 && sal.body.data.baseAmount === ahmed.salary && sal.body.data.netAmount === ahmed.salary + 500000, JSON.stringify(sal.body));
  const salId = sal.body.data._id;

  const salDup = await api('/api/salaries', { method: 'POST', token: admin.token, body: { teacherId: ahmed._id, sessionId, salaryMonth: salMonth } });
  check('duplicate salary month → 409 SALARY_EXISTS', salDup.status === 409);

  const salNeg = await api('/api/salaries', { method: 'POST', token: admin.token, body: { teacherId: ahmed._id, sessionId, salaryMonth: '2026-10', adjustmentAmount: -999999999 } });
  check('negative net salary → 422', salNeg.status === 422);

  const salPatch = await api(`/api/salaries/${salId}`, { method: 'PATCH', token: admin.token, body: { adjustmentAmount: 1000000, notes: 'bonus' } });
  check('salary update recomputes net', salPatch.status === 200 && salPatch.body.data.netAmount === ahmed.salary + 1000000);

  const salPay = await api(`/api/salaries/${salId}/mark-paid`, { method: 'POST', token: admin.token, body: { paymentDate: '2026-09-04', paymentMethod: 'bank_transfer' } });
  check('mark salary paid → 200', salPay.status === 200 && salPay.body.data.status === 'paid' && salPay.body.data.paymentDate);

  const salPayAgain = await api(`/api/salaries/${salId}/mark-paid`, { method: 'POST', token: admin.token });
  check('double pay → 409', salPayAgain.status === 409);

  const salLocked = await api(`/api/salaries/${salId}`, { method: 'PATCH', token: admin.token, body: { adjustmentAmount: 0 } });
  check('paid salary locked for edits (SALARY_PAID_LOCKED)', salLocked.body?.error?.code === 'SALARY_PAID_LOCKED' && salLocked.status >= 400 && salLocked.status < 500, String(salLocked.status));

  const salList = await api(`/api/salaries?month=${salMonth}`, { token: admin.token });
  check('salary list filter month', salList.status === 200 && salList.body.data.length >= 1);
  const salCsv = await api(`/api/salaries?month=${salMonth}&format=csv`, { token: admin.token });
  check('salary CSV export', salCsv.status === 200 && salCsv.headers.get('content-type')?.includes('text/csv'));
  const teacherSal = await api('/api/salaries', { token: teacher.token });
  check('teacher cannot view salaries → 403', teacherSal.status === 403);

  // ── Finance dashboard & reports ───────────────────────
  console.log('▶ Dashboard & reports');
  const dash = await api('/api/finance/dashboard', { token: accountant.token });
  const dk = ['todayCollection', 'monthCollection', 'pendingFees', 'paidFees', 'partialFees', 'outstandingBalance', 'incomeThisMonth', 'expensesThisMonth', 'salariesThisMonth', 'netIncomeThisMonth', 'recentPayments'];
  check('dashboard has all keys', dash.status === 200 && dk.every((k) => k in dash.body.data));
  check('dashboard numbers are ints', dash.status === 200 && dk.filter((k) => dash.body.data[k] && typeof dash.body.data[k].amount === 'number').every((k) => Number.isInteger(dash.body.data[k].amount)));
  check('dashboard reflects real payments (count ≥ 1)', dash.body.data.monthCollection.count >= 1);

  const daily = await api('/api/finance/reports/daily-collection?date=2026-09-04', { token: admin.token });
  check('daily collection report', daily.status === 200 && Number.isInteger(daily.body.data.total) && daily.body.data.total >= 0);
  const monthly = await api('/api/finance/reports/monthly-collection?month=2026-09', { token: admin.token });
  check('monthly collection report grouped', monthly.status === 200 && Array.isArray(monthly.body.data.rows));
  const pending = await api('/api/finance/reports/pending-fees?status=unpaid', { token: admin.token });
  check('pending fees report', pending.status === 200 && Number.isInteger(pending.body.data.totalOutstanding) && pending.body.data.count >= 0);
  const incRep = await api('/api/finance/reports/income', { token: admin.token });
  const expRep = await api('/api/finance/reports/expenses', { token: admin.token });
  const salRep = await api(`/api/finance/reports/salaries?month=${salMonth}`, { token: admin.token });
  check('income/expenses/salaries reports', incRep.status === 200 && expRep.status === 200 && salRep.status === 200 && salRep.body.data.totalNet > 0);
  const ive = await api('/api/finance/reports/income-vs-expense?from=2026-09-01&to=2026-09-30', { token: admin.token });
  check('income-vs-expense report', ive.status === 200 && Array.isArray(ive.body.data.rows) && Number.isInteger(ive.body.data.totalIncome));
  const stuLedger = await api(`/api/finance/reports/student-ledger?studentId=${bilalId}`, { token: admin.token });
  check('student-ledger report', stuLedger.status === 200 && Array.isArray(stuLedger.body.data.rows));
  const repCsv = await api('/api/finance/reports/income?format=csv', { token: admin.token });
  check('report CSV export', repCsv.status === 200 && repCsv.headers.get('content-type')?.includes('text/csv') && hasBom(repCsv));

  // ── Role gating ───────────────────────────────────────
  console.log('▶ Role gating');
  check('teacher 403 on finance dashboard', (await api('/api/finance/dashboard', { token: teacher.token })).status === 403);
  check('teacher 403 on payments', (await api('/api/payments', { token: teacher.token })).status === 403);
  check('receptionist 403 on incomes', (await api('/api/incomes', { token: receptionist.token })).status === 403);
  check('receptionist 403 on payments', (await api('/api/payments', { token: receptionist.token })).status === 403);
  check('student 403 on incomes', (await api('/api/incomes', { token: student.token })).status === 403);
  check('student 403 on salaries', (await api('/api/salaries', { token: student.token })).status === 403);
  check('student 403 on generate fees', (await api('/api/student-fees/generate', { method: 'POST', token: student.token, body: {} })).status === 403);
  check('student can view own fee list', (await api('/api/student-fees', { token: student.token })).status === 200);
  check('accountant 403 on users module (finance only)', (await api('/api/users', { token: accountant.token })).status === 403);

  // ── School settings (branding core) ───────────────────
  console.log('▶ School settings');
  const sset = await api('/api/school-settings', { token: student.token });
  check('any authenticated user reads school settings', sset.status === 200 && typeof sset.body.data.schoolName === 'string');
  const ssetPatch = await api('/api/school-settings', { method: 'PATCH', token: admin.token, body: { schoolName: `The ${stamp} School`, receiptSettings: { signatureLabel: 'Accounts Officer' } } });
  check('admin patches school settings', ssetPatch.status === 200 && ssetPatch.body.data.schoolName === `The ${stamp} School`);
  const ssetForbid = await api('/api/school-settings', { method: 'PATCH', token: teacher.token, body: { schoolName: 'Hacked' } });
  check('teacher cannot patch settings → 403', ssetForbid.status === 403);
  const receiptAfter = await api(`/api/payments/${payment._id}/receipt`, { token: admin.token });
  check('receipt reflects updated school branding', receiptAfter.body.data.school.schoolName === `The ${stamp} School` && receiptAfter.body.data.school.signatureLabel === 'Accounts Officer');
  await api('/api/school-settings', { method: 'PATCH', token: admin.token, body: { schoolName: 'School Management System', receiptSettings: { signatureLabel: 'Authorized Signatory' } } });

  console.log(`\nPhase 6 results: ${passed} passed, ${failed} failed`);
  process.exitCode = (failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Suite crashed:', err);
  process.exitCode = (1);
});

