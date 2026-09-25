import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { Tenant } from '../models/Tenant';
import { AcademicSession } from '../models/AcademicSession';
import { Class, normalizeName } from '../models/Class';
import { Section, normalizeSectionName } from '../models/Section';
import { Subject, normalizeSubjectCode } from '../models/Subject';
import { Student } from '../models/Student';
import { StudentHistory } from '../models/StudentHistory';
import { StudentAttendance } from '../models/StudentAttendance';
import { Exam } from '../models/Exam';
import { ExamSchedule } from '../models/ExamSchedule';
import { Mark } from '../models/Mark';
import { Result } from '../models/Result';
import { FeeStructure } from '../models/FeeStructure';
import { StudentFee } from '../models/StudentFee';
import { Timetable } from '../models/Timetable';

async function investigate() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB for Read-Only Duplicate Investigation\n');

  // 1-5. Check if migration mutated anything
  const classesWithNormName = await Class.countDocuments({ normalizedName: { $exists: true } });
  const sectionsWithNormName = await Section.countDocuments({ normalizedName: { $exists: true } });
  
  const classIndexes = await Class.collection.indexes();
  const sectionIndexes = await Section.collection.indexes();
  const subjectIndexes = await Subject.collection.indexes();

  const classUniqueIndexExists = classIndexes.some(i => i.name === 'idx_class_tenant_session_normname_unique');
  const sectionUniqueIndexExists = sectionIndexes.some(i => i.name === 'idx_section_tenant_class_normname_unique');
  const subjectUniqueIndexExists = subjectIndexes.some(i => i.name === 'idx_subject_tenant_session_code_unique');

  // 12. Missing / null / invalid isArchived counts
  const missingClassArchived = await Class.countDocuments({ isArchived: { $exists: false } });
  const missingSectionArchived = await Section.countDocuments({ isArchived: { $exists: false } });
  const missingSubjectArchived = await Subject.countDocuments({ isArchived: { $exists: false } });

  // 10 & 11: Section and Subject preflights
  const activeSections = await Section.find({ $or: [{ isArchived: false }, { isArchived: { $exists: false } }] }).select('_id tenantId classId name').lean();
  const secMap = new Map<string, any[]>();
  for (const s of activeSections) {
    const key = `${String(s.tenantId)}_${String(s.classId)}_${normalizeSectionName(s.name)}`;
    const list = secMap.get(key) || [];
    list.push(s);
    secMap.set(key, list);
  }
  const sectionConflicts = Array.from(secMap.entries()).filter(([_, docs]) => docs.length > 1);

  const activeSubjects = await Subject.find({ $or: [{ isArchived: false }, { isArchived: { $exists: false } }] }).select('_id tenantId sessionId code').lean();
  const subMap = new Map<string, any[]>();
  for (const sb of activeSubjects) {
    const key = `${String(sb.tenantId)}_${String(sb.sessionId)}_${normalizeSubjectCode(sb.code)}`;
    const list = subMap.get(key) || [];
    list.push(sb);
    subMap.set(key, list);
  }
  const subjectConflicts = Array.from(subMap.entries()).filter(([_, docs]) => docs.length > 1);

  // 6 & 7: Duplicate Class Groups & Dependencies
  const activeClasses = await Class.find({ $or: [{ isArchived: false }, { isArchived: { $exists: false } }] }).lean();
  const clsMap = new Map<string, any[]>();
  for (const c of activeClasses) {
    const key = `${String(c.tenantId)}_${String(c.sessionId)}_${normalizeName(c.name)}`;
    const list = clsMap.get(key) || [];
    list.push(c);
    clsMap.set(key, list);
  }
  const duplicateGroups = Array.from(clsMap.entries()).filter(([_, docs]) => docs.length > 1);

  const detailedGroups = [];

  for (const [key, classDocs] of duplicateGroups) {
    const tenantId = classDocs[0].tenantId;
    const sessionId = classDocs[0].sessionId;

    const tenant = await Tenant.findById(tenantId).lean();
    const session = await AcademicSession.findById(sessionId).lean();

    const classesWithDependencies = [];
    for (const c of classDocs) {
      const cId = c._id;
      const [
        currentStudents,
        historyClassId,
        historyPrevClassId,
        attendanceCount,
        sectionsCount,
        subjectsCount,
        examCount,
        examScheduleCount,
        markCount,
        resultCount,
        feeStructureCount,
        studentFeeCount,
        timetableCount,
      ] = await Promise.all([
        Student.countDocuments({ classId: cId }),
        StudentHistory.countDocuments({ classId: cId }),
        StudentHistory.countDocuments({ previousClassId: cId }),
        StudentAttendance.countDocuments({ classId: cId }),
        Section.countDocuments({ classId: cId }),
        Subject.countDocuments({ classIds: cId }),
        Exam.countDocuments({ $or: [{ classId: cId }, { classIds: cId }] }),
        ExamSchedule.countDocuments({ classId: cId }),
        Mark.countDocuments({ classId: cId }),
        Result.countDocuments({ classId: cId }),
        FeeStructure.countDocuments({ classId: cId }),
        StudentFee.countDocuments({ classId: cId }),
        Timetable.countDocuments({ classId: cId }),
      ]);

      classesWithDependencies.push({
        _id: String(c._id),
        name: c.name,
        code: c.code,
        isActive: c.isActive,
        isArchived: c.isArchived,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        dependencies: {
          currentStudents,
          historyClassId,
          historyPrevClassId,
          attendanceCount,
          sectionsCount,
          subjectsCount,
          examCount,
          examScheduleCount,
          markCount,
          resultCount,
          feeStructureCount,
          studentFeeCount,
          timetableCount,
        },
        hasAnyDependencies:
          currentStudents > 0 ||
          historyClassId > 0 ||
          historyPrevClassId > 0 ||
          attendanceCount > 0 ||
          sectionsCount > 0 ||
          subjectsCount > 0 ||
          examCount > 0 ||
          examScheduleCount > 0 ||
          markCount > 0 ||
          resultCount > 0 ||
          feeStructureCount > 0 ||
          studentFeeCount > 0 ||
          timetableCount > 0,
      });
    }

    // Determine category
    let category = 'REAL_OR_UNCERTAIN_USER_DATA';
    if (tenant?.slug?.startsWith('test-') || tenant?.name?.toLowerCase().includes('test') || tenant?.name?.toLowerCase().includes('audit')) {
      category = 'ISOLATED_TEST_FIXTURE';
    } else if (tenant?.slug === 'demo' || tenant?.name?.toLowerCase().includes('demo') || tenant?.isDemo) {
      category = 'DEMO_TENANT_DATA';
    }

    detailedGroups.push({
      key,
      canonicalName: normalizeName(classDocs[0].name),
      tenant: {
        _id: String(tenantId),
        name: tenant?.name || 'Unknown',
        slug: tenant?.slug || 'Unknown',
        status: tenant?.status,
        createdAt: tenant?.createdAt,
      },
      session: {
        _id: String(sessionId),
        name: session?.name || 'Unknown',
        startDate: session?.startDate,
        endDate: session?.endDate,
        isActive: session?.isActive,
      },
      category,
      classes: classesWithDependencies,
    });
  }

  const report = {
    mutationStatus: {
      migrationMutatedDataBeforeStopping: false,
      classesWithNormalizedName: classesWithNormName,
      sectionsWithNormalizedName: sectionsWithNormName,
      indexesCreated: {
        class: classUniqueIndexExists,
        section: sectionUniqueIndexExists,
        subject: subjectUniqueIndexExists,
      },
      missingArchivedFieldCounts: {
        classes: missingClassArchived,
        sections: missingSectionArchived,
        subjects: missingSubjectArchived,
      },
    },
    sectionsPreflight: {
      conflictCount: sectionConflicts.length,
      conflicts: sectionConflicts,
    },
    subjectsPreflight: {
      conflictCount: subjectConflicts.length,
      conflicts: subjectConflicts,
    },
    duplicateClassGroupsCount: detailedGroups.length,
    duplicateClassGroups: detailedGroups,
  };

  console.log(JSON.stringify(report, null, 2));

  await mongoose.disconnect();
}

investigate().catch(err => {
  console.error('Investigation error:', err);
  process.exit(1);
});
