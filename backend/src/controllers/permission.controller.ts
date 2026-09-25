import { Response } from 'express';
import { AuthRequest } from '../types';
import { ok } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { PERMISSION_CATALOG, ROLE_SLUGS } from '../config/permissions';

/**
 * GET /api/permissions/catalog
 * Returns the tenant-manageable permission catalog filtered by the actor's grant ceiling.
 * Super Admin sees the full tenant-manageable catalog.
 * Non-super admins only see permissions they are authorized to grant.
 * Internal/system permissions are never exposed to school role editing.
 */
export const getPermissionCatalog = asyncHandler(async (req: AuthRequest, res: Response) => {
  const actor = req.user!;
  const isSuper = actor.role === ROLE_SLUGS.superAdmin;
  const actorPerms = actor.permissions || {};

  const catalog = PERMISSION_CATALOG
    .filter((entry) => entry.tenantManageable)
    .map((entry) => {
      if (isSuper) {
        return {
          module: entry.module,
          label: entry.label,
          actions: entry.actions,
        };
      }

      // Filter actions strictly to those the actor actually possesses
      const allowedActions = entry.actions.filter((act) =>
        (actorPerms[entry.module] || []).includes(act)
      );

      return {
        module: entry.module,
        label: entry.label,
        actions: allowedActions,
      };
    });

  ok(res, { catalog });
});
