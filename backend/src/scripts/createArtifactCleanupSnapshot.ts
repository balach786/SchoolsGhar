import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import child_process from 'child_process';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function createSnapshot() {
  const runId = '20260913-181000';
  const backupDir = path.resolve(__dirname, `../../backups/phase4d-artifact-cleanup-${runId}`);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing');

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  console.log(`Connected to database: ${db.databaseName}`);

  // 1. Collection counts
  const cols = await db.listCollections().toArray();
  const counts: Record<string, number> = {};
  for (const c of cols) {
    if (c.name.startsWith('system.')) continue;
    counts[c.name] = await db.collection(c.name).countDocuments();
  }
  fs.writeFileSync(path.join(backupDir, 'collection-counts-before.json'), JSON.stringify(counts, null, 2));

  // 2. Exact results-before.ejson & exact-result-artifact-allowlist.json
  const results = await db.collection('results').find({}).toArray();
  fs.writeFileSync(path.join(backupDir, 'results-before.ejson'), JSON.stringify(results, null, 2));

  const baselineStudentIds = (await db.collection('students').find({}, { projection: { _id: 1 } }).toArray()).map(s => String(s._id));
  const existingExamIds = (await db.collection('exams').find({}, { projection: { _id: 1 } }).toArray()).map(e => String(e._id));

  const allowlist = results.map(r => ({
    _id: String(r._id),
    tenantId: String(r.tenantId),
    examId: String(r.examId),
    studentId: String(r.studentId),
    studentName: r.studentSnapshot?.fullName,
    examName: r.examSnapshot?.examName,
    version: r.version,
    publishedAt: r.publishedAt,
    isStudentInBaseline: baselineStudentIds.includes(String(r.studentId)),
    isExamInDatabase: existingExamIds.includes(String(r.examId))
  }));
  fs.writeFileSync(path.join(backupDir, 'exact-result-artifact-allowlist.json'), JSON.stringify(allowlist, null, 2));

  // 3. Referential check before
  const refCheck = {
    totalResultsInDatabase: results.length,
    exactAllowlistedIdsCount: allowlist.length,
    allAllowlistedNotInBaselineStudents: allowlist.every(a => !a.isStudentInBaseline),
    allAllowlistedExamsNonExistent: allowlist.every(a => !a.isExamInDatabase),
    examNames: Array.from(new Set(allowlist.map(a => a.examName))),
    allowlistedIds: allowlist.map(a => a._id),
    verifiedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(backupDir, 'referential-check-before.json'), JSON.stringify(refCheck, null, 2));

  // 4. Code version
  let gitCommit = 'unknown';
  let gitBranch = 'unknown';
  try {
    gitCommit = child_process.execSync('git rev-parse HEAD', { cwd: path.resolve(__dirname, '../..') }).toString().trim();
    gitBranch = child_process.execSync('git rev-parse --abbrev-ref HEAD', { cwd: path.resolve(__dirname, '../..') }).toString().trim();
  } catch (e) {}

  fs.writeFileSync(path.join(backupDir, 'code-version-before.json'), JSON.stringify({
    gitCommit,
    gitBranch,
    timestamp: new Date().toISOString()
  }, null, 2));

  // 5. Manifest
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify({
    runId,
    description: 'Pre-cleanup snapshot of 12 test Result artifacts from testPhase4cSafety.ts',
    targetCollection: 'results',
    artifactsCount: 12,
    databaseName: db.databaseName,
    createdAt: new Date().toISOString()
  }, null, 2));

  // 6. Rollback instructions
  const rollbackMd = `# ROLLBACK INSTRUCTIONS FOR PHASE 4D ARTIFACT CLEANUP
If the 12 deleted test Result artifacts need to be restored:
1. Connect to MongoDB using the maintenance script or Mongo shell.
2. Read \`results-before.ejson\`.
3. Convert the string IDs back to \`ObjectId\` and insert into \`results\` collection:
   \`db.collection('results').insertMany(documents)\`
4. Verify results count returns to 12.
`;
  fs.writeFileSync(path.join(backupDir, 'rollback-instructions.md'), rollbackMd);

  console.log(`Safety snapshot created successfully at: ${backupDir}`);
  await mongoose.disconnect();
}

createSnapshot().catch((err) => {
  console.error('Error creating snapshot:', err);
  process.exit(1);
});
