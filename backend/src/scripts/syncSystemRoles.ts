import mongoose from 'mongoose';
import { Role } from '../models/Role';
import { TenantRoleOverride } from '../models/TenantRoleOverride';
import { DEFAULT_ROLE_PERMISSIONS, normalizePermissions } from '../config/permissions';
import { connectDatabase } from '../config/db';
import { env } from '../config/env';

async function syncSystemRoles() {
  await connectDatabase();
  console.log(`Syncing system roles in ${env.mongodbUri}`);

  // Fetch all system roles
  const systemRoles = await Role.find({ isSystemRole: true });
  console.log(`Found ${systemRoles.length} system roles to sync.`);

  for (const role of systemRoles) {
    const slug = role.slug;
    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[slug];
    if (defaultPerms) {
      role.permissions = normalizePermissions(defaultPerms);
      await role.save();
      console.log(`Synced permissions for system role: ${role.name} (${slug})`);
    } else {
      console.log(`Skipped ${slug}: no default permissions found.`);
    }
  }

  console.log('Role sync complete.');
  process.exit(0);
}

syncSystemRoles().catch((err) => {
  console.error('Error syncing roles:', err);
  process.exit(1);
});
