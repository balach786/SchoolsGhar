import mongoose from 'mongoose';
import { MetricsCollector } from '../metrics';
import { SyntheticSchool } from '../fixtures';

export async function runDashboardScenario(
  connection: mongoose.Connection,
  schools: SyntheticSchool[],
  concurrency: number,
  metrics: MetricsCollector
): Promise<{ queriesPerDashboard: number }> {
  const db = connection.db!;

  // Simulate dashboard load (20 parallel operations executed inside Promise.all)
  const executeDashboard = async (school: SyntheticSchool) => {
    const start = performance.now();
    const tId = school.tenantId;

    try {
      await Promise.all([
        db.collection('students').countDocuments({ tenantId: tId, isArchived: false, isActive: true }),
        db.collection('students').countDocuments({ tenantId: tId, isArchived: false, isActive: false }),
        db.collection('students').countDocuments({ tenantId: tId, isArchived: true }),
        db.collection('staff').countDocuments({ tenantId: tId, isArchived: false, isActive: true }),
        db.collection('staff').countDocuments({ tenantId: tId, staffType: 'teaching' }),
        db.collection('classes').countDocuments({ tenantId: tId }),
        db.collection('sections').countDocuments({ tenantId: tId }),
        db.collection('studentattendances').aggregate([
          { $match: { tenantId: tId } },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]).toArray(),
        db.collection('studentfees').aggregate([
          { $match: { tenantId: tId } },
          { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } }
        ]).toArray(),
        db.collection('payments').aggregate([
          { $match: { tenantId: tId } },
          { $group: { _id: null, totalCollected: { $sum: '$amount' } } }
        ]).toArray(),
        db.collection('exams').find({ tenantId: tId }).sort({ examDate: -1 }).limit(5).toArray(),
        db.collection('notices').find({ tenantId: tId, isActive: true }).sort({ createdAt: -1 }).limit(5).toArray(),
        db.collection('auditlogs').find({ tenantId: tId }).sort({ createdAt: -1 }).limit(10).toArray(),
        db.collection('feestructures').countDocuments({ tenantId: tId }),
        db.collection('users').countDocuments({ tenantId: tId }),
        db.collection('incomes').aggregate([
          { $match: { tenantId: tId } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).toArray(),
        db.collection('expenses').aggregate([
          { $match: { tenantId: tId } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).toArray(),
        db.collection('salaryrecords').countDocuments({ tenantId: tId, status: 'unpaid' }),
        db.collection('notifications').countDocuments({ tenantId: tId, isRead: false }),
        db.collection('academicsessions').findOne({ tenantId: tId, isCurrent: true })
      ]);

      const duration = performance.now() - start;
      metrics.record({
        scenario: 'dashboard_fanout',
        durationMs: duration,
        statusCode: 200,
        success: true,
        tenantId: String(tId),
      });
    } catch (e: any) {
      metrics.record({
        scenario: 'dashboard_fanout',
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
    tasks.push(executeDashboard(school));
  }
  await Promise.all(tasks);

  return { queriesPerDashboard: 20 };
}
