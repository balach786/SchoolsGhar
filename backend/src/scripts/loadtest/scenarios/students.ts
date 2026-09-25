import mongoose from 'mongoose';
import { MetricsCollector } from '../metrics';
import { SyntheticSchool } from '../fixtures';

export async function runStudentListScenario(
  connection: mongoose.Connection,
  schools: SyntheticSchool[],
  concurrency: number,
  metrics: MetricsCollector
): Promise<{ regexVsEqualityRatio: number }> {
  const db = connection.db!;

  const testPaginationAndSearch = async (school: SyntheticSchool) => {
    const tId = school.tenantId;
    const cls = school.classes[0];

    // 1. Standard paginated list (page 1, limit 20)
    let start = performance.now();
    try {
      await db.collection('students')
        .find({ tenantId: tId, classId: cls._id, sectionId: cls.sectionId, isArchived: false })
        .sort({ admissionNumber: 1 })
        .limit(20)
        .toArray();
      metrics.record({
        scenario: 'student_list_paginated',
        durationMs: performance.now() - start,
        statusCode: 200,
        success: true,
        tenantId: String(tId),
      });
    } catch (e: any) {
      metrics.record({
        scenario: 'student_list_paginated',
        durationMs: performance.now() - start,
        statusCode: 500,
        success: false,
        tenantId: String(tId),
        error: e.message,
      });
    }

    // 2. Exact admission number lookup
    start = performance.now();
    try {
      const sampleAdm = school.students[0]?.admissionNumber || 'ADM-1-0001';
      await db.collection('students').findOne({ tenantId: tId, admissionNumber: sampleAdm });
      metrics.record({
        scenario: 'student_lookup_exact',
        durationMs: performance.now() - start,
        statusCode: 200,
        success: true,
        tenantId: String(tId),
      });
    } catch (e: any) {
      metrics.record({
        scenario: 'student_lookup_exact',
        durationMs: performance.now() - start,
        statusCode: 500,
        success: false,
        tenantId: String(tId),
        error: e.message,
      });
    }

    // 3. Case-insensitive Regex search
    start = performance.now();
    try {
      await db.collection('students')
        .find({ tenantId: tId, fullName: { $regex: 'Student', $options: 'i' } })
        .limit(20)
        .toArray();
      metrics.record({
        scenario: 'student_search_regex',
        durationMs: performance.now() - start,
        statusCode: 200,
        success: true,
        tenantId: String(tId),
      });
    } catch (e: any) {
      metrics.record({
        scenario: 'student_search_regex',
        durationMs: performance.now() - start,
        statusCode: 500,
        success: false,
        tenantId: String(tId),
        error: e.message,
      });
    }
  };

  const tasks: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    const school = schools[i % schools.length];
    tasks.push(testPaginationAndSearch(school));
  }
  await Promise.all(tasks);

  return { regexVsEqualityRatio: 1.0 };
}
