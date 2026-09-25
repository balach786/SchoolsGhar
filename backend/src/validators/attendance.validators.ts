import { z } from 'zod';

export const objectIdString = z.string().min(1, 'ID is required').max(64);

export const isoDateString = z
  .string()
  .min(1, 'attendanceDate is required')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'attendanceDate must be a valid date');

export const timeHHMM = z
  .string()
  .min(1)
  .regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm (24h) format');

export const statusEnum = z.enum(['present', 'absent', 'late', 'leave'], {
  errorMap: () => ({ message: 'status must be present, absent, late or leave' }),
});

// ---------------------------------------------------------------------------
// Student attendance
// ---------------------------------------------------------------------------

export const bulkStudentAttendanceSchema = z
  .object({
    sessionId: objectIdString,
    classId: objectIdString,
    sectionId: objectIdString.optional().nullable(),
    attendanceDate: isoDateString,
    /** Overwrite entries that already exist for the same student + date. */
    overwrite: z.boolean().optional().default(false),
    records: z
      .array(
        z.object({
          studentId: objectIdString,
          status: statusEnum,
        })
      )
      .min(1, 'At least one record is required')
      .max(500, 'Too many records in a single request'),
  })
  .strict();

export const recordSchema = z.object({ status: statusEnum }).strict();

export const markStudentSchema = z
  .object({
    sessionId: objectIdString,
    attendanceDate: isoDateString,
  })
  .strict();

export const dateRangeSchema = z
  .object({
    from: isoDateString,
    to: isoDateString,
  })
  .strict();

export const studentSummaryQuerySchema = z.object({
  studentId: objectIdString,
  from: z.string().optional(),
  to: z.string().optional(),
});

export const summaryQuerySchema = z.object({
  sessionId: objectIdString.optional(),
  classId: objectIdString.optional(),
  sectionId: objectIdString.optional().nullable(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const monthlyAttendanceQuerySchema = z.object({
  sessionId: objectIdString.optional(),
  classId: objectIdString.optional(),
  sectionId: objectIdString.optional().nullable(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM').optional(),
  format: z.string().optional(),
});

export const schoolClosureSchema = z.object({
  dateString: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateString must be YYYY-MM-DD'),
  type: z.enum(['official_leave', 'school_closed']),
  reason: z.string().min(1, 'Reason is required').max(200),
  reasonCategory: z.string().optional().default('other'),
  notes: z.string().max(500).optional(),
  applicableTo: z.enum(['all', 'students', 'staff']).optional().default('all'),
});

export const schoolClosureQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM').optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const teacherMonthlyAttendanceQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM').optional(),
  format: z.string().optional(),
});

export const studentAttendanceQuerySchema = z.object({
  sessionId: objectIdString.optional(),
  classId: objectIdString.optional(),
  sectionId: objectIdString.optional().nullable(),
  studentId: objectIdString.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export const downloadStudentAttendanceQuerySchema = z.object({
  sessionId: objectIdString.optional(),
  classId: objectIdString.optional(),
  sectionId: objectIdString.optional().nullable(),
  studentId: objectIdString.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Teacher attendance
// ---------------------------------------------------------------------------

export const bulkTeacherAttendanceSchema = z
  .object({
    attendanceDate: isoDateString,
    overwrite: z.boolean().optional().default(false),
    records: z
      .array(
        z.object({
          teacherId: objectIdString,
          status: statusEnum,
        })
      )
      .min(1, 'At least one record is required')
      .max(500, 'Too many records in a single request'),
  })
  .strict();

export const teacherRecordSchema = z.object({ status: statusEnum }).strict();

export const markTeacherSchema = z.object({ attendanceDate: isoDateString }).strict();

export const teacherRangeSchema = z
  .object({
    teacherId: objectIdString,
    from: isoDateString,
    to: isoDateString,
  })
  .strict();

export const teacherAttendanceQuerySchema = z.object({
  teacherId: objectIdString.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});


// ---------------------------------------------------------------------------
// Non-Teaching Staff attendance
// ---------------------------------------------------------------------------

export const bulkNonTeachingStaffAttendanceSchema = z
  .object({
    attendanceDate: isoDateString,
    overwrite: z.boolean().optional().default(false),
    records: z
      .array(
        z.object({
          staffId: objectIdString,
          status: statusEnum,
        })
      )
      .min(1, 'At least one record is required')
      .max(500, 'Too many records in a single request'),
  })
  .strict();

export const nonTeachingStaffRecordSchema = z.object({ status: statusEnum }).strict();

export const nonTeachingStaffAttendanceQuerySchema = z.object({
  staffId: objectIdString.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------

const periodBaseSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(1).max(6),
    periodNumber: z.coerce.number().int().min(1).max(20),
    startTime: timeHHMM,
    endTime: timeHHMM,
    subjectId: objectIdString.nullable().optional(),
    teacherId: objectIdString.nullable().optional(),
    isBreak: z.boolean().optional().default(false),
  })
  .strict();

export const periodSchema = periodBaseSchema.refine(
  (p) => {
    const [sh, sm] = p.startTime.split(':').map(Number);
    const [eh, em] = p.endTime.split(':').map(Number);
    return sh * 60 + sm < eh * 60 + em;
  },
  { message: 'startTime must be earlier than endTime' }
);

export const createTimetableSchema = z
  .object({
    sessionId: objectIdString,
    classId: objectIdString,
    sectionId: objectIdString.nullable().optional(),
    periods: z.array(periodSchema).min(1, 'At least one period is required').max(100),
  })
  .strict();

export const updatePeriodSchema = periodBaseSchema.partial().superRefine((p, ctx) => {
  if (p.startTime && p.endTime) {
    const [sh, sm] = p.startTime.split(':').map(Number);
    const [eh, em] = p.endTime.split(':').map(Number);
    if (sh * 60 + sm >= eh * 60 + em) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'startTime must be earlier than endTime' });
    }
  }
});

export const addPeriodRouteSchema = periodBaseSchema
  .extend({
    sessionId: objectIdString,
    classId: objectIdString,
    sectionId: objectIdString.nullable().optional(),
  })
  .refine(
    (p) => {
      const [sh, sm] = p.startTime.split(':').map(Number);
      const [eh, em] = p.endTime.split(':').map(Number);
      return sh * 60 + sm < eh * 60 + em;
    },
    { message: 'startTime must be earlier than endTime' }
  );

export const removePeriodsSchema = z
  .object({
    periodIds: z.array(objectIdString).min(1, 'At least one periodId is required').max(100),
  })
  .strict();

export const swapSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(1).max(6),
    periodA: z.coerce.number().int().min(1).max(20),
    periodB: z.coerce.number().int().min(1).max(20),
  })
  .strict();

export const swapRouteSchema = swapSchema
  .extend({
    sessionId: objectIdString,
    classId: objectIdString,
    sectionId: objectIdString.nullable().optional(),
  })
  .strict();

export const timetableQuerySchema = z.object({
  sessionId: objectIdString,
  classId: objectIdString.optional(),
  sectionId: objectIdString.nullable().optional(),
  teacherId: objectIdString.optional(),
  dayOfWeek: z.coerce.number().int().min(1).max(6).optional(),
});
