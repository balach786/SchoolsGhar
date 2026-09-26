import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import { ok, created, paginated } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { parsePagination } from '../utils/query';
import { IStaff, publicStaff, StaffType } from '../models/Staff';
import { getTenantModels } from '../services/TenantModelRegistry';



import { ROLE_SLUGS } from '../config/permissions';
import { requireUserLink } from '../services/academic.service';
import { parseDateOrThrow } from '../validators/academic.validators';
import { hasPermission } from '../services/permission.service';
import { recordAudit } from '../services/audit.service';
import { revokeAllSessions } from '../services/auth.service';
import { executeAdminRemovalWithLock } from '../services/adminSecurity.service';
import { scopeQuery, getTenantObjectId } from '../utils/tenantScope';

/** GET /api/staff — unified directory of all school employees */
export const listStaff = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Staff, User, Role } = getTenantModels(tenantDb);
  const { page, limit } = parsePagination(req.query);
  const { search, staffType, designation, department, status, sort } = req.query as Record<
    string,
    string | undefined
  >;

  let filter: Record<string, unknown> = {};
  if (search) {
    const rx = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { fullName: { $regex: rx, $options: 'i' } },
      { employeeId: { $regex: rx, $options: 'i' } },
      { email: { $regex: rx, $options: 'i' } },
      { designation: { $regex: rx, $options: 'i' } },
      { fatherName: { $regex: rx, $options: 'i' } },
    ];
  }
  if (staffType) filter.staffType = staffType;
  if (designation) filter.designation = designation;
  if (department) filter.department = department;

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
    employeeId: { employeeId: 1 },
    '-employeeId': { employeeId: -1 },
  };
  const sortSpec = sortMap[sort ?? ''] ?? { createdAt: -1 };

  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    Staff.find(filter).sort(sortSpec).skip(skip).limit(limit).lean(),
    Staff.countDocuments(filter),
  ]);

  const canSeeSalary = req.user
    ? await hasPermission(req.user.roleId, req.user.role, 'salaries', 'view', req.user?.tenantId, req.tenantDb as mongoose.Connection)
    : false;

  const data = docs.map((d) => publicStaff(d, { hideSalary: !canSeeSalary }));
  paginated(res, { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 } });
});

/** GET /api/staff/:id */
export const getStaff = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Staff, User, Role } = getTenantModels(tenantDb);
  const staff = await Staff.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!staff) throw ApiError.notFound('Staff member not found');



  const canSeeSalary = req.user
    ? await hasPermission(req.user.roleId, req.user.role, 'salaries', 'view', req.user?.tenantId, tenantDb)
    : false;

  ok(res, publicStaff(staff, { hideSalary: !canSeeSalary }));
});

/** POST /api/staff */
export const createStaff = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Staff, User, Role } = getTenantModels(tenantDb);
  const body = req.body as {
    employeeId: string;
    staffType: StaffType;
    designation: string;
    department?: string;
    fullName: string;
    fatherName: string;
    caste: string;
    gender?: 'male' | 'female' | 'other';
    email?: string;
    phone?: string;
    address?: string;
    dateOfBirth?: string;
    joiningDate: string;
    qualification?: string;
    specialization?: string;
    salary?: number;
    userId?: string;
    documents?: any[];
  };

  if (!body.employeeId || !body.staffType || !body.designation || !body.fullName || !body.joiningDate || !body.fatherName || !body.caste) {
    throw ApiError.badRequest('Missing required employee fields');
  }

  const tenantId = getTenantObjectId(req);
  const dupFilter: Record<string, unknown> = { employeeId: body.employeeId.toUpperCase() };
  if (tenantId) dupFilter.tenantId = tenantId;
  const existing = await Staff.findOne(dupFilter).select('_id').lean();
  if (existing) throw ApiError.conflict('Employee ID already exists in this school', 'EMPLOYEE_ID_TAKEN');

  // Validate optional userId link without coupling designation to RBAC role
  const linkedUserId = body.userId
    ? await requireUserLink(body.userId, 'staff', undefined, tenantId, undefined, tenantDb)
    : undefined;

  try {
    const staff = await Staff.create({
      tenantId,
      employeeId: body.employeeId.toUpperCase(),
      staffType: body.staffType,
      designation: body.designation,
      department: body.department,
      fullName: body.fullName,
      fatherName: body.fatherName.trim(),
      caste: body.caste.trim(),
      gender: body.gender,
      email: body.email ? body.email.trim().toLowerCase() : undefined,
      phone: body.phone ? body.phone.trim() : undefined,
      address: body.address,
      dateOfBirth: body.dateOfBirth ? parseDateOrThrow(body.dateOfBirth, 'Date of birth') : undefined,
      joiningDate: parseDateOrThrow(body.joiningDate, 'Joining date'),
      qualification: body.qualification,
      specialization: body.specialization,
      salary: body.salary ?? 0,
      userId: linkedUserId,
      documents: body.documents ?? [],
    });

    recordAudit('users', 'STAFF_CREATED', req.user, String(staff._id), {
      employeeId: staff.employeeId,
      staffType: staff.staffType,
      designation: staff.designation,
    });

    created(res, publicStaff(staff));
  } catch (err: any) {
    if (err?.code === 11000 || err?.message?.includes('E11000')) {
      throw ApiError.conflict('Employee ID already exists in this school', 'EMPLOYEE_ID_TAKEN');
    }
    throw err;
  }
});

/** PATCH /api/staff/:id */
export const updateStaff = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Staff, User, Role } = getTenantModels(tenantDb);
  const staff = await Staff.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!staff) throw ApiError.notFound('Staff member not found');
  if (staff.isArchived) throw ApiError.badRequest('Archived staff cannot be edited');

  const tenantId = getTenantObjectId(req);
  const body = req.body as Record<string, unknown>;

  if (body.employeeId !== undefined && String(body.employeeId).toUpperCase() !== staff.employeeId) {
    const dupFilter: Record<string, unknown> = {
      employeeId: String(body.employeeId).toUpperCase(),
      _id: { $ne: staff._id },
    };
    if (tenantId) dupFilter.tenantId = tenantId;
    const dup = await Staff.findOne(dupFilter).select('_id').lean();
    if (dup) throw ApiError.conflict('Employee ID already exists in this school', 'EMPLOYEE_ID_TAKEN');
  }

  // Salary permission check (Requirement 8)
  if (body.salary !== undefined && Number(body.salary) !== Number(staff.salary)) {
    const canEditSalary = req.user
      ? await hasPermission(req.user.roleId, req.user.role, 'salaries', 'edit', req.user?.tenantId, req.tenantDb as mongoose.Connection)
      : false;
    if (!canEditSalary) {
      throw ApiError.forbidden('You do not have permission to modify salary', 'SALARY_EDIT_FORBIDDEN');
    }
    if (Number(body.salary) < 0) throw ApiError.badRequest('Salary cannot be negative');
  }

  // Mass-assignment whitelist: allow only safe editable fields
  const allowedKeys = [
    'designation',
    'department',
    'fullName',
    'fatherName',
    'caste',
    'gender',
    'email',
    'phone',
    'address',
    'dateOfBirth',
    'joiningDate',
    'qualification',
    'specialization',
    'salary',
    'documents',
    'employeeId',
    'userId',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  if (body.employeeId !== undefined) updates.employeeId = String(body.employeeId).toUpperCase();
  if (body.joiningDate !== undefined) updates.joiningDate = parseDateOrThrow(String(body.joiningDate), 'Joining date');
  if (body.dateOfBirth !== undefined) updates.dateOfBirth = body.dateOfBirth ? parseDateOrThrow(String(body.dateOfBirth), 'Date of birth') : undefined;
  if (body.email !== undefined) updates.email = body.email ? String(body.email).trim().toLowerCase() : undefined;
  if (body.phone !== undefined) updates.phone = body.phone ? String(body.phone).trim() : undefined;

  let unsetUserId = false;
  if (body.userId !== undefined) {
    if (body.userId === null || body.userId === '') {
      delete updates.userId;
      unsetUserId = true;
    } else {
      updates.userId = await requireUserLink(body.userId as string, 'staff', String(staff._id), tenantId, undefined, tenantDb);
    }
  }

  Object.assign(staff, updates);
  if (unsetUserId) staff.set('userId', undefined);

  try {
    await staff.save();
  } catch (err: any) {
    if (err?.code === 11000 || err?.message?.includes('E11000')) {
      throw ApiError.conflict('Employee ID already exists in this school', 'EMPLOYEE_ID_TAKEN');
    }
    throw err;
  }

  recordAudit('users', 'STAFF_UPDATED', req.user, String(staff._id), {
    employeeId: staff.employeeId,
    staffType: staff.staffType,
  });

  ok(res, publicStaff(staff));
});

/** POST /api/staff/:id/archive | /restore */
export const archiveStaff = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Staff, User, Role } = getTenantModels(tenantDb);
  const restore = req.path.endsWith('/restore');
  const staff = await Staff.findOne(scopeQuery(req, { _id: req.params.id }));
  if (!staff) throw ApiError.notFound('Staff member not found');

  if (restore) {
    // Restoration: sets isActive=true, isArchived=false. Linked User remains untouched (Requirement 17)
    staff.isArchived = false;
    staff.isActive = true;
    await staff.save();

    recordAudit('users', 'STAFF_RESTORED', req.user, String(staff._id), {
      employeeId: staff.employeeId,
      staffType: staff.staffType,
    });

    return ok(res, publicStaff(staff));
  }

  // Archive flow (Requirement 2):
  // Atomically set staff.isArchived=true, staff.isActive=false, and linked user.isActive=false
  staff.isArchived = true;
  staff.isActive = false;

  let userToDeactivate: any = null;
  if (staff.userId) {
    userToDeactivate = await User.findById(staff.userId);
  }

  let isUserActiveAdmin = false;
  if (userToDeactivate && userToDeactivate.isActive && !userToDeactivate.isArchived) {
    const role = await Role.findById(userToDeactivate.roleId).select('slug isSystemRole').lean();
    isUserActiveAdmin = Boolean(role?.isSystemRole && (role.slug === ROLE_SLUGS.superAdmin || role.slug === ROLE_SLUGS.admin));
  }

  if (userToDeactivate && userToDeactivate.isActive) {
    if (isUserActiveAdmin) {
      // Last-admin invariant check inside Tenant serialization lock
      await executeAdminRemovalWithLock(
        req.user?.tenantId,
        String(userToDeactivate._id),
        async (session) => {
          await staff.save(session ? { session } : undefined);
          userToDeactivate.isActive = false;
          await userToDeactivate.save(session ? { session } : undefined);
        }
      );
    } else {
      const session = await tenantDb.startSession();
      try {
        await session.withTransaction(async () => {
          await staff.save({ session });
          userToDeactivate.isActive = false;
          await userToDeactivate.save({ session });
        });
      } catch (err: any) {
        if (
          err?.message?.includes('does not support retryable writes') ||
          err?.message?.includes('Transactions are not supported')
        ) {
          await staff.save();
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
    await staff.save();
  }

  recordAudit('users', 'STAFF_ARCHIVED', req.user, String(staff._id), {
    employeeId: staff.employeeId,
    staffType: staff.staffType,
  });

  ok(res, publicStaff(staff));
});
