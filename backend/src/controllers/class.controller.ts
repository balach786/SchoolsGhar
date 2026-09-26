import { getTenantModels } from '../services/TenantModelRegistry';
import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import { ok, created, paginated } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { parsePagination } from '../utils/query';
import { Class, publicClass } from '../models/Class';
import { requireSession, requireClass, ensureSubjectsInSession } from '../services/academic.service';
import { recordAudit } from '../services/audit.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';
import { assignClassTeacher, unassignClassTeacher } from '../services/classTeacher.service';
import mongoose from 'mongoose';

async function classStats(classIds: unknown[], tenantId: unknown, tenantDb: mongoose.Connection) {
  const { Student, Section } = getTenantModels(tenantDb);
  const studentMatch: Record<string, unknown> = { classId: { $in: classIds }, isArchived: false };
  const sectionMatch: Record<string, unknown> = { classId: { $in: classIds }, isArchived: false };
  if (tenantId) {
    studentMatch.tenantId = tenantId;
    sectionMatch.tenantId = tenantId;
  }
  const [students, sections] = await Promise.all([
    Student.aggregate([
      { $match: studentMatch },
      { $group: { _id: '$classId', n: { $sum: 1 } } },
    ]),
    Section.aggregate([
      { $match: sectionMatch },
      { $group: { _id: '$classId', n: { $sum: 1 } } },
    ]),
  ]);
  return {
    students: new Map(students.map((c: any) => [String(c._id), c.n])),
    sections: new Map(sections.map((c: any) => [String(c._id), c.n])),
  };
}

export const listClasses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Student, Class, Section, Staff } = getTenantModels(tenantDb);

  const { page, limit } = parsePagination(req.query);
  const { search, sessionId, status } = req.query as Record<string, string | undefined>;

  let filter: Record<string, unknown> = {};
  if (search) filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (sessionId) filter.sessionId = sessionId;
  if (status === 'active') filter.isActive = true;
  else if (status === 'inactive') filter.isActive = false;
  else if (status === 'archived') filter.isArchived = true;
  else filter.isArchived = false;

  filter = scopeQuery(req, filter);

  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    Class.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Class.countDocuments(filter),
  ]);

  const tenantId = getTenantObjectId(req);
  const stats = await classStats(docs.map((d) => d._id), tenantId, tenantDb);

  // Compute full-dataset summary across the active filter scope (not just current page)
  const allFilteredClassIds = await Class.find(filter).distinct('_id');
  const [totalStudentsSummary, totalSectionsSummary] = await Promise.all([
    Student.countDocuments({ ...scopeQuery(req, { classId: { $in: allFilteredClassIds }, isArchived: false }) }),
    Section.countDocuments({ ...scopeQuery(req, { classId: { $in: allFilteredClassIds }, isArchived: false }) }),
  ]);

  const classTeacherIds = Array.from(new Set(docs.map(d => String(d.classTeacherId)).filter(id => id && id !== 'undefined')));
  const teachers = await Staff.find({ _id: { $in: classTeacherIds } }).select('_id fullName').lean();
  const teacherMap = new Map(teachers.map(t => [String(t._id), t.fullName]));

  const data = docs.map((d) => ({
    ...publicClass(d as never),
    classTeacherName: d.classTeacherId ? teacherMap.get(String(d.classTeacherId)) : null,
    studentCount: stats.students.get(String(d._id)) ?? 0,
    sectionCount: stats.sections.get(String(d._id)) ?? 0,
  }));
  paginated(res, {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    summary: { totalStudents: totalStudentsSummary, totalSections: totalSectionsSummary },
  });
});

/** GET /api/classes/:id — full detail: sections, subjects, teacher. */
export const getClass = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Student, Class, Section, Subject } = getTenantModels(tenantDb);

  const doc = await Class.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Class not found');
  const tenantId = getTenantObjectId(req);
  const [sections, subjects] = await Promise.all([
    Section.find(scopeQuery(req, { classId: doc._id, isArchived: false })).select('name isActive').lean(),
    Subject.find(scopeQuery(req, { classIds: doc._id, isArchived: false })).select('name code').lean(),
  ]);
  const studentCount = await Student.countDocuments(scopeQuery(req, { classId: doc._id, isArchived: false }));
  
  let classTeacherName = null;
  if (doc.classTeacherId) {
    const { Staff } = getTenantModels(tenantDb);
    const teacher = await Staff.findById(doc.classTeacherId).select('fullName').lean();
    if (teacher) classTeacherName = teacher.fullName;
  }

  ok(res, {
    ...publicClass(doc),
    classTeacherName,
    studentCount,
    sections: sections.map((s) => ({ _id: String(s._id), name: s.name, isActive: s.isActive })),
    subjects: subjects.map((s) => ({ _id: String(s._id), name: s.name, code: s.code })),
  });
});

/** POST /api/classes */
export const createClass = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Section, AcademicSession, Staff, Subject, Student } = getTenantModels(tenantDb);
  const { name, code, sessionId } = req.body as Record<string, string | undefined>;
  const tenantId = getTenantObjectId(req);
  await requireSession(sessionId as string, false, tenantId, undefined, tenantDb);

  try {
    const doc = await Class.create({
      tenantId,
      name,
      code: (code ?? '').toUpperCase(),
      sessionId,

    });

    // Ensure default Section "A" exists so students can immediately be enrolled
    await Section.create({
      tenantId,
      name: 'A',
      classId: doc._id,
      sessionId: doc.sessionId,
      capacity: 40,
    }).catch(() => undefined);

    recordAudit('classes', 'CLASS_CREATED', req.user, String(doc._id), { name: doc.name });
    created(res, publicClass(doc));
  } catch (err: any) {
    if (err?.code === 11000 || err?.message?.includes('E11000')) {
      throw ApiError.conflict('A class with this name already exists in this academic session', 'CLASS_NAME_EXISTS');
    }
    throw err;
  }
});

/** PATCH /api/classes/:id */
export const updateClass = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Section, AcademicSession, Staff, Subject, Student } = getTenantModels(tenantDb);
  const doc = await Class.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Class not found');
  if (doc.isArchived) throw ApiError.badRequest('Archived classes cannot be edited');

  const tenantId = getTenantObjectId(req);
  const body = req.body as Record<string, string | undefined>;

  if (body.sessionId && String(body.sessionId) !== String(doc.sessionId)) {
    throw ApiError.badRequest('Class academic session cannot be modified after creation', 'SESSION_IMMUTABLE');
  }
  if (body.name !== undefined) doc.name = body.name;
  if (body.code !== undefined) doc.code = body.code.toUpperCase();

  try {
    await doc.save();
  } catch (err: any) {
    if (err?.code === 11000 || err?.message?.includes('E11000')) {
      throw ApiError.conflict('A class with this name already exists in this academic session', 'CLASS_NAME_EXISTS');
    }
    throw err;
  }

  recordAudit('classes', 'CLASS_UPDATED', req.user, String(doc._id), { name: doc.name });
  ok(res, publicClass(doc));
});

/** POST /api/classes/:id/class-teacher */
export const assignClassTeacherController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Section, AcademicSession, Staff, Subject, Student } = getTenantModels(tenantDb);
  const { teacherId } = req.body;
  const tenantId = getTenantObjectId(req);
  if (!tenantId) throw ApiError.unauthorized();
  
  const clsId = new mongoose.Types.ObjectId(req.params.id);
  const tId = new mongoose.Types.ObjectId(teacherId);
  const userId = new mongoose.Types.ObjectId(req.user!._id);
  
  const session = await tenantDb.startSession();
  try {
    await session.withTransaction(async () => {
      const cls = await Class.findOne(scopeQuery(req, { _id: clsId })).session(session);
      if (!cls) throw ApiError.notFound('Class not found');
      if (cls.classTeacherId) {
         await unassignClassTeacher(tenantId, clsId, userId, session, tenantDb);
      }
      await assignClassTeacher(tenantId, clsId, tId, userId, session, tenantDb);
    });
  } finally {
    await session.endSession();
  }
  
  recordAudit('classes', 'CLASS_TEACHER_ASSIGNED', req.user, req.params.id, { teacherId });
  
  const updatedDoc = await Class.findById(clsId);
  ok(res, publicClass(updatedDoc as any));
});

/** DELETE /api/classes/:id/class-teacher */
export const unassignClassTeacherController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Section, AcademicSession, Staff, Subject, Student } = getTenantModels(tenantDb);
  const tenantId = getTenantObjectId(req);
  if (!tenantId) throw ApiError.unauthorized();
  
  const clsId = new mongoose.Types.ObjectId(req.params.id);
  const userId = new mongoose.Types.ObjectId(req.user!._id);
  
  const session = await tenantDb.startSession();
  try {
    await session.withTransaction(async () => {
      await unassignClassTeacher(tenantId, clsId, userId, session, tenantDb);
    });
  } finally {
    await session.endSession();
  }
  
  recordAudit('classes', 'CLASS_TEACHER_UNASSIGNED', req.user, req.params.id, {});
  
  const updatedDoc = await Class.findById(clsId);
  ok(res, publicClass(updatedDoc as any));
});

/** POST /api/classes/:id/archive | /restore */
export const archiveClass = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Section, AcademicSession, Staff, Subject, Student } = getTenantModels(tenantDb);
  const restore = req.path.endsWith('/restore');
  const tenantId = getTenantObjectId(req);
  const doc = await Class.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Class not found');

  if (!restore) {
    // Check active students dependency guard
    const activeStudents = await Student.countDocuments(scopeQuery(req, { classId: doc._id, isArchived: false }));
    if (activeStudents > 0) {
      throw ApiError.badRequest('Cannot archive class with active enrolled students. Reassign or archive students first.', 'CLASS_HAS_ACTIVE_STUDENTS');
    }
    // Cascade archive to sections
    await Section.updateMany(scopeQuery(req, { classId: doc._id, isArchived: false }), { $set: { isArchived: true, isActive: false } });
    
    doc.isArchived = true;
    doc.isActive = false;
  } else {
    // Validate session exists and is active
    await requireSession(String(doc.sessionId), false, tenantId, undefined, tenantDb);
    doc.isArchived = false;
    doc.isActive = true;
  }

  try {
    await doc.save();
  } catch (err: any) {
    if (err?.code === 11000 || err?.message?.includes('E11000')) {
      throw ApiError.conflict('An active class with this name already exists in this academic session', 'CLASS_NAME_EXISTS');
    }
    throw err;
  }

  recordAudit('classes', restore ? 'CLASS_RESTORED' : 'CLASS_ARCHIVED', req.user, String(doc._id), { name: doc.name });
  ok(res, publicClass(doc));
});



/** PUT /api/classes/:id/subjects — assign subjects to the class (session-aware). */
export const assignClassSubjects = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Section, AcademicSession, Staff, Subject, Student } = getTenantModels(tenantDb);
  const tenantId = getTenantObjectId(req);
  const doc = await requireClass(req.params.id, tenantId, undefined, tenantDb);
  const { subjectIds } = req.body as { subjectIds: string[] };
  await ensureSubjectsInSession(subjectIds ?? [], String(doc.sessionId));

  const uniqueSubjectIds = Array.from(new Set(subjectIds ?? []));
  // Remove this class from any subject previously assigned but now deselected
  await Subject.updateMany(
    scopeQuery(req, { classIds: doc._id, _id: { $nin: uniqueSubjectIds } }),
    { $pull: { classIds: doc._id } }
  );

  // Update each subject's classIds to include this class
  for (const sid of uniqueSubjectIds) {
    await Subject.updateOne(scopeQuery(req, { _id: sid }), { $addToSet: { classIds: doc._id } });
  }
  const subjects = await Subject.find(scopeQuery(req, { classIds: doc._id, isArchived: false })).select('name code').lean();
  recordAudit('classes', 'CLASS_SUBJECTS_ASSIGNED', req.user, String(doc._id), { count: subjectIds?.length ?? 0 });
  ok(res, subjects.map((s) => ({ _id: String(s._id), name: s.name, code: s.code })));
});

/** GET /api/classes/lookup — lightweight reference list for dropdowns */
export const lookupClasses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class } = getTenantModels(tenantDb);

  const { sessionId } = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = scopeQuery(req, { isArchived: false });
  if (sessionId) filter.sessionId = sessionId;
  
  const docs = await Class.find(filter)
    .sort({ name: 1 })
    .select('_id name sessionId isActive')
    .lean();
  ok(res, docs.map(d => ({ _id: String(d._id), name: d.name, sessionId: String(d.sessionId), isActive: d.isActive })));
});

/** POST /api/classes/:id/substitutes */
export const assignSubstitute = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Staff, TemporaryAssignment } = getTenantModels(tenantDb);
  const { substituteTeacherId, startDate, endDate } = req.body;
  const tenantId = getTenantObjectId(req);
  
  const clsId = new mongoose.Types.ObjectId(req.params.id);
  const cls = await Class.findOne(scopeQuery(req, { _id: clsId }));
  if (!cls) throw ApiError.notFound('Class not found');
  
  const substitute = await Staff.findOne({ _id: substituteTeacherId, tenantId, staffType: 'teaching' });
  if (!substitute) throw ApiError.badRequest('Substitute teacher not found');
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);
  
  if (start > end) throw ApiError.badRequest('Start date must be before end date');
  
  const session = await tenantDb.startSession();
  let assignment: any = null;
  
  try {
    await session.withTransaction(async () => {
      // Version touch to lock class document against concurrent substitute assignments
      const clsDoc = await Class.findOneAndUpdate(
        { _id: clsId, tenantId },
        { $set: { updatedAt: new Date() } },
        { session, new: true }
      );
      if (!clsDoc) throw ApiError.notFound('Class not found');
      
      const overlap = await TemporaryAssignment.findOne({
        classId: clsId,
        status: 'active',
        $or: [
          { startDate: { $lte: end }, endDate: { $gte: start } }
        ]
      }).session(session);
      
      if (overlap) throw ApiError.conflict('An active substitute assignment already exists for this date range');
      
      const newAssignment = await TemporaryAssignment.create([{
        tenantId,
        classId: clsId,
        permanentTeacherId: clsDoc.classTeacherId,
        substituteTeacherId: substitute._id,
        startDate: start,
        endDate: end,
        status: 'active',
        assignedBy: req.user!._id,
      }], { session });
      
      assignment = newAssignment[0];
    });
  } finally {
    await session.endSession();
  }
  
  recordAudit('classes', 'SUBSTITUTE_ASSIGNED', req.user, String(assignment._id), { classId: String(cls._id), substitute: String(substitute._id) });
  
  const { publicTemporaryAssignment } = await import('../models/TemporaryAssignment');
  created(res, publicTemporaryAssignment(assignment));
});

/** PATCH /api/classes/substitutes/:id/cancel */
export const cancelSubstitute = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { TemporaryAssignment } = getTenantModels(tenantDb);
  
  const assignment = await TemporaryAssignment.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!assignment) throw ApiError.notFound('Assignment not found');
  if (assignment.status !== 'active') throw ApiError.badRequest('Assignment is already cancelled or expired');
  
  assignment.status = 'cancelled';
  assignment.cancelledAt = new Date();
  assignment.cancelledBy = req.user!._id as any;
  await assignment.save();
  
  recordAudit('classes', 'SUBSTITUTE_CANCELLED', req.user, String(assignment._id), { classId: String(assignment.classId) });
  
  const { publicTemporaryAssignment } = await import('../models/TemporaryAssignment');
  ok(res, publicTemporaryAssignment(assignment));
});

/** GET /api/classes/:id/substitutes */
export const listSubstitutes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { TemporaryAssignment } = getTenantModels(tenantDb);
  
  const assignments = await TemporaryAssignment.find(scopeQuery(req, { classId: req.params.id }))
    .sort({ createdAt: -1 })
    .lean();
    
  const { publicTemporaryAssignment } = await import('../models/TemporaryAssignment');
  ok(res, assignments.map(a => ({
    ...publicTemporaryAssignment(a as any),
    substituteTeacherName: undefined  // Populate via separate lookup if needed
  })));
});
