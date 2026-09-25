import mongoose from 'mongoose';
import { MetricsCollector } from '../metrics';
import { SyntheticSchool } from '../fixtures';

export async function runResultScenario(
  client: mongoose.mongo.MongoClient,
  connection: mongoose.Connection,
  school: SyntheticSchool,
  cohortSizes: number[],
  metrics: MetricsCollector
): Promise<{
  publicationDurations: Record<number, number>;
  latestReadLatencyMs: number;
}> {
  const db = connection.db!;
  const publicationDurations: Record<number, number> = {};
  const tId = school.tenantId;

  for (const cohortSize of cohortSizes) {
    const examId = new mongoose.Types.ObjectId();
    const classId = school.classes[0]._id;

    const snapshots = Array.from({ length: cohortSize }).map((_, i) => {
      const stId = new mongoose.Types.ObjectId();
      return {
        tenantId: tId,
        examId: examId,
        studentId: stId,
        classId: classId,
        academicSessionId: school.sessionId,
        version: 1,
        sourceChecksum: `chk-${stId}-v1`,
        studentSnapshot: {
          fullName: `Cohort Student ${i + 1}`,
          admissionNumber: `ADM-COHORT-${cohortSize}-${i + 1}`,
        },
        examSnapshot: {
          examName: `Exam Cohort ${cohortSize}`,
        },
      subjectResults: [
        { subjectName: 'English', marksObtained: 85, maxMarks: 100, grade: 'A', isPassed: true },
        { subjectName: 'Mathematics', marksObtained: 90, maxMarks: 100, grade: 'A+', isPassed: true },
      ],
      totalMarksObtained: 175,
      totalMaxMarks: 200,
      percentage: 87.5,
      gpa: 4.0,
      overallGrade: 'A+',
      overallResult: 'pass',
      rank: 1,
      publishedAt: new Date(),
      publishedBy: school.adminUser._id,
      createdAt: new Date(),
    };
  });

    const session = client.startSession();
    const start = performance.now();
    try {
      await session.withTransaction(async () => {
        await db.collection('results').insertMany(snapshots, { session });
        await db.collection('exams').updateOne(
          { _id: examId, tenantId: tId },
          { $set: { name: `Exam Cohort ${cohortSize}`, isPublished: true, publishedAt: new Date() } },
          { session, upsert: true }
        );
      });

      const duration = performance.now() - start;
      publicationDurations[cohortSize] = Math.round(duration);

      metrics.record({
        scenario: `result_publish_cohort_${cohortSize}`,
        durationMs: duration,
        statusCode: 200,
        success: true,
        tenantId: String(tId),
      });
    } catch (e: any) {
      metrics.record({
        scenario: `result_publish_cohort_${cohortSize}`,
        durationMs: performance.now() - start,
        statusCode: 500,
        success: false,
        tenantId: String(tId),
        error: e.message,
      });
    } finally {
      await session.endSession();
    }
  }

  // Test Read: Latest Report Card snapshot query
  const sampleStudent = school.students[0];
  const readStart = performance.now();
  let latestReadLatencyMs = 0;

  try {
    const res = await db.collection('results').findOne(
      { tenantId: tId, examId: school.exams[0]._id, studentId: sampleStudent._id },
      { sort: { version: -1 } }
    );
    latestReadLatencyMs = Math.round(performance.now() - readStart);

    metrics.record({
      scenario: 'result_read_latest_snapshot',
      durationMs: latestReadLatencyMs,
      statusCode: 200,
      success: Boolean(res),
      tenantId: String(tId),
    });
  } catch (e: any) {
    metrics.record({
      scenario: 'result_read_latest_snapshot',
      durationMs: performance.now() - readStart,
      statusCode: 500,
      success: false,
      tenantId: String(tId),
      error: e.message,
    });
  }

  return { publicationDurations, latestReadLatencyMs };
}
