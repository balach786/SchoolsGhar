import { Response } from 'express';
import { AuthRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { paginated, ok, created } from '../utils/apiResponse';
import { publicExam } from '../models/Exam';
import { getTenantModels } from '../services/TenantModelRegistry';
import {
  resolveExamContext,
  getDefaultGradeScale,
  requireGradeScale,
  assertExamVisible,
  type AuthedUser,
} from '../services/exam.service';
import { getOwnStudent } from '../services/attendance.service';
import { generateStudentExamFeesForClass } from '../services/examFee.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

export type ReqUser = AuthedUser;

/** Validate + normalize the subjects array of an exam create/update payload. */
function normalizeSubjects(bodySubjects: any[]): { subjectId: string; maxMarks: number; passMarks?: number }[] {
  const seen = new Set<string>();
  for (const s of bodySubjects) {
    if (seen.has(String(s.subjectId))) {
      throw ApiError.unprocessable('A subject appears more than once in the exam', 'SUBJECT_DUPLICATE_IN_EXAM');
    }
    seen.add(String(s.subjectId));
  }
  return bodySubjects.map((s) => ({
    subjectId: String(s.subjectId),
    maxMarks: s.maxMarks,
    ...(s.passMarks !== undefined ? { passMarks: s.passMarks } : {}),
  }));
}

import mongoose from 'mongoose';

async function resolveNames(req: AuthRequest, tenantDb: mongoose.Connection, exams: any[]) {
  const { Class, AcademicSession, ExamType } = getTenantModels(tenantDb);
  const ids = (key: string) => Array.from(new Set(exams.map((e) => e[key]).filter(Boolean).map((v: unknown) => String(v))));
  const allClassIds = Array.from(new Set(exams.flatMap(e => (e.classIds && e.classIds.length > 0) ? e.classIds : (e.classId ? [e.classId] : [])).filter(Boolean).map(String)));
  const [classes, sessions, examTypes] = await Promise.all([
    Class.find(scopeQuery(req, { _id: { $in: allClassIds } })).select('name').lean(),
    AcademicSession.find(scopeQuery(req, { _id: { $in: ids('sessionId') } })).select('name').lean(),
    ExamType.find(scopeQuery(req, { _id: { $in: ids('examTypeId') } })).select('name').lean(),
  ]);
  return {
    classMap: new Map(classes.map((c) => [String(c._id), c.name])),
    sessionMap: new Map(sessions.map((s) => [String(s._id), s.name])),
    examTypeMap: new Map(examTypes.map((t) => [String(t._id), t.name])),
  };
}

function publicExamWithNames(e: any, names: { classMap: Map<string, string>; sessionMap: Map<string, string>; examTypeMap: Map<string, string> }) {
  const cids = (e.classIds && e.classIds.length > 0) ? e.classIds : (e.classId ? [e.classId] : []);
  const classNames = cids.map((id: any) => names.classMap.get(String(id))).filter(Boolean);
  return {
    ...publicExam(e),
    className: names.classMap.get(String(e.classId)) ?? '—',
    classNames,
    sessionName: names.sessionMap.get(String(e.sessionId)) ?? '—',
    examTypeName: names.examTypeMap.get(String(e.examTypeId)) ?? '—',
  };
}

export const listExams = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Exam } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;

  let filter: Record<string, any> = { isArchived: false };
  if (req.query.sessionId) filter.sessionId = req.query.sessionId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.examTypeId) filter.examTypeId = req.query.examTypeId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.published === 'true') filter.isPublished = true;
  if (req.query.published === 'false') filter.isPublished = false;

  // Students only ever see published exams of their own class.
  if (user.role === 'student') {
    const own = await getOwnStudent(user, tenantDb);
    filter.sessionId = own.sessionId;
    filter.classId = own.classId;
    filter.isPublished = true;
  }

  filter = scopeQuery(req, filter);

  const [docs, total] = await Promise.all([
    Exam.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Exam.countDocuments(filter),
  ]);
  const names = await resolveNames(req, tenantDb, docs);
  paginated(res, {
    data: docs.map((d) => publicExamWithNames(d, names)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

export const createExam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Exam, ExamFee } = getTenantModels(tenantDb);

  const {
    name,
    sessionId,
    classId: rawClassId,
    classIds: rawClassIds,
    subjects,
    examDate,
    startDate,
    endDate,
    examTypeId,
    description,
    status,
    requireExamFeeForAdmitCard,
  } = req.body;
  const tenantId = getTenantObjectId(req);
  const classId = rawClassId || (rawClassIds && rawClassIds.length > 0 ? rawClassIds[0] : undefined);
  const classIds = rawClassIds || (rawClassId ? [rawClassId] : []);

  if (!classId) throw ApiError.badRequest('At least one class is required', 'CLASS_REQUIRED');

  const uniqueClassIds = Array.from(new Set(classIds));
  const classDocs = await Class.find(scopeQuery(req, { _id: { $in: uniqueClassIds } })).lean();
  if (classDocs.length !== uniqueClassIds.length) {
    throw ApiError.badRequest('One or more selected classes do not exist', 'CLASS_NOT_FOUND');
  }
  for (const c of classDocs) {
    if (c.isArchived) throw ApiError.badRequest(`Class ${c.name} is archived`, 'CLASS_ARCHIVED');
    if (String(c.sessionId) !== String(sessionId)) {
      throw ApiError.badRequest(`Class ${c.name} does not belong to the selected session`, 'INVALID_CLASS_SESSION');
    }
  }

  let normalized: any[] = [];
  if (Array.isArray(subjects) && subjects.length > 0) {
    normalized = normalizeSubjects(subjects);
    await resolveExamContext(tenantDb, sessionId, classId, normalized.map((s) => s.subjectId), tenantId);
  } else {
    await resolveExamContext(tenantDb, sessionId, classId, [], tenantId);
  }

  const scale = req.body.gradeScaleId
    ? await requireGradeScale(tenantDb, req.body.gradeScaleId, tenantId)
    : await getDefaultGradeScale(tenantDb, tenantId);

  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    throw ApiError.badRequest('Start date cannot be after end date', 'INVALID_DATE_RANGE');
  }

  const { classFees } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();

  let doc: any;
  try {
    const existing = await Exam.findOne(scopeQuery(req, { 
      name: name.trim(), 
      sessionId, 
      classIds: { $in: classIds } 
    })).select('_id').session(session).lean();
    
    if (existing) throw ApiError.conflict('An exam with this name already exists for one or more selected classes', 'EXAM_ALREADY_EXISTS');

    doc = new Exam({
      tenantId,
      name: name.trim(),
      examTypeId: examTypeId || undefined,
      sessionId,
      classId, // legacy primary class
      classIds,
      subjects: normalized,
      gradeScaleId: scale._id,
      ...(examDate ? { examDate: new Date(examDate) } : {}),
      ...(startDate ? { startDate: new Date(startDate) } : {}),
      ...(endDate ? { endDate: new Date(endDate) } : {}),
      description: description || undefined,
      status: status || 'Scheduled',
      requireExamFeeForAdmitCard: Boolean(requireExamFeeForAdmitCard),
      createdBy: req.user ? (req.user as any)._id : undefined,
    });
    await doc.save({ session });

    let generatedFeesCount = 0;
    let noFeeClassesCount = 0;
    const { examFeeDueDate } = req.body;
    const parsedDueDate = examFeeDueDate ? new Date(examFeeDueDate) : undefined;

    // Create per-class exam fees if specified
    if (classFees && typeof classFees === 'object') {
      const feesToCreate = [];
      for (const cid of classIds) {
        let classFeeAmount = 0;
        const feeStr = classFees[String(cid)];
        if (feeStr !== undefined && feeStr !== null && feeStr !== '') {
          const amount = Math.round(Number(feeStr)); // expected in paisa from frontend
          if (!isNaN(amount) && amount > 0) {
            classFeeAmount = amount;
            feesToCreate.push({
              tenantId,
              examId: doc._id,
              sessionId,
              classId: cid,
              amount,
            });
          }
        }
        
        if (classFeeAmount > 0) {
          const count = await generateStudentExamFeesForClass(
            tenantDb,
            tenantId!,
            doc._id,
            cid,
            sessionId,
            { amount: classFeeAmount, dueDate: parsedDueDate },
            req.user ? (req.user as any)._id : undefined,
            session
          );
          generatedFeesCount += count;
        } else {
          noFeeClassesCount++;
        }
      }
      if (feesToCreate.length > 0) {
        for (const feeData of feesToCreate) {
          await new ExamFee(feeData).save({ session });
        }
      }
    } else {
       noFeeClassesCount = classIds.length;
    }

    await session.commitTransaction();
    session.endSession();
    
    const paidClassesCount = classIds.length - noFeeClassesCount;
    let successMessage = `${doc.name} created successfully.`;
    if (paidClassesCount > 0) {
      successMessage += ` Exam Fees generated for ${paidClassesCount} paid class(es) / ${generatedFeesCount} student(s).`;
    }
    if (noFeeClassesCount > 0) {
      successMessage += ` ${noFeeClassesCount} class(es) are No Fee.`;
    }

    created(res, publicExam(doc as never), { message: successMessage.trim() });
    return;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

export const getExam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Exam, ExamFee } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const doc = await Exam.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Exam not found');
  await assertExamVisible(tenantDb, user, doc);

  const names = await resolveNames(req, tenantDb, [doc]);
  
  const examFees = await ExamFee.find(scopeQuery(req, { examId: doc._id })).lean();
  const classFees: Record<string, number> = {};
  for (const f of examFees) {
    if (f.amount > 0) {
      classFees[String(f.classId)] = Math.round(f.amount / 100);
    }
  }

  const payload = publicExamWithNames(doc, names);
  (payload as any).classFees = classFees;
  
  ok(res, payload);
});

export const updateExam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Exam, ExamFee, Result, Mark, ExamAttendance, ExamRollNumber, ExamSchedule, StudentExamFee } = getTenantModels(tenantDb);

  const tenantId = getTenantObjectId(req);
  const doc = await Exam.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Exam not found');
  if (doc.isArchived) throw ApiError.badRequest('Exam is archived', 'EXAM_ARCHIVED');

  if (req.body.name !== undefined) doc.name = req.body.name.trim();
  if (req.body.examTypeId !== undefined) doc.examTypeId = req.body.examTypeId || undefined;
  if (req.body.description !== undefined) doc.description = req.body.description;
  if (req.body.status !== undefined) doc.status = req.body.status;
  if (req.body.requireExamFeeForAdmitCard !== undefined) {
    doc.requireExamFeeForAdmitCard = Boolean(req.body.requireExamFeeForAdmitCard);
  }

  if (req.body.sessionId !== undefined && String(req.body.sessionId) !== String(doc.sessionId)) {
    throw ApiError.badRequest('Cannot change session membership after creation', 'IMMUTABLE_FIELD');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  let nextClassIds = (doc.classIds || []).map(String);
  let removedClassIds: string[] = [];
  let addedClassIds: string[] = [];

  try {
    if (req.body.classId !== undefined && req.body.classIds === undefined) {
      // Legacy single-class update fallback
      req.body.classIds = [req.body.classId];
    }

    if (req.body.classIds !== undefined) {
      const newClassIds = (Array.isArray(req.body.classIds) ? req.body.classIds : [req.body.classIds]).map(String);
      removedClassIds = nextClassIds.filter((id: string) => !newClassIds.includes(id));
      addedClassIds = newClassIds.filter((id: string) => !nextClassIds.includes(id));
      
      if (removedClassIds.length > 0) {
        for (const removedId of removedClassIds) {
          const query = { tenantId, examId: doc._id, classId: removedId };
          const hasResult = await Result.exists(query).session(session);
          const hasMark = await Mark.exists(query).session(session);
          const hasAttendance = await ExamAttendance.exists(query).session(session);
          const hasAdmitCard = await ExamRollNumber.exists(query).session(session);
          const hasSchedule = await ExamSchedule.exists(query).session(session);
          const hasStudentFee = await StudentExamFee.exists(query).session(session);

          if (hasResult || hasMark || hasAttendance || hasAdmitCard || hasSchedule || hasStudentFee) {
            throw ApiError.badRequest(`Cannot remove class because active exam records (marks, results, attendance, admit cards, or generated fees) exist for it.`, 'CLASS_HAS_DOWNSTREAM_RECORDS');
          }
        }
      }
      nextClassIds = newClassIds;
      doc.classIds = nextClassIds as any;
      if (nextClassIds.length > 0) {
        doc.classId = nextClassIds[0] as any; // legacy fallback
      }
    }

    const nextSessionId = String(doc.sessionId);

    // Lock academic configuration if published snapshots exist
    const hasPublishedSnapshots = await Result.exists({ examId: doc._id, tenantId }).session(session);

    if (hasPublishedSnapshots) {
      if (req.body.subjects !== undefined) {
        const existingStr = JSON.stringify(doc.subjects.map(s => ({ subjectId: String(s.subjectId), maxMarks: s.maxMarks, passMarks: s.passMarks })));
        const newStr = JSON.stringify(normalizeSubjects(req.body.subjects).map(s => ({ subjectId: String(s.subjectId), maxMarks: s.maxMarks, passMarks: s.passMarks })));
        if (existingStr !== newStr) throw ApiError.badRequest('Cannot modify exam subjects or marks after results are published. Use re-publish workflow instead.', 'IMMUTABLE_FIELD');
      }
      if (req.body.gradeScaleId !== undefined && String(req.body.gradeScaleId) !== String(doc.gradeScaleId)) {
        throw ApiError.badRequest('Cannot change Grade Scale after results are published.', 'IMMUTABLE_FIELD');
      }
    }

    let nextSubjects = doc.subjects.map((s) => ({
      subjectId: String(s.subjectId),
      maxMarks: s.maxMarks,
      ...(s.passMarks !== undefined ? { passMarks: s.passMarks } : {}),
    }));
    if (req.body.subjects !== undefined) {
      nextSubjects = normalizeSubjects(req.body.subjects);
    }

    await resolveExamContext(tenantDb, nextSessionId, String(doc.classId), nextSubjects.map((s) => s.subjectId), tenantId);

    if (req.body.gradeScaleId !== undefined) {
      await requireGradeScale(tenantDb, req.body.gradeScaleId, tenantId);
      doc.gradeScaleId = req.body.gradeScaleId;
    }
    if (req.body.examDate !== undefined) {
      doc.examDate = req.body.examDate ? new Date(req.body.examDate) : undefined;
    }
    if (req.body.startDate !== undefined) {
      doc.startDate = req.body.startDate ? new Date(req.body.startDate) : undefined;
    }
    if (req.body.endDate !== undefined) {
      doc.endDate = req.body.endDate ? new Date(req.body.endDate) : undefined;
    }

    if (doc.startDate && doc.endDate && doc.startDate > doc.endDate) {
      throw ApiError.badRequest('Start date cannot be after end date', 'INVALID_DATE_RANGE');
    }

    doc.subjects = nextSubjects as never;
    await doc.save({ session });

    // Handle class fees updates if provided
    if (req.body.classFees !== undefined) {
      const { classFees, examFeeDueDate } = req.body;
      const parsedDueDate = examFeeDueDate ? new Date(examFeeDueDate) : undefined;

      // 1. Delete ExamFee records for safely removed classes
      if (removedClassIds.length > 0) {
        await ExamFee.deleteMany({ tenantId, examId: doc._id, classId: { $in: removedClassIds } }).session(session);
      }

      // 2. Process all requested fees
      if (typeof classFees === 'object') {
        for (const cid of nextClassIds) {
          const feeStr = classFees[String(cid)];
          let amount = 0;
          if (feeStr !== undefined && feeStr !== null && feeStr !== '') {
             amount = Math.round(Number(feeStr)); // paisa
          }

          if (amount > 0) {
             const existingFee = await ExamFee.findOne({ tenantId, examId: doc._id, classId: cid }).session(session);
             if (existingFee) {
                if (existingFee.amount !== amount) {
                   existingFee.amount = amount;
                   if (parsedDueDate) existingFee.dueDate = parsedDueDate;
                   await existingFee.save({ session });
                   await generateStudentExamFeesForClass(tenantDb, tenantId!, doc._id, cid, nextSessionId, { amount, dueDate: parsedDueDate }, req.user ? (req.user as any)._id : undefined, session);
                }
             } else {
                await new ExamFee({
                  tenantId,
                  examId: doc._id,
                  sessionId: nextSessionId,
                  classId: cid,
                  amount,
                  dueDate: parsedDueDate,
                }).save({ session });
                await generateStudentExamFeesForClass(tenantDb, tenantId!, doc._id, cid, nextSessionId, { amount, dueDate: parsedDueDate }, req.user ? (req.user as any)._id : undefined, session);
             }
          } else {
             await ExamFee.deleteOne({ tenantId, examId: doc._id, classId: cid }).session(session);
          }
        }
      }
    }

    await session.commitTransaction();
    session.endSession();
    
    const names = await resolveNames(req, tenantDb, [doc]);
    const updatedExamFees = await ExamFee.find(scopeQuery(req, { examId: doc._id })).lean();
    const finalClassFees: Record<string, number> = {};
    for (const f of updatedExamFees) {
      if (f.amount > 0) {
        finalClassFees[String(f.classId)] = Math.round(f.amount / 100);
      }
    }
    const payload = publicExamWithNames(doc, names);
    (payload as any).classFees = finalClassFees;

    ok(res, payload, 200, { message: 'Exam updated' });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

export const deleteExam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Exam, Mark } = getTenantModels(tenantDb);

  const doc = await Exam.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Exam not found');

  const marksCount = await Mark.countDocuments(scopeQuery(req, { examId: doc._id }));
  if (marksCount > 0) {
    throw ApiError.badRequest('Cannot delete exam with recorded marks', 'EXAM_HAS_MARKS');
  }
  await doc.deleteOne();
  ok(res, { success: true, message: 'Exam deleted' });
});

export const archiveExam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Exam } = getTenantModels(tenantDb);

  const doc = await Exam.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Exam not found');
  const archive = req.path.endsWith('/archive');
  doc.isArchived = archive;
  await doc.save();
  ok(res, publicExam(doc as never), 200, { message: archive ? 'Exam archived' : 'Exam restored' });
});

export const publishExam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Exam } = getTenantModels(tenantDb);

  const doc = await Exam.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Exam not found');
  if (doc.isArchived) throw ApiError.badRequest('Archived exams cannot be published', 'EXAM_ARCHIVED');
  const publish = req.path.endsWith('/publish');
  doc.isPublished = publish;
  await doc.save();
  ok(res, publicExam(doc as never), 200, { message: publish ? 'Exam published — results are now visible to students' : 'Exam unpublished — results hidden from students' });
});

export const getExamMarksSheet = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Exam, Student, Mark, ExamSchedule, Subject, ExamRollNumber } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const doc = await Exam.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Exam not found');
  await assertExamVisible(tenantDb, user, doc);

  const examClassIds = (doc.classIds && doc.classIds.length > 0) ? doc.classIds : (doc.classId ? [doc.classId] : []);
  const [students, marks, names] = await Promise.all([
    Student.find(scopeQuery(req, { sessionId: doc.sessionId, classId: { $in: examClassIds }, isArchived: false }))
      .select('admissionNumber rollNumber fullName sectionId classId')
      .sort({ rollNumber: 1 })
      .lean(),
    Mark.find(scopeQuery(req, { examId: doc._id })).lean(),
    resolveNames(req, tenantDb, [doc]),
  ]);

  // Students only ever see their own row in a marks sheet.
  let rosterStudents = students;
  if (user.role === 'student') {
    const own = await getOwnStudent(user, tenantDb);
    rosterStudents = students.filter((s) => String(s._id) === String(own._id));
  }

  const markByStudentSubject = new Map<string, any>();
  for (const m of marks) {
    markByStudentSubject.set(`${String(m.studentId)}|${String(m.subjectId)}`, m);
  }

  let effectiveSubjects: any[] = (doc.subjects && doc.subjects.length > 0) ? doc.subjects : [];

  // P2: Graceful subject fallback from ExamSchedule or Class Subjects when exam.subjects is empty
  if (effectiveSubjects.length === 0) {
    const schedules = await ExamSchedule.find(scopeQuery(req, { examId: doc._id })).select('subjectId totalMarks passingMarks').lean();
    if (schedules.length > 0) {
      const seen = new Set<string>();
      for (const sch of schedules) {
        const sid = String(sch.subjectId);
        if (!seen.has(sid)) {
          seen.add(sid);
          effectiveSubjects.push({
            subjectId: sid,
            maxMarks: sch.totalMarks ?? 100,
            passMarks: sch.passingMarks ?? 33,
          });
        }
      }
    } else {
      // Fallback to subjects defined for the class
      const examClassIds = (doc.classIds && doc.classIds.length > 0) ? doc.classIds : (doc.classId ? [doc.classId] : []);
      const classSubjects = await Subject.find(scopeQuery(req, { classIds: { $in: examClassIds }, isArchived: { $ne: true } })).select('_id').lean();
      const seen = new Set<string>();
      for (const s of classSubjects) {
        const sid = String(s._id);
        if (!seen.has(sid)) {
          seen.add(sid);
          effectiveSubjects.push({
            subjectId: sid,
            maxMarks: 100,
            passMarks: 33,
          });
        }
      }
    }
  }

  const examWithSubjects = {
    ...publicExamWithNames(doc, names),
    subjects: effectiveSubjects,
  };

  const rollNumbers = await ExamRollNumber.find(scopeQuery(req, { examId: doc._id })).lean();
  const rollMap = new Map(rollNumbers.map((r) => [String(r.studentId), r]));

  ok(res, {
    exam: examWithSubjects,
    roster: rosterStudents.map((s) => {
      const rollInfo = rollMap.get(String(s._id));
      return {
        studentId: String(s._id),
        admissionNumber: s.admissionNumber,
        rollNumber: s.rollNumber,
        examRollNumber: rollInfo?.examRollNumber ?? null,
        block: rollInfo?.block ?? null,
        seatNumber: rollInfo?.seatNumber ?? null,
        fullName: s.fullName,
      sectionId: String(s.sectionId),
      marks: effectiveSubjects.map((sub) => {
        const m = markByStudentSubject.get(`${String(s._id)}|${String(sub.subjectId)}`);
        return {
          subjectId: String(sub.subjectId),
          marksObtained: m ? m.marksObtained : null,
          recordId: m ? String(m._id) : null,
          isAbsent: m ? Boolean(m.isAbsent) : false,
        };
      }),
    };
  }),
  });
});
