import { Router } from 'express';
import { authenticate, requirePermission, requireAnyPermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { listQuerySchema } from '../validators/academic.validators';
import {
  createGradeScaleSchema,
  updateGradeScaleSchema,
  examListQuerySchema,
  marksListQuerySchema,
  updateMarkSchema,
  bulkMarksSchema,
  resultQuerySchema,
} from '../validators/exam.validators';
import {
  createExamTypeSchema,
  updateExamTypeSchema,
  extendedCreateExamSchema,
  extendedUpdateExamSchema,
  createExamScheduleSchema,
  updateExamScheduleSchema,
  createExamFeeSchema,
  generateStudentExamFeesSchema,
  collectExamFeePaymentSchema,
  markExamAttendanceSchema,
  admitCardOverrideSchema,
  generateExamRollNumbersSchema,
  assignSeatingPlanSchema,
} from '../validators/examManagement.validators';
import * as gradeScaleController from '../controllers/gradeScale.controller';
import * as examController from '../controllers/exam.controller';
import * as markController from '../controllers/mark.controller';
import * as resultController from '../controllers/result.controller';
import * as resultV2Controller from '../controllers/resultV2.controller';
import * as examTypeController from '../controllers/examType.controller';
import * as examScheduleController from '../controllers/examSchedule.controller';
import * as examFeeController from '../controllers/examFee.controller';
import * as examAttendanceController from '../controllers/examAttendance.controller';
import * as admitCardController from '../controllers/admitCard.controller';
import * as examReportsController from '../controllers/examReports.controller';
import * as examRollNumberController from '../controllers/examRollNumber.controller';
import { resolveTenant } from '../middleware/tenant';
import { checkSubscriptionAccess } from '../middleware/subscription';

const router = Router();
router.use(authenticate, resolveTenant, checkSubscriptionAccess);

// ── Grade scales ──────────────────────────────────────────
router.get('/grade-scales', requirePermission('exams', 'view'), validate({ query: listQuerySchema }), gradeScaleController.listGradeScales);
router.post('/grade-scales', requirePermission('exams', 'edit'), validate({ body: createGradeScaleSchema }), gradeScaleController.createGradeScale);
router.get('/grade-scales/:id', requirePermission('exams', 'view'), gradeScaleController.getGradeScale);
router.patch('/grade-scales/:id', requirePermission('exams', 'edit'), validate({ body: updateGradeScaleSchema }), gradeScaleController.updateGradeScale);
router.post('/grade-scales/:id/set-default', requirePermission('exams', 'edit'), gradeScaleController.setDefaultGradeScale);

// ── Exam Types (Dual routes: /exams/types and /exam-types) ───
const listExamTypes = [requirePermission('exams', 'view'), examTypeController.listExamTypes];
const createExamType = [requirePermission('exams', 'create'), validate({ body: createExamTypeSchema }), examTypeController.createExamType];
router.get(['/exams/types', '/exam-types'], ...listExamTypes);
router.post(['/exams/types', '/exam-types'], ...createExamType);
router.patch(['/exams/types/:id', '/exam-types/:id'], requirePermission('exams', 'edit'), validate({ body: updateExamTypeSchema }), examTypeController.updateExamType);
router.post(['/exams/types/:id/toggle', '/exam-types/:id/toggle'], requirePermission('exams', 'edit'), examTypeController.toggleExamType);

// ── Exam Schedules (Dual routes) ──────────────────────────
router.get(['/exams/schedules/printable', '/exam-schedules/printable'], requirePermission('exams', 'view'), examScheduleController.getPrintableSchedule);
router.get(['/exams/schedules', '/exam-schedules'], requirePermission('exams', 'view'), examScheduleController.listExamSchedules);
router.post(['/exams/schedules', '/exam-schedules'], requirePermission('exams', 'schedule'), validate({ body: createExamScheduleSchema }), examScheduleController.createExamSchedule);
router.patch(['/exams/schedules/:id', '/exam-schedules/:id'], requirePermission('exams', 'schedule'), validate({ body: updateExamScheduleSchema }), examScheduleController.updateExamSchedule);
router.delete(['/exams/schedules/:id', '/exam-schedules/:id'], requirePermission('exams', 'schedule'), examScheduleController.deleteExamSchedule);

// ── Exam Fees (Dual routes) ───────────────────────────────
router.post(['/exams/fees/setup', '/exam-fees/setup'], requirePermission('examFees', 'edit'), validate({ body: createExamFeeSchema }), examFeeController.createOrUpdateExamFee);
router.post(['/exams/fees/sync-students', '/exam-fees/sync-students'], requirePermission('examFees', 'generate'), examFeeController.syncStudentExamFees);
router.get(['/exams/fees/students', '/exam-fees/students'], requirePermission('examFees', 'view'), examFeeController.listStudentExamFees);
router.patch(['/exams/fees/students/:id/adjust', '/exam-fees/students/:id/adjust'], requirePermission('examFees', 'edit'), examFeeController.adjustStudentExamFee);
router.post(['/exams/fees/collect', '/exam-fees/collect'], requirePermission('examFees', 'collect'), validate({ body: collectExamFeePaymentSchema }), examFeeController.collectExamFeePayment);
router.post(['/exams/fees/payments/:id/reversal', '/exam-fees/payments/:id/reversal'], requirePermission('examFees', 'edit'), examFeeController.createExamFeeReversalController);
router.get(['/exams/fees/receipt/:paymentId', '/exam-fees/receipt/:paymentId'], requirePermission('examFees', 'print'), examFeeController.getExamFeeReceipt);
router.get(['/exams/fees/history/:studentId', '/exam-fees/history/:studentId'], requirePermission('examFees', 'view'), examFeeController.getStudentExamFeeHistory);
router.get(['/exams/fees', '/exam-fees'], requirePermission('examFees', 'view'), examFeeController.listExamFees);
router.post(['/exams/fees', '/exam-fees'], requirePermission('examFees', 'edit'), validate({ body: createExamFeeSchema }), examFeeController.createOrUpdateExamFee);

// ── Exam Attendance (Dual routes) ─────────────────────────
router.get(['/exams/attendance/blocks', '/exam-attendance/blocks'], requirePermission('examAttendance', 'view'), examRollNumberController.getExamBlocks);
router.get(['/exams/attendance/sheet', '/exam-attendance/sheet'], requirePermission('examAttendance', 'view'), examAttendanceController.getExamAttendanceSheet);
router.post(['/exams/attendance/bulk', '/exam-attendance/bulk', '/exams/attendance', '/exam-attendance'], requirePermission('examAttendance', 'mark'), validate({ body: markExamAttendanceSchema }), examAttendanceController.markExamAttendance);

// ── Admit Cards & Roll Numbers (Dual routes) ─────────────────────────────
router.get(['/exams/admit-cards/students', '/admit-cards/students', '/admit-cards'], requirePermission('admitCards', 'view'), admitCardController.listAdmitCards);
router.post(['/exams/admit-cards/override', '/admit-cards/override'], requirePermission('admitCards', 'overrideEligibility'), validate({ body: admitCardOverrideSchema }), admitCardController.overrideAdmitCard);
router.delete(['/exams/admit-cards/override', '/admit-cards/override'], requirePermission('admitCards', 'overrideEligibility'), admitCardController.revokeOverride);
router.get(['/exams/admit-cards/print', '/admit-cards/print'], requirePermission('admitCards', 'print'), admitCardController.getPrintableAdmitCard);
router.post(['/exams/roll-numbers/generate', '/roll-numbers/generate'], requirePermission('admitCards', 'generate'), validate({ body: generateExamRollNumbersSchema }), examRollNumberController.generateExamRollNumbers);
router.post(['/exams/seating-plan/assign', '/seating-plan/assign'], requirePermission('admitCards', 'generate'), validate({ body: assignSeatingPlanSchema }), examRollNumberController.assignSeatingPlan);
router.get(['/exams/roll-numbers', '/roll-numbers'], requirePermission('admitCards', 'view'), examRollNumberController.getExamRollNumbers);

// ── Exam Reports & Dashboard (Dual routes) ────────────────
router.get(['/exams/reports/dashboard', '/exam-reports/dashboard'], requireAnyPermission(['reports', 'view'], ['exams', 'view']), examReportsController.getExamDashboardMetrics);
router.get(['/exams/reports/summary', '/exam-reports/summary'], requireAnyPermission(['reports', 'view'], ['exams', 'view']), examReportsController.getExamSummaryReport);
router.get(['/exams/reports/fees/export', '/exam-reports/fees/export'], requireAnyPermission(['reports', 'export'], ['examFees', 'export']), examReportsController.getExamFeeReport);
router.get(['/exams/reports/fees', '/exam-reports/fees'], requireAnyPermission(['reports', 'view'], ['examFees', 'view']), examReportsController.getExamFeeReport);
router.get(['/exams/reports/subjects', '/exam-reports/subject-performance'], requireAnyPermission(['reports', 'view'], ['exams', 'view']), examReportsController.getSubjectPerformanceReport);
router.get(['/exams/reports/class-results/export', '/exam-reports/class-results/export'], requireAnyPermission(['reports', 'export'], ['results', 'export']), examReportsController.getClassResultsReport);
router.get(['/exams/reports/class-results', '/exam-reports/class-results'], requireAnyPermission(['reports', 'view'], ['results', 'view'], ['exams', 'view']), examReportsController.getClassResultsReport);

// ── Marks ─────────────────────────────────────────────────
router.get('/marks', requirePermission('marks', 'view'), validate({ query: marksListQuerySchema }), markController.listMarks);
router.post('/marks/bulk', requirePermission('marks', 'create'), validate({ body: bulkMarksSchema }), markController.bulkCreateMarks);
router.patch('/marks/records/:id', requirePermission('marks', 'edit'), validate({ body: updateMarkSchema }), markController.updateMark);

// 🎓 Results (Phase 4C Immutable Snapshots & Draft Calculation) 📈
router.get('/results/draft', requirePermission('results', 'view'), resultV2Controller.getDraftResults);
router.get('/results/exam-summary', requirePermission('results', 'view'), validate({ query: resultQuerySchema }), resultV2Controller.getPublishedSummary);
router.get('/results/student', requirePermission('results', 'view'), validate({ query: resultQuerySchema }), resultController.studentResult);
router.get('/results/print', requirePermission('results', 'print'), validate({ query: resultQuerySchema }), resultController.printResult);
router.get('/results/:examId/students/:studentId', requirePermission('results', 'view'), resultV2Controller.getLatestPublishedResult);
router.get('/results/:examId/students/:studentId/history', requirePermission('results', 'history'), resultV2Controller.getStudentResultHistory);
router.post('/results/publish', requirePermission('results', 'publish'), resultV2Controller.publishExam);
router.post('/results/republish', requirePermission('results', 'republish'), resultV2Controller.republishStudentResult);

// ── Base Exams collection (placed after specific /exams/... subpaths) ───
router.get('/exams', requirePermission('exams', 'view'), validate({ query: examListQuerySchema }), examController.listExams);
router.post('/exams', requirePermission('exams', 'create'), validate({ body: extendedCreateExamSchema }), examController.createExam);
router.get('/exams/:id', requirePermission('exams', 'view'), examController.getExam);
router.get('/marks/class-matrix/:examId/:classId', requirePermission('marks', 'view'), markController.getClassMarksMatrix);
router.post('/marks/class-matrix/:examId/:classId/bulk', requirePermission('marks', 'create'), markController.bulkSaveClassMarks);
router.patch('/exams/:id', requirePermission('exams', 'edit'), validate({ body: extendedUpdateExamSchema }), examController.updateExam);
router.delete('/exams/:id', requirePermission('exams', 'delete'), examController.deleteExam);
router.post('/exams/:id/archive', requirePermission('exams', 'archive'), examController.archiveExam);
router.post('/exams/:id/restore', requirePermission('exams', 'archive'), examController.archiveExam);
router.post('/exams/:id/publish', requirePermission('exams', 'publish'), examController.publishExam);
router.patch('/exams/:id/publish', requirePermission('exams', 'publish'), examController.publishExam);
router.post('/exams/:id/unpublish', requirePermission('exams', 'publish'), examController.publishExam);

export default router;
