import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { Tenant } from '../models/Tenant';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { ROLE_SLUGS } from '../config/permissions';

/**
 * Concurrency-safe last-admin invariant check using MongoDB ACID transactions.
 * Acquires a serialization lock on the shared Tenant document.
 * Retries on write conflict and guarantees at least one active privileged administrator remains.
 * Reusable across user management, teacher archive, and staff archive.
 */
export async function executeAdminRemovalWithLock(
  tenantId: string | undefined,
  targetUserId: string,
  applyUpdate: (session?: mongoose.ClientSession) => Promise<void>
): Promise<void> {
  if (!tenantId) {
    await applyUpdate();
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // 1. Acquire document-level serialization lock on the shared Tenant document
      const tenantDoc = await Tenant.findOneAndUpdate(
        { _id: tenantId },
        { $inc: { adminSecuritySeq: 1 } },
        { session, new: true }
      );
      if (!tenantDoc) {
        throw ApiError.notFound('School tenant not found');
      }

      // 2. Query system admin roles
      const adminRoles = await Role.find({
        slug: { $in: [ROLE_SLUGS.superAdmin, ROLE_SLUGS.admin] },
        isSystemRole: true,
      })
        .select('_id')
        .session(session);
      const adminRoleIds = adminRoles.map((r) => r._id);

      // 3. Count remaining active, non-archived admins excluding target user
      const remainingCount = await User.countDocuments({
        tenantId,
        _id: { $ne: targetUserId },
        roleId: { $in: adminRoleIds },
        isActive: true,
        isArchived: false,
      }).session(session);

      if (remainingCount < 1) {
        throw ApiError.conflict(
          'At least one active school administrator must remain.',
          'LAST_ADMIN_REQUIRED'
        );
      }

      // 4. Apply update inside transaction
      await applyUpdate(session);
    });
  } catch (err: any) {
    // If transactions are not supported on standalone development runner
    if (
      err?.message?.includes('does not support retryable writes') ||
      err?.message?.includes('Transactions are not supported')
    ) {
      const adminRoles = await Role.find({
        slug: { $in: [ROLE_SLUGS.superAdmin, ROLE_SLUGS.admin] },
        isSystemRole: true,
      }).select('_id');
      const adminRoleIds = adminRoles.map((r) => r._id);
      const remainingCount = await User.countDocuments({
        tenantId,
        _id: { $ne: targetUserId },
        roleId: { $in: adminRoleIds },
        isActive: true,
        isArchived: false,
      });
      if (remainingCount < 1) {
        throw ApiError.conflict(
          'At least one active school administrator must remain.',
          'LAST_ADMIN_REQUIRED'
        );
      }
      await applyUpdate();
      return;
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
