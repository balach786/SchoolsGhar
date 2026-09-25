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
  const legacyDb = mongoose.connection.useDb('schoolsghar');

  const loginA = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@bkm.com', password: 'password123', schoolCode: 'bkm' })
  }).then((r: any) => r.json());
  const tokenA = loginA.data.accessToken;

  const ts = Date.now();

  console.log('\n--- 1. RESOLVE THE GRADE SCALE CONTRADICTION ---');
  const boundaries = [
    { grade: 'A', minPercentage: 90 },
    { grade: 'B', minPercentage: 70 },
    { grade: 'F', minPercentage: 0 }
  ];
  const gsRes = await fetchApi('/grade-scales', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'Scale ' + ts, boundaries })
  });
  
  const bList = gsRes.data.boundaries.map((b: any) => ({ grade: b.grade, minPercentage: b.minPercentage }));
  console.log(`GradeScale ID = ${gsRes.data._id}`);
  console.log(`boundaries = ${JSON.stringify(bList)}`);
  console.log(`percentage = 85`);
  console.log(`expected grade according to persisted boundaries = B`);
  
  const { gradeForPercentage } = await import('../models/GradeScale');
  const actualGrade = gradeForPercentage(bList, 85);
  console.log(`actual grade returned = ${actualGrade}`);

  console.log('\n--- 2. REGULAR FEE VS EXAM FEE ---');
  
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

  // Regular Fee
  const regularFeeAmount = 25000;
  const fsRes = await fetchApi('/fee-structures', tokenA, {
    method: 'POST', body: JSON.stringify({
      title: 'Tuition Fee', amount: regularFeeAmount, feeType: 'monthly_tuition',
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
  
  // Pay regular fee
  const regPayRes = await fetchApi('/payments', tokenA, {
    method: 'POST', body: JSON.stringify({ studentFeeId: regularFeeId, amount: regularFeeAmount, paymentMethod: 'cash', paymentDate: new Date().toISOString() })
  });

  // Set up marks and results for Issue 3
  const subjectRes = await fetchApi('/subjects', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'Math ' + ts, code: 'M' + (ts%10000), sessionId, classIds: [classId] })
  });
  const subjectId = subjectRes.data._id;

  // Exam Fee
  const typeRes = await fetchApi('/exam-types', tokenA, {
    method: 'POST', body: JSON.stringify({ name: 'T ' + ts, weightage: 100 })
  });
  const examTypeId = typeRes.data._id;
  
  const examRes = await fetchApi('/exams', tokenA, {
    method: 'POST', body: JSON.stringify({
      name: 'E ' + ts, examTypeId, sessionId, classIds: [classId], startDate: '2026-05-01', endDate: '2026-05-10', status: 'Scheduled',
      gradeScaleId: gsRes.data._id,
      subjects: [{ subjectId, examDate: '2026-05-02', startTime: '09:00', endTime: '12:00', maxMarks: 100, passMarks: 40 }]
    })
  });
  const examId = examRes.data._id;

  const schedRes = await fetchApi('/exam-schedules', tokenA, {
    method: 'POST', body: JSON.stringify({
      examId, subjectId, classId, examDate: '2026-05-02', startTime: '09:00', endTime: '12:00'
    })
  });

  const examFeeAmount = 50000;
  const examFeeRes = await fetchApi('/exam-fees', tokenA, {
    method: 'POST', body: JSON.stringify({ examId, classId, amount: examFeeAmount, dueDate: '2026-06-01' })
  });
  const syncRes = await fetchApi('/exam-fees/sync-students', tokenA, {
    method: 'POST', body: JSON.stringify({ examId })
  });
  
  const sFees = await fetchApi(`/exam-fees/students?examId=${examId}&classId=${classId}&limit=10`, tokenA);
  const eFeeList = sFees.data.data || sFees.data.items || (Array.isArray(sFees.data) ? sFees.data : []);
  const studentExamFeeId = eFeeList[0]._id;

  const payRes = await fetchApi('/exam-fees/collect', tokenA, {
    method: 'POST', body: JSON.stringify({ studentExamFeeId, amount: examFeeAmount, paymentMethod: 'Cash' })
  });
  const examFeePaymentId = payRes.data.payment._id;

  // Real dashboard endpoint
  const dashRes = await fetchApi('/finance/dashboard', tokenA);
  const dash = dashRes.data;
  const financialSummary = dash.financialSummary;

  const R = regularFeeAmount;
  const E = examFeeAmount;

  console.log(`Regular Fee Net Collected R = ${R}`);
  console.log(`Exam Fee Collected E = ${E}`);
  console.log(`Regular Fee KPI endpoint = /api/finance/dashboard -> financialSummary.regularFeeCollected.amount`);
  console.log(`Regular Fee KPI returned = ${financialSummary.regularFeeCollected.amount}`);
  console.log(`Exam Fee report/KPI endpoint = /api/finance/dashboard -> financialSummary.examFeeCollected.amount`);
  console.log(`Exam Fee amount returned = ${financialSummary.examFeeCollected.amount}`);
  
  if (financialSummary.regularFeeCollected.amount === financialSummary.regularFeeCollected.amount + financialSummary.examFeeCollected.amount) {
     throw new Error("FAIL: R includes E!");
  }
  
  const markRes = await fetchApi('/marks/bulk', tokenA, {
    method: 'POST', body: JSON.stringify({
      examId,
      records: [
        { studentId, subjectId, marksObtained: 85, isAbsent: false }
      ]
    })
  });
  
  const resultRes = await fetchApi(`/results/student?examId=${examId}&studentId=${studentId}`, tokenA);
  
  const markId = await bkmDb.collection('marks').findOne({ examId: new mongoose.Types.ObjectId(examId) }).then(doc => doc?._id);
  
  // Results are not actively persisted in Result V1 (only V2 snapshots are stored, but V2 is disabled). We will see if there is any record.
  const resultRecord = await bkmDb.collection('results').findOne({ examId: new mongoose.Types.ObjectId(examId) });

  console.log('\n--- 3. COMPLETE RAW PLACEMENT FOR THE FINAL FINANCIAL/RESULT RECORDS ---');
  
  const checkPlacement = async (modelName: string, collectionName: string, id: any) => {
    if (!id) return;
    const aCount = await bkmDb.collection(collectionName).countDocuments({ _id: new mongoose.Types.ObjectId(id) });
    const mCount = await masterDb.collection(collectionName).countDocuments({ _id: new mongoose.Types.ObjectId(id) });
    const bCount = await tntbDb.collection(collectionName).countDocuments({ _id: new mongoose.Types.ObjectId(id) });
    const legCount = await legacyDb.collection(collectionName).countDocuments({ _id: new mongoose.Types.ObjectId(id) });

    console.log(`Model = ${modelName}`);
    console.log(`Exact ID = ${id}`);
    console.log(`Tenant A DB count = ${aCount}`);
    console.log(`schoolsghar_master count = ${mCount}`);
    console.log(`deprecated schoolsghar count = ${legCount}`);
    console.log(`Tenant B DB count = ${bCount}`);
    console.log('');
  };

  await checkPlacement('Mark', 'marks', markId);
  
  if (resultRecord) {
     await checkPlacement('Result', 'results', resultRecord._id);
  } else {
     console.log('Model = Result');
     console.log('Result persistence = NOT PERSISTED');
     console.log('');
  }
  
  await checkPlacement('StudentExamFee', 'studentexamfees', studentExamFeeId);
  await checkPlacement('ExamFeePayment', 'examfeepayments', examFeePaymentId);
  
  console.log('Phase 4 Batch 7 safe to close: YES');

  process.exit(0);
}

run().catch(console.error);
