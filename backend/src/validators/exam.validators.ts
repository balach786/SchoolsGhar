import { z } from 'zod';
import { objectIdString, isoDateString } from './attendance.validators';

// ---------------------------------------------------------------------------
// Grade scales (configurable grade boundaries)
// ---------------------------------------------------------------------------

export const gradeBoundarySchema = z
  .object({
    grade: z.string().trim().min(1, 'Grade label is required').max(8),
    minPercentage: z.number().min(0, 'minPercentage cannot be negative').max(100, 'minPercentage cannot exceed 100'),
  })
  .strict();

export const createGradeScaleSchema = z
  .object({
    name: z.string().trim().min(2, 'Scale name must be at least 2 characters').max(80),
    boundaries: z.array(gradeBoundarySchema).min(1, 'At least one grade boundary is required').max(30),
  })
  .strict();

export const updateGradeScaleSchema = createGradeScaleSchema.partial();

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------

export const examSubjectSchema = z
  .object({
    subjectId: objectIdString,
    maxMarks: z.number().int().positive('maxMarks must be positive').max(1000),
    passMarks: z.number().int().min(0).max(1000).optional(),
  })
  .strict()
  .refine((s) => s.passMarks === undefined || s.passMarks <= s.maxMarks, {
    message: 'passMarks cannot exceed maxMarks',
    path: ['passMarks'],
  });

export const createExamSchema = z
  .object({
    name: z.string().trim().min(2, 'Exam name must be at least 2 characters').max(120),
    sessionId: objectIdString,
    classId: objectIdString,
    subjects: z.array(examSubjectSchema).min(1, 'At least one subject is required').max(20),
    gradeScaleId: objectIdString.optional(),
    examDate: isoDateString.optional(),
  })
  .strict();

export const updateExamSchema = createExamSchema.partial();

export const examListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(), // server caps at 100
    sessionId: objectIdString.optional(),
    classId: objectIdString.optional(),
    published: z.enum(['true', 'false']).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

export const bulkMarksSchema = z
  .object({
    examId: objectIdString,
    /** Overwrite entries that already exist for the same student + subject. */
    overwrite: z.boolean().optional().default(false),
    records: z
      .array(
        z.object({
          studentId: objectIdString,
          subjectId: objectIdString,
          marksObtained: z.number().min(0, 'Marks cannot be negative').max(1000).optional().default(0),
          isAbsent: z.boolean().optional().default(false),
        })
      )
      .min(1, 'At least one mark record is required')
      .max(500, 'Too many records in a single request'),
  })
  .strict();

export const updateMarkSchema = z
  .object({
    marksObtained: z.number().min(0, 'Marks cannot be negative').max(1000).optional(),
    isAbsent: z.boolean().optional(),
  })
  .strict();

export const marksListQuerySchema = z
  .object({
    examId: objectIdString,
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    studentId: objectIdString.optional(),
    subjectId: objectIdString.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export const resultQuerySchema = z
  .object({
    examId: objectIdString,
    studentId: objectIdString.optional(),
  })
  .strict();
