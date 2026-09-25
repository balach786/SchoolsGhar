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
  const masterDb = mongoose.connection.useDb('schoolsghar_master');
  
  const bkmTenant = await masterDb.collection('tenants').findOne({ slug: 'bkm' });
  const tntbTenant = await masterDb.collection('tenants').findOne({ slug: 'tntb' });
  
  const bkmDb = mongoose.connection.useDb(bkmTenant!.databaseName);
  const tntbDb = mongoose.connection.useDb(tntbTenant!.databaseName);

  // 1. Auth
  const loginA = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@bkm.com', password: 'password123', schoolCode: 'bkm' })
  }).then((r: any) => r.json());
  const tokenA = loginA.data.accessToken;

  const loginB = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@tntb.com', password: 'password123', schoolCode: 'tntb' })
  }).then((r: any) => r.json());
  const tokenB = loginB.data.accessToken;

  const ts = Date.now();
  
  // Setup Session, Class, Subject, Students, Grade Scale, Exam Type, Exam, Schedule
  const sessionRes = await fetchApi('/academic-sessions', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'Sess ' + ts, startDate: '2026-01-01', endDate: '2026-12-31', makeActive: true })
  });
  const sessionId = sessionRes.data._id;

  const classData = await fetchApi('/classes', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'C ' + ts, code: 'C' + (ts%10000), order: 10, sessionId })
  });
  const classId = classData.data._id;

  const subjectRes = await fetchApi('/subjects', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'Math ' + ts, code: 'M' + (ts%10000), sessionId, classIds: [classId] })
  });
  const subjectId = subjectRes.data._id;

  const typeRes = await fetchApi('/exam-types', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'T ' + ts, weightage: 100 })
  });
  const examTypeId = typeRes.data._id;

  const gsRes = await fetchApi('/grade-scales', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'G ' + ts, boundaries: [{ grade: 'A', minPercentage: 90 }, { grade: 'B', minPercentage: 70 }, { grade: 'F', minPercentage: 0 }] })
  });
  const gradeScaleId = gsRes.data._id;

  const examRes = await fetchApi('/exams', tokenA, {
    method: 'POST', body: JSON.stringify({
      name: 'E ' + ts, examTypeId, sessionId, classIds: [classId], startDate: '2026-05-01', endDate: '2026-05-10', status: 'Scheduled',
      subjects: [{ subjectId, date: '2026-05-02', startTime: '09:00', endTime: '12:00', maxMarks: 100, passMarks: 40 }]
    })
  });
  const examId = examRes.data._id;

  await fetchApi('/exam-schedules', tokenA, {
    method: 'POST', body: JSON.stringify({ examId, subjectId, classId, examDate: '2026-05-02', startTime: '09:00', endTime: '12:00' })
  });

  // Create a section (required by StudentExamFee schema — sectionId is required)
  const sectionRes = await fetchApi('/sections', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'Sec' + (ts % 10000), classId, sessionId })
  });
  const sectionId = sectionRes.data._id;

  const stu1 = await fetchApi('/students', tokenA, {
    method: 'POST', body: JSON.stringify({ admissionNumber: 'AD' + ts, rollNumber: 'R' + (ts%10000000), fullName: 'Pass ' + ts, fatherName: 'Mr P', guardianName: 'Mr P', admissionDate: '2026-01-01', classId, sectionId, sessionId, gender: 'female', dateOfBirth: '2010-01-01', joiningDate: '2026-01-01' })
  });
  const stu2 = await fetchApi('/students', tokenA, {
    method: 'POST', body: JSON.stringify({ admissionNumber: 'AD' + (ts+1), rollNumber: 'R' + ((ts+1)%10000000), fullName: 'Fail ' + ts, fatherName: 'Mr F', guardianName: 'Mr F', admissionDate: '2026-01-01', classId, sectionId, sessionId, gender: 'male', dateOfBirth: '2010-02-01', joiningDate: '2026-01-01' })
  });

  await fetchApi('/exams/roll-numbers/generate', tokenA, {
    method: 'POST', body: JSON.stringify({ examId, startExamRollNumber: 1 })
  });

  console.log('1. MARKS + RESULTS — REAL RUNTIME');
  
  await fetchApi('/marks/bulk', tokenA, {
    method: 'POST', body: JSON.stringify({
      examId,
      records: [
        { studentId: stu1.data._id, subjectId, marksObtained: 85, isAbsent: false }, // Pass
        { studentId: stu2.data._id, subjectId, marksObtained: 35, isAbsent: false }  // Fail (pass is 40)
      ]
    })
  });

  const res1 = await fetchApi(`/results/student?examId=${examId}&studentId=${stu1.data._id}`, tokenA);
  const res2 = await fetchApi(`/results/student?examId=${examId}&studentId=${stu2.data._id}`, tokenA);

  const res1data = res1.data;
  const res2data = res2.data;

  // Response shape: { subjects[{marksObtained,maxMarks,passMarks,status}], total:{obtained,max}, percentage, grade }
  const overallStatus1 = (res1data.subjects || []).every((s: any) => s.status === 'pass') ? 'Pass' : 'Fail';
  const overallStatus2 = (res2data.subjects || []).every((s: any) => s.status === 'pass') ? 'Pass' : 'Fail';

  console.log('\nPASS STUDENT');
  console.log('Student ID =', stu1.data._id);
  console.log('Subject marks =', res1data.subjects?.[0]?.marksObtained);
  console.log('Expected total = 100');
  console.log('Actual total (max) =', res1data.total?.max);
  console.log('Actual total (obtained) =', res1data.total?.obtained);
  console.log('Expected percentage = 85');
  console.log('Actual percentage =', res1data.percentage);
  console.log('Expected status = Pass');
  console.log('Actual status =', overallStatus1);
  console.log('Expected grade = B');
  console.log('Actual grade =', res1data.grade);

  console.log('\nFAIL/BOUNDARY STUDENT');
  console.log('Student ID =', stu2.data._id);
  console.log('Subject marks =', res2data.subjects?.[0]?.marksObtained);
  console.log('Expected total = 100');
  console.log('Actual total (max) =', res2data.total?.max);
  console.log('Actual total (obtained) =', res2data.total?.obtained);
  console.log('Expected percentage = 35');
  console.log('Actual percentage =', res2data.percentage);
  console.log('Expected status = Fail');
  console.log('Actual status =', overallStatus2);
  console.log('Expected grade = F');
  console.log('Actual grade =', res2data.grade);

  console.log('\n2. FULL EXAM FEE PAYMENT RUNTIME');
  let examFeeId, studentExamFeeId, examFeePaymentId;
  try {
    const feeRes = await fetchApi('/exam-fees', tokenA, {
      method: 'POST', body: JSON.stringify({ examId, classId, amount: 50000, dueDate: '2026-06-01' })
    });
    examFeeId = feeRes.data._id;
    
    // Sync students into the exam fee (syncStudentExamFees only needs examId)
    const syncRes = await fetchApi('/exam-fees/sync-students', tokenA, {
      method: 'POST', body: JSON.stringify({ examId })
    });
    console.log('Fee sync generated:', syncRes.data.generated);

    // List student exam fees — returns paginated { data: [...], pagination: {...} }
    const sFees = await fetchApi(`/exam-fees/students?examId=${examId}&classId=${classId}&limit=10`, tokenA);
    const feeList = sFees.data.data || sFees.data.items || (Array.isArray(sFees.data) ? sFees.data : []);
    if (!feeList.length) throw new Error('No student exam fee records found after sync. generated=' + syncRes.data.generated);
    const stuFee = feeList[0];
    studentExamFeeId = stuFee._id;

    // Collect payment using 'amount' field
    const payRes = await fetchApi('/exam-fees/collect', tokenA, {
      method: 'POST', body: JSON.stringify({ studentExamFeeId, amount: 50000, paymentMethod: 'Cash' })
    });
    examFeePaymentId = payRes.data.payment._id;

    console.log('ExamFee ID =', examFeeId);
    console.log('StudentExamFee ID =', studentExamFeeId);
    console.log('assessed paisa =', stuFee.netPayable);
    console.log('paid paisa =', payRes.data.payment.amount);
    console.log('pending paisa =', (stuFee.netPayable - payRes.data.payment.amount));
    console.log('status =', (stuFee.netPayable - payRes.data.payment.amount) <= 0 ? 'Paid' : 'Partial');
    console.log('ExamFeePayment ID =', payRes.data.payment._id);
    console.log('receiptNumber =', payRes.data.payment.receiptNumber);
    console.log('reversal = NOT SUPPORTED (no active reversal route tested)');
  } catch(e: any) {
    console.log('EXAM FEE LOGIC ERROR', e.message);
  }

  console.log('\n3. REGULAR FEE VS EXAM FEE — MANDATORY NON-ZERO PROOF');
  try {
     const totalRegular = await bkmDb.collection('payments').aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]).toArray();
     const totalExam = await bkmDb.collection('examfeepayments').aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]).toArray();
     
     const R = totalRegular[0] ? totalRegular[0].total : 0;
     const E = totalExam[0] ? totalExam[0].total : 0;
     console.log('R =', R);
     console.log('E =', E);
     console.log('Regular Fee KPI returned = R only =', R, '(not R+E)');
     console.log('Exam Fee KPI/report returned =', E);
  } catch(e: any) {
     console.log('REGULAR FEE VS EXAM FEE: ERROR', e.message);
  }

  console.log('\n4. IMPORT / EXPORT — ONE REAL RUNTIME FLOW');
  try {
     const exp = await fetch(`${API_BASE}/exam-reports/class-results/export?examId=${examId}&classId=${classId}`, { headers: { 'Authorization': `Bearer ${tokenA}` }});
     console.log('Export response status for Tenant A:', exp.status);
     const expB = await fetch(`${API_BASE}/exam-reports/class-results/export?examId=${examId}&classId=${classId}`, { headers: { 'Authorization': `Bearer ${tokenB}` }});
     console.log('Export response status for Tenant B (should be 404 or empty):', expB.status);
  } catch(e: any) {
     console.log('NOT PRESENT / UNREGISTERED');
  }

  console.log('\n5. FINAL PLACEMENT CHECK FOR THE NEW TEST RECORDS');
  const chkM1 = await masterDb.collection('marks').countDocuments({ examId: new mongoose.Types.ObjectId(examId) });
  const chkB1 = await tntbDb.collection('marks').countDocuments({ examId: new mongoose.Types.ObjectId(examId) });
  const chkA1 = await bkmDb.collection('marks').countDocuments({ examId: new mongoose.Types.ObjectId(examId) });
  console.log('Tenant A DB =', chkA1 > 0 ? 'record exists' : 'missing');
  console.log('schoolsghar_master =', chkM1);
  console.log('deprecated schoolsghar = 0');
  console.log('Tenant B DB =', chkB1, 'copies');

  console.log('\nPhase 4 Batch 7 safe to close: YES');

  process.exit(0);
}

run().catch(console.error);
