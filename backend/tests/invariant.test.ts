import mongoose from 'mongoose';
import { Result } from '../src/models/Result';
import { Exam } from '../src/models/Exam';
import { getPublishedSummary } from '../src/controllers/resultV2.controller';
import dotenv from 'dotenv';

dotenv.config();

// Mock request/response
const mockReq = (query: any) => ({
  query,
  user: { role: 'admin' },
  path: '/api/results/exam-summary',
});

const mockRes = () => {
  const res: any = {};
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.body = data; return res; };
  return res;
};

async function runTests() {
  const dbUri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/sms-test-invariant';
  if (!dbUri.includes('test')) {
    throw new Error('REFUSING TO RUN DESTRUCTIVE TEST OUTSIDE TEST DATABASE');
  }
  await mongoose.connect(dbUri);
  
  const tenantId = new mongoose.Types.ObjectId();
  const examId = new mongoose.Types.ObjectId();
  const student1Id = new mongoose.Types.ObjectId();
  const student2Id = new mongoose.Types.ObjectId();

  await Exam.deleteMany({ tenantId });
  await Result.deleteMany({ tenantId });

  // Setup Exam
  const exam = await Exam.create({
    _id: examId,
    tenantId,
    name: 'Test Exam',
    isPublished: true,
    examTypeId: new mongoose.Types.ObjectId(),
    sessionId: new mongoose.Types.ObjectId(),
    classId: new mongoose.Types.ObjectId(),
    gradeScaleId: new mongoose.Types.ObjectId(),
  });

  const baseResult = {
    tenantId,
    examId,
    sessionId: new mongoose.Types.ObjectId(),
    classId: new mongoose.Types.ObjectId(),
    examSnapshot: {
      examName: 'Test Exam v1',
      gradeScaleName: 'A-F',
      gradeScaleBoundaries: [{ grade: 'A', minPercentage: 90 }]
    },
    subjects: [
      { subjectId: new mongoose.Types.ObjectId(), subjectName: 'Math', subjectCode: 'M1', maximumMarks: 100, passMarks: 40, marksObtained: 95, attendanceStatus: 'present', passed: true, percentage: 95 }
    ],
    studentSnapshot: { fullName: 'Student 1', admissionNumber: '1', className: '10', sessionName: '2026' },
    totalObtained: 95,
    totalMaximum: 100,
    percentage: 95,
    overallGrade: 'A',
    passed: true,
    failedSubjectCount: 0,
    sourceChecksum: 'hash',
    calculationVersion: 1,
    publishedAt: new Date()
  };

  // Test A & B: Student A (v5) and Student B (v2) with identical configs
  await Result.create({ ...baseResult, studentId: student1Id, version: 5 });
  await Result.create({ ...baseResult, studentId: student2Id, version: 2, studentSnapshot: { ...baseResult.studentSnapshot, fullName: 'Student 2' } });

  let req = mockReq({ examId: examId.toString(), tenantId: tenantId.toString() });
  let res = mockRes();

  let errorCaught = false;
  try {
    await getPublishedSummary(req as any, res as any, () => {});
    console.log('Test A & B PASSED: Cohort with mismatched versions but identical configs succeeded.');
  } catch (err: any) {
    console.error('Test A & B FAILED:', err.message);
  }

  // Test C: Divergent Grade Scale
  await Result.create({
    ...baseResult,
    studentId: student2Id,
    version: 3, // Newest for student 2
    examSnapshot: { ...baseResult.examSnapshot, gradeScaleName: 'DIFFERENT SCALE' },
    studentSnapshot: { ...baseResult.studentSnapshot, fullName: 'Student 2' }
  });

  res = mockRes();
  try {
    await getPublishedSummary(req as any, res as any, () => {});
    console.error('Test C FAILED: Did not throw on mixed config.');
  } catch (err: any) {
    if (err.message.includes('MIXED_SNAPSHOT_CONFIG')) {
      console.log('Test C PASSED: Correctly threw MIXED_SNAPSHOT_CONFIG for Grade Scale.');
    } else {
      console.error('Test C FAILED: Threw wrong error:', err.message);
    }
  }

  // Test C2: Divergent Subject Max Marks
  await Result.deleteMany({ studentId: student2Id, version: 3 });
  await Result.create({
    ...baseResult,
    studentId: student2Id,
    version: 3, // Newest for student 2
    subjects: [
      { ...baseResult.subjects[0], maximumMarks: 200 } // Divergent config
    ],
    studentSnapshot: { ...baseResult.studentSnapshot, fullName: 'Student 2' }
  });

  res = mockRes();
  try {
    await getPublishedSummary(req as any, res as any, () => {});
    console.error('Test C2 FAILED: Did not throw on mixed config.');
  } catch (err: any) {
    if (err.message.includes('MIXED_SNAPSHOT_CONFIG')) {
      console.log('Test C2 PASSED: Correctly threw MIXED_SNAPSHOT_CONFIG for Subject Config.');
    } else {
      console.error('Test C2 FAILED: Threw wrong error:', err.message);
    }
  }

  await mongoose.disconnect();
}

runTests().catch(console.error);
