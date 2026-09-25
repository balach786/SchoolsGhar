import { Router } from 'express';
import { healthCheck, livenessCheck, readinessCheck } from '../controllers/health.controller';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import roleRoutes from './role.routes';
import auditRoutes from './audit.routes';
import academicRoutes from './academic.routes';
import attendanceRoutes from './attendance.routes';
import examRoutes from './exam.routes';
import financeRoutes from './finance.routes';
import prompt7Routes from './prompt7.routes';
import prompt8Routes from './prompt8.routes';
import systemRoutes from './system.routes';
import saasRoutes from './saas.routes';
import platformRoutes from './platform.routes';
import dataTransferRoutes from './dataTransfer.routes';
import staffRoutes from './staff.routes';

const router = Router();

/** Liveness / readiness probes. */
router.get('/health', healthCheck);
router.get('/health/liveness', livenessCheck);
router.get('/health/readiness', readinessCheck);

/** Public SaaS & Customer Billing routes (Registration, Plans, Payments). */
router.use('/', saasRoutes);

/** SaaS Owner Platform Admin Control Panel. */
router.use('/platform', platformRoutes);

/** Authentication & session management. */
router.use('/auth', authRoutes);

import permissionRoutes from './permission.routes';

/** Users, roles & permissions, audit logs (Phase 2). */
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/permissions', permissionRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/staff', staffRoutes);

/** Data Management Import / Export center. */
router.use('/data-transfer', dataTransferRoutes);

/** Private authorized file access (Step 4D.1) — covers both /files and legacy /uploads paths */
import { getAuthorizedProofFile } from '../controllers/file.controller';
import { authenticate } from '../middleware/auth';
router.get(['/files/proofs/:key', '/uploads/proofs/:key'], authenticate, getAuthorizedProofFile);

/**
 * Academic core (Phase 3) + attendance/timetable (Phase 4) mount at the API root.
 * They are path-scoped so unknown routes still fall through to the 404 handler
 * instead of being swallowed by each module's `router.use(authenticate)`.
 */
const academicPath = /^\/(academic-sessions|classes|sections|subjects|students|teachers|promotions)(\/|$)/;
router.use((req, res, next) => (academicPath.test(req.path) ? academicRoutes(req, res, next) : next()));

const attendancePath = /^\/(student-attendance|teacher-attendance|timetables|my-attendance|school-closures|non-teaching-attendance)(\/|$)/;
router.use((req, res, next) => (attendancePath.test(req.path) ? attendanceRoutes(req, res, next) : next()));

const examPath = /^\/(exams|marks|results|grade-scales|exam-types|exam-schedules|exam-fees|exam-expenses|exam-attendance|admit-cards|exam-reports)(\/|$)/;
router.use((req, res, next) => (examPath.test(req.path) ? examRoutes(req, res, next) : next()));

const financePath = /^\/(fee-structures|student-fees|payments|incomes|expenses|salaries|finance|school-settings|fee-settings|fee-discounts)(\/|$)/;
router.use((req, res, next) => (financePath.test(req.path) ? financeRoutes(req, res, next) : next()));

const prompt7Path = /^\/(assignments|submissions|notices|notifications|leave-requests)(\/|$)/;
router.use((req, res, next) => (prompt7Path.test(req.path) ? prompt7Routes(req, res, next) : next()));

const prompt8Path = /^\/(search|dashboard|reports)(\/|$)/;
router.use((req, res, next) => (prompt8Path.test(req.path) ? prompt8Routes(req, res, next) : next()));

const systemPath = /^\/(system)(\/|$)/;
router.use((req, res, next) => (systemPath.test(req.path) ? systemRoutes(req, res, next) : next()));

/**
 * Future module routers mount here (portals, search, reports).
 */

export default router;
