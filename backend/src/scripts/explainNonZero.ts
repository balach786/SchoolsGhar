import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';

interface ExplainStats {
  winningPlanStage: string;
  indexName: string;
  keysExamined: number;
  docsExamined: number;
  docsReturned: number;
  hasSortStage: boolean;
  totalTimeMillis: number;
}

function walkPlan(plan: any, state: { indexName?: string; hasSortStage: boolean }) {
  if (!plan) return;
  if (plan.stage === 'SORT') state.hasSortStage = true;
  if (plan.indexName) state.indexName = plan.indexName;
  if (plan.inputStage) walkPlan(plan.inputStage, state);
  if (Array.isArray(plan.inputStages)) plan.inputStages.forEach((s: any) => walkPlan(s, state));
}

function extractExplainStats(raw: any): ExplainStats {
  const es = raw?.executionStats;
  const winningPlan = raw?.queryPlanner?.winningPlan || {};
  const state = { indexName: undefined as string | undefined, hasSortStage: false };
  walkPlan(winningPlan, state);
  return {
    winningPlanStage: winningPlan.stage || 'UNKNOWN',
    indexName: state.indexName || 'COLLSCAN',
    keysExamined: es?.totalKeysExamined ?? 0,
    docsExamined: es?.totalDocsExamined ?? 0,
    docsReturned: es?.nReturned ?? 0,
    hasSortStage: state.hasSortStage,
    totalTimeMillis: es?.executionTimeMillis ?? 0,
  };
}

async function main() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db!;
  const col = db.collection('timetables');

  // ─── Create isolated fixture IDs ───────────────────────────────────────────
  const tenantId  = new mongoose.Types.ObjectId();
  const sessionId = new mongoose.Types.ObjectId();
  const classId   = new mongoose.Types.ObjectId();
  const sectionId = new mongoose.Types.ObjectId();
  const teacherA  = new mongoose.Types.ObjectId();
  const teacherB  = new mongoose.Types.ObjectId();
  const subjectId = new mongoose.Types.ObjectId();

  // Insert 30 rows: 5 days × 6 periods, teacher alternates
  const rows: any[] = [];
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday'];
  for (let d = 0; d < 6; d++) {
    for (let p = 1; p <= 6; p++) {
      const startH = 7 + p;
      const endH   = startH + 1;
      rows.push({
        tenantId, sessionId, classId, sectionId,
        dayOfWeek: days[d],
        periodNumber: p,
        startTime: `${String(startH).padStart(2,'0')}:00`,
        endTime:   `${String(endH).padStart(2,'0')}:00`,
        teacherId: p % 2 === 0 ? teacherA : teacherB,
        subjectId,
        isBreak: false,
        isArchived: false,
      });
    }
  }

  await col.insertMany(rows);
  const insertedCount = await col.countDocuments({ tenantId });
  console.log(`\nInserted ${insertedCount} fixture rows.\n`);

  // ─── Query A: List Query ───────────────────────────────────────────────────
  const rawA = await col.find({
    tenantId, sessionId, classId, sectionId,
    isArchived: false,
  }).sort({ dayOfWeek: 1, periodNumber: 1, startTime: 1 }).explain('executionStats');
  const statsA = extractExplainStats(rawA);

  // ─── Query B: Teacher Conflict Query ──────────────────────────────────────
  const rawB = await col.find({
    tenantId, sessionId,
    teacherId: teacherA,
    dayOfWeek: 'monday',
    isArchived: false,
    startTime: { $lt: '10:00' },
    endTime:   { $gt: '09:00' },
  }).explain('executionStats');
  const statsB = extractExplainStats(rawB);

  // ─── Query C: Class/Section Conflict Query ─────────────────────────────────
  const rawC = await col.find({
    tenantId, sessionId, classId, sectionId,
    dayOfWeek: 'monday',
    isArchived: false,
    startTime: { $lt: '10:00' },
    endTime:   { $gt: '09:00' },
  }).explain('executionStats');
  const statsC = extractExplainStats(rawC);

  // ─── Print results ─────────────────────────────────────────────────────────
  console.log('=== NON-ZERO EXPLAIN RESULTS (30 fixture rows) ===\n');
  console.log('A. LIST QUERY:');
  console.log(`   Winning Stage : ${statsA.winningPlanStage}`);
  console.log(`   Index Used    : ${statsA.indexName}`);
  console.log(`   Keys Examined : ${statsA.keysExamined}`);
  console.log(`   Docs Examined : ${statsA.docsExamined}`);
  console.log(`   Docs Returned : ${statsA.docsReturned}`);
  console.log(`   SORT Stage    : ${statsA.hasSortStage ? 'YES ⚠️' : 'NO ✅'}`);
  console.log(`   Time (ms)     : ${statsA.totalTimeMillis}`);

  console.log('\nB. TEACHER CONFLICT QUERY:');
  console.log(`   Winning Stage : ${statsB.winningPlanStage}`);
  console.log(`   Index Used    : ${statsB.indexName}`);
  console.log(`   Keys Examined : ${statsB.keysExamined}`);
  console.log(`   Docs Examined : ${statsB.docsExamined}`);
  console.log(`   Docs Returned : ${statsB.docsReturned}`);
  console.log(`   SORT Stage    : ${statsB.hasSortStage ? 'YES ⚠️' : 'NO ✅'}`);
  console.log(`   Time (ms)     : ${statsB.totalTimeMillis}`);

  console.log('\nC. CLASS/SECTION CONFLICT QUERY:');
  console.log(`   Winning Stage : ${statsC.winningPlanStage}`);
  console.log(`   Index Used    : ${statsC.indexName}`);
  console.log(`   Keys Examined : ${statsC.keysExamined}`);
  console.log(`   Docs Examined : ${statsC.docsExamined}`);
  console.log(`   Docs Returned : ${statsC.docsReturned}`);
  console.log(`   SORT Stage    : ${statsC.hasSortStage ? 'YES ⚠️' : 'NO ✅'}`);
  console.log(`   Time (ms)     : ${statsC.totalTimeMillis}`);

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  const del = await col.deleteMany({ tenantId });
  console.log(`\nCleaned up ${del.deletedCount} fixture rows.`);

  const remaining = await col.countDocuments({});
  console.log(`Total timetable documents after cleanup: ${remaining}`);

  // ─── Regression check ──────────────────────────────────────────────────────
  const listOk    = statsA.indexName === 'idx_timetable_class_slot' && !statsA.hasSortStage;
  const teacherOk = statsB.indexName === 'idx_timetable_teacher_slot';
  const classOk   = statsC.indexName === 'idx_timetable_class_slot';

  console.log('\n=== REGRESSION CHECK ===');
  console.log(`List Query index correct & no SORT stage : ${listOk    ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Teacher Conflict index correct            : ${teacherOk ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Class/Section Conflict index correct      : ${classOk   ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Overall index regression                  : ${(listOk && teacherOk && classOk) ? 'NONE ✅' : 'REGRESSION DETECTED ❌'}`);

  await mongoose.disconnect();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
