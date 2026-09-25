import mongoose from 'mongoose';
import { Role } from '../models/Role';
import { TenantRoleOverride } from '../models/TenantRoleOverride';
import { PermissionAction, ROLE_SLUGS, FULL_ACCESS, normalizePermissions } from '../config/permissions';

/**
 * Resolves the live effective role directly from MongoDB.
 * Merges system or custom Role definition with any tenant-specific override.
 * Process-local cache is NOT used in authorization.
 */
function mergePermissions(core: any[], override: any[]) {
  const map = new Map<string, Set<string>>();
  [...(core || []), ...(override || [])].forEach((entry: any) => {
    if (!map.has(entry.module)) map.set(entry.module, new Set());
    (entry.actions || []).forEach((a: string) => map.get(entry.module)!.add(a));
  });
  return Array.from(map.entries()).map(([module, actions]) => ({
    module,
    actions: Array.from(actions),
  }));
}

export async function effectiveRole(roleId: string, tenantId?: string, tenantDb?: mongoose.Connection) {
  let role;
  if (tenantDb) {
    const { getTenantModels } = await import('./TenantModelRegistry');
    const tenantModels = getTenantModels(tenantDb);
    role = await tenantModels.Role.findById(roleId).lean();
    console.log(`Queried Role from tenantModels:`, !!role);
  } else {
    role = await Role.findById(roleId).lean();
    console.log(`Queried Role from default models:`, !!role);
  }
  
  if (!role) {
    console.error(`effectiveRole role is null!`);
  }
  if (role && role.tenantId && String(role.tenantId) !== tenantId) {
    console.error(`effectiveRole tenant mismatch: ${role.tenantId} != ${tenantId}`);
  }

  if (!role || (role.tenantId && String(role.tenantId) !== tenantId)) {
    console.error(`effectiveRole null for roleId=${roleId}, tenantId=${tenantId}`);
    return null;
  }
  const override = tenantId ? await TenantRoleOverride.findOne({ roleId, tenantId }).lean() : null;
  
  if (override) console.log(`effectiveRole override: ${override.isActive}`);
  else console.log(`effectiveRole role: ${role.isActive}`);
  
  // Dynamically pull FULL_ACCESS for Admin & Super Admin to prevent staleness
  const corePerms = (role.slug === ROLE_SLUGS.superAdmin || role.slug === ROLE_SLUGS.admin) 
    ? normalizePermissions(FULL_ACCESS)
    : role.permissions;

  return {
    ...role,
    name: override?.name ?? role.name,
    description: override?.description ?? role.description,
    isActive: override?.isActive ?? role.isActive,
    permissions: mergePermissions(corePerms, override?.permissions || []),
    corePermissions: corePerms,
  };
}

/**
 * Pure function to build a clean, normalized module->actions dictionary from a role.
 * Automatically sanitizes deprecated actions (e.g. users:delete).
 */
export function buildEffectivePermissionMap(role: any): Record<string, string[]> {
  if (!role || !role.isActive) return {};
  const map: Record<string, string[]> = {};
  for (const entry of role.permissions ?? []) {
    if (entry.module) {
      const sanitizedActions = (entry.actions ?? []).filter((a: string) => {
        if (entry.module === 'users' && a === 'delete') return false;
        return true;
      });
      map[entry.module] = sanitizedActions;
    }
  }
  return map;
}

/**
 * Checks whether targetPermissions is a subset of actorPermissions.
 * Used for role-assignment ceiling and custom-role creation/editing checks.
 * Deprecated actions (such as legacy users:delete) are safely ignored.
 */
export function isPermissionSubset(
  targetPerms: Record<string, string[]>,
  actorPerms: Record<string, string[]>
): boolean {
  for (const [mod, actions] of Object.entries(targetPerms)) {
    const actorActions = actorPerms[mod] || [];
    for (const act of actions) {
      if (mod === 'users' && act === 'delete') continue;
      if (!actorActions.includes(act)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Legacy/display helper: returns fresh role permissions dictionary directly from MongoDB.
 */
export async function getRolePermissionMap(
  roleId: string,
  _roleSlug?: string,
  tenantId?: string,
  tenantDb?: mongoose.Connection
): Promise<Record<string, string[]>> {
  const role = await effectiveRole(roleId, tenantId, tenantDb);
  return buildEffectivePermissionMap(role);
}

/**
 * Authorization helper (kept for any direct consumers).
 * Super admin has explicit bypass. Freshly checks MongoDB.
 */
export async function hasPermission(
  roleId: string,
  roleSlug: string,
  module: string,
  action: PermissionAction,
  tenantId?: string
): Promise<boolean> {
  if (!tenantId) return false;
  const perms = await getRolePermissionMap(roleId, roleSlug, tenantId);
  return (perms[module] ?? []).includes(action);
}

/**
 * Backward compatibility stub: No-op since cache is no longer used for authorization.
 */
export function invalidatePermissionCache(_roleId?: string): void {
  // Authorization is always fresh from MongoDB
}
