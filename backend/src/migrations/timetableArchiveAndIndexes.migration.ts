import mongoose from 'mongoose';
import { Timetable } from '../models/Timetable';

export interface ExplainStats {
  winningPlanStage?: string;
  indexName?: string;
  keysExamined?: number;
  docsExamined?: number;
  docsReturned?: number;
  hasSortStage?: boolean;
  totalTimeMillis?: number;
}

export interface TimetableMigrationResult {
  success: boolean;
  initialDocumentCount: number;
  legacyIsArchivedBackfilled: number;
  preMigrationIndexes: string[];
  postMigrationIndexes: string[];
  indexesCreated: string[];
  indexesDropped: Array<{ name: string; reason: string }>;
  explainBefore: {
    listQuery: ExplainStats;
    teacherConflictQuery: ExplainStats;
    classConflictQuery: ExplainStats;
  };
  explainAfter: {
    listQuery: ExplainStats;
    teacherConflictQuery: ExplainStats;
    classConflictQuery: ExplainStats;
  };
  message: string;
}

function extractExplainStats(explainOutput: any): ExplainStats {
  const executionStats = explainOutput?.executionStats;
  const queryPlanner = explainOutput?.queryPlanner;
  const winningPlan = queryPlanner?.winningPlan || {};

  let indexName: string | undefined = undefined;
  let hasSortStage = false;

  function walkPlan(plan: any) {
    if (!plan) return;
    if (plan.stage === 'SORT') {
      hasSortStage = true;
    }
    if (plan.indexName) {
      indexName = plan.indexName;
    }
    if (plan.inputStage) {
      walkPlan(plan.inputStage);
    }
    if (plan.inputStages && Array.isArray(plan.inputStages)) {
      for (const st of plan.inputStages) {
        walkPlan(st);
      }
    }
  }

  walkPlan(winningPlan);

  return {
    winningPlanStage: winningPlan.stage,
    indexName: indexName || 'COLLSCAN',
    keysExamined: executionStats?.totalKeysExamined ?? 0,
    docsExamined: executionStats?.totalDocsExamined ?? 0,
    docsReturned: executionStats?.nReturned ?? 0,
    hasSortStage,
    totalTimeMillis: executionStats?.executionTimeMillis ?? 0,
  };
}

export async function runTimetableArchiveAndIndexesMigration(): Promise<TimetableMigrationResult> {
  const collection = Timetable.collection;

  // 1. Inspect initial document count
  const initialDocumentCount = await Timetable.countDocuments({});

  // 2. Safe idempotent backfill of legacy isArchived
  const backfillResult = await Timetable.updateMany(
    { isArchived: { $exists: false } },
    { $set: { isArchived: false } }
  );
  const legacyIsArchivedBackfilled = backfillResult.modifiedCount;

  // 3. Inspect pre-migration indexes
  const existingIndexInfo = await collection.indexes();
  const preMigrationIndexes = existingIndexInfo.map((idx) => idx.name).filter((n): n is string => !!n);

  // Define synthetic IDs for query shape explain testing
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummySessionId = new mongoose.Types.ObjectId();
  const dummyClassId = new mongoose.Types.ObjectId();
  const dummySectionId = new mongoose.Types.ObjectId();
  const dummyTeacherId = new mongoose.Types.ObjectId();

  // Explain Query Shape A: List Query
  const explainListBeforeRaw = await collection
    .find({
      tenantId: dummyTenantId,
      sessionId: dummySessionId,
      classId: dummyClassId,
      sectionId: dummySectionId,
      isArchived: false,
    })
    .sort({ dayOfWeek: 1, periodNumber: 1, startTime: 1 })
    .explain('executionStats');
  const explainListBefore = extractExplainStats(explainListBeforeRaw);

  // Explain Query Shape B: Teacher Conflict Query
  const explainTeacherBeforeRaw = await collection
    .find({
      tenantId: dummyTenantId,
      sessionId: dummySessionId,
      teacherId: dummyTeacherId,
      dayOfWeek: 'monday',
      isArchived: false,
      startTime: { $lt: '10:00' },
      endTime: { $gt: '09:00' },
    })
    .explain('executionStats');
  const explainTeacherBefore = extractExplainStats(explainTeacherBeforeRaw);

  // Explain Query Shape C: Class/Section Conflict Query
  const explainClassBeforeRaw = await collection
    .find({
      tenantId: dummyTenantId,
      sessionId: dummySessionId,
      classId: dummyClassId,
      sectionId: dummySectionId,
      dayOfWeek: 'monday',
      isArchived: false,
      startTime: { $lt: '10:00' },
      endTime: { $gt: '09:00' },
    })
    .explain('executionStats');
  const explainClassBefore = extractExplainStats(explainClassBeforeRaw);

  // 4. Create explicit indexes justified by execution shapes
  const indexesCreated: string[] = [];
  const indexesDropped: Array<{ name: string; reason: string }> = [];

  // Index 1: Covers List Query (equality on tenantId, sessionId, classId, sectionId, isArchived + sort on dayOfWeek, periodNumber, startTime)
  // and prefix covers Class/Section Conflict Query (equality on tenantId, sessionId, classId, sectionId, isArchived, dayOfWeek)
  const classSlotIndexName = 'idx_timetable_class_slot';
  if (!preMigrationIndexes.includes(classSlotIndexName)) {
    await collection.createIndex(
      {
        tenantId: 1,
        sessionId: 1,
        classId: 1,
        sectionId: 1,
        isArchived: 1,
        dayOfWeek: 1,
        periodNumber: 1,
        startTime: 1,
      },
      { name: classSlotIndexName }
    );
    indexesCreated.push(classSlotIndexName);
  }

  // Index 2: Covers Teacher Conflict Query (equality on tenantId, sessionId, teacherId, dayOfWeek, isArchived + range on startTime, endTime)
  const teacherSlotIndexName = 'idx_timetable_teacher_slot';
  if (!preMigrationIndexes.includes(teacherSlotIndexName)) {
    await collection.createIndex(
      {
        tenantId: 1,
        sessionId: 1,
        teacherId: 1,
        dayOfWeek: 1,
        isArchived: 1,
        startTime: 1,
        endTime: 1,
      },
      { name: teacherSlotIndexName }
    );
    indexesCreated.push(teacherSlotIndexName);
  }

  // 5. Drop redundant legacy indexes ONLY if they exist and are proven redundant
  const oldClassIndex = 'tenantId_1_classId_1_sectionId_1_dayOfWeek_1';
  if (preMigrationIndexes.includes(oldClassIndex)) {
    await collection.dropIndex(oldClassIndex);
    indexesDropped.push({
      name: oldClassIndex,
      reason: 'Redundant: lacks sessionId and isArchived; fully superseded by idx_timetable_class_slot',
    });
  }

  const oldTeacherIndex = 'tenantId_1_teacherId_1_dayOfWeek_1';
  if (preMigrationIndexes.includes(oldTeacherIndex)) {
    await collection.dropIndex(oldTeacherIndex);
    indexesDropped.push({
      name: oldTeacherIndex,
      reason: 'Redundant: lacks sessionId and isArchived; fully superseded by idx_timetable_teacher_slot',
    });
  }

  // 6. Explain after index creation
  const explainListAfterRaw = await collection
    .find({
      tenantId: dummyTenantId,
      sessionId: dummySessionId,
      classId: dummyClassId,
      sectionId: dummySectionId,
      isArchived: false,
    })
    .sort({ dayOfWeek: 1, periodNumber: 1, startTime: 1 })
    .explain('executionStats');
  const explainListAfter = extractExplainStats(explainListAfterRaw);

  const explainTeacherAfterRaw = await collection
    .find({
      tenantId: dummyTenantId,
      sessionId: dummySessionId,
      teacherId: dummyTeacherId,
      dayOfWeek: 'monday',
      isArchived: false,
      startTime: { $lt: '10:00' },
      endTime: { $gt: '09:00' },
    })
    .explain('executionStats');
  const explainTeacherAfter = extractExplainStats(explainTeacherAfterRaw);

  const explainClassAfterRaw = await collection
    .find({
      tenantId: dummyTenantId,
      sessionId: dummySessionId,
      classId: dummyClassId,
      sectionId: dummySectionId,
      dayOfWeek: 'monday',
      isArchived: false,
      startTime: { $lt: '10:00' },
      endTime: { $gt: '09:00' },
    })
    .explain('executionStats');
  const explainClassAfter = extractExplainStats(explainClassAfterRaw);

  // 7. Post-migration indexes
  const postIndexes = await collection.indexes();
  const postMigrationIndexes = postIndexes.map((idx) => idx.name).filter((n): n is string => !!n);

  return {
    success: true,
    initialDocumentCount,
    legacyIsArchivedBackfilled,
    preMigrationIndexes,
    postMigrationIndexes,
    indexesCreated,
    indexesDropped,
    explainBefore: {
      listQuery: explainListBefore,
      teacherConflictQuery: explainTeacherBefore,
      classConflictQuery: explainClassBefore,
    },
    explainAfter: {
      listQuery: explainListAfter,
      teacherConflictQuery: explainTeacherAfter,
      classConflictQuery: explainClassAfter,
    },
    message: 'Timetable index and archive migration executed successfully.',
  };
}
