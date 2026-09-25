import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  bulkStudentAttendanceSchema,
  recordSchema,
  studentAttendanceQuerySchema,
  downloadStudentAttendanceQuerySchema,
  summaryQuerySchema,
  monthlyAttendanceQuerySchema,
  studentSummaryQuerySchema,
  bulkTeacherAttendanceSchema,
  teacherRecordSchema,
  dateRangeSchema,
  teacherAttendanceQuerySchema,
  teacherMonthlyAttendanceQuerySchema,
  createTimetableSchema,
  updatePeriodSchema,
  addPeriodRouteSchema,
  removePeriodsSchema,
  swapRouteSchema,
  timetableQuerySchema,
  schoolClosureSchema,
  schoolClosureQuerySchema,
  bulkNonTeachingStaffAttendanceSchema,
  nonTeachingStaffAttendanceQuerySchema,
  nonTeachingStaffRecordSchema,
} from '../validators/attendance.validators';
import * as studentAttendanceController from '../controllers/studentAttendance.controller';
import * as teacherAttendanceController from '../controllers/teacherAttendance.controller';
import * as nonTeachingStaffAttendanceController from '../controllers/nonTeachingStaffAttendance.controller';
import * as timetableController from '../controllers/timetable.controller';
import * as myAttendanceController from '../controllers/myAttendance.controller';
import * as schoolClosureController from '../controllers/schoolClosure.controller';
import { resolveTenant } from '../middleware/tenant';
import { checkSubscriptionAccess } from '../middleware/subscription';

const router = Router();
router.use(authenticate, resolveTenant, checkSubscriptionAccess);

// ── Student attendance ──────────────────────────────────
router.get(
  '/student-attendance/check-auth',
  requirePermission('studentAttendance', 'create'),
  studentAttendanceController.checkAuth
);
router.get(
  '/student-attendance',
  requirePermission('studentAttendance', 'view'),
  validate({ query: studentAttendanceQuerySchema }),
  studentAttendanceController.listAttendance
);
router.post(
  '/student-attendance/bulk',
  requirePermission('studentAttendance', 'create'),
  validate({ body: bulkStudentAttendanceSchema }),
  studentAttendanceController.bulkMark
);
router.get(
  '/student-attendance/summary',
  requirePermission('studentAttendance', 'view'),
  validate({ query: summaryQuerySchema }),
  studentAttendanceController.summary
);
router.get(
  '/student-attendance/monthly-summary',
  requirePermission('studentAttendance', 'view'),
  validate({ query: monthlyAttendanceQuerySchema }),
  studentAttendanceController.monthlySummary
);
router.get(
  '/student-attendance/student-summary',
  requirePermission('studentAttendance', 'view'),
  validate({ query: studentSummaryQuerySchema }),
  studentAttendanceController.studentSummary
);
router.get(
  '/student-attendance/download',
  requirePermission('studentAttendance', 'export'),
  validate({ query: downloadStudentAttendanceQuerySchema }),
  studentAttendanceController.downloadCsv
);
router.get(
  '/student-attendance/records/:id',
  requirePermission('studentAttendance', 'view'),
  studentAttendanceController.getRecord
);
router.patch(
  '/student-attendance/records/:id',
  requirePermission('studentAttendance', 'edit'),
  validate({ body: recordSchema }),
  studentAttendanceController.updateRecord
);

// ── Teacher attendance ──────────────────────────────────
router.get(
  '/teacher-attendance',
  requirePermission('teacherAttendance', 'view'),
  validate({ query: teacherAttendanceQuerySchema }),
  teacherAttendanceController.listAttendance
);
router.get(
  '/teacher-attendance/monthly-summary',
  requirePermission('teacherAttendance', 'view'),
  validate({ query: teacherMonthlyAttendanceQuerySchema }),
  teacherAttendanceController.monthlySummary
);
router.post(
  '/teacher-attendance/bulk',
  requirePermission('teacherAttendance', 'create'),
  validate({ body: bulkTeacherAttendanceSchema }),
  teacherAttendanceController.bulkMark
);
router.get(
  '/teacher-attendance/summary',
  requirePermission('teacherAttendance', 'view'),
  validate({ query: dateRangeSchema.partial() }),
  teacherAttendanceController.summary
);
router.get(
  '/teacher-attendance/download',
  requirePermission('teacherAttendance', 'export'),
  validate({ query: teacherAttendanceQuerySchema }),
  teacherAttendanceController.downloadCsv
);
router.get(
  '/teacher-attendance/records/:id',
  requirePermission('teacherAttendance', 'view'),
  teacherAttendanceController.getRecord
);
router.patch(
  '/teacher-attendance/records/:id',
  requirePermission('teacherAttendance', 'edit'),
  validate({ body: teacherRecordSchema }),
  teacherAttendanceController.updateRecord
);

// ---------------------------------------------------------------------------
// Non-Teaching Staff Attendance
// ---------------------------------------------------------------------------
router.get(
  '/non-teaching-attendance',
  requirePermission('nonTeachingAttendance', 'view'),
  validate({ query: nonTeachingStaffAttendanceQuerySchema }),
  nonTeachingStaffAttendanceController.listAttendance
);
router.post(
  '/non-teaching-attendance/bulk',
  requirePermission('nonTeachingAttendance', 'create'),
  validate({ body: bulkNonTeachingStaffAttendanceSchema }),
  nonTeachingStaffAttendanceController.bulkMark
);
router.get(
  '/non-teaching-attendance/download',
  requirePermission('nonTeachingAttendance', 'export'),
  validate({ query: nonTeachingStaffAttendanceQuerySchema }),
  nonTeachingStaffAttendanceController.downloadCsv
);
router.get(
  '/non-teaching-attendance/records/:id',
  requirePermission('nonTeachingAttendance', 'view'),
  nonTeachingStaffAttendanceController.getRecord
);
router.patch(
  '/non-teaching-attendance/records/:id',
  requirePermission('nonTeachingAttendance', 'edit'),
  validate({ body: nonTeachingStaffRecordSchema }),
  nonTeachingStaffAttendanceController.updateRecord
);

// ── My attendance (student/teacher self-service, Prompt 8) ──
router.get('/my-attendance', myAttendanceController.studentMyAttendance);
router.get('/my-attendance/teacher', myAttendanceController.teacherMyAttendance);

// ── Timetable ───────────────────────────────────────────
router.get(
  '/timetables',
  requirePermission('timetables', 'view'),
  validate({ query: timetableQuerySchema }),
  timetableController.listTimetable
);
router.get(
  '/timetables/print',
  requirePermission('timetables', 'print'),
  validate({ query: timetableQuerySchema }),
  timetableController.printTimetable
);
router.post(
  '/timetables',
  requirePermission('timetables', 'create'),
  validate({ body: createTimetableSchema }),
  timetableController.createTimetable
);
router.post(
  '/timetables/periods',
  requirePermission('timetables', 'create'),
  validate({ body: addPeriodRouteSchema }),
  timetableController.addPeriod
);
router.patch(
  '/timetables/periods/:id',
  requirePermission('timetables', 'edit'),
  validate({ body: updatePeriodSchema }),
  timetableController.updatePeriod
);
router.delete(
  '/timetables/periods',
  requirePermission('timetables', 'delete'),
  validate({ body: removePeriodsSchema }),
  timetableController.removePeriods
);
router.post(
  '/timetables/swap',
  requirePermission('timetables', 'edit'),
  validate({ body: swapRouteSchema }),
  timetableController.swapPeriods
);

// ── School closures & official leave days ────────────────
router.get(
  '/school-closures',
  validate({ query: schoolClosureQuerySchema }),
  schoolClosureController.getClosures
);
router.post(
  '/school-closures',
  requirePermission('studentAttendance', 'create'),
  validate({ body: schoolClosureSchema }),
  schoolClosureController.setClosure
);
router.delete(
  '/school-closures/:idOrDate',
  requirePermission('studentAttendance', 'create'),
  schoolClosureController.deleteClosure
);

export default router;
