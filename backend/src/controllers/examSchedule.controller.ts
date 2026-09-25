import { Response } from 'express';
import { AuthRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok, created } from '../utils/apiResponse';
import { publicExamSchedule } from '../models/ExamSchedule';
import { publicSchoolSettings } from '../models/SchoolSettings';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';
import { getTenantModels } from '../services/TenantModelRegistry';
import mongoose from 'mongoose';

/** GET /api/exam-schedules */
export const listExamSchedules = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { ExamSchedule, Subject } = getTenantModels(tenantDb);

  const filter: Record<string, any> = {};
  if (req.query.examId) filter.examId = req.query.examId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.sessionId) filter.sessionId = req.query.sessionId;

  const docs = await ExamSchedule.find(scopeQuery(req, filter)).sort({ examDate: 1, startTime: 1 }).lean();
  const subjectIds = Array.from(new Set(docs.map((d) => String(d.subjectId))));
  const subjects = await Subject.find(scopeQuery(req, { _id: { $in: subjectIds } })).select('name code').lean();
  const subMap = new Map(subjects.map((s) => [String(s._id), s]));

  const enriched = docs.map((d) => {
    const sub = subMap.get(String(d.subjectId));
    return {
      ...publicExamSchedule(d),
      subjectName: sub?.name ?? '—',
      subjectCode: sub?.code ?? '—',
    };
  });

  ok(res, enriched);
});

/** POST /api/exam-schedules */
export const createExamSchedule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Exam, ExamSchedule, Subject } = getTenantModels(tenantDb);

  const tenantId = getTenantObjectId(req);
  const {
    examId,
    sessionId,
    classId,
    subjectId,
    examDate,
    startTime,
    endTime,
    totalMarks,
    passingMarks,
    theoryMarks,
    practicalMarks,
    instructions,
  } = req.body;

  const exam = await Exam.findOne(scopeQuery(req, { _id: examId }));
  if (!exam) throw ApiError.notFound('Exam not found');
  const targetSessionId = sessionId || exam.sessionId;

  // Validate subject belongs to tenant
  const subject = await Subject.findOne(scopeQuery(req, { _id: subjectId }));
  if (!subject) throw ApiError.badRequest('Subject not found', 'INVALID_SUBJECT');

  // Validate date range if exam specifies startDate and endDate
  const schedDate = new Date(examDate);
  if (exam.startDate && schedDate < new Date(new Date(exam.startDate).setHours(0, 0, 0, 0))) {
    throw ApiError.badRequest('Exam schedule date is before exam start date', 'DATE_OUT_OF_RANGE');
  }
  if (exam.endDate && schedDate > new Date(new Date(exam.endDate).setHours(23, 59, 59, 999))) {
    throw ApiError.badRequest('Exam schedule date is after exam end date', 'DATE_OUT_OF_RANGE');
  }

  // Prevent duplicate subject schedule for same exam/class
  const existing = await ExamSchedule.findOne(scopeQuery(req, { examId, classId, subjectId })).lean();
  if (existing) {
    throw ApiError.conflict('Schedule for this subject already exists for this exam and class', 'SCHEDULE_EXISTS');
  }

  // Prevent duplicate schedule for same exam/class on the same date
  const startOfDay = new Date(schedDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(schedDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const existingDate = await ExamSchedule.findOne(scopeQuery(req, {
    examId,
    classId,
    examDate: { $gte: startOfDay, $lte: endOfDay }
  })).lean();

  if (existingDate) {
    throw ApiError.conflict('A schedule already exists for this class on this date', 'DATE_CONFLICT');
  }

  const effectiveTotal = totalMarks ?? req.body.maxMarks ?? 100;
  const effectivePassing = passingMarks ?? req.body.passMarks ?? 33;

  const doc = await ExamSchedule.create({
    tenantId,
    examId,
    sessionId: targetSessionId,
    classId,
    subjectId,
    examDate: schedDate,
    startTime,
    endTime,
    totalMarks: effectiveTotal,
    passingMarks: effectivePassing,
    theoryMarks,
    practicalMarks,
    instructions,
    roomNumber: req.body.roomNumber,
  });

  // Ensure subject is synced into exam.subjects array if not present
  const hasSubject = exam.subjects.some((s) => String(s.subjectId) === String(subjectId));
  if (!hasSubject) {
    exam.subjects.push({
      subjectId: doc.subjectId,
      maxMarks: effectiveTotal,
      passMarks: effectivePassing,
    });
    await exam.save();
  }

  created(res, publicExamSchedule(doc), { message: 'Exam schedule created' });
});

/** PATCH /api/exam-schedules/:id */
export const updateExamSchedule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { ExamSchedule } = getTenantModels(tenantDb);

  const doc = await ExamSchedule.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Exam schedule not found');

  if (req.body.examDate !== undefined) {
    const newDate = new Date(req.body.examDate);
    const startOfDay = new Date(newDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(newDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const existingDate = await ExamSchedule.findOne(scopeQuery(req, {
      _id: { $ne: doc._id },
      examId: doc.examId,
      classId: doc.classId,
      examDate: { $gte: startOfDay, $lte: endOfDay }
    })).lean();

    if (existingDate) {
      throw ApiError.conflict('A schedule already exists for this class on this date', 'DATE_CONFLICT');
    }

    doc.examDate = newDate;
  }
  if (req.body.startTime !== undefined) doc.startTime = req.body.startTime;
  if (req.body.endTime !== undefined) doc.endTime = req.body.endTime;
  if (req.body.totalMarks !== undefined) doc.totalMarks = req.body.totalMarks;
  if (req.body.passingMarks !== undefined) doc.passingMarks = req.body.passingMarks;
  if (req.body.theoryMarks !== undefined) doc.theoryMarks = req.body.theoryMarks;
  if (req.body.practicalMarks !== undefined) doc.practicalMarks = req.body.practicalMarks;
  if (req.body.instructions !== undefined) doc.instructions = req.body.instructions;

  if (doc.passingMarks > doc.totalMarks) {
    throw ApiError.badRequest('Passing marks cannot exceed total marks', 'MARKS_INVALID');
  }

  await doc.save();
  ok(res, publicExamSchedule(doc), 200, { message: 'Exam schedule updated' });
});

/** DELETE /api/exam-schedules/:id */
export const deleteExamSchedule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { ExamSchedule } = getTenantModels(tenantDb);

  const doc = await ExamSchedule.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Exam schedule not found');

  await doc.deleteOne();
  ok(res, { success: true, message: 'Exam schedule deleted' });
});

/** GET /api/exam-schedules/printable?examId=&classId= */
export const getPrintableSchedule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Exam, Class, SchoolSettings, ExamSchedule, AcademicSession, Subject } = getTenantModels(tenantDb);

  const { examId, classId } = req.query;
  if (!examId) throw ApiError.badRequest('examId is required', 'EXAM_REQUIRED');

  const [exam, cls, settings, schedules] = await Promise.all([
    Exam.findOne(scopeQuery(req, { _id: examId })).lean(),
    classId ? Class.findOne(scopeQuery(req, { _id: classId })).lean() : null,
    SchoolSettings.findOne(scopeQuery(req, {})).lean(),
    ExamSchedule.find(scopeQuery(req, { examId, ...(classId ? { classId } : {}) })).sort({ examDate: 1, startTime: 1 }).lean(),
  ]);

  if (!exam) throw ApiError.notFound('Exam not found');

  const [session, subjects] = await Promise.all([
    AcademicSession.findOne(scopeQuery(req, { _id: exam.sessionId })).lean(),
    Subject.find(scopeQuery(req, { _id: { $in: schedules.map((s) => s.subjectId) } })).select('name code').lean(),
  ]);

  const subMap = new Map(subjects.map((s) => [String(s._id), s]));

  ok(res, {
    school: settings ? publicSchoolSettings(settings) : null,
    exam: {
      _id: String(exam._id),
      name: exam.name,
      startDate: exam.startDate ? new Date(exam.startDate).toISOString() : null,
      endDate: exam.endDate ? new Date(exam.endDate).toISOString() : null,
    },
    session: session ? { name: session.name } : null,
    class: cls ? { _id: String(cls._id), name: cls.name } : null,
    schedules: schedules.map((s) => {
      const sub = subMap.get(String(s.subjectId));
      return {
        ...publicExamSchedule(s),
        subjectName: sub?.name ?? '—',
        subjectCode: sub?.code ?? '—',
      };
    }),
    timetable: schedules.map((s) => {
      const sub = subMap.get(String(s.subjectId));
      return {
        ...publicExamSchedule(s),
        subjectName: sub?.name ?? '—',
        subjectCode: sub?.code ?? '—',
      };
    }),
  });
});
