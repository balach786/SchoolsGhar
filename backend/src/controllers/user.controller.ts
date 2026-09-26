import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { AuthRequest } from '../types';
import { ok, created, paginated } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { hashPassword } from '../utils/security';
import { parsePagination } from '../utils/query';
import { User, IUser, publicUser } from '../models/User';
import { Role } from '../models/Role';
import { Tenant } from '../models/Tenant';
import { ROLE_SLUGS } from '../config/permissions';
import { getTenantModels } from '../services/TenantModelRegistry';
import { revokeAllSessions } from '../services/auth.service';
import { recordAudit, AUDIT_ACTIONS } from '../services/audit.service';
import {
  effectiveRole,
  buildEffectivePermissionMap,
  isPermissionSubset,
  invalidatePermissionCache,
} from '../services/permission.service';

async function requireValidRole(roleId: string, tenantId?: string, tenantDb?: mongoose.Connection) {
  const role = await effectiveRole(roleId, tenantId, tenantDb);
  if (!role) throw ApiError.badRequest('Selected role does not exist', 'INVALID_ROLE');
  if (role.slug === 'platform_admin') throw ApiError.forbidden('Platform accounts cannot be assigned to a school.');
  if (!role.isActive) throw ApiError.badRequest('Selected role is inactive', 'INVALID_ROLE');
  return role;
}

/** Only the super admin may create/assign/modify super admin accounts. */
function ensureCanTouchSuperAdmin(actor: AuthRequest['user'], roleSlug: string | undefined): void {
  if (roleSlug === ROLE_SLUGS.superAdmin && actor?.role !== ROLE_SLUGS.superAdmin) {
    throw ApiError.forbidden('Only a Super Admin can manage Super Admin accounts');
  }
}

/**
 * Enforces role assignment ceiling:
 * - Super admin may assign any role.
 * - Non-super admin cannot assign super_admin or platform_admin.
 * - Non-super admin cannot assign any role whose permissions exceed the actor's own effective permissions.
 */
function assertCanAssignRole(actor: AuthRequest['user'], targetRole: any): void {
  if (targetRole.slug === 'platform_admin') {
    throw ApiError.forbidden('Platform accounts cannot be assigned to a school.');
  }
  if (targetRole.slug === ROLE_SLUGS.superAdmin) {
    if (actor?.role !== ROLE_SLUGS.superAdmin) {
      throw ApiError.forbidden('Only a Super Admin can manage Super Admin accounts');
    }
    return;
  }
  if (actor?.role === ROLE_SLUGS.superAdmin) {
    return; // Super admin has full ceiling bypass
  }

  const targetPerms = buildEffectivePermissionMap(targetRole);
  const actorPerms = actor?.permissions || {};
  if (!isPermissionSubset(targetPerms, actorPerms)) {
    throw ApiError.forbidden(
      'You cannot assign a role with permissions exceeding your own privileges.',
      'ROLE_ASSIGNMENT_FORBIDDEN'
    );
  }
}

import { executeAdminRemovalWithLock } from '../services/adminSecurity.service';


/** GET /api/users — paginated list with search + filters. */
export const listUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, limit } = parsePagination(req.query);
  const { search, role, status } = req.query as Record<string, string | undefined>;

  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing');
  const { getTenantModels } = await import('../services/TenantModelRegistry');
  const { User: TenantUser, Role: TenantRole } = getTenantModels(tenantDb);

  const filter: Record<string, unknown> = {};
  if (req.user?.tenantId) {
    filter.tenantId = req.user.tenantId;
  }
  filter.isPlatformAdmin = { $ne: true };

  if (search) {
    filter.$or = [
      { name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { email: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    ];
  }
  if (role) {
    const roleDoc = await TenantRole.findOne({ slug: role }).select('_id').lean();
    filter.roleId = roleDoc ? roleDoc._id : new Types.ObjectId('0'.repeat(24)); // matches nothing
  }

  // P1-3 Inactive filter fix: exclude archived users from inactive view
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

  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    TenantUser.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    TenantUser.countDocuments(filter),
  ]);

  // Resolve role labels in one query
  const roleIds = Array.from(new Set(docs.map((d) => String(d.roleId))));
  const roles = await TenantRole.find({ _id: { $in: roleIds } }).select('slug name').lean();
  const roleMap = new Map(roles.map((r) => [String(r._id), { slug: r.slug, name: r.name }]));

  const data = docs.map((d) => {
    const r = roleMap.get(String(d.roleId));
    return {
      ...publicUser(d as unknown as IUser),
      role: r?.slug ?? 'unknown',
      roleLabel: r?.name ?? 'Unknown',
    };
  });

  paginated(res, { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 } });
});

/** GET /api/users/:id */
export const getUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing');
  const { getTenantModels } = await import('../services/TenantModelRegistry');
  const { User: TenantUser, Role: TenantRole } = getTenantModels(tenantDb);

  const query: Record<string, unknown> = { _id: req.params.id };
  if (req.user?.tenantId) query.tenantId = req.user.tenantId;
  const user = await TenantUser.findOne(query);
  if (!user) throw ApiError.notFound('User not found');
  const targetRole = await TenantRole.findById(user.roleId).select('slug').lean();
  ensureCanTouchSuperAdmin(req.user, targetRole?.slug);
  const role = await TenantRole.findById(user.roleId).select('slug name').lean();
  ok(res, {
    ...publicUser(user),
    role: role?.slug ?? 'unknown',
    roleLabel: role?.name ?? 'Unknown',
  });
});

/** POST /api/users */
export const createUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, password, roleId, isActive, personType, personId } = req.body as {
    email: string;
    password: string;
    roleId: string;
    isActive?: boolean;
    personType: string;
    personId: string;
  };

  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Staff: TenantStaff, Student: TenantStudent, User: TenantUser, Role: TenantRole } = getTenantModels(tenantDb);

  let resolvedRoleId = roleId;
  if (personType === 'teacher' || personType === 'student' || personType === 'accountant') {
    const roleDoc = await TenantRole.findOne({ slug: personType }).lean();
    if (!roleDoc) throw ApiError.badRequest(`Required system role '${personType}' not found`);
    resolvedRoleId = String(roleDoc._id);
  } else if (!resolvedRoleId) {
    throw ApiError.badRequest('Role is required for staff members.');
  }

  const role = await requireValidRole(resolvedRoleId, req.user?.tenantId, tenantDb);
  ensureCanTouchSuperAdmin(req.user, role.slug);
  assertCanAssignRole(req.user, role);

  if (personType === 'staff') {
    if (role.slug === 'student' || role.slug === 'teacher') {
      throw ApiError.badRequest('Non-teaching staff cannot be assigned Student or Teacher roles.', 'USER_ROLE_LINK_CONFLICT');
    }
    if (role.slug === 'platform_admin' || role.slug === 'super_admin' || role.slug === 'admin') {
      throw ApiError.badRequest('Primary Admin or platform roles cannot be assigned through this directory.', 'USER_ROLE_LINK_CONFLICT');
    }
  }

  const session = await tenantDb.startSession();
  try {
    session.startTransaction();

    const existing = await TenantUser.findOne({ email }).session(session).lean();
    if (existing) {
      throw ApiError.conflict('A user with this email already exists in the system.', 'EMAIL_TAKEN');
    }

    let personName = '';
    let personRecord: any = null;

    const personQuery = { 
      _id: personId, 
      tenantId: req.user?.tenantId,
      $or: [{ userId: null }, { userId: { $exists: false } }],
      isActive: true,
      isArchived: false
    };

    if (personType === 'student') {
      personRecord = await TenantStudent.findOne(personQuery).session(session);
    } else {
      personRecord = await TenantStaff.findOne(personQuery).session(session);
      if (personRecord) {
        if (personType === 'teacher' && personRecord.staffType !== 'teaching') {
          throw ApiError.badRequest('Selected profile is not a Teacher.');
        }
        if ((personType === 'accountant' || personType === 'staff') && personRecord.staffType !== 'non_teaching') {
          throw ApiError.badRequest('Selected profile is not Non-Teaching Staff.');
        }
      }
    }

    if (!personRecord) {
      throw ApiError.conflict('Selected person profile is not found, inactive, or already linked to another account.');
    }

    personName = personRecord.fullName;

    const user = new TenantUser({
      name: personName,
      email,
      passwordHash: await hashPassword(password),
      roleId: role._id,
      tenantId: req.user?.tenantId,
      isActive: true,
    });
    await user.save({ session });

    const updatePayload: any = { $set: { userId: user._id } };
    if (!personRecord.email) {
      updatePayload.$set.email = email;
    }

    let claimResult;
    if (personType === 'student') {
      claimResult = await TenantStudent.findOneAndUpdate(personQuery, updatePayload, { session, new: true });
    } else {
      claimResult = await TenantStaff.findOneAndUpdate(personQuery, updatePayload, { session, new: true });
    }

    if (!claimResult) {
      throw ApiError.conflict('Selected person profile was concurrently linked by another request.');
    }

    await session.commitTransaction();
    session.endSession();

    recordAudit('users', AUDIT_ACTIONS.USER_CREATED, req.user, String(user._id), {
      role: role.slug,
      email,
    });

    created(res, { user: publicUser(user), role: role.slug, roleLabel: role.name });
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();
    if (err.code === 11000) {
      throw ApiError.conflict('A user with this email already exists in the system.', 'EMAIL_TAKEN');
    }
    throw err;
  }
});

/** GET /api/users/unlinked-people */
export const searchUnlinkedPeople = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) {
    throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  }
  const { Staff, Student } = getTenantModels(tenantDb);

  const { type, search } = req.query as { type?: string; search?: string };
  const tenantId = req.user?.tenantId;

  if (!['teacher', 'accountant', 'staff', 'student'].includes(type || '')) {
    throw ApiError.badRequest('Invalid person type');
  }

  const limit = 20;
  let data: any[] = [];
  
  const searchRegex = search ? { $regex: search.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&'), $options: 'i' } : null;

  if (type === 'student') {
    const filter: any = { tenantId, isActive: true, isArchived: false };
    if (searchRegex) {
      filter.$and = [
        { $or: [{ userId: null }, { userId: { $exists: false } }] },
        { $or: [{ fullName: searchRegex }, { admissionNumber: searchRegex }, { email: searchRegex }] }
      ];
    } else {
      filter.$or = [{ userId: null }, { userId: { $exists: false } }];
    }
    const students = await Student.find(filter).limit(limit).select('fullName email admissionNumber').lean();
    data = students.map(s => ({ _id: s._id, name: s.fullName, email: s.email, identifier: s.admissionNumber }));
  } else {
    const filter: any = { tenantId, isActive: true, isArchived: false };
    if (type === 'teacher') {
      filter.staffType = 'teaching';
    } else {
      filter.staffType = 'non_teaching';
      if (type === 'accountant') {
        filter.designation = { $regex: /accountant/i };
      } else if (type === 'staff') {
        filter.designation = { $not: /accountant/i };
      }
    }
    if (searchRegex) {
      filter.$and = [
        { $or: [{ userId: null }, { userId: { $exists: false } }] },
        { $or: [{ fullName: searchRegex }, { employeeId: searchRegex }, { email: searchRegex }] }
      ];
    } else {
      filter.$or = [{ userId: null }, { userId: { $exists: false } }];
    }
    const staff = await Staff.find(filter).limit(limit).select('fullName email employeeId designation').lean();
    data = staff.map(s => ({ _id: s._id, name: s.fullName, email: s.email, identifier: s.employeeId, designation: s.designation }));
  }

  ok(res, data);
});

/** PATCH /api/users/:id */
export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing');
  const { getTenantModels } = await import('../services/TenantModelRegistry');
  const { User: TenantUser, Role: TenantRole, Staff: TStaff, Student: TStudent } = getTenantModels(tenantDb);

  const user = await TenantUser.findOne({ _id: req.params.id, tenantId: req.user?.tenantId, isPlatformAdmin: { $ne: true } });
  if (!user) throw ApiError.notFound('User not found');
  const currentRole = await TenantRole.findById(user.roleId).select('slug').lean();
  ensureCanTouchSuperAdmin(req.user, currentRole?.slug);

  const { name, email, roleId, isActive, isArchived } = req.body as {
    name?: string;
    email?: string;
    roleId?: string;
    isActive?: boolean;
    isArchived?: boolean;
  };

  const changes: Record<string, unknown> = {};
  let roleChanged = false;
  let newRoleObj: any = null;

  if (name !== undefined) changes.name = name;
  if (email !== undefined) {
    if (email !== user.email) {
      const existing = await TenantUser.findOne({ email, _id: { $ne: user._id } });
      if (existing) throw ApiError.conflict('A user with this email already exists', 'EMAIL_TAKEN');
    }
    changes.email = email;
  }

  if (roleId !== undefined && String(roleId) !== String(user.roleId)) {
    const role = await requireValidRole(roleId, req.user?.tenantId, tenantDb);
    ensureCanTouchSuperAdmin(req.user, role.slug);
    assertCanAssignRole(req.user, role);

    const profileDependentRoles = [
      ROLE_SLUGS.teacher,
      ROLE_SLUGS.student,
      ROLE_SLUGS.accountant,
      ROLE_SLUGS.receptionist,
      'librarian',
    ];
    if (profileDependentRoles.includes(role.slug)) {
      throw ApiError.badRequest('Please use the specific Teachers, Students, or Staff directories to assign this role to users.');
    }

    const [linkedStudent, linkedStaff] = await Promise.all([
      TStudent.findOne({ userId: user._id }).select('fullName admissionNumber').lean(),
      TStaff.findOne({ userId: user._id }).select('fullName staffType designation').lean(),
    ]);

    if (linkedStudent && role.slug !== 'student') {
      throw ApiError.badRequest(
        `This user is currently linked to Student profile "${linkedStudent.fullName}". Unlink or reassign that profile before changing the user's role.`,
        'USER_ROLE_LINK_CONFLICT'
      );
    }

    if (linkedStaff) {
      if (linkedStaff.staffType === 'teaching' && role.slug !== 'teacher' && role.slug !== 'admin') {
        throw ApiError.badRequest(
          `This user is currently linked to Teacher profile "${linkedStaff.fullName}". Unlink or reassign that profile before changing the user's role.`,
          'USER_ROLE_LINK_CONFLICT'
        );
      }
      if (linkedStaff.staffType !== 'teaching') {
        if (role.slug === 'student' || role.slug === 'teacher') {
          throw ApiError.badRequest(
            `This user is currently linked to Non-Teaching Staff profile "${linkedStaff.fullName}". Cannot reassign to Student or Teacher role.`,
            'USER_ROLE_LINK_CONFLICT'
          );
        }
        if (role.slug === 'platform_admin' || role.slug === 'super_admin') {
          throw ApiError.badRequest('Cannot reassign to platform-level roles.', 'USER_ROLE_LINK_CONFLICT');
        }
      }
    }

    roleChanged = true;
    newRoleObj = role;
    changes.roleId = role._id;
  }

  // Prevent self-lockout
  if (
    String(user._id) === req.user?._id &&
    (isActive === false || isArchived === true || (roleId && roleId !== String(user.roleId)))
  ) {
    throw ApiError.badRequest('You cannot remove your own account access.');
  }

  let willDeactivateOrDemoteAdmin = false;
  const isCurrentlyAdmin = currentRole?.slug === 'super_admin' || currentRole?.slug === 'admin';

  if (isCurrentlyAdmin && user.isActive && !user.isArchived) {
    if (isActive === false || isArchived === true) {
      willDeactivateOrDemoteAdmin = true;
    } else if (roleChanged && newRoleObj && newRoleObj.slug !== 'super_admin' && newRoleObj.slug !== 'admin') {
      willDeactivateOrDemoteAdmin = true;
    }
  }

  if (isArchived !== undefined && isArchived !== user.isArchived) {
    changes.isArchived = isArchived;
  }
  if (isActive !== undefined && isActive !== user.isActive) {
    if (isActive === true && user.isArchived && changes.isArchived !== false) {
      throw ApiError.badRequest(
        'Archived users must be restored before they can be activated. Please restore the user first.',
        'ARCHIVED_USER_ACTIVATION_BLOCKED'
      );
    }
    changes.isActive = isActive;
  }

  if (Object.keys(changes).length === 0) {
    throw ApiError.badRequest('No changes provided');
  }

  // Execute mutation — serialized if modifying an active admin
  if (willDeactivateOrDemoteAdmin) {
    await executeAdminRemovalWithLock(
      tenantDb,
      req.user?.tenantId,
      String(user._id),
      async (session) => {
        Object.assign(user, changes);
        await user.save(session ? { session } : undefined);
      }
    );
  } else {
    Object.assign(user, changes);
    await user.save();
  }

  // Audit and session revocation
  if (isActive !== undefined && changes.isActive !== undefined) {
    recordAudit(
      'users',
      changes.isActive ? AUDIT_ACTIONS.USER_ACTIVATED : AUDIT_ACTIONS.USER_DEACTIVATED,
      req.user,
      String(user._id)
    );
  }

  if (isArchived !== undefined && changes.isArchived !== undefined) {
    recordAudit(
      'users',
      changes.isArchived ? AUDIT_ACTIONS.USER_ARCHIVED : AUDIT_ACTIONS.USER_RESTORED,
      req.user,
      String(user._id)
    );
  }

  if (roleChanged) {
    invalidatePermissionCache(String(user.roleId));
    await revokeAllSessions(user._id, (req.tenantDb as mongoose.Connection));
    recordAudit(
      'users',
      AUDIT_ACTIONS.USER_ROLE_CHANGED,
      req.user,
      String(user._id),
      newRoleObj?.slug ? { role: newRoleObj.slug } : undefined
    );
  }

  recordAudit(
    'users',
    AUDIT_ACTIONS.USER_UPDATED,
    req.user,
    String(user._id),
    newRoleObj?.slug ? { role: newRoleObj.slug } : undefined
  );

  const finalRole = await TenantRole.findById(user.roleId).select('slug name').lean();
  ok(res, {
    user: publicUser(user),
    role: finalRole?.slug ?? 'unknown',
    roleLabel: finalRole?.name ?? 'Unknown',
  });
});

/** POST /api/users/:id/reset-password — admin-safe password reset. */
export const resetUserPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing');
  const { getTenantModels } = await import('../services/TenantModelRegistry');
  const { User: TenantUser, Role: TenantRole } = getTenantModels(tenantDb);

  const user = await TenantUser.findOne({ _id: req.params.id, tenantId: req.user?.tenantId, isPlatformAdmin: { $ne: true } });
  if (!user) throw ApiError.notFound('User not found');
  const targetRole = await TenantRole.findById(user.roleId).select('slug').lean();
  ensureCanTouchSuperAdmin(req.user, targetRole?.slug);

  const { newPassword } = req.body as { newPassword: string };
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();

  // All sessions die — the user must sign in with the new password.
  await revokeAllSessions(user._id, (req.tenantDb as mongoose.Connection));

  recordAudit('users', AUDIT_ACTIONS.USER_PASSWORD_RESET, req.user, String(user._id));
  ok(res, { message: 'Password reset successfully' });
});

/** POST /api/users/:id/activate */
export const activateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing');
  const { getTenantModels } = await import('../services/TenantModelRegistry');
  const { User: TenantUser, Role: TenantRole } = getTenantModels(tenantDb);

  const user = await TenantUser.findOne({ _id: req.params.id, tenantId: req.user?.tenantId, isPlatformAdmin: { $ne: true } });
  if (!user) throw ApiError.notFound('User not found');
  const targetRole = await TenantRole.findById(user.roleId).select('slug').lean();
  ensureCanTouchSuperAdmin(req.user, targetRole?.slug);

  if (user.isArchived) {
    throw ApiError.badRequest(
      'Archived users must be restored before they can be activated. Please unarchive the user first.',
      'ARCHIVED_USER_ACTIVATION_BLOCKED'
    );
  }

  user.isActive = true;
  await user.save();
  recordAudit('users', AUDIT_ACTIONS.USER_ACTIVATED, req.user, String(user._id));
  ok(res, { user: publicUser(user) });
});

/** POST /api/users/:id/deactivate */
export const deactivateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantDb = req.tenantDb as mongoose.Connection;
  if (!tenantDb) throw new ApiError(500, 'Tenant database connection missing');
  const { getTenantModels } = await import('../services/TenantModelRegistry');
  const { User: TenantUser, Role: TenantRole } = getTenantModels(tenantDb);

  const user = await TenantUser.findOne({ _id: req.params.id, tenantId: req.user?.tenantId, isPlatformAdmin: { $ne: true } });
  if (!user) throw ApiError.notFound('User not found');
  const targetRole = await TenantRole.findById(user.roleId).select('slug').lean();
  ensureCanTouchSuperAdmin(req.user, targetRole?.slug);

  if (String(user._id) === req.user!._id) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }

  const isCurrentlyAdmin = targetRole?.slug === 'super_admin' || targetRole?.slug === 'admin';

  if (isCurrentlyAdmin && user.isActive && !user.isArchived) {
    await executeAdminRemovalWithLock(
      tenantDb,
      req.user?.tenantId,
      String(user._id),
      async (session) => {
        user.isActive = false;
        await user.save(session ? { session } : undefined);
      }
    );
  } else {
    user.isActive = false;
    await user.save();
  }

  await revokeAllSessions(user._id, (req.tenantDb as mongoose.Connection));
  recordAudit('users', AUDIT_ACTIONS.USER_DEACTIVATED, req.user, String(user._id));
  ok(res, { user: publicUser(user) });
});
