import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate, requirePermission } from '../middleware/auth';
import { z } from 'zod';
import * as searchController from '../controllers/search.controller';
import * as dashboardController from '../controllers/dashboard.controller';
import * as reportsController from '../controllers/reports.controller';
import { resolveTenant } from '../middleware/tenant';
import { checkSubscriptionAccess } from '../middleware/subscription';

const router = Router();
router.use(authenticate, resolveTenant, checkSubscriptionAccess);

const searchQuerySchema = z.object({ q: z.string().trim().max(80) }).strict();
const reportQuerySchema = z
  .object({
    classId: z.string().trim().optional(),
    sessionId: z.string().trim().optional(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM').optional(),
    format: z.enum(['csv']).optional(),
  })
  .strict();

// ── Global search (role-scoped; internal per-section permission checks) ──
router.get('/search', validate({ query: searchQuerySchema }), searchController.globalSearch);

// ── Dashboard analytics ─────────────────────────────────
router.get('/dashboard/analytics', requirePermission('dashboard', 'view'), dashboardController.analytics);

// ── Report center ───────────────────────────────────────
router.get('/reports/exams', requirePermission('reports', 'view'), validate({ query: reportQuerySchema }), reportsController.examReport);
router.get('/reports/attendance', requirePermission('reports', 'view'), validate({ query: reportQuerySchema }), reportsController.attendanceReport);
router.get('/reports/session-overview', requirePermission('reports', 'view'), validate({ query: reportQuerySchema }), reportsController.sessionReport);
router.get('/reports/teacher-workload', requirePermission('reports', 'view'), validate({ query: reportQuerySchema }), reportsController.teacherReport);

export default router;
