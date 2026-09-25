import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import { ok, created } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Role } from '../models/Role';
import { TenantRoleOverride } from '../models/TenantRoleOverride';
import { User } from '../models/User';
import { normalizePermissions, ROLE_SLUGS } from '../config/permissions';
import { recordAudit, AUDIT_ACTIONS } from '../services/audit.service';
import {
  effectiveRole,
  isPermissionSubset,
  invalidatePermissionCache,
} from '../services/permission.service';
import { requireTenantId } from '../utils/tenantScope';

const RESERVED_SLUGS: string[] = [
  ...Object.values(ROLE_SLUGS),
  'platform_admin',
];

async function selected(req: Request) {
  const role = await effectiveRole(req.params.id, requireTenantId(req));
  if (!role || role.slug === 'platform_admin') throw ApiError.notFound('Role not found');
  return role;
}

function shape(role: NonNullable<Awaited<ReturnType<typeof effectiveRole>>>) {
  return {
    _id: String(role._id),
    name: role.name,
    slug: role.slug,
    description: role.description ?? '',
    isSystemRole: role.isSystemRole,
    isActive: role.isActive,
    permissions: role.permissions,
    corePermissions: (role as any).corePermissions || [],
  };
}

/**
 * Super Admin protection: Only super_admin may modify super_admin role configuration.
 */
function editable(req: AuthRequest, slug: string) {
  if (slug === 'super_admin' && req.user?.role !== 'super_admin') {
    throw ApiError.forbidden('Only a Super Admin can manage the Super Admin role.');
  }
}

/** GET /api/roles */
export const listRoles = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const roles = await Role.find({
    slug: { $ne: 'platform_admin' },
    $or: [{ tenantId }, { tenantId: { $exists: false } }, { tenantId: null }],
  })
    .sort({ isSystemRole: -1, name: 1 })
    .lean();

  const effective = await Promise.all(roles.map((r) => effectiveRole(String(r._id), tenantId)));
  ok(res, effective.filter((r): r is NonNullable<typeof r> => !!r).map(shape));
});

/** GET /api/roles/:id */
export const getRole = asyncHandler(async (req: Request, res: Response) => {
  ok(res, shape(await selected(req)));
});

/** POST /api/roles */
export const createRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantId = requireTenantId(req);
  const { name, slug, description, permissions } = req.body;

  // 1. Reserved slug check
  const normalizedSlug = String(slug || '').trim().toLowerCase();
  if (RESERVED_SLUGS.includes(normalizedSlug)) {
    throw ApiError.forbidden('This role slug is reserved for system roles.', 'RESERVED_ROLE_SLUG');
  }

  // 2. Per-tenant uniqueness check
  const existing = await Role.exists({ slug: normalizedSlug, tenantId });
  if (existing) {
    throw ApiError.conflict('A role with this slug already exists in your school', 'ROLE_SLUG_TAKEN');
  }

  // 3. Permission ceiling check
  const normalizedPerms = normalizePermissions(permissions ?? {});
  if (req.user?.role !== ROLE_SLUGS.superAdmin) {
    const actorPerms = req.user?.permissions || {};
    for (const entry of normalizedPerms) {
      const allowed = actorPerms[entry.module] || [];
      for (const act of entry.actions) {
        if (!allowed.includes(act)) {
          throw ApiError.forbidden(
            `You cannot grant action "${act}" on module "${entry.module}" as it exceeds your privileges.`,
            'ROLE_PERMISSION_CEILING_EXCEEDED'
          );
        }
      }
    }
  }

  const role = await Role.create({
    tenantId,
    name: String(name || '').trim(),
    slug: normalizedSlug,
    description: description ? String(description).trim() : '',
    isSystemRole: false,
    permissions: normalizedPerms,
  });

  recordAudit('roles', AUDIT_ACTIONS.ROLE_CREATED, req.user, String(role._id), { slug: normalizedSlug });
  created(res, shape((await effectiveRole(String(role._id), tenantId))!));
});

/** PATCH /api/roles/:id */
export const updateRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantId = requireTenantId(req);
  const role = await selected(req);
  editable(req, role.slug);

  const { name, description, isActive } = req.body;
  if (isActive === false && role.isSystemRole) {
    throw ApiError.badRequest('System roles cannot be deactivated');
  }

  const changes: Record<string, any> = {};
  if (name !== undefined) changes.name = String(name).trim();
  if (description !== undefined) changes.description = String(description).trim();
  if (isActive !== undefined) changes.isActive = Boolean(isActive);

  if (Object.keys(changes).length === 0) {
    throw ApiError.badRequest('No changes provided');
  }

  if (role.isSystemRole) {
    await TenantRoleOverride.findOneAndUpdate(
      { tenantId, roleId: role._id },
      { $set: changes },
      { upsert: true, runValidators: true }
    );
  } else {
    await Role.updateOne({ _id: role._id, tenantId }, { $set: changes });
  }

  invalidatePermissionCache(String(role._id));
  recordAudit('roles', AUDIT_ACTIONS.ROLE_UPDATED, req.user, String(role._id));
  ok(res, shape(await selected(req)));
});

/** PUT /api/roles/:id/permissions */
export const updateRolePermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const tenantId = requireTenantId(req);
  const role = await selected(req);
  editable(req, role.slug);

  const requestedPerms = normalizePermissions(req.body.permissions ?? {});
  let finalPermissions = requestedPerms;

  // Non-super-admin ceiling and preservation of hidden modules
  if (req.user?.role !== ROLE_SLUGS.superAdmin) {
    const actorPerms = req.user?.permissions || {};

    const existingPerms = (role.permissions || []) as Array<{ module: string; actions: string[] }>;

    // Validate actor does not grant NEW actions they do not possess
    for (const entry of requestedPerms) {
      const actorAllowed = actorPerms[entry.module] || [];
      const existingEntry = existingPerms.find(p => p.module === entry.module);
      const existingActions = existingEntry?.actions || [];

      for (const act of entry.actions) {
        if (!actorAllowed.includes(act) && !existingActions.includes(act)) {
          throw ApiError.forbidden(
            `You cannot grant action "${act}" on module "${entry.module}" as it exceeds your privileges.`,
            'ROLE_PERMISSION_CEILING_EXCEEDED'
          );
        }
      }
    }

    // Preserve existing permissions for modules completely outside the actor's grant ceiling
    // (modules hidden from the editor UI to prevent accidental stripping)
    const preservedUntouchableModules: Array<{ module: string; actions: string[] }> = existingPerms
      .filter((p) => {
        const actorModulePerms = actorPerms[p.module] || [];
        return actorModulePerms.length === 0;
      })
      .map((p) => ({ module: String(p.module), actions: [...(p.actions || [])] }));

    finalPermissions = [
      ...preservedUntouchableModules,
      ...requestedPerms,
    ];
  }

  if (role.isSystemRole) {
    await TenantRoleOverride.findOneAndUpdate(
      { tenantId, roleId: role._id },
      { $set: { permissions: finalPermissions } },
      { upsert: true, runValidators: true }
    );
  } else {
    await Role.updateOne(
      { _id: role._id, tenantId },
      { $set: { permissions: finalPermissions } }
    );
  }

  invalidatePermissionCache(String(role._id));
  recordAudit('roles', AUDIT_ACTIONS.ROLE_PERMISSION_UPDATED, req.user, String(role._id), { slug: role.slug });
  ok(res, shape(await selected(req)));
});

/** GET /api/roles/:id/users */
export const roleUsers = asyncHandler(async (req: Request, res: Response) => {
  const role = await selected(req);
  ok(
    res,
    await User.find({
      roleId: role._id,
      tenantId: requireTenantId(req),
      isArchived: false,
      isPlatformAdmin: { $ne: true },
    })
      .select('name email isActive lastLoginAt')
      .limit(50)
      .lean()
  );
});
