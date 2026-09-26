import { getTenantModels } from '../services/TenantModelRegistry';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import { ok, created, paginated } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { parsePagination } from '../utils/query';
import { Student, publicStudent } from '../models/Student';
import { AcademicSession } from '../models/AcademicSession';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { StudentHistory, publicHistory } from '../models/StudentHistory';
import { StudentFee } from '../models/StudentFee';
import { ReceiptCounter } from '../models/ReceiptCounter';
import { requireSession, requireClass, requireSectionOfClass, requireUserLink, withUserLinkLock } from '../services/academic.service';
import { getOwnStudent, getSchoolTodayISO } from '../services/attendance.service';
import { generateAdmissionNumber } from '../utils/id';
import { parseDateOrThrow } from '../validators/academic.validators';
import { recordAudit } from '../services/audit.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';
import { ensureApplicableMonthlyInvoiceForStudent } from '../services/feeManagement.service';

/** Resolve the class/section/session for display (compact maps). */
async function resolveContext(tenantDb: mongoose.Connection, students: { sessionId: unknown; classId: unknown; sectionId?: unknown }[]) {
  const sessionIds = Array.from(new Set(students.map((s) => String(s.sessionId)).filter(Boolean)));
  const classIds = Array.from(new Set(students.map((s) => String(s.classId)).filter(Boolean)));
  const sectionIds = Array.from(new Set(students.map((s) => (s.sectionId ? String(s.sectionId) : null)).filter(Boolean)));
  const { AcademicSession, Class, Section } = getTenantModels(tenantDb);
  const [sessions, classes, sections] = await Promise.all([
    AcademicSession.find({ _id: { $in: sessionIds } }).select('name').lean(),
    Class.find({ _id: { $in: classIds } }).select('name code').lean(),
    Section.find({ _id: { $in: sectionIds } }).select('name').lean(),
  ]);
  return {
    session: new Map(sessions.map((s) => [String(s._id), s.name])),
    class: new Map(classes.map((c) => [String(c._id), c.name])),
    section: new Map(sections.map((s) => [String(s._id), s.name])),
  };
}

/** Validate roll-number uniqueness within class+section+session (application level). */
async function assertRollNumberFree(
  tenantDb: mongoose.Connection,
  rollNumber: string,
  sessionId: string,
  classId: string,
  sectionId?: string,
  tenantId?: unknown,
  excludeStudentId?: string
) {
  const { Student } = getTenantModels(tenantDb);
  if (!rollNumber) return;
  const q: Record<string, unknown> = {
    rollNumber,
    sessionId,
    classId,
    sectionId: sectionId ? sectionId : { $in: [null, undefined] },
    isArchived: false,
  };
  if (tenantId) q.tenantId = tenantId;
  if (excludeStudentId) q._id = { $ne: excludeStudentId };
  const existing = await Student.findOne(q).select('_id').lean();
  if (existing) {
    const loc = sectionId ? 'this class/section' : 'this class';
    throw ApiError.conflict(`Roll number ${rollNumber} is already taken in ${loc}`, 'ROLL_NUMBER_TAKEN');
  }
}

/** GET /api/students — paginated, searchable, filterable list. */
export const listStudents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Student } = getTenantModels(tenantDb);

  const { page, limit } = parsePagination(req.query);
  const { search, sessionId, classId, sectionId, gender, status, admissionFrom, admissionTo, sort } =
    req.query as Record<string, string | undefined>;

  let filter: Record<string, unknown> = {};
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { fullName: { $regex: escaped, $options: 'i' } },
      { fatherName: { $regex: escaped, $options: 'i' } },
      { caste: { $regex: escaped, $options: 'i' } },
      { admissionNumber: { $regex: escaped, $options: 'i' } },
      { rollNumber: { $regex: escaped, $options: 'i' } },
      { guardianName: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
      { guardianPhone: { $regex: escaped, $options: 'i' } },
    ];
  }
  if (sessionId) {
    filter.sessionId = mongoose.Types.ObjectId.isValid(sessionId) ? new mongoose.Types.ObjectId(sessionId) : sessionId;
  }
  if (classId) {
    filter.classId = mongoose.Types.ObjectId.isValid(classId) ? new mongoose.Types.ObjectId(classId) : classId;
  }
  if (sectionId) {
    filter.sectionId = mongoose.Types.ObjectId.isValid(sectionId) ? new mongoose.Types.ObjectId(sectionId) : sectionId;
  }
  if (gender) filter.gender = gender;
  if (status === 'active') {
    filter.isActive = true;
    filter.isArchived = false;
  } else if (status === 'inactive') {
    filter.isActive = false;
    filter.isArchived = false;
  } else if (status === 'archived') {
    filter.isArchived = true;
  } else {
    filter.isArchived = false;
  }
  if (admissionFrom || admissionTo) {
    const range: Record<string, Date> = {};
    if (admissionFrom) range.$gte = parseDateOrThrow(admissionFrom, 'admissionFrom');
    if (admissionTo) range.$lte = parseDateOrThrow(admissionTo, 'admissionTo');
    filter.admissionDate = range;
  }

  // Scope to authenticated tenant
  filter = scopeQuery(req, filter);

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    fullName: { fullName: 1 },
    '-fullName': { fullName: -1 },
    admissionDate: { admissionDate: -1 },
    '-admissionDate': { admissionDate: 1 },
    rollNumber: { rollNumber: 1 },
    '-rollNumber': { rollNumber: -1 },
    createdAt: { createdAt: -1 },
    '-createdAt': { createdAt: 1 },
  };
  const sortSpec = sortMap[sort ?? ''] ?? { createdAt: -1 };

  const aggMatch: Record<string, any> = { ...filter };
  if (aggMatch.tenantId && typeof aggMatch.tenantId === 'string' && mongoose.Types.ObjectId.isValid(aggMatch.tenantId)) {
    aggMatch.tenantId = new mongoose.Types.ObjectId(aggMatch.tenantId);
  }

  const skip = (page - 1) * limit;
  const [docs, total, summaryAgg] = await Promise.all([
    Student.find(filter).sort(sortSpec).skip(skip).limit(limit).lean(),
    Student.countDocuments(filter),
    Student.aggregate([
      { $match: aggMatch },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $and: [{ $eq: ['$isActive', true] }, { $eq: ['$isArchived', false] }] }, 1, 0] } },
          male: { $sum: { $cond: [{ $eq: ['$gender', 'male'] }, 1, 0] } },
          female: { $sum: { $cond: [{ $eq: ['$gender', 'female'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const summaryDoc = summaryAgg[0] || { total: 0, active: 0, male: 0, female: 0 };
  const summary = {
    total: summaryDoc.total || 0,
    active: summaryDoc.active || 0,
    male: summaryDoc.male || 0,
    female: summaryDoc.female || 0,
  };

  const ctx = await resolveContext(req.tenantDb!, docs);
  const data = docs.map((d) => ({
    ...publicStudent(d as never),
    sessionName: ctx.session.get(String(d.sessionId)) ?? '—',
    className: ctx.class.get(String(d.classId)) ?? '—',
    sectionName: d.sectionId ? (ctx.section.get(String(d.sectionId)) ?? '—') : '—',
  }));
  paginated(res, { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 }, summary });
});

/** GET /api/students/:id — full profile incl. academic history. */
export const getStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Student, StudentHistory } = getTenantModels(tenantDb);

  const student = await Student.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!student) throw ApiError.notFound('Student not found');

  const [ctx, history] = await Promise.all([
    resolveContext(req.tenantDb!, [student]),
    StudentHistory.find(scopeQuery(req, { studentId: student._id })).sort({ eventDate: -1, date: -1 }).lean(),
  ]);

  // Resolve history context
  const histSessionIds = Array.from(new Set(history.map((h) => String(h.sessionId)).filter(Boolean)));
  const histClassIds = Array.from(new Set(history.map((h) => String(h.classId)).filter(Boolean)));
  const histSectionIds = Array.from(new Set(history.map((h) => (h.sectionId ? String(h.sectionId) : null)).filter(Boolean)));
  const { AcademicSession, Class, Section } = getTenantModels(tenantDb);
  const [sessions, classes, sections] = await Promise.all([
    AcademicSession.find({ _id: { $in: histSessionIds } }).select('name').lean(),
    Class.find({ _id: { $in: histClassIds } }).select('name').lean(),
    Section.find({ _id: { $in: histSectionIds } }).select('name').lean(),
  ]);
  const sMap = new Map(sessions.map((x) => [String(x._id), x.name]));
  const cMap = new Map(classes.map((x) => [String(x._id), x.name]));
  const secMap = new Map(sections.map((x) => [String(x._id), x.name]));

  ok(res, {
    ...publicStudent(student),
    sessionName: ctx.session.get(String(student.sessionId)) ?? '—',
    className: ctx.class.get(String(student.classId)) ?? '—',
    sectionName: student.sectionId ? (ctx.section.get(String(student.sectionId)) ?? '—') : '—',
    history: history.map((h) => ({
      ...publicHistory(h as never),
      sessionName: sMap.get(String(h.sessionId)) ?? '—',
      className: cMap.get(String(h.classId)) ?? '—',
      sectionName: h.sectionId ? (secMap.get(String(h.sectionId)) ?? '—') : '—',
    })),
  });
});

/** GET /api/students/suggested-admission-number — non-destructive next safe admission number suggestion */
export const getSuggestedAdmissionNumber = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Section, AcademicSession, Staff, Subject, Student, StudentHistory, ReceiptCounter, Role, User } = getTenantModels(tenantDb);
  const tenantId = getTenantObjectId(req);
  const schoolToday = getSchoolTodayISO();
  const year = parseInt(schoolToday.slice(0, 4), 10) || new Date().getFullYear();

  const counterKey = `${String(tenantId)}:ADM-${year}`;
  const counterDoc = await ReceiptCounter.findById(counterKey).lean();

  const pattern = new RegExp(`^ADM-${year}-(\\d+)$`);
  const existingMatches = await Student.find(scopeQuery(req, { admissionNumber: pattern }))
    .select('admissionNumber')
    .lean();

  let maxSeq = counterDoc?.seq || 0;
  for (const s of existingMatches) {
    const m = s.admissionNumber.match(pattern);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!isNaN(num) && num > maxSeq) maxSeq = num;
    }
  }

  let candidateSeq = maxSeq + 1;
  let candidate = generateAdmissionNumber(year, candidateSeq);
  while (await Student.exists(scopeQuery(req, { admissionNumber: candidate }))) {
    candidateSeq++;
    candidate = generateAdmissionNumber(year, candidateSeq);
  }

  ok(res, { suggestedAdmissionNumber: candidate, year, nextSequence: candidateSeq });
});

/** POST /api/students — admission. */
export const createStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Section, AcademicSession, Staff, Subject, Student, StudentHistory, ReceiptCounter, Role, User } = getTenantModels(tenantDb);
  const body = req.body as Record<string, unknown>;
  const tenantId = getTenantObjectId(req);

  const session = await requireSession(String(body.sessionId), false, tenantId, undefined, tenantDb);
  const cls = await requireClass(String(body.classId), tenantId, undefined, tenantDb);

  if (String(cls.sessionId) !== String(session._id)) {
    throw ApiError.badRequest(
      'Class does not belong to the selected session',
      'INVALID_CLASS_SESSION'
    );
  }

  let section: any = null;
  if (body.sectionId) {
    section = await requireSectionOfClass(String(body.sectionId), String(cls._id), tenantId, undefined, tenantDb);
    if (String(section.sessionId) !== String(session._id)) {
      throw ApiError.badRequest('Section does not belong to the selected session', 'INVALID_SECTION_SESSION');
    }
  }

  const schoolToday = getSchoolTodayISO();
  const defaultYear = parseInt(schoolToday.slice(0, 4), 10) || new Date().getFullYear();

  const isAutoAdmissionNumber = body.isAutoAdmissionNumber === true || body.isAutoAdmissionNumber === 'true' || !String(body.admissionNumber ?? '').trim();
  let admissionNumber = String(body.admissionNumber ?? '').trim();
  const counterKey = `${String(tenantId)}:ADM-${defaultYear}`;

  if (isAutoAdmissionNumber) {
    // If an auto-suggested number was provided and is still free, use it.
    // Otherwise (if blank or taken by a concurrent receptionist), allocate the next atomic sequence.
    let needsAllocation = !admissionNumber;
    if (admissionNumber) {
      const dupFilter: Record<string, unknown> = { admissionNumber };
      if (tenantId) dupFilter.tenantId = tenantId;
      const exists = await Student.findOne(dupFilter).select('_id').lean();
      if (exists) {
        needsAllocation = true;
      }
    }

    if (needsAllocation) {
      let allocated = false;
      while (!allocated) {
        const counter = await ReceiptCounter.findOneAndUpdate(
          { _id: counterKey },
          { $inc: { seq: 1 } },
          { upsert: true, new: true }
        );
        const cand = generateAdmissionNumber(defaultYear, counter.seq);
        const exists = await Student.findOne({ tenantId, admissionNumber: cand }).select('_id').lean();
        if (!exists) {
          admissionNumber = cand;
          allocated = true;
        }
      }
    } else {
      // Auto-suggested number was still free, advance counter so future auto-generations stay ahead
      const admMatch = admissionNumber.match(/^ADM-(\d{4})-(\d+)$/);
      if (admMatch && tenantId) {
        const admSeq = parseInt(admMatch[2], 10);
        if (!isNaN(admSeq) && admSeq > 0) {
          await ReceiptCounter.findOneAndUpdate(
            { _id: counterKey },
            { $max: { seq: admSeq } },
            { upsert: true }
          );
        }
      }
    }
  } else {
    // User manually entered/edited an admission number -> validate uniqueness strictly
    const dupFilter: Record<string, unknown> = { admissionNumber };
    if (tenantId) dupFilter.tenantId = tenantId;
    const dupAdmission = await Student.findOne(dupFilter).select('_id').lean();
    if (dupAdmission) throw ApiError.conflict('Admission number already exists in this school', 'ADMISSION_NUMBER_TAKEN');

    // If manual entry matches standard pattern, sync counter upward
    const admMatch = admissionNumber.match(/^ADM-(\d{4})-(\d+)$/);
    if (admMatch && tenantId) {
      const admYear = parseInt(admMatch[1], 10);
      const admSeq = parseInt(admMatch[2], 10);
      if (!isNaN(admSeq) && admSeq > 0) {
        await ReceiptCounter.findOneAndUpdate(
          { _id: `${String(tenantId)}:ADM-${admYear}` },
          { $max: { seq: admSeq } },
          { upsert: true }
        );
      }
    }
  }

  await assertRollNumberFree(tenantDb, 
    String(body.rollNumber ?? ''),
    String(session._id),
    String(cls._id),
    section ? String(section._id) : undefined,
    tenantId
  );

  const admissionDate = parseDateOrThrow(String(body.admissionDate), 'Admission date');
  const dateOfBirth = parseDateOrThrow(String(body.dateOfBirth), 'Date of birth');
  if (dateOfBirth >= new Date()) throw ApiError.badRequest('Date of birth must be in the past');

  // Non-blocking possible duplicate student check (full name + date of birth)
  const confirmDuplicate = body.confirmDuplicate === true || body.confirmDuplicate === 'true';
  if (!confirmDuplicate) {
    const escapedName = String(body.fullName).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const possibleDup = await Student.findOne(scopeQuery(req, {
      isArchived: false,
      fullName: { $regex: `^${escapedName}$`, $options: 'i' },
      dateOfBirth,
    })).select('fullName admissionNumber rollNumber').lean();

    if (possibleDup) {
      throw ApiError.badRequest(
        `A student named "${possibleDup.fullName}" with the same date of birth already exists (${possibleDup.admissionNumber}). Confirm to proceed.`,
        'POSSIBLE_DUPLICATE_STUDENT',
        { existingStudent: possibleDup }
      );
    }
  }

  let student: any;
  let attempts = 0;
  const maxAttempts = isAutoAdmissionNumber ? 5 : 1;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      await withUserLinkLock(body.userId as string | null | undefined, tenantDb, async (mongoSession) => {
        let validatedUserId: mongoose.Types.ObjectId | undefined = undefined;
        if (body.userId) {
          validatedUserId = await requireUserLink(body.userId as string, 'student', undefined, tenantId, mongoSession, tenantDb);
        }

        if (mongoSession) {
          const createdStudents = await Student.create([{
            ...body,
            tenantId,
            admissionNumber,
            rollNumber: String(body.rollNumber ?? ''),
            admissionDate,
            dateOfBirth,
            sessionId: session._id,
            classId: cls._id,
            sectionId: section?._id || undefined,
            userId: validatedUserId,
            email: body.email || undefined,
            phone: body.phone || undefined,
            documents: body.documents ?? [],
          }], { session: mongoSession });
          student = createdStudents[0];

          await StudentHistory.create([{
            tenantId,
            studentId: student._id,
            sessionId: session._id,
            classId: cls._id,
            sectionId: section?._id || undefined,
            status: 'admitted',
            eventDate: admissionDate || new Date(),
            date: admissionDate || new Date(),
            recordedBy: req.user?._id,
          }], { session: mongoSession });
        } else {
          student = await Student.create({
            ...body,
            tenantId,
            admissionNumber,
            rollNumber: String(body.rollNumber ?? ''),
            admissionDate,
            dateOfBirth,
            sessionId: session._id,
            classId: cls._id,
            sectionId: section?._id || undefined,
            userId: validatedUserId,
            email: body.email || undefined,
            phone: body.phone || undefined,
            documents: body.documents ?? [],
          });
          await StudentHistory.create({
            tenantId,
            studentId: student._id,
            sessionId: session._id,
            classId: cls._id,
            sectionId: section?._id || undefined,
            status: 'admitted',
            eventDate: admissionDate || new Date(),
            date: admissionDate || new Date(),
            recordedBy: req.user?._id,
          });
        }
      });
      break;
    } catch (err: any) {
      if (err?.code === 11000) {
        if (err.message.includes('admissionNumber') && isAutoAdmissionNumber && attempts < maxAttempts) {
          // Concurrently claimed by another process during insert; atomically allocate next sequence and retry
          const counter = await ReceiptCounter.findOneAndUpdate(
            { _id: counterKey },
            { $inc: { seq: 1 } },
            { upsert: true, new: true }
          );
          admissionNumber = generateAdmissionNumber(defaultYear, counter.seq);
          continue;
        }
        if (err.message.includes('admissionNumber')) throw ApiError.conflict('Admission number already exists in this school', 'ADMISSION_NUMBER_TAKEN');
        if (err.message.includes('rollNumber')) throw ApiError.conflict('Roll number is already taken', 'ROLL_NUMBER_TAKEN');
        if (err.message.includes('userId')) throw ApiError.conflict('This user account is already linked to another student', 'USER_ALREADY_LINKED');
      }
      throw err;
    }
  }

  recordAudit('students', 'STUDENT_CREATED', req.user, String(student._id), {
    admissionNumber: student.admissionNumber,
  });

  // Safely auto-generate applicable monthly fee invoice if the structure already exists
  await ensureApplicableMonthlyInvoiceForStudent(
    req.user!,
    {
      tenantId: tenantId!,
      studentId: student._id,
      sessionId: session._id,
      classId: cls._id,
    },
    tenantDb
  ).catch(e => console.error(`Background fee generation failed for new student ${student._id}`, e));

  created(res, publicStudent(student));
});

/** PATCH /api/students/:id */
export const updateStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Section, AcademicSession, Staff, Subject, Student, StudentHistory, ReceiptCounter, Role, User } = getTenantModels(tenantDb);
  const tenantId = getTenantObjectId(req);
  const student = await Student.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!student) throw ApiError.notFound('Student not found');
  if (student.isArchived) throw ApiError.badRequest('Archived students cannot be edited');

  const body = req.body as Record<string, unknown>;

  const prevSessionId = String(student.sessionId);
  const prevClassId = String(student.classId);
  const prevSectionId = student.sectionId ? String(student.sectionId) : undefined;

  const finalSessionId = String(body.sessionId ?? student.sessionId);
  const finalClassId = String(body.classId ?? student.classId);

  let finalSectionId: string | undefined = undefined;
  if (body.sectionId !== undefined) {
    if (body.sectionId) {
      finalSectionId = String(body.sectionId);
    } else {
      finalSectionId = undefined;
    }
  } else {
    finalSectionId = student.sectionId ? String(student.sectionId) : undefined;
  }

  // Final validation
  const session = await requireSession(finalSessionId, false, tenantId, undefined, tenantDb);
  const cls = await requireClass(finalClassId, tenantId, undefined, tenantDb);
  
  if (String(cls.sessionId) !== String(session._id)) {
    throw ApiError.badRequest('Class does not belong to the selected session', 'INVALID_CLASS_SESSION');
  }

  if (finalSectionId) {
    const section = await requireSectionOfClass(finalSectionId, finalClassId, tenantId, undefined, tenantDb);
    if (String(section.sessionId) !== String(session._id)) {
      throw ApiError.badRequest('Section does not belong to the selected session', 'INVALID_SECTION_SESSION');
    }
  }

  if (body.admissionNumber !== undefined && body.admissionNumber !== student.admissionNumber) {
    const dupFilter: Record<string, unknown> = {
      admissionNumber: String(body.admissionNumber),
      _id: { $ne: student._id },
    };
    if (tenantId) dupFilter.tenantId = tenantId;
    const dup = await Student.findOne(dupFilter);
    if (dup) throw ApiError.conflict('Admission number already exists in this school', 'ADMISSION_NUMBER_TAKEN');
  }

  const finalRollNumber = body.rollNumber !== undefined ? String(body.rollNumber) : String(student.rollNumber || '');
  const rollChanged = finalRollNumber !== String(student.rollNumber || '');
  const sessionChanged = finalSessionId !== String(student.sessionId);
  const classChanged = finalClassId !== String(student.classId);
  const sectionChanged = finalSectionId !== (student.sectionId ? String(student.sectionId) : undefined);

  if (rollChanged || sessionChanged || classChanged || sectionChanged) {
    await assertRollNumberFree(req.tenantDb!, finalRollNumber, finalSessionId, finalClassId, finalSectionId, tenantId, String(student._id));
  }

  const updates: Record<string, unknown> = { ...body };
  if (body.dateOfBirth) {
    const parsedDob = parseDateOrThrow(String(body.dateOfBirth), 'Date of birth');
    if (parsedDob >= new Date()) throw ApiError.badRequest('Date of birth must be in the past');
    updates.dateOfBirth = parsedDob;
  }
  if (body.admissionDate) updates.admissionDate = parseDateOrThrow(String(body.admissionDate), 'Admission date');
  updates.email = body.email || undefined;
  updates.phone = body.phone || undefined;
  let unsetUserId = false;
  let unsetSectionId = false;

  try {
    await withUserLinkLock(body.userId as string | null | undefined, tenantDb, async (mongoSession) => {
      if (body.userId !== undefined) {
        if (body.userId === null || body.userId === '') {
          delete updates.userId;
          unsetUserId = true;
        } else {
          updates.userId = await requireUserLink(body.userId as string, 'student', String(student._id), tenantId, mongoSession, tenantDb);
        }
      }

      if (body.sectionId !== undefined) {
        if (body.sectionId === null || body.sectionId === '') {
          delete updates.sectionId;
          unsetSectionId = true;
        }
      }

      Object.assign(student, updates);
      if (unsetUserId) student.set('userId', undefined);
      if (unsetSectionId) student.set('sectionId', undefined);

      // Record academic history if placement changed
      const newSessionId = finalSessionId;
      const newClassId = finalClassId;
      const newSectionId = finalSectionId;
      const academicChanged = sessionChanged || classChanged || sectionChanged;

      if (academicChanged) {
        let historyStatus: 'class_changed' | 'section_changed' | 'transferred' = 'class_changed';
        if (prevSessionId !== newSessionId) {
          historyStatus = 'transferred';
        } else if (prevClassId !== newClassId) {
          historyStatus = 'class_changed';
        } else if (prevSectionId !== newSectionId) {
          historyStatus = 'section_changed';
        }

        if (mongoSession) {
          await student.save({ session: mongoSession });
          await StudentHistory.create([{
            tenantId,
            studentId: student._id,
            sessionId: newSessionId,
            classId: newClassId,
            sectionId: newSectionId || undefined,
            previousClassId: prevClassId,
            previousSectionId: prevSectionId,
            status: historyStatus,
            eventDate: new Date(),
            date: new Date(),
            recordedBy: req.user?._id,
            remarks: 'Academic placement updated via student profile edit.',
          }], { session: mongoSession });
        } else {
          await student.save();
          await StudentHistory.create({
            tenantId,
            studentId: student._id,
            sessionId: newSessionId,
            classId: newClassId,
            sectionId: newSectionId || undefined,
            previousClassId: prevClassId,
            previousSectionId: prevSectionId,
            status: historyStatus,
            eventDate: new Date(),
            date: new Date(),
            recordedBy: req.user?._id,
            remarks: 'Academic placement updated via student profile edit.',
          });
        }
      } else {
        if (mongoSession) {
          await student.save({ session: mongoSession });
        } else {
          await student.save();
        }
      }
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      if (err.message.includes('admissionNumber')) throw ApiError.conflict('Admission number already exists in this school', 'ADMISSION_NUMBER_TAKEN');
      if (err.message.includes('rollNumber')) throw ApiError.conflict('Roll number is already taken', 'ROLL_NUMBER_TAKEN');
      if (err.message.includes('userId')) throw ApiError.conflict('This user account is already linked to another student', 'USER_ALREADY_LINKED');
    }
    throw err;
  }

  recordAudit('students', 'STUDENT_UPDATED', req.user, String(student._id), {
    admissionNumber: student.admissionNumber,
  });
  ok(res, publicStudent(student));
});

/** POST /api/students/:id/archive | /restore */
export const archiveStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Section, AcademicSession, Staff, Subject, Student, StudentHistory, ReceiptCounter, Role, User, StudentFee } = getTenantModels(tenantDb);
  const restore = req.path.endsWith('/restore');
  const student = await Student.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!student) throw ApiError.notFound('Student not found');
  const tenantIdObj = getTenantObjectId(req);

  if (!restore && !student.isArchived) {
    const dues = await StudentFee.aggregate([
      {
        $match: {
          tenantId: tenantIdObj,
          studentId: student._id,
          status: { $in: ['unpaid', 'partial'] },
          remainingBalance: { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: '$remainingBalance' } } },
    ]);
    const pendingBalancePaisa = dues[0]?.total || 0;
    const confirmWithDues = req.body?.confirmWithDues === true || req.body?.confirmWithDues === 'true';
    if (pendingBalancePaisa > 0 && !confirmWithDues) {
      const amountRs = (pendingBalancePaisa / 100).toLocaleString('en-PK');
      throw ApiError.badRequest(
        `Student has outstanding fee balance of Rs ${amountRs}. Explicit confirmation required to archive.`,
        'STUDENT_HAS_PENDING_DUES',
        { pendingBalancePaisa, pendingBalanceRs: amountRs }
      );
    }
  }

  student.isArchived = !restore;
  if (student.isArchived) {
    student.isActive = false;
    await student.save();
  } else if (restore) {
    let finalSessionId = String(student.sessionId);
    let finalClassId = String(student.classId);
    let finalSectionId = student.sectionId ? String(student.sectionId) : undefined;
    let finalRollNumber = String(student.rollNumber || '');
    let overrideApplied = false;

    if (req.body?.sessionId !== undefined) { finalSessionId = String(req.body.sessionId); overrideApplied = true; }
    if (req.body?.classId !== undefined) { finalClassId = String(req.body.classId); overrideApplied = true; }
    if (req.body?.sectionId !== undefined) { finalSectionId = req.body.sectionId ? String(req.body.sectionId) : undefined; overrideApplied = true; }
    if (req.body?.rollNumber !== undefined) { finalRollNumber = String(req.body.rollNumber); overrideApplied = true; }

    const session = await requireSession(finalSessionId, false, tenantIdObj, undefined, tenantDb).catch(() => null);
    if (!session) throw ApiError.badRequest('Cannot restore student: Academic context is invalid or archived.', 'RESTORE_INVALID_ACADEMIC_CONTEXT');
    
    const cls = await requireClass(finalClassId, tenantIdObj, undefined, tenantDb).catch(() => null);
    if (!cls || String(cls.sessionId) !== finalSessionId) throw ApiError.badRequest('Cannot restore student: Academic context is invalid or archived.', 'RESTORE_INVALID_ACADEMIC_CONTEXT');
    
    if (finalSectionId) {
      const sec = await requireSectionOfClass(finalSectionId, finalClassId, tenantIdObj, undefined, tenantDb).catch(() => null);
      if (!sec || String(sec.sessionId) !== finalSessionId) throw ApiError.badRequest('Cannot restore student: Academic context is invalid or archived.', 'RESTORE_INVALID_ACADEMIC_CONTEXT');
    }

    const prevClassId = String(student.classId);
    const prevSectionId = student.sectionId ? String(student.sectionId) : undefined;

    if (overrideApplied) {
      await assertRollNumberFree(tenantDb, finalRollNumber, finalSessionId, finalClassId, finalSectionId, tenantIdObj, String(student._id));
      student.sessionId = new mongoose.Types.ObjectId(finalSessionId);
      student.classId = new mongoose.Types.ObjectId(finalClassId);
      student.sectionId = finalSectionId ? new mongoose.Types.ObjectId(finalSectionId) : undefined;
      student.rollNumber = finalRollNumber;
    }
    
    student.isActive = true;

    try {
      if (overrideApplied) {
        const mongoSession = await mongoose.startSession();
        try {
          await mongoSession.withTransaction(async () => {
            await student.save({ session: mongoSession });
            await StudentHistory.create([{
              tenantId: tenantIdObj,
              studentId: student._id,
              sessionId: finalSessionId,
              classId: finalClassId,
              sectionId: finalSectionId,
              previousClassId: prevClassId,
              previousSectionId: prevSectionId,
              status: 're_admitted',
              eventDate: new Date(),
              date: new Date(),
              recordedBy: req.user?._id,
              remarks: 'Restored and relocated to new academic context.',
            }], { session: mongoSession });
          });
        } catch (err: any) {
          if (err?.message?.includes('does not support retryable writes') || err?.message?.includes('Transactions are not supported')) {
            await student.save();
            await StudentHistory.create({
              tenantId: tenantIdObj,
              studentId: student._id,
              sessionId: finalSessionId,
              classId: finalClassId,
              sectionId: finalSectionId,
              previousClassId: prevClassId,
              previousSectionId: prevSectionId,
              status: 're_admitted',
              eventDate: new Date(),
              date: new Date(),
              recordedBy: req.user?._id,
              remarks: 'Restored and relocated to new academic context.',
            });
          } else throw err;
        } finally {
          await mongoSession.endSession();
        }
      } else {
        await student.save();
      }
    } catch (err: any) {
      if (err?.code === 11000) {
        if (err.message.includes('rollNumber')) throw ApiError.conflict('Roll number is already taken', 'ROLL_NUMBER_TAKEN');
        if (err.message.includes('admissionNumber')) throw ApiError.conflict('Admission number already exists in this school', 'ADMISSION_NUMBER_TAKEN');
        if (err.message.includes('userId')) throw ApiError.conflict('This user account is already linked to another student', 'USER_ALREADY_LINKED');
      }
      throw err;
    }
  }
  recordAudit('students', restore ? 'STUDENT_RESTORED' : 'STUDENT_ARCHIVED', req.user, String(student._id), {
    admissionNumber: student.admissionNumber,
  });
  ok(res, publicStudent(student));
});

/** GET /api/students/:id/history — academic history. */
export const studentHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Student, StudentHistory } = getTenantModels(tenantDb);
  const student = await Student.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!student) throw ApiError.notFound('Student not found');
  const history = await StudentHistory.find(scopeQuery(req, { studentId: student._id })).sort({ date: -1 }).lean();
  ok(res, history.map((h) => publicHistory(h as never)));
});

/** GET /api/students/me — the signed-in student's own profile (self-service). */
export const getOwnProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const student = await getOwnStudent(req.user as never, tenantDb);
  ok(res, publicStudent(student));
});
