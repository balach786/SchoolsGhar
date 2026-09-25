import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MetricsCollector } from '../metrics';
import { SyntheticSchool } from '../fixtures';

export async function runAuthScenario(
  connection: mongoose.Connection,
  schools: SyntheticSchool[],
  iterations: number,
  metrics: MetricsCollector
): Promise<{ authQueriesPerRequest: number }> {
  const db = connection.db!;
  const jwtSecret = process.env.JWT_ACCESS_SECRET || 'sms-dev-access-token-secret-2026';

  // Issue tokens for admin users
  for (const s of schools) {
    s.adminUser.token = jwt.sign(
      { id: String(s.adminUser._id), tenantId: String(s.tenantId), role: 'admin' },
      jwtSecret,
      { expiresIn: '1h' }
    );
  }

  // Measure /api/auth/me equivalent queries
  // 1. User.findById
  // 2. Tenant.exists({ _id, status: 'active' })
  for (let i = 0; i < iterations; i++) {
    const school = schools[i % schools.length];
    const start = performance.now();
    try {
      const decoded: any = jwt.verify(school.adminUser.token!, jwtSecret);
      
      // Query 1: User lookup
      const user = await db.collection('users').findOne(
        { _id: new mongoose.Types.ObjectId(decoded.id) },
        { projection: { password: 0 } }
      );
      
      // Query 2: Tenant active lookup
      const tenant = await db.collection('tenants').findOne(
        { _id: new mongoose.Types.ObjectId(decoded.tenantId), status: 'active' },
        { projection: { _id: 1 } }
      );

      const duration = performance.now() - start;
      const success = Boolean(user && tenant);

      metrics.record({
        scenario: 'auth_me',
        durationMs: duration,
        statusCode: success ? 200 : 401,
        success,
        tenantId: String(school.tenantId),
      });
    } catch (e: any) {
      metrics.record({
        scenario: 'auth_me',
        durationMs: performance.now() - start,
        statusCode: 500,
        success: false,
        error: e.message,
      });
    }
  }

  return { authQueriesPerRequest: 2 };
}
