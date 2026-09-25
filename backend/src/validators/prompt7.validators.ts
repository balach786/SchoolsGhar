import { z } from 'zod';
import { objectIdString, isoDateString } from './attendance.validators';

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

const fileRefSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    url: z.string().trim().min(1).max(500),
    mimeType: z.string().trim().max(80).optional(),
  })
  .strict();

export const createAssignmentSchema = z
  .object({
    title: z.string().trim().min(2, 'Title must be at least 2 characters').max(120),
    description: z.string().trim().max(2000).optional(),
    classId: objectIdString,
    sectionId: objectIdString.optional(),
    subjectId: objectIdString.optional(),
    dueDate: isoDateString.optional(),
    maxMarks: z.number().int().min(0).max(1000).optional(),
    /** External file references only — never bytes/base64. */
    attachments: z.array(fileRefSchema).max(5).optional(),
  })
  .strict();

export const updateAssignmentSchema = createAssignmentSchema.partial();

export const assignmentQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    classId: objectIdString.optional(),
    sectionId: objectIdString.optional(),
    subjectId: objectIdString.optional(),
    status: z.enum(['active', 'archived', 'all']).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export const createSubmissionSchema = z
  .object({
    assignmentId: objectIdString,
    content: z.string().trim().max(5000).optional(),
    fileUrl: z.string().trim().max(500).optional(),
    fileMeta: z
      .object({
        name: z.string().trim().max(160),
        mimeType: z.string().trim().max(80).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (!s.content && !s.fileUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide text content or a file reference', path: ['content'] });
    }
  });

export const reviewSubmissionSchema = z
  .object({
    marksObtained: z.number().min(0).max(1000),
    feedback: z.string().trim().max(1000).optional(),
  })
  .strict();

export const submissionQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    assignmentId: objectIdString.optional(),
    studentId: objectIdString.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

const noticeBaseSchema = z.object({
  title: z.string().trim().min(2).max(140),
  body: z.string().trim().min(2).max(3000),
  audienceType: z.enum(['school', 'students', 'teachers', 'class', 'section']),
  classId: objectIdString.optional(),
  sectionId: objectIdString.optional(),
  isPinned: z.boolean().optional().default(false),
  isImportant: z.boolean().optional().default(false),
  expiresAt: isoDateString.optional(),
})
  .strict();

export const createNoticeSchema = noticeBaseSchema.superRefine((s, ctx) => {
  if (s.audienceType === 'class' && !s.classId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'classId is required for class notices', path: ['classId'] });
  }
  if (s.audienceType === 'section' && !s.sectionId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sectionId is required for section notices', path: ['sectionId'] });
  }
});

export const updateNoticeSchema = noticeBaseSchema.partial();

export const noticeQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    audienceType: z.enum(['school', 'students', 'teachers', 'class', 'section']).optional(),
    includeArchived: z.enum(['true', 'false']).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Leave requests
// ---------------------------------------------------------------------------

export const createLeaveSchema = z
  .object({
    fromDate: isoDateString,
    toDate: isoDateString,
    reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(500),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (new Date(s.toDate) < new Date(s.fromDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'toDate cannot be before fromDate', path: ['toDate'] });
    }
  });

export const reviewLeaveSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reviewNote: z.string().trim().max(300).optional(),
  })
  .strict();

export const leaveQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    requesterType: z.enum(['student', 'teacher']).optional(),
    from: isoDateString.optional(),
    to: isoDateString.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notificationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    unread: z.enum(['true', 'false']).optional(),
  })
  .strict();
