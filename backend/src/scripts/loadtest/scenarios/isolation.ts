import mongoose from 'mongoose';
import { MetricsCollector } from '../metrics';
import { SyntheticSchool } from '../fixtures';

export async function runIsolationScenario(
  connection: mongoose.Connection,
  schools: SyntheticSchool[],
  iterations: number,
  metrics: MetricsCollector
): Promise<{ isolationChecksPassed: number; crossTenantViolations: number }> {
  const db = connection.db!;
  let isolationChecksPassed = 0;
  let crossTenantViolations = 0;

  for (let i = 0; i < iterations; i++) {
    const schoolA = schools[i % schools.length];
    const schoolB = schools[(i + 1) % schools.length];

    const start = performance.now();
    try {
      // 1. Fetch schoolA students
      const studentsA = await db.collection('students').find({ tenantId: schoolA.tenantId }).limit(20).toArray();
      for (const st of studentsA) {
        if (String(st.tenantId) !== String(schoolA.tenantId)) {
          crossTenantViolations++;
        }
      }

      // 2. Fetch schoolB fee obligations
      const feesB = await db.collection('studentfees').find({ tenantId: schoolB.tenantId }).limit(20).toArray();
      for (const f of feesB) {
        if (String(f.tenantId) !== String(schoolB.tenantId)) {
          crossTenantViolations++;
        }
      }

      // 3. Ensure schoolA does not see schoolB students
      const crossCheck = await db.collection('students').findOne({
        tenantId: schoolA.tenantId,
        _id: schoolB.students[0]?._id,
      });

      if (crossCheck) {
        crossTenantViolations++;
      } else {
        isolationChecksPassed++;
      }

      metrics.record({
        scenario: 'tenant_isolation_concurrency',
        durationMs: performance.now() - start,
        statusCode: 200,
        success: crossTenantViolations === 0,
        tenantId: String(schoolA.tenantId),
      });
    } catch (e: any) {
      metrics.record({
        scenario: 'tenant_isolation_concurrency',
        durationMs: performance.now() - start,
        statusCode: 500,
        success: false,
        error: e.message,
      });
    }
  }

  return { isolationChecksPassed, crossTenantViolations };
}
