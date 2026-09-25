import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { LoadTestSafety } from './safety';
import { createCanonicalSession } from '../../services/academicSession.service';

export interface SyntheticSchool {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  adminUser: { _id: mongoose.Types.ObjectId; email: string; token?: string };
  staffUsers: { _id: mongoose.Types.ObjectId; email: string }[];
  sessionId: mongoose.Types.ObjectId;
  classes: { _id: mongoose.Types.ObjectId; name: string; sectionId: mongoose.Types.ObjectId }[];
  students: { _id: mongoose.Types.ObjectId; admissionNumber: string; fullName: string; classId: mongoose.Types.ObjectId; sectionId: mongoose.Types.ObjectId }[];
  feeStructures: { _id: mongoose.Types.ObjectId; title: string; amount: number; classId: mongoose.Types.ObjectId }[];
  exams: { _id: mongoose.Types.ObjectId; name: string; classId: mongoose.Types.ObjectId }[];
}

export class LoadTestFixtures {
  /**
   * Clones all 255 baseline indexes from schemas onto the load-test database.
   */
  static async syncBaselineIndexes(connection: mongoose.Connection): Promise<number> {
    LoadTestSafety.assertSafeDatabase(connection);
    const db = connection.db!;
    const fs = await import('fs');
    const path = await import('path');

    const backupRootDir = path.join(process.cwd(), 'backups');
    const backupDirs = fs.readdirSync(backupRootDir).filter(d => d.startsWith('phase4f-loadtest-'));
    const latestDir = backupDirs.sort().reverse()[0];
    const indexFilePath = path.join(backupRootDir, latestDir, 'baseline-primary-indexes.json');

    if (!fs.existsSync(indexFilePath)) {
      throw new Error(`Cannot find baseline indexes file at: ${indexFilePath}`);
    }

    const backupData = JSON.parse(fs.readFileSync(indexFilePath, 'utf8'));
    const indexesByCol = backupData.indexesByCollection || {};

    let totalCreated = 0;
    for (const [colName, idxList] of Object.entries(indexesByCol)) {
      await db.createCollection(colName).catch(() => {});
      const coll = db.collection(colName);
      for (const idx of (idxList as any[])) {
        if (idx.name === '_id_') continue;
        try {
          const options: any = { name: idx.name };
          if (idx.unique) options.unique = true;
          if (idx.sparse) options.sparse = true;
          if (idx.partialFilterExpression) options.partialFilterExpression = idx.partialFilterExpression;
          if (idx.expireAfterSeconds !== null && idx.expireAfterSeconds !== undefined) {
            options.expireAfterSeconds = idx.expireAfterSeconds;
          }
          await coll.createIndex(idx.key, options);
        } catch (e: any) {
          // ignore if already exists
        }
      }
      try {
        const created = await coll.indexes();
        totalCreated += created.length;
      } catch (e) {
        // ignore
      }
    }
    return totalCreated;
  }

  /**
   * Seeds deterministic synthetic multi-tenant dataset.
   */
  static async seedDataset(
    connection: mongoose.Connection,
    schoolCount: number,
    studentsPerSchool: number,
    staffPerSchool: number
  ): Promise<SyntheticSchool[]> {
    LoadTestSafety.assertSafeDatabase(connection);
    const db = connection.db!;
    const passwordHash = await bcrypt.hash('LoadTest123!', 8);
    const schools: SyntheticSchool[] = [];

    for (let sIdx = 1; sIdx <= schoolCount; sIdx++) {
      const tenantId = new mongoose.Types.ObjectId();
      const slug = `loadtest-school-${sIdx}-${Date.now().toString().slice(-4)}`;
      const schoolName = `LoadTest School ${sIdx}`;

      // 1. Tenant
      await db.collection('tenants').insertOne({
        _id: tenantId,
        name: schoolName,
        slug,
        status: 'active',
        plan: 'pro',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2. AcademicSession (canonical creation)
      const sessionDoc = await createCanonicalSession({
        tenantId,
        name: '2026-2027',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2027-06-30'),
        makeActive: true,
        tenantDb: connection
      });
      const sessionId = sessionDoc._id;

      // 3. Classes & Sections
      const classCount = Math.max(2, Math.floor(studentsPerSchool / 30));
      const classesList: { _id: mongoose.Types.ObjectId; name: string; sectionId: mongoose.Types.ObjectId }[] = [];

      for (let cIdx = 1; cIdx <= classCount; cIdx++) {
        const classId = new mongoose.Types.ObjectId();
        const sectionId = new mongoose.Types.ObjectId();

        await db.collection('classes').insertOne({
          _id: classId,
          tenantId,
          name: `Class ${cIdx}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await db.collection('sections').insertOne({
          _id: sectionId,
          tenantId,
          classId,
          name: 'Section A',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        classesList.push({ _id: classId, name: `Class ${cIdx}`, sectionId });
      }

      // 4. Admin User
      const adminUserId = new mongoose.Types.ObjectId();
      const adminEmail = `admin-${sIdx}@loadtest.local`;
      await db.collection('users').insertOne({
        _id: adminUserId,
        tenantId,
        name: `Admin ${sIdx}`,
        email: adminEmail,
        password: passwordHash,
        role: 'admin',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 5. Staff Users
      const staffUsers: { _id: mongoose.Types.ObjectId; email: string }[] = [];
      const staffDocs: any[] = [];
      for (let stIdx = 1; stIdx <= staffPerSchool; stIdx++) {
        const staffUserId = new mongoose.Types.ObjectId();
        const staffEmail = `staff-${sIdx}-${stIdx}@loadtest.local`;
        staffUsers.push({ _id: staffUserId, email: staffEmail });

        staffDocs.push({
          tenantId,
          userId: staffUserId,
          employeeId: `EMP-${sIdx}-${String(stIdx).padStart(3, '0')}`,
          firstName: `StaffFirst${stIdx}`,
          lastName: `StaffLast${stIdx}`,
          fullName: `StaffFirst${stIdx} StaffLast${stIdx}`,
          staffType: 'teaching',
          isActive: true,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      if (staffDocs.length > 0) {
        await db.collection('staff').insertMany(staffDocs);
      }

      // 6. Students
      const studentDocs: any[] = [];
      const studentsList: any[] = [];

      for (let stIdx = 1; stIdx <= studentsPerSchool; stIdx++) {
        const studentId = new mongoose.Types.ObjectId();
        const assignedClass = classesList[(stIdx - 1) % classesList.length];
        const admNum = `ADM-${sIdx}-${String(stIdx).padStart(4, '0')}`;
        const rollNum = String((stIdx % 40) + 1);

        studentDocs.push({
          _id: studentId,
          tenantId,
          sessionId,
          classId: assignedClass._id,
          sectionId: assignedClass.sectionId,
          admissionNumber: admNum,
          rollNumber: rollNum,
          fullName: `Student ${sIdx}-${stIdx}`,
          gender: stIdx % 2 === 0 ? 'male' : 'female',
          dateOfBirth: new Date('2014-05-15'),
          guardianName: `Guardian ${sIdx}-${stIdx}`,
          isActive: true,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        studentsList.push({
          _id: studentId,
          admissionNumber: admNum,
          fullName: `Student ${sIdx}-${stIdx}`,
          classId: assignedClass._id,
          sectionId: assignedClass.sectionId,
        });
      }

      if (studentDocs.length > 0) {
        await db.collection('students').insertMany(studentDocs);
      }

      // 7. Fee Structures
      const feeStructures: { _id: mongoose.Types.ObjectId; title: string; amount: number; classId: mongoose.Types.ObjectId }[] = [];
      const feeStructDocs: any[] = [];

      for (const cls of classesList) {
        const fsId = new mongoose.Types.ObjectId();
        feeStructDocs.push({
          _id: fsId,
          tenantId,
          academicSessionId: sessionId,
          classId: cls._id,
          feeType: 'tuition',
          title: `Monthly Tuition - ${cls.name}`,
          amount: 500000, // 5000.00 in integer paisa
          dueDate: new Date('2026-10-10'),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        feeStructures.push({ _id: fsId, title: `Monthly Tuition - ${cls.name}`, amount: 500000, classId: cls._id });
      }
      if (feeStructDocs.length > 0) {
        await db.collection('feestructures').insertMany(feeStructDocs);
      }

      // 8. Exams
      const exams: { _id: mongoose.Types.ObjectId; name: string; classId: mongoose.Types.ObjectId }[] = [];
      const examDocs: any[] = [];

      for (const cls of classesList) {
        const examId = new mongoose.Types.ObjectId();
        examDocs.push({
          _id: examId,
          tenantId,
          academicSessionId: sessionId,
          classId: cls._id,
          name: `Midterm Exam - ${cls.name}`,
          examDate: new Date('2026-11-15'),
          isPublished: false,
          subjects: [
            { subjectId: new mongoose.Types.ObjectId(), maxMarks: 100, passMarks: 40 },
            { subjectId: new mongoose.Types.ObjectId(), maxMarks: 100, passMarks: 40 },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        exams.push({ _id: examId, name: `Midterm Exam - ${cls.name}`, classId: cls._id });
      }
      if (examDocs.length > 0) {
        await db.collection('exams').insertMany(examDocs);
      }

      schools.push({
        tenantId,
        name: schoolName,
        slug,
        adminUser: { _id: adminUserId, email: adminEmail },
        staffUsers,
        sessionId,
        classes: classesList,
        students: studentsList,
        feeStructures,
        exams,
      });
    }

    return schools;
  }
}
