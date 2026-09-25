import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Ensure LOAD_TEST flag is verified
import { LOAD_TEST_CONFIG } from './config';
import { LoadTestSafety } from './safety';
import { LoadTestFixtures, SyntheticSchool } from './fixtures';
import { MetricsCollector, MetricSummary } from './metrics';

// Import Scenarios
import { runAuthScenario } from './scenarios/auth';
import { runDashboardScenario } from './scenarios/dashboard';
import { runStudentListScenario } from './scenarios/students';
import { runAttendanceScenario } from './scenarios/attendance';
import { runFeeGenerationScenario } from './scenarios/fees';
import { runPaymentScenario } from './scenarios/payments';
import { runResultScenario } from './scenarios/results';
import { runIsolationScenario } from './scenarios/isolation';
import { runExportScenario } from './scenarios/export';

async function main() {
  console.log('=====================================================');
  console.log('  STARTING PHASE 4F — CONTROLLED LOAD TEST HARNESS   ');
  console.log('=====================================================');

  // 1. Safety verification
  LoadTestSafety.assertSafeEnvironment();
  const loadTestUri = LoadTestSafety.getLoadTestMongoUri();
  console.log(`Targeting isolated load-test database URI: ${loadTestUri.replace(/\/\/.*@/, '//***@')}`);

  // Connect to isolated load-test database
  const connection = await mongoose.createConnection(loadTestUri).asPromise();
  const client = connection.getClient();
  LoadTestSafety.assertSafeDatabase(connection);
  console.log(`Connected safely to database: "${connection.db!.databaseName}"`);

  const metrics = new MetricsCollector();
  metrics.start();

  const resultsArtifact: Record<string, any> = {
    startedAt: new Date().toISOString(),
    environment: 'MongoDB Atlas M0 (Shared Cluster)',
    databaseName: connection.db!.databaseName,
    safetyVerified: true,
  };

  try {
    // Pre-test cleanup of load-test DB collections
    const initialColls = await connection.db!.listCollections().toArray();
    for (const col of initialColls) {
      await connection.db!.collection(col.name).drop().catch(() => {});
    }

    // 2. Clone baseline index configuration onto load-test database
    console.log('\n--- STEP 4F.2: CLONING BASELINE INDEXES TO LOADTEST DB ---');
    const createdIndexesCount = await LoadTestFixtures.syncBaselineIndexes(connection);
    console.log(`Synced schema indexes. Total physical indexes verified: ${createdIndexesCount}`);
    resultsArtifact.indexesSynced = createdIndexesCount;

    // 3. Seed Dataset A (Micro: 5 schools, 100 students each)
    console.log('\n--- STEP 4F.4: SEEDING DATASET A (MICRO: 5 SCHOOLS, 100 STUDENTS EACH) ---');
    const seedStart = performance.now();
    const schoolsA = await LoadTestFixtures.seedDataset(connection, 5, 100, 10);
    console.log(`Seeded 5 schools in ${Math.round(performance.now() - seedStart)}ms.`);
    resultsArtifact.datasetA = { schools: 5, studentsPerSchool: 100, staffPerSchool: 10 };

    // Seed initial fee obligations so payment scenarios have unpaid fees
    console.log('Seeding initial fee obligations for Dataset A...');
    const feeGenRes = await runFeeGenerationScenario(connection, schoolsA, metrics);
    console.log(`Generated ${feeGenRes.totalGenerated} fees across schools.`);
    resultsArtifact.feeGeneration = feeGenRes;

    // 4. Step 4F.3: Query Mapping & Explain Plan Audit
    console.log('\n--- STEP 4F.3: QUERY-MAPPING AMBIGUITIES AUDIT ---');
    const sampleSchool = schoolsA[0];
    const sampleClass = sampleSchool.classes[0];
    const sampleStudent = sampleSchool.students[0];

    // 4.1 Attendance field verification
    const attExplain = await connection.db!.collection('studentattendances').find({
      tenantId: sampleSchool.tenantId,
      classId: sampleClass._id,
      sectionId: sampleClass.sectionId,
      attendanceDate: new Date('2026-09-10'),
    }).explain('executionStats');

    const attWinningIndex = (attExplain as any).queryPlanner?.winningPlan?.inputStage?.indexName || 'COLLSCAN';
    console.log(`Student Attendance Query Plan: Winning Index = "${attWinningIndex}" (field: attendanceDate)`);

    // 4.2 Roll Lookup without sessionId
    const rollExplain = await connection.db!.collection('students').find({
      tenantId: sampleSchool.tenantId,
      classId: sampleClass._id,
      sectionId: sampleClass.sectionId,
      rollNumber: '1',
    }).explain('executionStats');
    const rollWinningIndex = (rollExplain as any).queryPlanner?.winningPlan?.inputStage?.indexName || 'COLLSCAN';
    console.log(`Roll Lookup (without sessionId) Plan: Winning Index = "${rollWinningIndex}"`);

    // 4.3 Payment Student History query
    const payHistExplain = await connection.db!.collection('payments').find({
      tenantId: sampleSchool.tenantId,
      studentId: sampleStudent._id,
    }).sort({ paymentDate: -1 }).explain('executionStats');
    const payWinningIndex = (payHistExplain as any).queryPlanner?.winningPlan?.inputStage?.indexName || 'COLLSCAN';
    const payHasSort = JSON.stringify((payHistExplain as any).queryPlanner).includes('"stage":"SORT"');
    console.log(`Payment History Query Plan: Winning Index = "${payWinningIndex}", Has In-Memory Sort = ${payHasSort}`);

    resultsArtifact.queryMappings = {
      studentAttendance: { field: 'attendanceDate', winningIndex: attWinningIndex },
      studentRollLookup: { queryIncludesSessionId: false, winningIndex: rollWinningIndex },
      paymentStudentHistory: { winningIndex: payWinningIndex, inMemorySort: payHasSort },
    };

    // 5. Staged Concurrency Executions
    console.log('\n--- STEP 4F.5: STAGED CONCURRENCY TESTING (5 -> 10 -> 25 -> 50 VUs) ---');
    const stageSummaries: Record<number, MetricSummary[]> = {};

    for (const stg of LOAD_TEST_CONFIG.STAGES) {
      console.log(`\nExecuting Stage ${stg.stage}: ${stg.vus} VUs (Duration target: ${stg.durationMs / 1000}s)`);

      // Auth Scenario
      const authRes = await runAuthScenario(connection, schoolsA, stg.vus * 2, metrics);

      // Student List Scenario
      const stuRes = await runStudentListScenario(connection, schoolsA, stg.vus, metrics);

      // Attendance Bulk Writes
      const attRes = await runAttendanceScenario(connection, schoolsA, Math.min(stg.vus, 10), metrics);

      // Dashboard Fan-out Scenario
      const dashRes = await runDashboardScenario(connection, schoolsA, Math.min(stg.vus, 25), metrics);

      // Payment Concurrency & ACID Race
      const payRes = await runPaymentScenario(client, connection, schoolsA, Math.min(stg.vus, 20), metrics);

      // Multi-Tenant Isolation Continuous Assertions
      const isoRes = await runIsolationScenario(connection, schoolsA, stg.vus * 2, metrics);

      if (isoRes.crossTenantViolations > 0) {
        throw new Error(`CRITICAL ISOLATION FAILURE: Detected ${isoRes.crossTenantViolations} cross-tenant violations in Stage ${stg.stage}!`);
      }

      console.log(`Stage ${stg.stage} Complete: 0 isolation leaks, payments committed=${payRes.committedTransactions}, duplicates caught=${attRes.duplicateErrorsCaught + payRes.idempotentDeduplications}`);
    }

    // 6. Step 4F.11: Fee Generation Scale (300 & 1,000 obligations)
    console.log('\n--- STEP 4F.11: FEE GENERATION SCALE BENCHMARK ---');
    const feeGenStressRes = await runFeeGenerationScenario(connection, schoolsA, metrics);
    console.log(`Generated ${feeGenStressRes.totalGenerated} fees across schools. Duplicate rejections caught = ${feeGenStressRes.duplicateRejections}`);
    resultsArtifact.feeGenerationStress = feeGenStressRes;

    // 7. Step 4F.14: Result Publication Benchmark (100, 300, 500 cohorts)
    console.log('\n--- STEP 4F.14: RESULT PUBLICATION BENCHMARK ---');
    const resultBenchmark = await runResultScenario(client, connection, schoolsA[0], [100, 300, 500], metrics);
    console.log('Result publication transaction durations (ms):', JSON.stringify(resultBenchmark.publicationDurations));
    console.log(`Result report card read latency: ${resultBenchmark.latestReadLatencyMs}ms`);
    resultsArtifact.resultPublication = resultBenchmark;

    // 8. Step 4F.16 & 4F.17: Export Refactor & Event Loop Benchmark
    console.log('\n--- STEP 4F.16 & 4F.17: EXPORT REFACTOR & EVENT-LOOP BENCHMARK ---');
    const exportBenchmark = await runExportScenario(connection, schoolsA[0], metrics);
    console.log(`Export completed in ${exportBenchmark.exportDurationMs}ms (Archive size: ${exportBenchmark.archiveSizeBytes} bytes)`);
    console.log(`Concurrent query latency during export: ${exportBenchmark.concurrentQueryLatencyMs}ms (Event-loop responsive)`);
    console.log(`Mode B decryption verified: ${exportBenchmark.modeBDecryptionVerified}`);
    resultsArtifact.exportBenchmark = exportBenchmark;

    // 9. Step 4F.19: Index A/B Benchmark in Isolated Load-Test Database
    console.log('\n--- STEP 4F.19: INDEX A/B BENCHMARK (LOADTEST DB ONLY) ---');
    // Test write latency before vs after dropping redundant compound uniqueness on financialreferences
    const abCollection = connection.db!.collection('financialreferences');
    const sampleTId = schoolsA[0].tenantId;

    const measureRefWrites = async (batchSize: number) => {
      const docs = Array.from({ length: batchSize }).map((_, i) => ({
        _id: `${sampleTId}:test_ab:${Date.now()}_${i}`,
        tenantId: sampleTId,
        paymentMethod: 'cash',
        normalizedReference: `AB_REF_${Date.now()}_${i}`,
        sourceType: 'regular_fee',
        paymentId: new mongoose.Types.ObjectId(),
        receiptNumber: 'REC-AB',
        createdAt: new Date(),
      }));
      const start = performance.now();
      await abCollection.insertMany(docs as any);
      return Math.round(performance.now() - start);
    };

    const beforeDropWriteMs = await measureRefWrites(100);
    console.log(`Index A/B [FinancialReferences]: 100 Inserts WITH redundant compound unique index = ${beforeDropWriteMs}ms`);

    // Drop redundant compound unique index in load-test database
    await abCollection.dropIndex('tenantId_1_paymentMethod_1_normalizedReference_1');
    const afterDropWriteMs = await measureRefWrites(100);
    console.log(`Index A/B [FinancialReferences]: 100 Inserts WITHOUT redundant compound unique index = ${afterDropWriteMs}ms`);

    resultsArtifact.indexAB = {
      financialReferences: {
        withRedundantCompoundMs: beforeDropWriteMs,
        withoutRedundantCompoundMs: afterDropWriteMs,
        improvementPercent: Math.round(((beforeDropWriteMs - afterDropWriteMs) / beforeDropWriteMs) * 100),
      },
    };

    metrics.stop();

    // Summarize Metrics
    console.log('\n=====================================================');
    console.log('            LOAD TEST METRICS SUMMARY                ');
    console.log('=====================================================');
    const scenarios = [
      'auth_me',
      'dashboard_fanout',
      'student_list_paginated',
      'student_lookup_exact',
      'student_search_regex',
      'attendance_bulk_write_40',
      'attendance_class_daily_read',
      'fee_generation_batch',
      'payment_acid_transaction',
      'result_publish_cohort_100',
      'result_publish_cohort_300',
      'result_publish_cohort_500',
      'result_read_latest_snapshot',
      'export_tenant_mode_b',
      'tenant_isolation_concurrency',
    ];

    const summaries: Record<string, MetricSummary> = {};
    for (const sc of scenarios) {
      const s = metrics.getSummary(sc);
      summaries[sc] = s;
      console.log(
        `${sc.padEnd(30)} | reqs: ${String(s.totalRequests).padStart(4)} | err: ${s.errorRatePercent}% | p50: ${String(s.p50Ms).padStart(5)}ms | p95: ${String(s.p95Ms).padStart(6)}ms | p99: ${String(s.p99Ms).padStart(6)}ms`
      );
    }
    resultsArtifact.summaries = summaries;

  } finally {
    // 10. Step 4F.24: Final Database Cleanup
    console.log('\n--- STEP 4F.24: CLEANUP OF ISOLATED LOAD-TEST DATABASE ---');
    try {
      console.log(`Purging collections in load-test database: "${connection.db!.databaseName}"...`);
      const remainingColls = await connection.db!.listCollections().toArray();
      for (const col of remainingColls) {
        await connection.db!.collection(col.name).drop().catch(() => {});
      }
      console.log(`All ${remainingColls.length} collections dropped from load-test database.`);
    } catch (e: any) {
      console.error('Error dropping load-test collections:', e.message);
    } finally {
      await connection.close();
    }

    // 11. Verify Primary Baseline Preservation
    console.log('\n--- VERIFYING PRIMARY LEGITIMATE BASELINE PRESERVATION ---');
    const primaryUri = process.env.MONGODB_URI!;
    const primaryConn = await mongoose.createConnection(primaryUri).asPromise();
    const pDb = primaryConn.db!;

    const postVerifyCounts = {
      students: await pDb.collection('students').countDocuments(),
      tenants: await pDb.collection('tenants').countDocuments(),
      users: await pDb.collection('users').countDocuments(),
      feeStructures: await pDb.collection('feestructures').countDocuments(),
      results: await pDb.collection('results').countDocuments(),
      studentFees: await pDb.collection('studentfees').countDocuments(),
      payments: await pDb.collection('payments').countDocuments(),
    };

    console.log('Primary database baseline counts post-test:');
    console.log(JSON.stringify(postVerifyCounts, null, 2));

    const baselineMatches =
      postVerifyCounts.students === 40 &&
      postVerifyCounts.tenants === 2 &&
      postVerifyCounts.users === 3 &&
      postVerifyCounts.feeStructures === 1 &&
      postVerifyCounts.results === 0 &&
      postVerifyCounts.studentFees === 0 &&
      postVerifyCounts.payments === 0;

    console.log(`Primary baseline preserved perfectly: ${baselineMatches}`);
    resultsArtifact.primaryBaselinePreserved = baselineMatches;
    resultsArtifact.primaryPostVerifyCounts = postVerifyCounts;

    await primaryConn.close();

    // Save final report artifact
    const runId = `run-${Date.now()}`;
    const reportPath = path.join(process.cwd(), 'backups', `phase4f-report-${runId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(resultsArtifact, null, 2));
    console.log(`Saved comprehensive load test report artifact: ${reportPath}`);
  }
}

main().catch((err) => {
  console.error('FATAL RUNNER ERROR:', err);
  process.exit(1);
});
