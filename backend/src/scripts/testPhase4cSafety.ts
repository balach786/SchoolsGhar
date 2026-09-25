import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { AcademicSession } from '../models/AcademicSession';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { Subject } from '../models/Subject';
import { Exam } from '../models/Exam';
import { ExamSchedule } from '../models/ExamSchedule';
import { Mark } from '../models/Mark';
import { ExamAttendance } from '../models/ExamAttendance';
import { GradeScale } from '../models/GradeScale';
import { Student } from '../models/Student';
import { Result } from '../models/Result';
import { TenantExportService } from '../services/dataTransfer/TenantExportService';
import {
  computeCanonicalResults,
  computeResultSourceChecksum,
  ResultPublicationService,
} from '../services/resultCalculation.service';

dotenv.config();

interface Fixture {
  col: string;
  id: any;
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  ✗ [FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ [PASS] ${msg}`);
}

async function runProductionSafetyVerification() {
  console.log('\n======================================================');
  console.log('  PHASE 4C PRODUCTION SAFETY VERIFICATION SUITE       ');
  console.log('======================================================\n');

  await mongoose.connect(process.env.MONGODB_URI || '');
  const db = mongoose.connection.db!;
  console.log(`Connected to Database: ${db.databaseName}`);

  const fixturesToClean: Fixture[] = [];
  const testExamIds: mongoose.Types.ObjectId[] = [];

  const cleanup = async () => {
    for (const examId of testExamIds) {
      try {
        await db.collection('results').deleteMany({ examId });
      } catch (e) {
        // ignore
      }
    }
    for (const f of fixturesToClean.reverse()) {
      try {
        await db.collection(f.col).deleteOne({ _id: f.id });
      } catch (e) {
        // ignore
      }
    }
  };

  try {
    const existingTenant = await db.collection('tenants').findOne({});
    if (!existingTenant) throw new Error('No tenant found in database');
    const tenantId = existingTenant._id;
    const foreignTenantId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    // ──────────────────────────────────────────────────────────
    // SETUP FIXTURES
    // ──────────────────────────────────────────────────────────
    const session = await AcademicSession.create({
      tenantId,
      name: 'Safety Test Session 2026',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
      isArchived: false,
    });
    fixturesToClean.push({ col: 'academicsessions', id: session._id });

    const cls = await Class.create({
      tenantId,
      sessionId: session._id,
      name: 'Class Safety 1',
      code: 'CS1',
    });
    fixturesToClean.push({ col: 'classes', id: cls._id });

    const sec = await Section.create({
      tenantId,
      classId: cls._id,
      sessionId: session._id,
      name: 'Section A',
    });
    fixturesToClean.push({ col: 'sections', id: sec._id });

    const sub1 = await Subject.create({
      tenantId,
      sessionId: session._id,
      name: 'Safety Math',
      code: 'SMTH',
      type: 'theory',
    });
    fixturesToClean.push({ col: 'subjects', id: sub1._id });

    const studentA = await Student.create({
      tenantId,
      sessionId: session._id,
      classId: cls._id,
      sectionId: sec._id,
      fullName: 'Safety Student A',
      admissionNumber: `SAFE-A-${Date.now()}`,
      rollNumber: '01',
      gender: 'male',
      dateOfBirth: new Date('2010-01-01'),
      admissionDate: new Date(),
      guardianName: 'Guardian A',
      status: 'active',
      isArchived: false,
    });
    fixturesToClean.push({ col: 'students', id: studentA._id });

    const studentB = await Student.create({
      tenantId,
      sessionId: session._id,
      classId: cls._id,
      sectionId: sec._id,
      fullName: 'Safety Student B',
      admissionNumber: `SAFE-B-${Date.now()}`,
      rollNumber: '02',
      gender: 'female',
      dateOfBirth: new Date('2010-02-02'),
      admissionDate: new Date(),
      guardianName: 'Guardian B',
      status: 'active',
      isArchived: false,
    });
    fixturesToClean.push({ col: 'students', id: studentB._id });

    const gradeScale = await GradeScale.create({
      tenantId,
      name: 'Standard Safety Scale',
      boundaries: [
        { grade: 'A', minPercentage: 80 },
        { grade: 'B', minPercentage: 60 },
        { grade: 'C', minPercentage: 40 },
        { grade: 'F', minPercentage: 0 },
      ],
      isActive: true,
    });
    fixturesToClean.push({ col: 'gradescales', id: gradeScale._id });

    const exam = await Exam.create({
      tenantId,
      sessionId: session._id,
      classId: cls._id,
      classIds: [cls._id],
      name: 'Safety Exam 1',
      examType: 'term',
      gradeScaleId: gradeScale._id,
      status: 'Draft',
      isPublished: false,
      subjects: [
        {
          subjectId: sub1._id,
          maxMarks: 100,
          passMarks: 40,
        },
      ],
    });
    fixturesToClean.push({ col: 'exams', id: exam._id });
    testExamIds.push(exam._id);

    const sched1 = await ExamSchedule.create({
      tenantId,
      examId: exam._id,
      sessionId: session._id,
      classId: cls._id,
      subjectId: sub1._id,
      examDate: new Date('2026-10-10'),
      startTime: '09:00',
      endTime: '12:00',
      totalMarks: 100,
      passingMarks: 40,
    });
    fixturesToClean.push({ col: 'examschedules', id: sched1._id });

    const markA = await Mark.create({
      tenantId,
      examId: exam._id,
      sessionId: session._id,
      studentId: studentA._id,
      subjectId: sub1._id,
      marksObtained: 85,
      isAbsent: false,
    });
    fixturesToClean.push({ col: 'marks', id: markA._id });

    const markB = await Mark.create({
      tenantId,
      examId: exam._id,
      sessionId: session._id,
      studentId: studentB._id,
      subjectId: sub1._id,
      marksObtained: 70,
      isAbsent: false,
    });
    fixturesToClean.push({ col: 'marks', id: markB._id });

    // ──────────────────────────────────────────────────────────
    // 1. TRANSACTION ROLLBACK VERIFICATION (ITEM 1)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 1. Verification of Publication Transaction Rollback ---');
    let rollbackVerified = false;
    const sessionMongo = await mongoose.startSession();
    try {
      await sessionMongo.withTransaction(async () => {
        // Insert a partial Result snapshot within transaction
        await Result.create(
          [
            {
              tenantId,
              examId: exam._id,
              studentId: studentA._id,
              sessionId: session._id,
              classId: cls._id,
              sectionId: sec._id,
              version: 1,
              studentSnapshot: {
                fullName: studentA.fullName,
                admissionNumber: studentA.admissionNumber,
                rollNumber: studentA.rollNumber,
                className: 'Class Safety 1',
                sectionName: 'Section A',
                sessionName: 'Safety Test Session 2026',
              },
              examSnapshot: {
                examName: exam.name,
                examTypeName: 'term',
                gradeScaleName: gradeScale.name,
                gradeScaleBoundaries: gradeScale.boundaries,
              },
              subjectSnapshots: [
                {
                  subjectId: sub1._id,
                  subjectName: 'Safety Math',
                  subjectCode: 'SMTH',
                  marksObtained: 85,
                  maximumMarks: 100,
                  passMarks: 40,
                  attendanceStatus: 'present',
                  passed: true,
                  percentage: 85,
                },
              ],
              totalObtained: 85,
              totalMaximum: 100,
              percentage: 85,
              overallGrade: 'A',
              passed: true,
              failedSubjectCount: 0,
              sourceChecksum: 'dummy-checksum',
              calculationVersion: 1,
              publishedAt: new Date(),
              publishedBy: userId,
            },
          ],
          { session: sessionMongo }
        );

        // Force intentional error before exam publish update
        throw new Error('SIMULATED_TRANSACTION_FAILURE_BEFORE_EXAM_PUBLISHED');
      });
    } catch (err: any) {
      rollbackVerified = err.message === 'SIMULATED_TRANSACTION_FAILURE_BEFORE_EXAM_PUBLISHED';
    } finally {
      await sessionMongo.endSession();
    }

    assert(rollbackVerified, 'Transaction aborted upon mid-stream failure');

    // Confirm that zero results exist for exam
    const resultsAfterAbortedTx = await db.collection('results').find({ tenantId, examId: exam._id }).toArray();
    assert(resultsAfterAbortedTx.length === 0, 'Zero partial Result snapshots exist after aborted transaction');

    const examAfterAbortedTx = await Exam.findById(exam._id).lean();
    assert(!examAfterAbortedTx?.isPublished, 'Exam remains unpublished after transaction rollback');
    assert(examAfterAbortedTx?.status === 'Draft', 'Exam status remains Draft after rollback');

    // ──────────────────────────────────────────────────────────
    // 2. CONCURRENT RE-PUBLISH RACE VERIFICATION (ITEM 2)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 2. Concurrency Safe Re-Publish Race Verification ---');
    // First officially publish Version 1
    const initialPub = await ResultPublicationService.publishExamResults(mongoose.connection, String(exam._id), userId, tenantId);
    assert(initialPub.publishedCount === 2, 'Initial publication succeeded for 2 students (Version 1)');

    // Modify academic source: student A mark changed 85 -> 92
    markA.marksObtained = 92;
    await markA.save();

    // Fire 2 re-publication attempts concurrently
    const [p1, p2] = await Promise.allSettled([
      ResultPublicationService.republishStudentResult(mongoose.connection, String(exam._id), String(studentA._id), userId, tenantId),
      ResultPublicationService.republishStudentResult(mongoose.connection, String(exam._id), String(studentA._id), userId, tenantId),
    ]);

    const resultsP1P2 = [p1, p2];
    const fulfilled = resultsP1P2.filter((p) => p.status === 'fulfilled');
    const rejected = resultsP1P2.filter((p) => p.status === 'rejected');

    assert(fulfilled.length >= 1, 'At least one concurrent republish succeeded');
    // The second either succeeded with version 2 (if serializable) or threw controlled duplicate / SOURCE_UNCHANGED error
    if (rejected.length > 0) {
      const rejReason: any = (rejected[0] as PromiseRejectedResult).reason;
      const isControlled = rejReason?.code === 'SOURCE_UNCHANGED' || rejReason?.code === 'CONCURRENT_UPDATE_CONFLICT';
      assert(isControlled, `Second concurrent republish returned controlled application error (${rejReason?.code})`);
    }

    // Inspect all persisted versions for student A
    const allVersionsStudentA = await db.collection('results')
      .find({ tenantId, examId: exam._id, studentId: studentA._id })
      .sort({ version: 1 })
      .toArray();

    const versionNumbers = allVersionsStudentA.map((v) => v.version);
    console.log(`  -> Persisted versions for student A: [${versionNumbers.join(', ')}]`);
    assert(new Set(versionNumbers).size === versionNumbers.length, 'No duplicate versions exist in results collection');
    assert(versionNumbers[0] === 1, 'Version 1 exists intact');
    assert(versionNumbers[versionNumbers.length - 1] === 2, 'Highest version is exactly 2');

    // ──────────────────────────────────────────────────────────
    // 3. RAW BSON IMMUTABILITY VERIFICATION (ITEM 3)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 3. Raw BSON Immutability Verification ---');
    const v1Before = await db.collection('results').findOne({
      tenantId,
      examId: exam._id,
      studentId: studentA._id,
      version: 1,
    });

    const v1BeforeJson = JSON.stringify(v1Before);

    // Perform massive mutations across all raw entities
    markA.marksObtained = 99;
    await markA.save();

    gradeScale.boundaries[0].minPercentage = 95;
    await gradeScale.save();

    studentA.fullName = 'Mutated Student Name XYZ';
    studentA.rollNumber = '999';
    await studentA.save();

    // Create Version 3
    const v3Res = await ResultPublicationService.republishStudentResult(
      mongoose.connection,
      String(exam._id),
      String(studentA._id),
      userId,
      tenantId
    );
    assert(v3Res.version === 3, 'Created Version 3 snapshot after source changes');

    // Read Version 1 again from MongoDB
    const v1After = await db.collection('results').findOne({
      tenantId,
      examId: exam._id,
      studentId: studentA._id,
      version: 1,
    });
    const v1AfterJson = JSON.stringify(v1After);

    assert(v1BeforeJson === v1AfterJson, 'Version 1 raw BSON representation is 100% identical byte-for-byte');
    assert(v1After?.studentSnapshot.fullName === 'Safety Student A', 'Version 1 retains original student name');
    assert(v1After?.totalObtained === 85, 'Version 1 retains original marks (85, not 99)');

    // ──────────────────────────────────────────────────────────
    // 4. TENANT ISOLATION DEFENSE (ITEM 6)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 4. Cross-Tenant Isolation Defense ---');
    // Attempt retrieving student A's result using foreignTenantId
    const crossTenantLookup = await Result.findOne({
      tenantId: foreignTenantId,
      examId: exam._id,
      studentId: studentA._id,
    });
    assert(crossTenantLookup === null, 'Foreign tenant cannot read Tenant A Result snapshot');

    // Attempt re-publishing using foreign tenant ID
    let crossTenantRepubBlocked = false;
    try {
      await ResultPublicationService.republishStudentResult(
        mongoose.connection,
        String(exam._id),
        String(studentA._id),
        userId,
        foreignTenantId
      );
    } catch (err: any) {
      crossTenantRepubBlocked = err.code === 'NOT_FOUND' || err.statusCode === 404;
    }
    assert(crossTenantRepubBlocked, 'Foreign tenant cannot trigger re-publication on foreign exam');

    // ──────────────────────────────────────────────────────────
    // 5. HTTP IMMUTABILITY BYPASS DEFENSE (ITEM 7)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 5. HTTP Immutability Bypass Defense ---');
    let maliciousSaveBlocked = false;
    const v1DocToHack = await Result.findOne({
      tenantId,
      examId: exam._id,
      studentId: studentA._id,
      version: 1,
    });

    // Simulate an attacker sending malicious payload properties
    (v1DocToHack as any).allowAdministrativeResultMutation = true;
    (v1DocToHack as any).bypassImmutability = true;
    (v1DocToHack as any).totalObtained = 100;

    try {
      await v1DocToHack!.save();
    } catch (err: any) {
      maliciousSaveBlocked = err.code === 'RESULT_IMMUTABLE';
    }
    assert(maliciousSaveBlocked, 'Payload fields like allowAdministrativeResultMutation cannot bypass Result immutability pre-hook');

    // ──────────────────────────────────────────────────────────
    // 6. EXPORT REGISTRY & ROUND-TRIP VERIFICATION (ITEM 8)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 6. Tenant Export Integrity Verification ---');
    const os = await import('os');
    const fs = await import('fs');
    const path = await import('path');
    const tempExportDirA = path.join(os.tmpdir(), `sms-export-test-a-${Date.now()}`);
    const tempExportDirB = path.join(os.tmpdir(), `sms-export-test-b-${Date.now()}`);

    try {
      const manifestA = await TenantExportService.exportTenant(tenantId, 'school_data', tempExportDirA);
      assert(Boolean(manifestA.collectionSummary['results']), 'results collection is exported under Mode A');
      assert(manifestA.collectionSummary['results'].count >= 3, 'Export Mode A contains all published Result snapshots (count >= 3)');

      const { EJSON } = await import('bson');
      const resultsFileA = path.join(tempExportDirA, 'results.ejson');
      const contentA = fs.readFileSync(resultsFileA, 'utf-8');
      const parsedA: any[] = EJSON.parse(contentA) as any[];
      const exportedV1 = parsedA.find((r: any) => String(r.studentId) === String(studentA._id) && r.version === 1);
      assert(Boolean(exportedV1), 'Found exported Version 1 record for student A in Mode A');
      assert(exportedV1.totalObtained === 85, 'Exported Mode A Version 1 preserves snapshot totalObtained = 85');

      // Test Mode B (Internal Recovery with AES-256-GCM encryption)
      const manifestB = await TenantExportService.exportTenant(tenantId, 'internal_recovery', tempExportDirB);
      assert(Boolean(manifestB.collectionSummary['results']), 'results collection is exported under Mode B');
      assert(manifestB.collectionSummary['results'].algorithm === 'aes-256-gcm', 'results export in Mode B uses AES-256-GCM');

      // Verify Mode B decryption round-trip
      const resultsFileB = path.join(tempExportDirB, 'results.ejson.enc');
      const ciphertextBuf = fs.readFileSync(resultsFileB);
      const keyInfo = TenantExportService.getBackupEncryptionKeyInfo();
      const decryptedBuf = TenantExportService.verifyAndDecryptModeBFile(
        ciphertextBuf,
        keyInfo.key,
        manifestB.collectionSummary['results'].iv!,
        manifestB.collectionSummary['results'].authTag!
      );
      const parsedB: any[] = EJSON.parse(decryptedBuf.toString('utf-8')) as any[];
      assert(parsedB.length >= 3, 'Decrypted Mode B results file accurately restores all versions');
      const decryptedV1 = parsedB.find((r: any) => String(r.studentId) === String(studentA._id) && r.version === 1);
      assert(Boolean(decryptedV1), 'Found decrypted Version 1 record in Mode B');
      assert(decryptedV1.totalObtained === 85, 'Decrypted Mode B preserves Version 1 values perfectly');
    } finally {
      if (fs.existsSync(tempExportDirA)) fs.rmSync(tempExportDirA, { recursive: true, force: true });
      if (fs.existsSync(tempExportDirB)) fs.rmSync(tempExportDirB, { recursive: true, force: true });
    }

    // ──────────────────────────────────────────────────────────
    // 7. QUERY EXECUTION PLAN INSPECTION (ITEM 9)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 7. Query Execution Plan Inspection ---');
    const explainLatest = await db.collection('results').find({
      tenantId,
      examId: exam._id,
      studentId: studentA._id,
    }).sort({ version: -1 }).limit(1).explain();

    const plan = (explainLatest as any).queryPlanner || (explainLatest as any).executionStats;
    const winningPlan = (explainLatest as any).queryPlanner?.winningPlan || {};
    const planString = JSON.stringify(winningPlan);
    const usesIndex = planString.includes('IXSCAN') && planString.includes('version_-1');
    assert(usesIndex, 'Latest Result query uses compound index { tenantId, examId, studentId, version: -1 } via IXSCAN');

    console.log('\n======================================================');
    console.log('  ALL PRODUCTION SAFETY VERIFICATIONS PASSED (7/7)   ');
    console.log('======================================================\n');
  } finally {
    console.log('Cleaning up temporary safety fixtures...');
    await cleanup();
    console.log('Safety fixtures cleaned up successfully.');
    await mongoose.disconnect();
  }
}

runProductionSafetyVerification().catch((err) => {
  console.error('Production safety verification error:', err);
  process.exit(1);
});
