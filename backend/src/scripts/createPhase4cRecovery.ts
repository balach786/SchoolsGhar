import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function createRecoveryPackage() {
  const runId = '20260913-165500';
  const backupDir = path.resolve(__dirname, '../../backups', `migration-phase4c-${runId}`);
  fs.mkdirSync(backupDir, { recursive: true });

  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;

  const collections = ['exams', 'marks', 'examschedules', 'examattendances', 'results', 'students', 'staff', 'classes', 'subjects', 'users', 'tenants'];
  const counts: Record<string, number> = {};
  for (const c of collections) {
    counts[c] = (await db.listCollections({ name: c }).hasNext()) ? await db.collection(c).countDocuments() : 0;
  }

  const manifest = {
    phase: '4C',
    title: 'Immutable Published Result Snapshots',
    timestamp: new Date().toISOString(),
    gitCommit: 'eb35ef67db339778f3b5df18a591b5cc06d1ecc8',
    baselineCollectionCounts: counts,
  };
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(backupDir, 'collection-counts-before.json'), JSON.stringify(counts, null, 2));
  fs.writeFileSync(path.join(backupDir, 'code-version-before.json'), JSON.stringify({ gitCommit: manifest.gitCommit }, null, 2));

  // Index state before
  const idxs: Record<string, any> = {};
  for (const col of ['exams', 'marks', 'examschedules', 'examattendances', 'gradescales']) {
    idxs[col] = (await db.listCollections({ name: col }).hasNext()) ? await db.collection(col).indexes() : [];
  }
  fs.writeFileSync(path.join(backupDir, 'exam-index-state-before.json'), JSON.stringify(idxs, null, 2));

  // Schemas before
  const schemaState = {
    examSchemaNotes: 'Exam model uses subjects array with { subjectId, maxMarks, passMarks } and gradeScaleId.',
    markSchemaNotes: 'Mark model records tenantId, examId, sessionId, studentId, subjectId, marksObtained, isAbsent.',
    examScheduleSchemaNotes: 'ExamSchedule records examId, classId, subjectId, totalMarks, passingMarks.',
    examAttendanceSchemaNotes: 'ExamAttendance records examScheduleId, studentId, status (present/absent/leave).'
  };
  fs.writeFileSync(path.join(backupDir, 'exam-schema-state-before.json'), JSON.stringify(schemaState, null, 2));
  fs.writeFileSync(path.join(backupDir, 'marks-state-before.json'), JSON.stringify({ count: counts.marks, note: 'No marks in DB' }, null, 2));

  const plannedResultSchema = {
    collection: 'results',
    fields: [
      '_id', 'tenantId', 'examId', 'studentId', 'sessionId', 'classId', 'sectionId', 'version',
      'studentSnapshot (fullName, admissionNumber, rollNumber, className, sectionName, sessionName)',
      'examSnapshot (examName, examTypeName, gradeScaleName, gradeScaleBoundaries)',
      'subjects ([subjectId, subjectName, subjectCode, examScheduleId, marksObtained, maximumMarks, passMarks, attendanceStatus, passed, percentage])',
      'totalObtained', 'totalMaximum', 'percentage', 'overallGrade', 'passed', 'failedSubjectCount',
      'sourceChecksum', 'calculationVersion', 'publishedAt', 'publishedBy'
    ],
    immutability: 'Strict append-only. Save of existing doc, updateOne, updateMany, findOneAndUpdate, replaceOne, deleteOne, deleteMany rejected by Mongoose pre-hooks.'
  };
  fs.writeFileSync(path.join(backupDir, 'planned-result-schema.json'), JSON.stringify(plannedResultSchema, null, 2));

  const plannedIndexActions = [
    { key: { tenantId: 1, examId: 1, studentId: 1, version: -1 }, unique: true, name: 'tenantId_1_examId_1_studentId_1_version_-1' },
    { key: { tenantId: 1, examId: 1, classId: 1 }, name: 'tenantId_1_examId_1_classId_1' }
  ];
  fs.writeFileSync(path.join(backupDir, 'planned-index-actions.json'), JSON.stringify(plannedIndexActions, null, 2));

  const calculationRules = {
    version: 1,
    totalObtainedFormula: 'sum(marksObtained for scored subjects where not absent)',
    totalMaxFormula: 'sum(maxMarks for all subjects configured in Exam)',
    percentageFormula: 'round2((totalObtained / totalMax) * 100)',
    passFailFormula: 'overall passed = failedSubjectCount === 0 && all required subjects present and passed',
    overallGradeFormula: 'gradeForPercentage(scale.boundaries, percentage)',
    rankFormula: 'deferred / not persisted in Phase 4C V1'
  };
  fs.writeFileSync(path.join(backupDir, 'calculation-rules-v1.json'), JSON.stringify(calculationRules, null, 2));

  const rollbackInstructions = `# PHASE 4C ROLLBACK INSTRUCTIONS
1. Drop physical 'results' collection if created:
   db.results.drop();
2. Revert code changes to git commit ${manifest.gitCommit}:
   git checkout ${manifest.gitCommit}
3. Re-verify TypeScript build:
   npm run typecheck
`;
  fs.writeFileSync(path.join(backupDir, 'rollback-instructions.md'), rollbackInstructions);

  console.log('RECOVERY_PACKAGE_CREATED_SUCCESSFULLY:', backupDir);
  await mongoose.disconnect();
}

createRecoveryPackage().catch((e) => {
  console.error('Error creating recovery package:', e);
  process.exit(1);
});
