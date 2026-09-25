import { z } from 'zod';
import { objectIdString, isoDateString } from './attendance.validators';

// ---------------------------------------------------------------------------
// Exam Types
// ---------------------------------------------------------------------------

export const createExamTypeSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
    description: z.string().trim().max(300).optional(),
    weightage: z.number().min(0).max(100).optional(),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const updateExamTypeSchema = createExamTypeSchema.partial();

// ---------------------------------------------------------------------------
// Exam (extended)
// ---------------------------------------------------------------------------

export const baseExamSchema = z
  .object({
    name: z.string().trim().min(2, 'Exam name must be at least 2 characters').max(120),
    examTypeId: objectIdString.optional(),
    sessionId: objectIdString,
    classId: objectIdString.optional(),
    classIds: z.array(objectIdString).optional(),
    subjects: z
      .array(
        z.object({
          subjectId: objectIdString,
          maxMarks: z.number().int().positive().max(1000),
          passMarks: z.number().int().min(0).max(1000).optional(),
        })
      )
      .optional()
      .default([]),
    gradeScaleId: objectIdString.optional(),
    examDate: isoDateString.optional(),
    startDate: isoDateString.optional(),
    endDate: isoDateString.optional(),
    description: z.string().trim().max(1000).optional(),
    status: z
      .enum(['Draft', 'Scheduled', 'Ongoing', 'Completed', 'Results Pending', 'Published', 'Archived'])
      .optional()
      .default('Scheduled'),
    requireExamFeeForAdmitCard: z.boolean().optional().default(false),
    classFees: z.record(z.number()).optional(),
    examFeeDueDate: isoDateString.optional().nullable(),
  })
  .strict();

export const extendedUpdateExamSchema = baseExamSchema.partial();

export const extendedCreateExamSchema = baseExamSchema.refine(
  (d) => {
    if (d.startDate && d.endDate && new Date(d.startDate) > new Date(d.endDate)) {
      return false;
    }
    return Boolean(d.classId || (d.classIds && d.classIds.length > 0));
  },
  { message: 'Valid class and date range required', path: ['startDate'] }
);

// ---------------------------------------------------------------------------
// Exam Schedule
// ---------------------------------------------------------------------------

export const baseScheduleSchema = z
  .object({
    examId: objectIdString,
    sessionId: objectIdString.optional(),
    classId: objectIdString,
    subjectId: objectIdString,
    examDate: isoDateString,
    startTime: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format must be HH:MM (24-hour)'),
    endTime: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format must be HH:MM (24-hour)'),
    roomNumber: z.string().trim().max(60).optional(),
    totalMarks: z.number().int().positive().max(1000).optional().default(100),
    passingMarks: z.number().int().min(0).max(1000).optional().default(33),
    maxMarks: z.number().int().positive().max(1000).optional(),
    passMarks: z.number().int().min(0).max(1000).optional(),
    theoryMarks: z.number().int().min(0).max(1000).optional(),
    practicalMarks: z.number().int().min(0).max(1000).optional(),
    instructions: z.string().trim().max(500).optional(),
  })
  .strict();

export const updateExamScheduleSchema = baseScheduleSchema.partial();

export const createExamScheduleSchema = baseScheduleSchema.refine(
  (s) => {
    const tot = s.totalMarks ?? s.maxMarks ?? 100;
    const pass = s.passingMarks ?? s.passMarks ?? 33;
    if (pass > tot) return false;
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    return eh * 60 + em > sh * 60 + sm;
  },
  { message: 'Passing marks must be <= total marks and end time must be after start time', path: ['endTime'] }
);

// ---------------------------------------------------------------------------
// Exam Fee Setup & Student Exam Fee Generation
// ---------------------------------------------------------------------------

export const createExamFeeSchema = z
  .object({
    examId: objectIdString,
    sessionId: objectIdString.optional(),
    classId: objectIdString,
    amount: z.number().int().min(0, 'Amount cannot be negative'), // integer paisa
    dueDate: isoDateString.optional(),
    description: z.string().trim().max(500).optional(),
    defaultFine: z.number().int().min(0).optional().default(0),
    discountAllowed: z.boolean().optional().default(true),
    scholarshipAllowed: z.boolean().optional().default(true),
  })
  .strict();

export const updateExamFeeSchema = createExamFeeSchema.partial();

export const generateStudentExamFeesSchema = z
  .object({
    examId: objectIdString,
    classId: objectIdString,
    sectionId: objectIdString.optional(),
    studentIds: z.array(objectIdString).optional(),
    dueDate: isoDateString.optional(),
  })
  .strict();

export const generateExamRollNumbersSchema = z
  .object({
    examId: objectIdString,
    startExamRollNumber: z.number().int().positive().optional(),
    regenerate: z.boolean().optional(),
  })
  .strict();

export const assignSeatingPlanSchema = z
  .object({
    examId: objectIdString,
    block: z.string().trim().min(1, 'Block/Room name is required').max(60),
    originalBlock: z.string().trim().max(60).nullable().optional(),
    studentIds: z.array(objectIdString).min(1, 'At least one student must be assigned'),
  })
  .strict();

export const collectExamFeePaymentSchema = z
  .object({
    studentExamFeeId: objectIdString,
    amount: z.number().int().positive('Payment amount must be positive').optional(),
    amountPaid: z.number().int().positive('Payment amount must be positive').optional(),
    paymentMethod: z.string().trim().min(1).max(50),
    paymentDate: isoDateString.optional(),
    discount: z.number().int().min(0).optional().default(0),
    fine: z.number().int().min(0).optional().default(0),
    reference: z.string().trim().max(120).optional(),
    remarks: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((d) => Boolean(d.amount || d.amountPaid), {
    message: 'Either amount or amountPaid is required',
    path: ['amount'],
  });



// ---------------------------------------------------------------------------
// Exam Attendance
// ---------------------------------------------------------------------------

export const markExamAttendanceSchema = z
  .object({
    examId: objectIdString,
    scheduleId: objectIdString.optional(),
    examScheduleId: objectIdString.optional(),
    block: z.string().trim().min(1, 'Block/Room is required').max(60),
    records: z
      .array(
        z.object({
          studentId: objectIdString,
          status: z.enum(['present', 'absent', 'leave']),
          remarks: z.string().trim().max(300).optional(),
        })
      )
      .min(1, 'At least one student record is required'),
  })
  .strict()
  .refine((d) => Boolean(d.scheduleId || d.examScheduleId), {
    message: 'Schedule identifier is required',
    path: ['scheduleId'],
  });

// ---------------------------------------------------------------------------
// Admit Card Override
// ---------------------------------------------------------------------------

export const admitCardOverrideSchema = z
  .object({
    examId: objectIdString,
    studentId: objectIdString,
    reason: z.string().trim().min(2, 'Reason is required').max(300),
  })
  .strict();
