import { z } from 'zod';

// ── Shared ───────────────────────────────────────────────
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format');
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
const optionalUrl = z.string().url('Must be a valid URL').max(500).optional().or(z.literal(''));
const optionalEmail = z.string().trim().toLowerCase().email('Invalid email').max(120).optional().or(z.literal(''));
const optionalPhone = z.string().trim().max(24).optional().or(z.literal(''));

export const fileRefSchema = z.object({
  name: z.string().trim().min(1, 'File name required').max(120),
  fileUrl: z.string().url('Must be a valid URL').max(500),
  mimeType: z.string().max(80).optional(),
  fileSize: z.number().int().min(0).max(50 * 1024 * 1024).optional(),
  storageKey: z.string().max(200).optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(), // validation bound; server caps at 100
  search: z.string().trim().max(80).optional(),
  sessionId: objectId.optional(),
  classId: objectId.optional(),
  sectionId: objectId.optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  sort: z.string().trim().max(30).optional(),
});

// ── Academic sessions ────────────────────────────────────
export const createSessionSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(40),
  startDate: isoDate,
  endDate: isoDate,
  makeActive: z.boolean().optional(),
});
export const updateSessionSchema = z.object({
  name: z.string().trim().min(3).max(40).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
});

// ── Classes ──────────────────────────────────────────────
export const createClassSchema = z.object({
  name: z.string().trim().min(1, 'Class name required').max(60),
  code: z.string().trim().max(20).optional().or(z.literal('')),
  sessionId: objectId,

});
export const updateClassSchema = createClassSchema.partial();

// ── Sections ─────────────────────────────────────────────
export const createSectionSchema = z.object({
  name: z.string().trim().min(1, 'Section name required').max(20),
  classId: objectId,
});
export const updateSectionSchema = z.object({
  name: z.string().trim().min(1).max(20).optional(),
  classId: objectId.optional(),
});

// ── Subjects ─────────────────────────────────────────────
export const createSubjectSchema = z.object({
  name: z.string().trim().min(2, 'Subject name must be at least 2 characters').max(80),
  code: z.string().trim().min(1, 'Subject code required').max(20),
  sessionId: objectId,
  classIds: z.array(objectId).max(40).optional().default([]),
});
export const updateSubjectSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  code: z.string().trim().min(1).max(20).optional(),
  classIds: z.array(objectId).max(40).optional(),
  isActive: z.boolean().optional(),
});

// ── Students ─────────────────────────────────────────────
export const createStudentSchemaBase = z.object({
  admissionNumber: z.string().trim().max(24).optional().or(z.literal('')),
  rollNumber: z.string().trim().max(12).optional().or(z.literal('')),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(80),
  profilePhotoUrl: optionalUrl,
  gender: z.enum(['male', 'female']),
  dateOfBirth: isoDate,
  email: optionalEmail,
  phone: optionalPhone,
  fatherName: z.string().trim().min(2, 'Father name is required for new admissions (min 2 chars)').max(80),
  caste: z.string().trim().max(60).optional().or(z.literal('')),
  guardianName: z.string().trim().min(2, 'Guardian name required').max(80),
  guardianPhone: optionalPhone,
  guardianRelationship: z.string().trim().max(30).optional().or(z.literal('')),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  admissionDate: isoDate,
  previousSchool: z.string().trim().max(100).optional().or(z.literal('')),
  sessionId: objectId,
  classId: objectId,
  sectionId: objectId.optional().nullable(),
  userId: objectId.optional().nullable(),
  documents: z.array(fileRefSchema).max(20).optional().default([]),
  confirmDuplicate: z.boolean().optional(),
  isAutoAdmissionNumber: z.boolean().optional(),
});

export const createStudentSchema = createStudentSchemaBase;

export const updateStudentSchema = createStudentSchemaBase.partial();

export const listStudentsQuerySchema = listQuerySchema.extend({
  gender: z.enum(['male', 'female']).optional(),
  admissionFrom: isoDate.optional(),
  admissionTo: isoDate.optional(),
  sort: z.enum(['fullName', '-fullName', 'admissionDate', '-admissionDate', 'rollNumber', '-rollNumber', 'createdAt', '-createdAt']).optional(),
});

// ── Teachers ─────────────────────────────────────────────
export const createTeacherSchema = z.object({
  employeeId: z.string().trim().min(1, 'Employee ID required').max(20),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(80),
  fatherName: z.string().trim().min(2, 'Father name must be at least 2 characters').max(80),
  caste: z.string().trim().min(2, 'Caste must be at least 2 characters').max(80),
  profilePhotoUrl: optionalUrl,
  email: optionalEmail,
  phone: optionalPhone,
  qualification: z.string().trim().max(120).optional().or(z.literal('')),
  joiningDate: isoDate,

  salary: z.number().int().min(0, 'Salary cannot be negative').max(1_000_000_000).optional().default(0),
  userId: objectId.optional().nullable(),
  documents: z.array(fileRefSchema).max(20).optional().default([]),
  createLogin: z.boolean().optional(),
});
export const updateTeacherSchema = createTeacherSchema.partial();

export const listTeachersQuerySchema = listQuerySchema.extend({
  subjectId: objectId.optional(),
  sort: z.enum(['fullName', '-fullName', 'joiningDate', '-joiningDate', 'createdAt', '-createdAt']).optional(),
});

// ── Promotion ────────────────────────────────────────────
export const promotionPreviewQuerySchema = z.object({
  sessionId: objectId,
  classId: objectId,
  sectionId: objectId.optional().or(z.literal('')).transform((v) => v || null),
  toSessionId: objectId,
  toClassId: objectId,
  toSectionId: objectId.optional().or(z.literal('')).transform((v) => v || null),
});

export const promotionSchema = z.object({
  source: z.object({
    sessionId: objectId,
    classId: objectId,
    sectionId: objectId.nullable().optional().transform((v) => v || null),
  }),
  destination: z.object({
    sessionId: objectId,
    classId: objectId,
    sectionId: objectId.nullable().optional().transform((v) => v || null),
  }),
  studentIds: z.array(objectId).max(500).optional().default([]),
});

export function parseDateOrThrow(value: string, field: string): Date {
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`${field} is invalid`);
  return d;
}
