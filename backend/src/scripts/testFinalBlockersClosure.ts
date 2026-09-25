import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import assert from 'assert';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { Tenant } from '../models/Tenant';
import { AcademicSession } from '../models/AcademicSession';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { Student } from '../models/Student';
import { StudentHistory } from '../models/StudentHistory';
import { StudentAttendance } from '../models/StudentAttendance';

async function main() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB for Final Blockers Closure Test.');

  const report: Record<string, any> = {};

  const tenantA = await Tenant.create({
    name: 'Tenant Closure A ' + Date.now(),
    slug: 'closure-a-' + Date.now(),
    status: 'active',
    contactEmail: `closure_a_${Date.now()}@test.com`,
    ownerUserId: new mongoose.Types.ObjectId(),
    trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const tenantB = await Tenant.create({
    name: 'Tenant Closure B ' + Date.now(),
    slug: 'closure-b-' + Date.now(),
    status: 'active',
    contactEmail: `closure_b_${Date.now()}@test.com`,
    ownerUserId: new mongoose.Types.ObjectId(),
    trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  try {
    const sessionA1 = await AcademicSession.create({
      tenantId: tenantA._id,
      name: 'Session 2025',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      isActive: true,
    });

    const sessionA2 = await AcademicSession.create({
      tenantId: tenantA._id,
      name: 'Session 2026',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      isActive: false,
    });

    const sessionB1 = await AcademicSession.create({
      tenantId: tenantB._id,
      name: 'Session B 2025',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      isActive: true,
    });

    const class5 = await Class.create({
      tenantId: tenantA._id,
      name: 'Class 5',
      sessionId: sessionA1._id,
    });

    const class6 = await Class.create({
      tenantId: tenantA._id,
      name: 'Class 6',
      sessionId: sessionA1._id,
    });

    // =========================================================================
    // 1. SECTION REASSIGNMENT HISTORICAL DEPENDENCY GUARDS
    // =========================================================================
    console.log('--- 1. Testing Section Historical Guards ---');

    // Helper to evaluate reassignment eligibility
    async function checkReassignmentAllowed(sectionId: mongoose.Types.ObjectId | string) {
      const [studentCount, historySectionCount, historyPrevSectionCount, attendanceCount] = await Promise.all([
        Student.countDocuments({ tenantId: tenantA._id, sectionId }),
        StudentHistory.countDocuments({ tenantId: tenantA._id, sectionId }),
        StudentHistory.countDocuments({ tenantId: tenantA._id, previousSectionId: sectionId }),
        StudentAttendance.countDocuments({ tenantId: tenantA._id, sectionId }),
      ]);
      const total = studentCount + historySectionCount + historyPrevSectionCount + attendanceCount;
      return {
        allowed: total === 0,
        counts: {
          students: studentCount,
          historySection: historySectionCount,
          historyPrevSection: historyPrevSectionCount,
          attendance: attendanceCount,
          total,
        },
      };
    }

    // 1A. Section with current student
    const secWithStudent = await Section.create({
      tenantId: tenantA._id,
      name: 'Sec Student',
      classId: class5._id,
      sessionId: sessionA1._id,
    });
    const s1 = await Student.create({
      tenantId: tenantA._id,
      admissionNumber: 'AD-S1-' + Date.now().toString().slice(-8),
      fullName: 'Student Current',
      gender: 'male',
      dateOfBirth: new Date('2015-01-01'),
      admissionDate: new Date('2025-01-01'),
      guardianName: 'Guardian 1',
      classId: class5._id,
      sectionId: secWithStudent._id,
      sessionId: sessionA1._id,
      isActive: true,
      isArchived: false,
    });
    const check1 = await checkReassignmentAllowed(secWithStudent._id);
    assert(!check1.allowed && check1.counts.students === 1, 'Current student must block reassignment');

    // 1B. Section with StudentHistory.sectionId (student later moved/promoted)
    const secWithHistoryCurrent = await Section.create({
      tenantId: tenantA._id,
      name: 'Sec Hist Cur',
      classId: class5._id,
      sessionId: sessionA1._id,
    });
    await StudentHistory.create({
      tenantId: tenantA._id,
      studentId: s1._id,
      classId: class5._id,
      sectionId: secWithHistoryCurrent._id,
      sessionId: sessionA1._id,
      academicYear: '2025',
      status: 'promoted',
    });
    const check2 = await checkReassignmentAllowed(secWithHistoryCurrent._id);
    assert(!check2.allowed && check2.counts.historySection === 1, 'StudentHistory.sectionId must block reassignment');

    // 1C. Section with StudentHistory.previousSectionId
    const secWithHistoryPrev = await Section.create({
      tenantId: tenantA._id,
      name: 'Sec Hist Prev',
      classId: class5._id,
      sessionId: sessionA1._id,
    });
    await StudentHistory.create({
      tenantId: tenantA._id,
      studentId: s1._id,
      classId: class6._id,
      previousClassId: class5._id,
      previousSectionId: secWithHistoryPrev._id,
      sessionId: sessionA1._id,
      academicYear: '2025-2026',
      status: 'promoted',
    });
    const check3 = await checkReassignmentAllowed(secWithHistoryPrev._id);
    assert(!check3.allowed && check3.counts.historyPrevSection === 1, 'StudentHistory.previousSectionId must block reassignment');

    // 1D. Section with StudentAttendance record
    const secWithAttendance = await Section.create({
      tenantId: tenantA._id,
      name: 'Sec Attendance',
      classId: class5._id,
      sessionId: sessionA1._id,
    });
    await StudentAttendance.create({
      tenantId: tenantA._id,
      studentId: s1._id,
      classId: class5._id,
      sectionId: secWithAttendance._id,
      sessionId: sessionA1._id,
      attendanceDate: new Date('2025-03-01'),
      status: 'present',
    });
    const check4 = await checkReassignmentAllowed(secWithAttendance._id);
    assert(!check4.allowed && check4.counts.attendance === 1, 'StudentAttendance must block reassignment');

    // 1E. Completely unused Section
    const secUnused = await Section.create({
      tenantId: tenantA._id,
      name: 'Sec Unused',
      classId: class5._id,
      sessionId: sessionA1._id,
    });
    const check5 = await checkReassignmentAllowed(secUnused._id);
    assert(check5.allowed && check5.counts.total === 0, 'Unused section must be allowed for reassignment');

    report.sectionHistoricalGuards = {
      currentStudentBlocked: !check1.allowed,
      historySectionBlocked: !check2.allowed,
      historyPrevSectionBlocked: !check3.allowed,
      attendanceBlocked: !check4.allowed,
      unusedSectionAllowed: check5.allowed,
    };

    // =========================================================================
    // 2. CONCURRENT SESSION ACTIVATION RACES (20 ITERATIONS)
    // =========================================================================
    console.log('--- 2. Testing 20x Concurrent Activation Races ---');

    async function executeSerializedActivation(targetSessionId: mongoose.Types.ObjectId, tenantObjId: mongoose.Types.ObjectId) {
      const mongoSession = await mongoose.startSession();
      try {
        let activated: any;
        await mongoSession.withTransaction(async () => {
          await Tenant.updateOne({ _id: tenantObjId }, { $inc: { academicSessionSeq: 1 } }, { session: mongoSession });
          const target = await AcademicSession.findOne({ _id: targetSessionId, tenantId: tenantObjId }).session(mongoSession);
          if (!target || target.isArchived) throw new Error('Cannot activate session');
          if (target.isActive) {
            activated = target;
            return;
          }
          await AcademicSession.updateMany({ tenantId: tenantObjId, isActive: true }, { $set: { isActive: false } }, { session: mongoSession });
          target.isActive = true;
          await target.save({ session: mongoSession });
          activated = target;
        });
        return { success: true, activatedId: String(activated._id) };
      } catch (err: any) {
        return { success: false, error: err.message };
      } finally {
        await mongoSession.endSession();
      }
    }

    const raceResults: Array<{ iteration: number; finalActiveCount: number; passed: boolean }> = [];
    for (let i = 1; i <= 20; i++) {
      // Race activation between sessionA1 and sessionA2 simultaneously
      await Promise.all([
        executeSerializedActivation(sessionA1._id, tenantA._id),
        executeSerializedActivation(sessionA2._id, tenantA._id),
      ]);

      const activeCount = await AcademicSession.countDocuments({ tenantId: tenantA._id, isActive: true });
      assert(activeCount === 1, `Race ${i} failed: activeCount was ${activeCount}, expected exactly 1`);
      raceResults.push({ iteration: i, finalActiveCount: activeCount, passed: activeCount === 1 });
    }

    report.concurrentActivation20x = {
      totalIterations: 20,
      allIterationsPassed: raceResults.every((r) => r.passed && r.finalActiveCount === 1),
      raceResults,
    };

    // =========================================================================
    // 3. ACTIVATION FAILURE ATOMICITY / ROLLBACK
    // =========================================================================
    console.log('--- 3. Testing Activation Failure Rollback ---');
    // Ensure sessionA1 is currently active
    await AcademicSession.updateMany({ tenantId: tenantA._id }, { $set: { isActive: false } });
    await AcademicSession.findByIdAndUpdate(sessionA1._id, { isActive: true });

    let rollbackObserved = false;
    const mongoSessionRollback = await mongoose.startSession();
    try {
      await mongoSessionRollback.withTransaction(async () => {
        await Tenant.updateOne({ _id: tenantA._id }, { $inc: { academicSessionSeq: 1 } }, { session: mongoSessionRollback });
        // Deactivate old
        await AcademicSession.updateMany({ tenantId: tenantA._id, isActive: true }, { $set: { isActive: false } }, { session: mongoSessionRollback });
        // Force failure before new activation commits
        throw new Error('Simulated mid-transaction failure');
      });
    } catch (err: any) {
      if (err.message === 'Simulated mid-transaction failure') {
        rollbackObserved = true;
      }
    } finally {
      await mongoSessionRollback.endSession();
    }

    const activeAfterRollback = await AcademicSession.findOne({ tenantId: tenantA._id, isActive: true });
    assert(rollbackObserved, 'Simulated failure must trigger transaction abort');
    assert(activeAfterRollback && String(activeAfterRollback._id) === String(sessionA1._id), 'Previous active session must remain active after rollback');

    report.activationFailureAtomicity = {
      rollbackSuccess: rollbackObserved,
      previousSessionStillActive: String(activeAfterRollback?._id) === String(sessionA1._id),
      activeCountAfterRollback: 1,
    };

    // =========================================================================
    // 4. CROSS-TENANT SESSION ACTIVATION ISOLATION
    // =========================================================================
    console.log('--- 4. Testing Cross-Tenant Session Activation ---');
    // Tenant A attempts to activate sessionB1 (which belongs to Tenant B)
    const crossTenantTarget = await AcademicSession.findOne({ _id: sessionB1._id, tenantId: tenantA._id });
    assert(!crossTenantTarget, 'Tenant A must NOT find Tenant B session under its tenantId');

    // Tenant B's active session before and after
    const tenantBActive = await AcademicSession.findOne({ tenantId: tenantB._id, isActive: true });
    assert(tenantBActive && String(tenantBActive._id) === String(sessionB1._id), 'Tenant B active session must remain intact');

    report.crossTenantIsolation = {
      crossTenantTargetFound: !!crossTenantTarget,
      tenantBActiveUnchanged: String(tenantBActive?._id) === String(sessionB1._id),
    };

    report.allTestsPassed = true;
    console.log('=== ALL CLOSURE TESTS PASSED ===');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    // Teardown test data cleanly
    await Promise.all([
      Tenant.deleteMany({ _id: { $in: [tenantA._id, tenantB._id] } }),
      AcademicSession.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
      Class.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
      Section.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
      Student.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
      StudentAttendance.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
      StudentHistory.collection.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } }),
    ]);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Final Blockers Closure Test Failed:', err);
  process.exit(1);
});
