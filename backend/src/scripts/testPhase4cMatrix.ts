import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { Exam } from '../models/Exam';
import { ExamSchedule } from '../models/ExamSchedule';
import { Mark } from '../models/Mark';
import { ExamAttendance } from '../models/ExamAttendance';
import { GradeScale } from '../models/GradeScale';
import { Student } from '../models/Student';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { Subject } from '../models/Subject';
import { AcademicSession } from '../models/AcademicSession';
import { Result } from '../models/Result';
import {
  computeCanonicalResults,
  computeResultSourceChecksum,
  ResultPublicationService,
  RESULT_CALCULATION_VERSION,
} from '../services/resultCalculation.service';
import { TENANT_EXPORT_REGISTRY } from '../services/dataTransfer/TenantExportService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail: string = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
  }
}

async function runPhase4cMatrix() {
  console.log('\n======================================================');
  console.log('       PHASE 4C COMPREHENSIVE TEST MATRIX            ');
  console.log('======================================================\n');

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing from environment');

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  console.log(`Connected to Database: ${db.databaseName}\n`);

  // Ensure indexes are synced on Result
  await Result.syncIndexes();

  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  const fixturesToClean: { col: string; id: any }[] = [];

  try {
    // ──────────────────────────────────────────────────────────
    // 1. PHYSICAL COLLECTION & INDEXES
    // ──────────────────────────────────────────────────────────
    console.log('--- 1. Physical Collection & Indexes ---');
    const cols = (await db.listCollections().toArray()).map((c) => c.name);
    assert(cols.includes('results'), "Physical 'results' collection created");

    const resultIndexes = await db.collection('results').indexes();
    const versionIdx = resultIndexes.find(
      (idx) =>
        idx.key?.tenantId === 1 &&
        idx.key?.examId === 1 &&
        idx.key?.studentId === 1 &&
        idx.key?.version === -1 &&
        idx.unique === true
    );
    assert(
      Boolean(versionIdx),
      'Unique version index { tenantId: 1, examId: 1, studentId: 1, version: -1 } exists'
    );

    const isLatestIdx = resultIndexes.find((idx) => idx.key?.isLatest !== undefined);
    assert(!isLatestIdx, 'No mutable isLatest index exists (Correction 1: Pure immutable versions)');

    // ──────────────────────────────────────────────────────────
    // 2. SETUP ACADEMIC FIXTURES
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 2. Academic Environment Setup ---');
    const session = await AcademicSession.create({
      tenantId,
      name: '2026-2027 Session',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
      isArchived: false,
    });
    fixturesToClean.push({ col: 'academicsessions', id: session._id });

    const cls = await Class.create({
      tenantId,
      sessionId: session._id,
      name: 'Grade 10',
      code: 'G10',
    });
    fixturesToClean.push({ col: 'classes', id: cls._id });

    const sec = await Section.create({
      tenantId,
      classId: cls._id,
      sessionId: session._id,
      name: 'Section A',
    });
    fixturesToClean.push({ col: 'sections', id: sec._id });

    const subMath = await Subject.create({
      tenantId,
      sessionId: session._id,
      name: 'Mathematics',
      code: 'MATH10',
      classIds: [cls._id],
    });
    fixturesToClean.push({ col: 'subjects', id: subMath._id });

    const subEng = await Subject.create({
      tenantId,
      sessionId: session._id,
      name: 'English',
      code: 'ENG10',
      classIds: [cls._id],
    });
    fixturesToClean.push({ col: 'subjects', id: subEng._id });

    const gradeScale = await GradeScale.create({
      tenantId,
      name: 'Standard 10-Point Scale',
      boundaries: [
        { grade: 'A+', minPercentage: 90 },
        { grade: 'A', minPercentage: 80 },
        { grade: 'B', minPercentage: 70 },
        { grade: 'C', minPercentage: 60 },
        { grade: 'D', minPercentage: 50 },
        { grade: 'F', minPercentage: 0 },
      ],
      isDefault: true,
    });
    fixturesToClean.push({ col: 'gradescales', id: gradeScale._id });

    const student1 = await Student.create({
      tenantId,
      admissionNumber: 'ADM-G10-001',
      rollNumber: '101',
      fullName: 'Tariq Mehmood',
      gender: 'male',
      dateOfBirth: new Date('2010-05-15'),
      admissionDate: new Date(),
      sessionId: session._id,
      classId: cls._id,
      sectionId: sec._id,
      guardianName: 'Mehmood',
      isActive: true,
      isArchived: false,
    });
    fixturesToClean.push({ col: 'students', id: student1._id });

    const student2 = await Student.create({
      tenantId,
      admissionNumber: 'ADM-G10-002',
      rollNumber: '102',
      fullName: 'Sara Khan',
      gender: 'female',
      dateOfBirth: new Date('2010-08-20'),
      admissionDate: new Date(),
      sessionId: session._id,
      classId: cls._id,
      sectionId: sec._id,
      guardianName: 'Khan',
      isActive: true,
      isArchived: false,
    });
    fixturesToClean.push({ col: 'students', id: student2._id });

    const exam = await Exam.create({
      tenantId,
      name: 'Midterm Examination 2026',
      sessionId: session._id,
      classId: cls._id,
      classIds: [cls._id],
      gradeScaleId: gradeScale._id,
      subjects: [
        { subjectId: subMath._id, maxMarks: 100, passMarks: 40 },
        { subjectId: subEng._id, maxMarks: 100, passMarks: 40 },
      ],
      status: 'Scheduled',
      isPublished: false,
    });
    fixturesToClean.push({ col: 'exams', id: exam._id });

    // ExamSchedules matching Exam.subjects (Correction 3)
    const schedMath = await ExamSchedule.create({
      tenantId,
      examId: exam._id,
      sessionId: session._id,
      classId: cls._id,
      subjectId: subMath._id,
      examDate: new Date('2026-10-10'),
      startTime: '09:00',
      endTime: '12:00',
      totalMarks: 100,
      passingMarks: 40,
    });
    fixturesToClean.push({ col: 'examschedules', id: schedMath._id });

    const schedEng = await ExamSchedule.create({
      tenantId,
      examId: exam._id,
      sessionId: session._id,
      classId: cls._id,
      subjectId: subEng._id,
      examDate: new Date('2026-10-11'),
      startTime: '09:00',
      endTime: '12:00',
      totalMarks: 100,
      passingMarks: 40,
    });
    fixturesToClean.push({ col: 'examschedules', id: schedEng._id });
    assert(Boolean(exam._id && schedMath._id && schedEng._id), 'Academic environment and schedules created');

    // ──────────────────────────────────────────────────────────
    // 3. EXAM & SCHEDULE CONFIGURATION RECONCILIATION (CORRECTION 3)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 3. Configuration Reconciliation (Correction 3) ---');
    // Inconsistent schedule mismatch test
    schedEng.totalMarks = 90; // mismatch vs exam.subjects (100)
    await schedEng.save();

    let configMismatchThrew = false;
    try {
      await computeCanonicalResults(mongoose.connection, exam, { isPublicationPreflight: true });
    } catch (err: any) {
      configMismatchThrew = err.code === 'EXAM_CONFIGURATION_MISMATCH';
    }
    assert(configMismatchThrew, 'Rejects publication with EXAM_CONFIGURATION_MISMATCH when schedule totalMarks differs from exam maxMarks');

    // Restore consistent schedule
    schedEng.totalMarks = 100;
    await schedEng.save();

    // ──────────────────────────────────────────────────────────
    // 4. PUBLICATION COMPLETENESS GATE (STEP 4C.6)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 4. Publication Completeness Gate (Step 4C.6) ---');
    // Preflight fails when no marks entered
    let missingMarksThrew = false;
    try {
      await computeCanonicalResults(mongoose.connection, exam, { isPublicationPreflight: true });
    } catch (err: any) {
      missingMarksThrew = err.code === 'MARK_NOT_ENTERED';
    }
    assert(missingMarksThrew, 'Rejects publication with MARK_NOT_ENTERED when marks are missing');

    // ──────────────────────────────────────────────────────────
    // 5. ATTENDANCE & MARK CONFLICTS (CORRECTION 4)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 5. Attendance & Mark Conflict Defense (Correction 4) ---');
    // Mark student1 present with positive score
    const m1Math = await Mark.create({
      tenantId,
      examId: exam._id,
      sessionId: session._id,
      studentId: student1._id,
      subjectId: subMath._id,
      marksObtained: 85,
      isAbsent: false,
    });
    fixturesToClean.push({ col: 'marks', id: m1Math._id });

    // But ExamAttendance says student1 was absent
    const attConflict = await ExamAttendance.create({
      tenantId,
      examId: exam._id,
      examScheduleId: schedMath._id,
      studentId: student1._id,
      status: 'absent',
    });
    fixturesToClean.push({ col: 'examattendances', id: attConflict._id });

    let conflictThrew = false;
    try {
      await computeCanonicalResults(mongoose.connection, exam, { isPublicationPreflight: true });
    } catch (err: any) {
      conflictThrew = err.code === 'MARK_ATTENDANCE_CONFLICT';
    }
    assert(conflictThrew, 'Fails closed: Rejects publication with MARK_ATTENDANCE_CONFLICT when attendance contradicts marks');

    // Fix attendance to present
    attConflict.status = 'present';
    await attConflict.save();

    // ──────────────────────────────────────────────────────────
    // 6. POPULATE COMPLETE VALID MARKS
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 6. Complete Marks Population ---');
    // Student 1: Math 85, Eng 75 (Total 160/200, 80% -> Grade A)
    const m1Eng = await Mark.create({
      tenantId,
      examId: exam._id,
      sessionId: session._id,
      studentId: student1._id,
      subjectId: subEng._id,
      marksObtained: 75,
      isAbsent: false,
    });
    fixturesToClean.push({ col: 'marks', id: m1Eng._id });

    // Student 2: Math 0 (valid zero, not absent), Eng absent (explicit)
    const m2Math = await Mark.create({
      tenantId,
      examId: exam._id,
      sessionId: session._id,
      studentId: student2._id,
      subjectId: subMath._id,
      marksObtained: 0,
      isAbsent: false,
    });
    fixturesToClean.push({ col: 'marks', id: m2Math._id });

    const m2Eng = await Mark.create({
      tenantId,
      examId: exam._id,
      sessionId: session._id,
      studentId: student2._id,
      subjectId: subEng._id,
      marksObtained: 0,
      isAbsent: true,
    });
    fixturesToClean.push({ col: 'marks', id: m2Eng._id });

    const att2Eng = await ExamAttendance.create({
      tenantId,
      examId: exam._id,
      examScheduleId: schedEng._id,
      studentId: student2._id,
      status: 'absent',
    });
    fixturesToClean.push({ col: 'examattendances', id: att2Eng._id });

    const { results } = await computeCanonicalResults(mongoose.connection, exam, { isPublicationPreflight: true });
    assert(results.length === 2, 'Canonical calculation calculates results for both students');
    assert(results[0].studentId === String(student1._id) && results[0].percentage === 80 && results[0].overallGrade === 'A', 'Student 1 calculation accurate (80%, Grade A, passed)');
    const r2 = results.find((r) => r.studentId === String(student2._id))!;
    assert(r2.percentage === 0 && r2.passed === false && r2.rows[0].marksObtained === 0 && r2.rows[0].attendanceStatus === 'present', 'Student 2 valid zero marks distinguished from absent status');
    assert(r2.rows[1].attendanceStatus === 'absent' && r2.rows[1].isAbsent === true, 'Student 2 subject 2 accurately marked absent');

    // ──────────────────────────────────────────────────────────
    // 7. INITIAL COHORT PUBLICATION (STEP 4C.8 & CORRECTION 8)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 7. Initial Publication (Version 1) ---');
    const pubRes = await ResultPublicationService.publishExamResults(mongoose.connection, String(exam._id), userId, tenantId);
    assert(pubRes.publishedCount === 2 && pubRes.version === 1, 'Initial publication published 2 students as Version 1');

    const updatedExam = await Exam.findById(exam._id);
    assert(updatedExam?.isPublished === true && updatedExam?.status === 'Published', 'Exam marked isPublished=true and status=Published');

    // Verify persisted snapshot does NOT contain rank or mutable fields (Correction 1, 7)
    const rawSnapshot1 = await Result.findOne({ tenantId, examId: exam._id, studentId: student1._id, version: 1 }).lean();
    assert(Boolean(rawSnapshot1), 'Version 1 snapshot persisted in results collection');
    assert((rawSnapshot1 as any).isLatest === undefined, 'No isLatest field persisted (Correction 1)');
    assert((rawSnapshot1 as any).rank === undefined, 'No rank field persisted in snapshot (Correction 7)');
    assert((rawSnapshot1 as any).studentSnapshot.fullName === 'Tariq Mehmood', 'Student identity snapshotted');
    assert((rawSnapshot1 as any).examSnapshot.gradeScaleName === 'Standard 10-Point Scale', 'Grade scale snapshotted');

    // ──────────────────────────────────────────────────────────
    // 8. RESULT IMMUTABILITY DEFENSE (CORRECTION 1 & STEP 4C.4)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 8. Immutability Defense ---');
    // Test direct save mutation rejection
    const docToMutate = await Result.findOne({ tenantId, examId: exam._id, studentId: student1._id, version: 1 });
    docToMutate!.totalObtained = 999;
    let saveRejected = false;
    try {
      await docToMutate!.save();
    } catch (err: any) {
      saveRejected = err.code === 'RESULT_IMMUTABLE' || err.message.includes('immutable');
    }
    assert(saveRejected, 'save() on existing Result snapshot rejected with RESULT_IMMUTABLE');

    // Test updateOne rejection
    let updateOneRejected = false;
    try {
      await Result.updateOne({ _id: rawSnapshot1!._id }, { $set: { totalObtained: 999 } });
    } catch (err: any) {
      updateOneRejected = err.code === 'RESULT_IMMUTABLE' || err.message.includes('immutable');
    }
    assert(updateOneRejected, 'updateOne on Result collection rejected by pre-hook');

    // Test deleteOne rejection
    let deleteRejected = false;
    try {
      await Result.deleteOne({ _id: rawSnapshot1!._id });
    } catch (err: any) {
      deleteRejected = err.code === 'RESULT_IMMUTABLE' || err.message.includes('immutable');
    }
    assert(deleteRejected, 'deleteOne on Result collection rejected by pre-hook');

    // ──────────────────────────────────────────────────────────
    // 9. SOURCE CHECKSUM & RE-PUBLICATION (STEP 4C.9)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 9. Checksum & Re-Publication Flow ---');
    // Attempt re-publishing when source is unchanged
    let unchangedRejected = false;
    try {
      await ResultPublicationService.republishStudentResult(mongoose.connection, String(exam._id), String(student1._id), userId, tenantId);
    } catch (err: any) {
      unchangedRejected = err.code === 'SOURCE_UNCHANGED';
    }
    assert(unchangedRejected, 'Re-publication rejected with SOURCE_UNCHANGED when marks have not changed');

    // Correct student 1 English mark: 75 -> 95 (total becomes 180/200 = 90% -> Grade A+)
    m1Eng.marksObtained = 95;
    await m1Eng.save();

    const repubRes = await ResultPublicationService.republishStudentResult(
      mongoose.connection,
      String(exam._id),
      String(student1._id),
      userId,
      tenantId
    );
    assert(repubRes.version === 2, 'Re-publication creates Version 2 snapshot');

    // Verify Version 1 remains completely untouched in MongoDB
    const v1After = await db.collection('results').findOne({ tenantId, examId: exam._id, studentId: student1._id, version: 1 });
    assert(v1After?.totalObtained === 160 && v1After?.version === 1, 'Version 1 document in MongoDB remains completely unchanged (160 marks)');

    // Verify Version 2 contains corrected data
    const v2After = await db.collection('results').findOne({ tenantId, examId: exam._id, studentId: student1._id, version: 2 });
    assert(v2After?.totalObtained === 180 && v2After?.version === 2 && v2After?.overallGrade === 'A+', 'Version 2 document contains updated data (180 marks, Grade A+)');

    // Latest query returns Version 2
    const latestQuery = await Result.findOne({ tenantId, examId: exam._id, studentId: student1._id })
      .sort({ version: -1 })
      .lean();
    assert(latestQuery?.version === 2, 'Latest query (sort: { version: -1 }) returns Version 2');

    // ──────────────────────────────────────────────────────────
    // 10. HISTORICAL SAFETY (GRADESCALE & STUDENT RENAME)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 10. Historical Safety & Snapshot Resilience ---');
    // Mutate GradeScale boundary: change A threshold from 80% to 95%
    gradeScale.boundaries[1].minPercentage = 95;
    await gradeScale.save();

    // Re-verify Version 1 snapshot still has original grade A and original boundaries
    const v1Check = await Result.findOne({ tenantId, examId: exam._id, studentId: student1._id, version: 1 }).lean();
    assert(v1Check?.overallGrade === 'A', 'Version 1 grade remains A even after live GradeScale boundary was changed');
    assert(v1Check?.examSnapshot.gradeScaleBoundaries[1].minPercentage === 80, 'Version 1 snapshot preserves original 80% boundary');

    // Mutate Student name and class
    student1.fullName = 'Tariq Renamed Al-Mehmood';
    student1.classId = new mongoose.Types.ObjectId();
    await student1.save();

    const v1StudentCheck = await Result.findOne({ tenantId, examId: exam._id, studentId: student1._id, version: 1 }).lean();
    assert(v1StudentCheck?.studentSnapshot.fullName === 'Tariq Mehmood', 'Version 1 preserves historical student name "Tariq Mehmood"');
    assert(v1StudentCheck?.studentSnapshot.className === 'Grade 10', 'Version 1 preserves historical class "Grade 10"');

    // ──────────────────────────────────────────────────────────
    // 11. EXPORT REGISTRY TRANSITION (STEP 4C.17)
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 11. Export Registry Transition ---');
    const resultExportPolicy = TENANT_EXPORT_REGISTRY.find((p: any) => p.collection === 'results');
    assert(
      Boolean(resultExportPolicy && resultExportPolicy.includeInSchoolData && resultExportPolicy.includeInInternalRecovery),
      'results collection is registered in TENANT_EXPORT_REGISTRY under TENANT_BUSINESS_DATA'
    );

    // ──────────────────────────────────────────────────────────
    // 12. BASELINE DATA INTEGRITY
    // ──────────────────────────────────────────────────────────
    console.log('\n--- 12. Baseline Data Integrity ---');
    const studentCount = await db.collection('students').countDocuments();
    // 40 baseline students + 2 test students created
    assert(studentCount === 42, `Baseline student data intact (expected 40 baseline + 2 test students)`);

  } finally {
    // Guaranteed cleanup of temporary fixtures
    for (const f of fixturesToClean) {
      await db.collection(f.col).deleteOne({ _id: f.id });
    }
    // Clean up created test results
    await db.collection('results').deleteMany({ tenantId });
    console.log('\nTemporary test fixtures cleaned up successfully.');
  }

  console.log('\n======================================================');
  console.log(`TEST MATRIX SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  await mongoose.disconnect();
  if (failed > 0) process.exit(1);
}

runPhase4cMatrix().catch((err) => {
  console.error('Test matrix execution error:', err);
  process.exit(1);
});
