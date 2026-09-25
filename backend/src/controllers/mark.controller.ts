import { Response } from 'express';
import { AuthRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { paginated, ok, created } from '../utils/apiResponse';
import { getOwnStudent, type AuthedUser } from '../services/attendance.service';
import { assertCanEnterMarks, assertExamVisible } from '../services/exam.service';
import { publicMark } from '../models/Mark';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';
import { recordAudit } from '../services/audit.service';
import { getTenantModels } from '../services/TenantModelRegistry';
import mongoose from 'mongoose';

const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

export type ReqUser = AuthedUser;

async function loadExamForMarks(req: AuthRequest, tenantDb: mongoose.Connection, user: ReqUser, examId: string) {
  const { Exam } = getTenantModels(tenantDb);
  const exam = await Exam.findOne(scopeQuery(req, { _id: examId }));
  if (!exam) throw ApiError.notFound('Exam not found');
  await assertCanEnterMarks(tenantDb, user, exam);

  // Marks lock once an exam is published — only users who can publish exams may adjust afterwards.
  const authUser = req.user as any;
  const canPublishExams = authUser.isPlatformAdmin || (authUser.permissions?.['exams'] && authUser.permissions['exams'].includes('publish'));
  
  if (exam.isPublished && !canPublishExams) {
    throw ApiError.conflict('Marks are locked after the exam is published', 'MARKS_LOCKED');
  }

  return exam;
}

/** GET /api/marks — recorded marks for an exam (scoped). */
export const listMarks = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Exam, Mark, ExamRollNumber } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const examId = String(req.query.examId || '');
  if (!examId) throw ApiError.badRequest('examId is required', 'EXAM_REQUIRED');

  const exam = await Exam.findOne(scopeQuery(req, { _id: examId }));
  if (!exam) throw ApiError.notFound('Exam not found');
  await assertExamVisible(tenantDb, user, exam);

  let filter: Record<string, any> = { examId: exam._id };
  // Students only ever see their own marks.
  if (user.role === 'student') {
    const own = await getOwnStudent(user, tenantDb);
    if (req.query.studentId && String(req.query.studentId) !== String(own._id)) {
      throw ApiError.forbidden('You can only view your own marks', 'MARKS_FORBIDDEN');
    }
    filter.studentId = own._id;
  } else if (req.query.studentId) {
    filter.studentId = req.query.studentId;
  }
  if (req.query.subjectId) filter.subjectId = req.query.subjectId;

  filter = scopeQuery(req, filter);

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || PAGE_DEFAULT));
  const skip = (page - 1) * limit;

  const [docs, total, rollNumbers] = await Promise.all([
    Mark.find(filter).sort({ studentId: 1, subjectId: 1 }).skip(skip).limit(limit).lean(),
    Mark.countDocuments(filter),
    ExamRollNumber.find(scopeQuery(req, { examId })).lean()
  ]);

  const rollMap = new Map(rollNumbers.map(r => [String(r.studentId), r]));

  const mappedDocs = docs.map((d: any) => {
    const pub = publicMark(d as never);
    const rollInfo = rollMap.get(String(pub.studentId));
    return {
      ...pub,
      examRollNumber: rollInfo?.examRollNumber ?? null,
      block: rollInfo?.block ?? null,
      seatNumber: rollInfo?.seatNumber ?? null,
    };
  });

  paginated(res, {
    data: mappedDocs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
});

/** POST /api/marks/bulk — record a batch of marks for one exam. */
export const bulkCreateMarks = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Student, Mark } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const { examId, overwrite, records } = req.body;
  const tenantId = getTenantObjectId(req);

  const exam = await loadExamForMarks(req, tenantDb, user, examId);

  // Subjects in the request must be part of the exam.
  const subjectByKey = new Map<string, { maxMarks: number; passMarks?: number }>();
  for (const sub of exam.subjects) subjectByKey.set(String(sub.subjectId), sub);

  // Deduplicate identical (student, subject) pairs inside the request.
  const seen = new Set<string>();
  for (const r of records) {
    const key = `${String(r.studentId)}|${String(r.subjectId)}`;
    if (seen.has(key)) throw ApiError.unprocessable('Duplicate student+subject pair in request', 'MARK_DUPLICATE_IN_REQUEST');
    seen.add(key);

    const sub = subjectByKey.get(String(r.subjectId));
    if (!sub) throw ApiError.unprocessable('A subject is not part of this exam', 'INVALID_SUBJECT_IN_EXAM');
    if (r.marksObtained > sub.maxMarks) {
      throw ApiError.unprocessable('Marks exceed the subject maximum', 'MARKS_EXCEED_MAX');
    }
  }

  // Students must belong to the exam's class + session within tenant.
  const studentIds = Array.from(new Set(records.map((r: any) => String(r.studentId))));
  const students = await Student.find(scopeQuery(req, { _id: { $in: studentIds } })).select('_id').lean();
  if (students.length !== studentIds.length) throw ApiError.badRequest('One or more students do not exist', 'INVALID_REFERENCE');
  const allowedClassIds = (exam.classIds && exam.classIds.length > 0)
    ? exam.classIds
    : (exam.classId ? [exam.classId] : []);
  const inClass = await Student.countDocuments(scopeQuery(req, {
    _id: { $in: studentIds },
    sessionId: exam.sessionId,
    classId: { $in: allowedClassIds },
    isArchived: false,
  }));
  if (inClass !== studentIds.length) {
    throw ApiError.badRequest('One or more students do not belong to this exam class', 'INVALID_STUDENT_CLASS');
  }

  // Duplicate prevention vs. existing marks (unique examId+studentId+subjectId).
  const existing = await Mark.find(scopeQuery(req, {
    examId: exam._id,
    $or: records.map((r: any) => ({ studentId: r.studentId, subjectId: r.subjectId })),
  }));
  const existingKeys = new Map(existing.map((m) => [`${String(m.studentId)}|${String(m.subjectId)}`, m]));

  const blocked = records.filter((r: any) => existingKeys.has(`${String(r.studentId)}|${String(r.subjectId)}`));
  if (blocked.length && !overwrite) {
    throw ApiError.conflict(
      'Marks already recorded for some students — pass overwrite: true to replace them',
      'MARK_ALREADY_EXISTS',
      { studentIds: blocked.map((r: any) => String(r.studentId)) }
    );
  }

  const results: any[] = [];
  for (const r of records) {
    const key = `${String(r.studentId)}|${String(r.subjectId)}`;
    const prev = existingKeys.get(key);
    const isAbsent = Boolean(r.isAbsent);
    const marksObtained = isAbsent ? 0 : r.marksObtained;

    if (prev) {
      prev.marksObtained = marksObtained;
      prev.isAbsent = isAbsent;
      prev.markedBy = user._id as never;
      await prev.save();
      results.push(publicMark(prev as never));
    } else {
      const doc = await Mark.create({
        tenantId,
        examId: exam._id,
        sessionId: exam.sessionId,
        studentId: r.studentId,
        subjectId: r.subjectId,
        marksObtained,
        isAbsent,
        markedBy: user._id,
      });
      results.push(publicMark(doc as never));
    }
  }

  created(res, results, { message: `${results.length} mark record(s) saved` });
});

/** PATCH /api/marks/records/:id */
export const updateMark = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Mark } = getTenantModels(tenantDb);

  const user = req.user as unknown as ReqUser;
  const doc = await Mark.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Mark record not found');

  const exam = await loadExamForMarks(req, tenantDb, user, String(doc.examId));
  const sub = exam.subjects.find((s) => String(s.subjectId) === String(doc.subjectId));
  if (!sub) throw ApiError.unprocessable('This subject is no longer part of the exam', 'INVALID_SUBJECT_IN_EXAM');
  if (req.body.marksObtained !== undefined && req.body.marksObtained > sub.maxMarks) {
    throw ApiError.unprocessable('Marks exceed the subject maximum', 'MARKS_EXCEED_MAX');
  }

  if (req.body.marksObtained !== undefined) doc.marksObtained = req.body.marksObtained;
  if (req.body.isAbsent !== undefined) {
    doc.isAbsent = Boolean(req.body.isAbsent);
    if (doc.isAbsent) doc.marksObtained = 0;
  }
  doc.markedBy = user._id as never;
  await doc.save();
  recordAudit('marks', 'MARK_CORRECTED', req.user as any, String(doc._id), {
    examId: String(doc.examId),
    studentId: String(doc.studentId),
    marksObtained: doc.marksObtained,
    isAbsent: Boolean(doc.isAbsent),
  });
  ok(res, publicMark(doc as never), 200, { message: 'Mark updated' });
});

/** GET /api/marks/class-matrix/:examId/:classId */
export const getClassMarksMatrix = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { ExamSchedule, Student, ExamAttendance, Mark, Subject } = getTenantModels(tenantDb);

  const { examId, classId } = req.params;
  const user = req.user as unknown as ReqUser;
  
  const exam = await loadExamForMarks(req, tenantDb, user, examId);
  
  const schedules = await ExamSchedule.find({ examId, classId, isArchived: false }).lean();
  const students = await Student.find({ classId, sessionId: exam.sessionId, isActive: true, isArchived: false }).lean();
  
  const scheduleIds = schedules.map(s => s._id);
  const studentIds = students.map(s => s._id);
  
  const [attendances, marks, subjects] = await Promise.all([
    ExamAttendance.find({ examScheduleId: { $in: scheduleIds } }).lean(),
    Mark.find({ examId, studentId: { $in: studentIds } }).lean(),
    Subject.find({ _id: { $in: schedules.map(s => s.subjectId) } }).lean()
  ]);

  const columns = schedules.map(sch => {
     const sub = subjects.find(s => String(s._id) === String(sch.subjectId));
     return {
       scheduleId: String(sch._id),
       subjectId: String(sch.subjectId),
       subjectName: sub?.name || 'Unknown',
       maxMarks: sch.totalMarks,
       passingMarks: sch.passingMarks,
       canEdit: true
     };
  });

  const rows = students.map(st => {
     const stAtts = attendances.filter(a => String(a.studentId) === String(st._id));
     const stMarks = marks.filter(m => String(m.studentId) === String(st._id));
     
     const subjectCells = columns.map(col => {
        const att = stAtts.find(a => String(a.examScheduleId) === col.scheduleId);
        const mk = stMarks.find(m => String(m.subjectId) === col.subjectId);
        
        let status = 'pending';
        if (att) {
           status = att.status === 'present' ? 'present' : 'absent';
        }
        
        return {
           subjectId: col.subjectId,
           scheduleId: col.scheduleId,
           attendanceStatus: status,
           markObtained: mk && status !== 'absent' ? mk.marksObtained : null,
           isAbsent: status === 'absent'
        };
     });
     
     return {
        studentId: String(st._id),
        fullName: st.fullName,
        admissionNumber: st.admissionNumber,
        examRollNumber: st.rollNumber,
        subjects: subjectCells
     };
  });

  ok(res, { exam: { _id: examId, name: exam.name }, columns, rows });
});

/** POST /api/marks/class-matrix/:examId/:classId/bulk */
export const bulkSaveClassMarks = asyncHandler(async (req: AuthRequest, res: Response) => {
   const tenantDb = req.tenantDb as mongoose.Connection;
   if (!tenantDb) {
     throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
   }
   const { ExamSchedule, ExamAttendance, Subject, Mark } = getTenantModels(tenantDb);

   const { examId, classId } = req.params;
   const { marks: incomingMarks } = req.body; // Array of { studentId, subjectId, marksObtained }
   const user = req.user as unknown as ReqUser;

   const exam = await loadExamForMarks(req, tenantDb, user, examId);
   const schedules = await ExamSchedule.find({ examId, classId }).lean();
   const attendances = await ExamAttendance.find({ examScheduleId: { $in: schedules.map(s => s._id) } }).lean();
   const subjects = await Subject.find({ _id: { $in: schedules.map(s => s.subjectId) } }).lean();

   const results = [];
   for (const im of incomingMarks) {
      const { studentId, subjectId, marksObtained } = im;
      const schedule = schedules.find(s => String(s.subjectId) === String(subjectId));
      if (!schedule) continue;

      const att = attendances.find(a => String(a.studentId) === String(studentId) && String(a.examScheduleId) === String(schedule._id));
      if (!att) {
          continue;
      }

      const isAbsent = att.status !== 'present';
      const finalMarks = isAbsent ? 0 : marksObtained;

      if (!isAbsent && (finalMarks < 0 || finalMarks > schedule.totalMarks)) {
          throw ApiError.unprocessable(`Marks for this subject must be between 0 and ${schedule.totalMarks}`, 'INVALID_MARKS');
      }

      const doc = await Mark.findOneAndUpdate(
         { examId, studentId, subjectId },
         { marksObtained: finalMarks, isAbsent, markedBy: user._id, tenantId: exam.tenantId, sessionId: exam.sessionId },
         { upsert: true, new: true }
      );
      results.push(doc);
   }

   created(res, { count: results.length }, { message: 'Marks saved successfully' });
});
