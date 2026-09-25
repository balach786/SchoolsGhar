import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  assignmentQuerySchema,
  createSubmissionSchema,
  reviewSubmissionSchema,
  submissionQuerySchema,
  createNoticeSchema,
  updateNoticeSchema,
  noticeQuerySchema,
  createLeaveSchema,
  reviewLeaveSchema,
  leaveQuerySchema,
  notificationQuerySchema,
} from '../validators/prompt7.validators';
import * as assignmentController from '../controllers/assignment.controller';
import * as submissionController from '../controllers/submission.controller';
import * as noticeController from '../controllers/notice.controller';
import * as leaveController from '../controllers/leave.controller';
import * as notificationController from '../controllers/notification.controller';
import { resolveTenant } from '../middleware/tenant';
import { checkSubscriptionAccess } from '../middleware/subscription';

const router = Router();
router.use(authenticate, resolveTenant, checkSubscriptionAccess);

// ── Assignments ─────────────────────────────────────────
router.get('/assignments', requirePermission('assignments', 'view'), validate({ query: assignmentQuerySchema }), assignmentController.listAssignments);
router.post('/assignments', requirePermission('assignments', 'create'), validate({ body: createAssignmentSchema }), assignmentController.createAssignment);
router.get('/assignments/:id', requirePermission('assignments', 'view'), assignmentController.getAssignment);
router.patch('/assignments/:id', requirePermission('assignments', 'edit'), validate({ body: updateAssignmentSchema }), assignmentController.updateAssignment);
router.post('/assignments/:id/archive', requirePermission('assignments', 'edit'), assignmentController.archiveAssignment);
router.post('/assignments/:id/restore', requirePermission('assignments', 'edit'), assignmentController.archiveAssignment);

// ── Submissions ─────────────────────────────────────────
router.get('/submissions', requirePermission('submissions', 'view'), validate({ query: submissionQuerySchema }), submissionController.listSubmissions);
router.post('/submissions', requirePermission('submissions', 'create'), validate({ body: createSubmissionSchema }), submissionController.createSubmission);
router.patch('/submissions/:id', requirePermission('submissions', 'edit'), validate({ body: reviewSubmissionSchema }), submissionController.reviewSubmission);

// ── Notices ─────────────────────────────────────────────
router.get('/notices', requirePermission('notices', 'view'), validate({ query: noticeQuerySchema }), noticeController.listNotices);
router.post('/notices', requirePermission('notices', 'create'), validate({ body: createNoticeSchema }), noticeController.createNotice);
router.patch('/notices/:id', requirePermission('notices', 'edit'), validate({ body: updateNoticeSchema }), noticeController.updateNotice);
router.post('/notices/:id/archive', requirePermission('notices', 'edit'), noticeController.archiveNotice);
router.post('/notices/:id/publish', requirePermission('notices', 'publish'), noticeController.publishNotice);

// ── Leave requests ──────────────────────────────────────
router.get('/leave-requests', requirePermission('leaveRequests', 'view'), validate({ query: leaveQuerySchema }), leaveController.listLeaves);
router.post('/leave-requests', requirePermission('leaveRequests', 'create'), validate({ body: createLeaveSchema }), leaveController.createLeave);
router.patch('/leave-requests/:id/review', requirePermission('leaveRequests', 'approve'), validate({ body: reviewLeaveSchema }), leaveController.reviewLeave);

// ── Notifications ───────────────────────────────────────
router.get('/notifications', requirePermission('notifications', 'view'), validate({ query: notificationQuerySchema }), notificationController.listNotifications);
router.post('/notifications/read-all', requirePermission('notifications', 'view'), notificationController.markAllRead);
router.patch('/notifications/:id/read', requirePermission('notifications', 'view'), notificationController.markRead);
router.delete('/notifications/:id', requirePermission('notifications', 'delete'), notificationController.deleteNotification);

export default router;
