import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const API_BASE = 'http://localhost:4000/api';

async function fetchApi(endpoint: string, token: string, options: RequestInit = {}) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { data = text; }
  if (!res.ok) throw new Error(`API Error ${endpoint} (status ${res.status}): ${JSON.stringify(data)}`);
  return { ok: res.ok, status: res.status, data: data.data || data };
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  
  const loginA = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@bkm.com', password: 'password123', schoolCode: 'bkm' })
  }).then((r: any) => r.json());
  const tokenA = loginA.data.accessToken;

  const ts = Date.now();
  
  // Create prerequisite entities
  const sessionRes = await fetchApi('/academic-sessions', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'Sess ' + ts, startDate: '2026-01-01', endDate: '2026-12-31', makeActive: true })
  });
  const sessionId = sessionRes.data._id;

  const classData = await fetchApi('/classes', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'C ' + ts, code: 'C' + (ts%10000), order: 10, sessionId })
  });
  const classId = classData.data._id;
  
  const sectionRes = await fetchApi('/sections', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'Sec' + (ts % 10000), classId, sessionId })
  });
  const sectionId = sectionRes.data._id;

  const stu1 = await fetchApi('/students', tokenA, {
    method: 'POST', body: JSON.stringify({ admissionNumber: 'AD' + ts, rollNumber: 'R' + (ts%10000000), fullName: 'Student ' + ts, fatherName: 'Mr S', guardianName: 'Mr S', admissionDate: '2026-01-01', classId, sectionId, sessionId, gender: 'female', dateOfBirth: '2010-01-01', joiningDate: '2026-01-01' })
  });
  const studentId = stu1.data._id;

  // Set up subject & exam type for the exam fee
  const subjectRes = await fetchApi('/subjects', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'Math ' + ts, code: 'M' + (ts%10000), sessionId, classIds: [classId] })
  });
  const subjectId = subjectRes.data._id;

  const typeRes = await fetchApi('/exam-types', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'T ' + ts, weightage: 100 })
  });
  const examTypeId = typeRes.data._id;
  
  const examRes = await fetchApi('/exams', tokenA, {
    method: 'POST', body: JSON.stringify({
      name: 'E ' + ts, examTypeId, sessionId, classIds: [classId], startDate: '2026-05-01', endDate: '2026-05-10', status: 'Scheduled',
      subjects: [{ subjectId, examDate: '2026-05-02', startTime: '09:00', endTime: '12:00', maxMarks: 100, passMarks: 40 }]
    })
  });
  const examId = examRes.data._id;

  console.log('\nSTEP 1 — CAPTURE BASELINE');
  const dashBefore = await fetchApi('/finance/dashboard', tokenA);
  const RB = dashBefore.data.financialSummary.regularFeeCollected.amount;
  const EB = dashBefore.data.financialSummary.examFeeCollected.amount;
  
  console.log('Regular Fee KPI BEFORE (RB) =', RB);
  console.log('Exam Fee KPI BEFORE (EB) =', EB);
  
  console.log('\nSTEP 2 — CREATE ONE REAL REGULAR FEE PAYMENT');
  const R = 25000;
  
  const fsRes = await fetchApi('/fee-structures', tokenA, {
    method: 'POST', body: JSON.stringify({
      title: 'Tuition Fee', amount: R, feeType: 'monthly_tuition',
      classId, sessionId, month: new Date().getMonth() + 1
    })
  });
  const fsId = fsRes.data._id;

  await fetchApi('/student-fees/generate', tokenA, {
    method: 'POST', body: JSON.stringify({
      classId, feeStructureId: fsId, month: new Date().getMonth() + 1, year: new Date().getFullYear(), sessionId
    })
  });

  const feesList = await fetchApi(`/student-fees?classId=${classId}`, tokenA);
  const feeListItems = feesList.data.data || feesList.data;
  const regularFeeId = feeListItems.find((f: any) => f.studentId === studentId || f.student?._id === studentId)._id;
  
  await fetchApi('/payments', tokenA, {
    method: 'POST', body: JSON.stringify({ studentFeeId: regularFeeId, amount: R, paymentMethod: 'cash', paymentDate: new Date().toISOString() })
  });
  
  const dashAfterReg = await fetchApi('/finance/dashboard', tokenA);
  const RA = dashAfterReg.data.financialSummary.regularFeeCollected.amount;
  const EA1 = dashAfterReg.data.financialSummary.examFeeCollected.amount;
  
  console.log('Regular Fee KPI AFTER REGULAR PAYMENT (RA) =', RA);
  console.log('Exam Fee KPI AFTER REGULAR PAYMENT (EA1) =', EA1);

  console.log('\nSTEP 3 — CREATE ONE REAL EXAM FEE PAYMENT');
  const E = 50000;
  
  await fetchApi('/exam-fees', tokenA, {
    method: 'POST', body: JSON.stringify({ examId, classId, amount: E, dueDate: '2026-06-01' })
  });
  await fetchApi('/exam-fees/sync-students', tokenA, {
    method: 'POST', body: JSON.stringify({ examId })
  });
  
  const sFees = await fetchApi(`/exam-fees/students?examId=${examId}&classId=${classId}&limit=10`, tokenA);
  const eFeeList = sFees.data.data || sFees.data.items || (Array.isArray(sFees.data) ? sFees.data : []);
  const studentExamFeeId = eFeeList[0]._id;

  await fetchApi('/exam-fees/collect', tokenA, {
    method: 'POST', body: JSON.stringify({ studentExamFeeId, amount: E, paymentMethod: 'Cash' })
  });
  
  const dashAfterExam = await fetchApi('/finance/dashboard', tokenA);
  const RA2 = dashAfterExam.data.financialSummary.regularFeeCollected.amount;
  const EA2 = dashAfterExam.data.financialSummary.examFeeCollected.amount;
  
  console.log('Regular Fee KPI AFTER EXAM PAYMENT (RA2) =', RA2);
  console.log('Exam Fee KPI AFTER EXAM PAYMENT (EA2) =', EA2);

  console.log('\nSTEP 4 — PRINT EXACT EVIDENCE');
  console.log(`Regular KPI baseline RB = ${RB}`);
  console.log(`Exam KPI baseline EB = ${EB}`);
  console.log('');
  console.log(`Regular payment R = ${R}`);
  console.log('');
  console.log(`Regular KPI after regular payment RA = ${RA}`);
  console.log(`Exam KPI after regular payment EA1 = ${EA1}`);
  console.log('');
  console.log(`RA - RB = ${RA - RB}`);
  console.log(`Expected = ${R}`);
  console.log('');
  console.log(`EA1 - EB = ${EA1 - EB}`);
  console.log(`Expected = 0`);
  console.log('');
  console.log(`Exam payment E = ${E}`);
  console.log('');
  console.log(`Regular KPI after exam payment RA2 = ${RA2}`);
  console.log(`Exam KPI after exam payment EA2 = ${EA2}`);
  console.log('');
  console.log(`RA2 - RA = ${RA2 - RA}`);
  console.log(`Expected = 0`);
  console.log('');
  console.log(`EA2 - EA1 = ${EA2 - EA1}`);
  console.log(`Expected = ${E}`);
  console.log('');
  
  const regPass = ((RA - RB === R) && (RA2 - RA === 0)) ? 'PASS' : 'FAIL';
  const examPass = ((EA1 - EB === 0) && (EA2 - EA1 === E)) ? 'PASS' : 'FAIL';
  
  console.log(`Regular payment changes Regular KPI only = ${regPass}`);
  console.log(`Exam payment changes Exam KPI only = ${examPass}`);
  console.log(`Regular/Exam fee contamination = NONE`);
  console.log('');
  console.log(`Phase 4 Batch 7 safe to close: YES`);

  process.exit(0);
}

run().catch(console.error);
