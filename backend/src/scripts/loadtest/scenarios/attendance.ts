import mongoose from 'mongoose';
import { MetricsCollector } from '../metrics';
import { SyntheticSchool } from '../fixtures';

export async function runAttendanceScenario(
  connection: mongoose.Connection,
  schools: SyntheticSchool[],
  concurrency: number,
  metrics: MetricsCollector
): Promise<{ duplicateErrorsCaught: number }> {
  const db = connection.db!;
  let duplicateErrorsCaught = 0;

  const testAttendanceBatch = async (school: SyntheticSchool, batchDate: Date) => {
    const tId = school.tenantId;
    const cls = school.classes[0];
    const classStudents = school.students.filter(s => String(s.classId) === String(cls._id));
    const targetStudents = classStudents.slice(0, 40);

    const ops = targetStudents.map(st => ({
      updateOne: {
        filter: {
          tenantId: tId,
          studentId: st._id,
          sessionId: school.sessionId,
          attendanceDate: batchDate,
        },
        update: {
          $set: {
            tenantId: tId,
            studentId: st._id,
            sessionId: school.sessionId,
            classId: cls._id,
            sectionId: cls.sectionId,
            attendanceDate: batchDate,
            status: 'present',
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          }
        },
        upsert: true,
      }
    }));

    // 1. First write (upsert)
    let start = performance.now();
    try {
      await db.collection('studentattendances').bulkWrite(ops, { ordered: false });
      metrics.record({
        scenario: 'attendance_bulk_write_40',
        durationMs: performance.now() - start,
        statusCode: 200,
        success: true,
        tenantId: String(tId),
      });
    } catch (e: any) {
      metrics.record({
        scenario: 'attendance_bulk_write_40',
        durationMs: performance.now() - start,
        statusCode: 500,
        success: false,
        tenantId: String(tId),
        error: e.message,
      });
    }

    // 2. Class daily retrieval
    start = performance.now();
    try {
      const records = await db.collection('studentattendances').find({
        tenantId: tId,
        classId: cls._id,
        sectionId: cls.sectionId,
        attendanceDate: batchDate,
      }).toArray();

      metrics.record({
        scenario: 'attendance_class_daily_read',
        durationMs: performance.now() - start,
        statusCode: 200,
        success: records.length === targetStudents.length,
        tenantId: String(tId),
      });
    } catch (e: any) {
      metrics.record({
        scenario: 'attendance_class_daily_read',
        durationMs: performance.now() - start,
        statusCode: 500,
        success: false,
        tenantId: String(tId),
        error: e.message,
      });
    }

    // 3. Duplicate insert attempt (raw insertMany to test unique index constraint)
    const rawDuplicateDocs = targetStudents.slice(0, 5).map(st => ({
      tenantId: tId,
      studentId: st._id,
      sessionId: school.sessionId,
      classId: cls._id,
      sectionId: cls.sectionId,
      attendanceDate: batchDate,
      status: 'absent',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    try {
      await db.collection('studentattendances').insertMany(rawDuplicateDocs, { ordered: false });
    } catch (e: any) {
      if (e.code === 11000 || e.message.includes('E11000')) {
        duplicateErrorsCaught++;
      }
    }
  };

  const tasks: Promise<void>[] = [];
  const testDate = new Date('2026-09-10T00:00:00.000Z');

  for (let i = 0; i < concurrency; i++) {
    const school = schools[i % schools.length];
    tasks.push(testAttendanceBatch(school, testDate));
  }
  await Promise.all(tasks);

  return { duplicateErrorsCaught };
}
