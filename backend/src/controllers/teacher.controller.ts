import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import { ok, created, paginated } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { parsePagination } from '../utils/query';
import { publicTeacher } from '../models/Teacher';
import { getTenantModels } from '../services/TenantModelRegistry';
import { ROLE_SLUGS } from '../config/permissions';
import { requireUserLink } from '../services/academic.service';
import { parseDateOrThrow } from '../validators/academic.validators';
import { hasPermission } from '../services/permission.service';
import { recordAudit } from '../services/audit.service';
import { hashPassword } from '../utils/security';
import crypto from 'crypto';
import { revokeAllSessions } from '../services/auth.service';
import { executeAdminRemovalWithLock } from '../services/adminSecurity.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';
import { assignClassTeacher } from '../services/classTeacher.service';

/** GET /api/teachers/me — the signed-in teacher's own profile (self-service). */
export const getOwnProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Teacher, User } = getTenantModels(tenantDb);

  // Primary lookup: find by userId
  let teacher = await Teacher.findOne({ userId: req.user?._id, isArchived: false });

  // Auto-heal fallback: match by email if userId link is missing
  if (!teacher) {
    const userDoc = await User.findById(req.user?._id).select('email tenantId');
    if (userDoc?.email) {
      const matchQuery: Record<string, unknown> = {
        email: userDoc.email.trim().toLowerCase(),
        isArchived: false,
        isActive: true,
      };
      if (userDoc.tenantId) matchQuery.tenantId = userDoc.tenantId;
      const potentialMatches = await Teacher.find(matchQuery);
      if (potentialMatches.length === 1 && !potentialMatches[0].userId) {
        teacher = potentialMatches[0];
        teacher.userId = new mongoose.Types.ObjectId(String(req.user?._id));
        await teacher.save();
      }
    }
  }

  if (!teacher) throw ApiError.forbidden('No active teacher profile is linked to this account', 'TEACHER_PROFILE_REQUIRED');
  ok(res, publicTeacher(teacher, { hideSalary: true }));
});

/** GET /api/teachers */
export const listTeachers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Teacher, Class } = getTenantModels(tenantDb);

  const { page, limit } = parsePagination(req.query);
  const { search, status, sort } = req.query as Record<string, string | undefined>;

  let filter: Record<string, unknown> = {};
  if (search) {
    const rx = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { fullName: { $regex: rx, $options: 'i' } },
      { employeeId: { $regex: rx, $options: 'i' } },
      { email: { $regex: rx, $options: 'i' } },
      { fatherName: { $regex: rx, $options: 'i' } },
    ];
  }

  if (status === 'active') filter.isActive = true;
  else if (status === 'inactive') filter.isActive = false;
  else if (status === 'archived') filter.isArchived = true;
  else filter.isArchived = false;

  filter = scopeQuery(req, filter);

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    fullName: { fullName: 1 },
    '-fullName': { fullName: -1 },
    joiningDate: { joiningDate: -1 },
    '-joiningDate': { joiningDate: 1 },
    createdAt: { createdAt: -1 },
    '-createdAt': { createdAt: 1 },
  };
  const sortSpec = sortMap[sort ?? ''] ?? { createdAt: -1 };

  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    Teacher.find(filter).sort(sortSpec).skip(skip).limit(limit).lean(),
    Teacher.countDocuments(filter),
  ]);

  // Accurate tenant-wide metrics for KPIs across pagination
  const [totalAll, activeAll, qualifiedAll] = await Promise.all([
    Teacher.countDocuments(scopeQuery(req, { isArchived: false })),
    Teacher.countDocuments(scopeQuery(req, { isArchived: false, isActive: true })),
    Teacher.countDocuments(
      scopeQuery(req, { isArchived: false, qualification: { $exists: true, $nin: [null, ''] } })
    ),
  ]);

  const canSeeSalary = req.user
    ? await hasPermission(req.user.roleId, req.user.role, 'salaries', 'view', req.user?.tenantId)
    : false;

  // Class teacher assignment lookup from same tenant connection
  const classes = await Class.find({ classTeacherId: { $in: docs.map(d => d._id) } }).select('name classTeacherId').lean();
  const classMap = new Map(classes.map(c => [String(c.classTeacherId), c.name]));

  const data = docs.map((d) => {
    const t = d as never as import('../models/Teacher').ITeacher;
    return { ...publicTeacher(t, { hideSalary: !canSeeSalary }), className: classMap.get(String(t._id)) };
  });

  paginated(res, {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    summary: { total: totalAll, active: activeAll, qualified: qualifiedAll },
  });
});

/** GET /api/teachers/:id — full profile with class/subject names. */
export const getTeacher = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Teacher, Class } = getTenantModels(tenantDb);

  const teacher = await Teacher.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!teacher) throw ApiError.notFound('Teacher not found');

  const canSeeSalary = await hasPermission(req.user!.roleId, req.user!.role, 'salaries', 'view', req.user?.tenantId);
  const assignedClass = await Class.findOne({ classTeacherId: teacher._id }).select('_id name').lean();

  ok(res, {
    ...publicTeacher(teacher, { hideSalary: !canSeeSalary }),
    classId: assignedClass ? String(assignedClass._id) : undefined,
    className: assignedClass?.name,
  });
});

/** POST /api/teachers */
export const createTeacher = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Teacher, Staff, User, Role } = getTenantModels(tenantDb);

  const body = req.body as {
    employeeId: string;
    fullName: string;
    fatherName: string;
    caste: string;
    joiningDate: string;
    designation?: string;
    salary?: number;
    userId?: string | null;
    email?: string;
    phone?: string;
    qualification?: string;
    documents?: any[];
    createLogin?: boolean;
    classId?: string;
    [k: string]: unknown;
  };

  const tenantId = getTenantObjectId(req);

  // Check uniqueness across base Staff collection (teaching + non-teaching)
  const dupFilter: Record<string, unknown> = { employeeId: body.employeeId.toUpperCase() };
  if (tenantId) dupFilter.tenantId = tenantId;
  const existing = await Staff.findOne(dupFilter).select('_id').lean();
  if (existing) throw ApiError.conflict('Employee ID already exists in this school', 'EMPLOYEE_ID_TAKEN');

  let userId = await requireUserLink(body.userId as string | null | undefined, 'teacher', undefined, tenantId, undefined, tenantDb);
  const emailVal = body.email ? body.email.trim().toLowerCase() : undefined;

  // If createLogin is enabled, we must create the user atomically
  if (body.createLogin && !userId) {
    if (!emailVal) throw ApiError.badRequest('Email is required when creating a login account');
    const existingUser = await User.findOne({ email: emailVal });
    if (existingUser) throw ApiError.conflict('A user with this email already exists', 'EMAIL_TAKEN');
  }

  const session = await tenantDb.startSession();
  let tempPassword: string | undefined;
  try {
    let teacher: any;
    await session.withTransaction(async () => {
      if (body.createLogin && !userId && emailVal) {
        const teacherRole = await Role.findOne({ slug: ROLE_SLUGS.teacher }).session(session);
        if (!teacherRole) throw new ApiError(500, 'Teacher role not found');
        
        tempPassword = crypto.randomBytes(8).toString('hex');
        const user = await User.create([{
          name: body.fullName,
          email: emailVal,
          passwordHash: await hashPassword(tempPassword),
          roleId: teacherRole._id,
          tenantId,
          isActive: true,
        }], { session });
        
        userId = user[0]._id as unknown as mongoose.Types.ObjectId;
      }

      const createdTeachers = await Teacher.create([{
        tenantId,
        employeeId: body.employeeId.toUpperCase(),
        staffType: 'teaching',
        designation: body.designation || 'Teacher',
        fullName: body.fullName,
        fatherName: body.fatherName,
        caste: body.caste,
        email: emailVal,
        phone: body.phone ? body.phone.trim() : undefined,
        qualification: body.qualification || undefined,
        joiningDate: parseDateOrThrow(body.joiningDate, 'Joining date'),
        salary: body.salary ?? 0,
        userId,
        documents: body.documents ?? [],
      }], { session });
      
      teacher = createdTeachers[0];
    });

    recordAudit('teachers', 'TEACHER_CREATED', req.user, String(teacher._id), { employeeId: teacher.employeeId });
    
    ok(res, { ...publicTeacher(teacher), tempPassword }, 201);
  } catch (err: any) {
    session.endSession();
    if (err?.code === 11000 || err?.message?.includes('E11000')) {
      throw ApiError.conflict('Employee ID already exists in this school', 'EMPLOYEE_ID_TAKEN');
    }
    throw err;
  }
});

/** PATCH /api/teachers/:id */
export const updateTeacher = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Teacher, Staff, User, Role, Class } = getTenantModels(tenantDb);

  const teacher = await Teacher.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!teacher) throw ApiError.notFound('Teacher not found');
  if (teacher.isArchived) throw ApiError.badRequest('Archived teachers cannot be edited');

  const tenantId = getTenantObjectId(req);
  const body = req.body as Record<string, unknown>;

  // Employee ID check against base Staff collection (teaching + non-teaching)
  if (body.employeeId !== undefined && String(body.employeeId).toUpperCase() !== teacher.employeeId) {
    const dupFilter: Record<string, unknown> = {
      employeeId: String(body.employeeId).toUpperCase(),
      _id: { $ne: teacher._id },
    };
    if (tenantId) dupFilter.tenantId = tenantId;
    const dup = await Staff.findOne(dupFilter).select('_id').lean();
    if (dup) throw ApiError.conflict('Employee ID already exists in this school', 'EMPLOYEE_ID_TAKEN');
  }

  // Salary permission check
  if (body.salary !== undefined && Number(body.salary) !== Number(teacher.salary)) {
    const canEditSalary = req.user
      ? await hasPermission(req.user.roleId, req.user.role, 'salaries', 'edit', req.user?.tenantId)
      : false;
    if (!canEditSalary) {
      throw ApiError.forbidden('You do not have permission to modify salary', 'SALARY_EDIT_FORBIDDEN');
    }
    if (Number(body.salary) < 0) throw ApiError.badRequest('Salary cannot be negative');
  }

  const allowedKeys = [
    'designation', 'fullName', 'fatherName', 'caste', 'email', 'phone',
    'qualification', 'joiningDate', 'salary', 'documents', 'employeeId', 'userId',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (body.employeeId !== undefined) updates.employeeId = String(body.employeeId).toUpperCase();
  if (body.joiningDate !== undefined) updates.joiningDate = parseDateOrThrow(String(body.joiningDate), 'Joining date');
  if (body.email !== undefined) updates.email = body.email ? String(body.email).trim().toLowerCase() : undefined;
  if (body.phone !== undefined) updates.phone = body.phone ? String(body.phone).trim() : undefined;

  let unsetUserId = false;
  if (body.userId !== undefined) {
    if (body.userId === null || body.userId === '') {
      delete updates.userId;
      unsetUserId = true;
    } else {
      updates.userId = await requireUserLink(body.userId as string, 'teacher', String(teacher._id), tenantId, undefined, tenantDb);
    }
  }

  let tempPassword: string | undefined;
  const performUpdate = async (session?: mongoose.ClientSession) => {
    Object.assign(teacher, updates);
    if (unsetUserId) teacher.set('userId', undefined);
    
    if (body.createLogin && !teacher.userId && updates.email) {
      const emailVal = String(updates.email).trim().toLowerCase();
      const existingUser = await User.findOne({ email: emailVal }).session(session || null);
      if (existingUser) throw ApiError.conflict('A user with this email already exists', 'EMAIL_TAKEN');
      
      const teacherRole = await Role.findOne({ slug: ROLE_SLUGS.teacher }).session(session || null);
      if (!teacherRole) throw new ApiError(500, 'Teacher role not found');
      
      tempPassword = crypto.randomBytes(8).toString('hex');
      const user = await User.create([{
        name: teacher.fullName,
        email: emailVal,
        passwordHash: await hashPassword(tempPassword),
        roleId: teacherRole._id,
        tenantId,
        isActive: true,
      }], { session });
      
      teacher.userId = user[0]._id;
    }

    await teacher.save(session ? { session } : undefined);
  };

  const session = await tenantDb.startSession();
  try {
    await session.withTransaction(async () => {
      await performUpdate(session);
    });
  } catch (err: any) {
    if (
      err?.message?.includes('does not support retryable writes') ||
      err?.message?.includes('Transactions are not supported')
    ) {
      await performUpdate();
    } else {
      if (err?.code === 11000 || err?.message?.includes('E11000')) {
        throw ApiError.conflict('Employee ID already exists in this school', 'EMPLOYEE_ID_TAKEN');
      }
      throw err;
    }
  } finally {
    await session.endSession();
  }

  recordAudit('teachers', 'TEACHER_UPDATED', req.user, String(teacher._id), { employeeId: teacher.employeeId });
  const assignedClass = await Class.findOne({ classTeacherId: teacher._id }).select('_id name').lean();
  ok(res, { ...publicTeacher(teacher), tempPassword, classId: assignedClass?._id, className: assignedClass?.name });
});

/** POST /api/teachers/:id/archive | /restore */
export const archiveTeacher = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Teacher, User, Role, Class } = getTenantModels(tenantDb);

  const restore = req.path.endsWith('/restore');
  const teacher = await Teacher.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!teacher) throw ApiError.notFound('Teacher not found');

  if (!restore) {
    const isClassTeacher = await Class.exists({ classTeacherId: teacher._id, tenantId: getTenantObjectId(req) });
    if (isClassTeacher) {
      throw ApiError.conflict('Cannot archive a teacher who is currently assigned as a Class Teacher. Please explicitly unassign or change the class teacher first.');
    }
  }

  if (restore) {
    teacher.isArchived = false;
    teacher.isActive = true;
    await teacher.save();
    recordAudit('teachers', 'TEACHER_RESTORED', req.user, String(teacher._id), { employeeId: teacher.employeeId });
    return ok(res, publicTeacher(teacher));
  }

  teacher.isArchived = true;
  teacher.isActive = false;

  let userToDeactivate: any = null;
  if (teacher.userId) {
    userToDeactivate = await User.findById(teacher.userId);
  }

  let isUserActiveAdmin = false;
  if (userToDeactivate && userToDeactivate.isActive && !userToDeactivate.isArchived) {
    const role = await Role.findById(userToDeactivate.roleId).select('slug isSystemRole').lean();
    isUserActiveAdmin = Boolean(role?.isSystemRole && (role.slug === ROLE_SLUGS.superAdmin || role.slug === ROLE_SLUGS.admin));
  }

  if (userToDeactivate && userToDeactivate.isActive) {
    if (isUserActiveAdmin) {
      await executeAdminRemovalWithLock(
        req.user?.tenantId,
        String(userToDeactivate._id),
        async (session) => {
          await teacher.save(session ? { session } : undefined);
          userToDeactivate.isActive = false;
          await userToDeactivate.save(session ? { session } : undefined);
        }
      );
    } else {
      const session = await tenantDb.startSession();
      try {
        await session.withTransaction(async () => {
          await teacher.save({ session });
          userToDeactivate.isActive = false;
          await userToDeactivate.save({ session });
        });
      } catch (err: any) {
        if (
          err?.message?.includes('does not support retryable writes') ||
          err?.message?.includes('Transactions are not supported')
        ) {
          await teacher.save();
          userToDeactivate.isActive = false;
          await userToDeactivate.save();
        } else {
          throw err;
        }
      } finally {
        await session.endSession();
      }
    }
    // Revoke sessions strictly post-commit
    await revokeAllSessions(new mongoose.Types.ObjectId(String(userToDeactivate._id)), tenantDb);
  } else {
    await teacher.save();
  }

  recordAudit('teachers', 'TEACHER_ARCHIVED', req.user, String(teacher._id), { employeeId: teacher.employeeId });
  ok(res, publicTeacher(teacher));
});
