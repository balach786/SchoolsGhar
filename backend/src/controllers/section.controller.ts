import { getTenantModels } from '../services/TenantModelRegistry';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import { ok, created, paginated } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { parsePagination } from '../utils/query';
import { Section, publicSection } from '../models/Section';
import { requireClass } from '../services/academic.service';
import { recordAudit } from '../services/audit.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

/** GET /api/sections */
export const listSections = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Section, Class, Student } = getTenantModels(tenantDb);

  const { page, limit } = parsePagination(req.query);
  const { search, classId, sessionId, status } = req.query as Record<string, string | undefined>;

  let filter: Record<string, unknown> = {};
  if (search) filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (classId) filter.classId = classId;
  if (sessionId) filter.sessionId = sessionId;
  if (status === 'active') filter.isActive = true;
  else if (status === 'inactive') filter.isActive = false;
  else if (status === 'archived') filter.isArchived = true;
  else filter.isArchived = false;

  filter = scopeQuery(req, filter);

  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    Section.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Section.countDocuments(filter),
  ]);

  // Class names (compact map, no duplication)
  const classIds = Array.from(new Set(docs.map((d) => String(d.classId))));
  const classes = await Class.find(scopeQuery(req, { _id: { $in: classIds } })).select('name code').lean();
  const classMap = new Map(classes.map((c) => [String(c._id), c.name]));

  const tenantId = getTenantObjectId(req);
  const studentMatch: Record<string, unknown> = {
    sectionId: { $in: docs.map((d) => d._id) },
    isArchived: false,
  };
  if (tenantId) studentMatch.tenantId = tenantId;

  const counts = await Student.aggregate([
    { $match: studentMatch },
    { $group: { _id: '$sectionId', n: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.n]));

  const data = docs.map((d) => ({
    ...publicSection(d as never),
    className: classMap.get(String(d.classId)) ?? '—',
    studentCount: countMap.get(String(d._id)) ?? 0,
  }));
  paginated(res, { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 } });
});

/** POST /api/sections */
export const createSection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Section, AcademicSession, Staff, Subject, Student, StudentHistory, ReceiptCounter, Role, User } = getTenantModels(tenantDb);
  const { name, classId } = req.body as { name: string; classId: string };
  const tenantId = getTenantObjectId(req);
  const cls = await requireClass(classId, tenantId, undefined, tenantDb);

  // Duplicate section name within the class is prevented
  const existing = await Section.findOne(scopeQuery(req, { classId: cls._id, name, isArchived: false }));
  if (existing) throw ApiError.conflict('A section with this name already exists in this class', 'SECTION_EXISTS');

  try {
    const doc = await Section.create({
      tenantId,
      name,
      classId: cls._id,
      sessionId: cls.sessionId,
    });
    recordAudit('sections', 'SECTION_CREATED', req.user, String(doc._id), { name });
    created(res, publicSection(doc));
  } catch (err: any) {
    if (err?.code === 11000 || err?.message?.includes('E11000')) {
      throw ApiError.conflict('A section with this name already exists in this class', 'SECTION_EXISTS');
    }
    throw err;
  }
});

/** PATCH /api/sections/:id */
export const updateSection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Section, AcademicSession, Staff, Subject, Student, StudentHistory, ReceiptCounter, Role, User, StudentAttendance } = getTenantModels(tenantDb);
  const doc = await Section.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Section not found');
  if (doc.isArchived) throw ApiError.badRequest('Archived sections cannot be edited');

  const tenantId = getTenantObjectId(req);
  const { name, classId } = req.body as { name?: string; classId?: string };

  if (classId && String(classId) !== String(doc.classId)) {
    const [studentCount, historySectionCount, historyPrevSectionCount, attendanceCount] = await Promise.all([
      Student.countDocuments({ tenantId, sectionId: doc._id }),
      StudentHistory.countDocuments({ tenantId, sectionId: doc._id }),
      StudentHistory.countDocuments({ tenantId, previousSectionId: doc._id }),
      StudentAttendance.countDocuments({ tenantId, sectionId: doc._id }),
    ]);

    const totalHistoricalDeps = studentCount + historySectionCount + historyPrevSectionCount + attendanceCount;
    if (totalHistoricalDeps > 0) {
      throw ApiError.conflict(
        'Cannot reassign section with existing students, historical placement, or attendance records to another class',
        'SECTION_CLASS_CHANGE_BLOCKED'
      );
    }

    const cls = await requireClass(classId, tenantId, undefined, tenantDb);
    // Validate destination name uniqueness
    const existing = await Section.findOne(
      scopeQuery(req, { classId: cls._id, normalizedName: doc.normalizedName, isArchived: false })
    );
    if (existing) {
      throw ApiError.conflict('A section with this name already exists in the destination class', 'SECTION_EXISTS');
    }

    doc.classId = cls._id;
    doc.sessionId = cls.sessionId;
  }
  if (name !== undefined) doc.name = name;

  try {
    await doc.save();
  } catch (err: any) {
    if (err?.code === 11000 || err?.message?.includes('E11000')) {
      throw ApiError.conflict('A section with this name already exists in this class', 'SECTION_EXISTS');
    }
    throw err;
  }

  recordAudit('sections', 'SECTION_UPDATED', req.user, String(doc._id), { name: doc.name });
  ok(res, publicSection(doc));
});

/** POST /api/sections/:id/archive | /restore */
export const archiveSection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Class, Section, AcademicSession, Staff, Subject, Student, StudentHistory, ReceiptCounter, Role, User } = getTenantModels(tenantDb);
  const restore = req.path.endsWith('/restore');
  const doc = await Section.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!doc) throw ApiError.notFound('Section not found');

  if (!restore) {
    const activeStudents = await Student.countDocuments(scopeQuery(req, { sectionId: doc._id, isArchived: false }));
    if (activeStudents > 0) {
      throw ApiError.badRequest('Cannot archive section with active enrolled students. Reassign or archive students first.', 'SECTION_HAS_ACTIVE_STUDENTS');
    }
    doc.isArchived = true;
    doc.isActive = false;
  } else {
    const parentClass = await Class.findOne(scopeQuery(req, { _id: doc.classId, isArchived: false }));
    if (!parentClass) {
      throw ApiError.badRequest('Cannot restore section because parent class is archived or missing', 'CLASS_ARCHIVED');
    }
    doc.isArchived = false;
    doc.isActive = true;
  }

  try {
    await doc.save();
  } catch (err: any) {
    if (err?.code === 11000 || err?.message?.includes('E11000')) {
      throw ApiError.conflict('An active section with this name already exists in this class', 'SECTION_EXISTS');
    }
    throw err;
  }

  recordAudit('sections', restore ? 'SECTION_RESTORED' : 'SECTION_ARCHIVED', req.user, String(doc._id), { name: doc.name });
  ok(res, publicSection(doc));
});

/** GET /api/sections/:id/students — compact roster. */
export const sectionStudents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Section, Student } = getTenantModels(tenantDb);
  const section = await Section.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!section) throw ApiError.notFound('Section not found');
  const students = await Student.find(scopeQuery(req, { sectionId: section._id, isArchived: false }))
    .select('fullName admissionNumber rollNumber gender isActive')
    .sort({ rollNumber: 1 })
    .limit(100)
    .lean();
  ok(
    res,
    students.map((s) => ({
      _id: String(s._id),
      fullName: s.fullName,
      admissionNumber: s.admissionNumber,
      rollNumber: s.rollNumber,
      gender: s.gender,
      isActive: s.isActive,
    }))
  );
});

/** GET /api/sections/lookup — lightweight reference list for dropdowns */
export const lookupSections = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Section } = getTenantModels(tenantDb);
  const { classId } = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = scopeQuery(req, { isArchived: false });
  if (classId) filter.classId = classId;

  const docs = await Section.find(filter)
    .sort({ name: 1 })
    .select('_id name classId isActive')
    .lean();
  ok(res, docs.map(d => ({ _id: String(d._id), name: d.name, classId: String(d.classId), isActive: d.isActive })));
});
