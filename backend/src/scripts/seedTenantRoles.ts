import mongoose from 'mongoose';
import { connectDatabase } from '../config/db';
import { env } from '../config/env';
import { ROLE_SLUGS, DEFAULT_ROLE_PERMISSIONS, normalizePermissions } from '../config/permissions';
import { getTenantModels } from '../services/TenantModelRegistry';
import { Tenant } from '../models/Tenant';


async function seedMissingTenantRoles() {
  const masterDb = await connectDatabase();
  console.log(`Connected to global DB: ${env.mongodbUri}`);

  const tenants = await Tenant.find({}).lean();
  console.log(`Found ${tenants.length} tenants. Syncing system roles...`);

  const systemRolesToSeed = [
    { slug: ROLE_SLUGS.superAdmin, name: 'Super Admin' },
    { slug: ROLE_SLUGS.admin, name: 'School Admin / Principal' },
    { slug: ROLE_SLUGS.teacher, name: 'Teacher' },
    { slug: ROLE_SLUGS.student, name: 'Student' },
    { slug: ROLE_SLUGS.accountant, name: 'Accountant' },
    { slug: ROLE_SLUGS.receptionist, name: 'Receptionist' },
  ];

  for (const tenant of tenants) {
    const { getTenantConnection } = await import('../services/TenantConnectionManager');
    const tenantDb = getTenantConnection(tenant.databaseName);
    const { Role: TenantRole } = getTenantModels(tenantDb);

    for (const roleDef of systemRolesToSeed) {
      let role = await TenantRole.findOne({ slug: roleDef.slug });
      const defaultPerms = DEFAULT_ROLE_PERMISSIONS[roleDef.slug] || {};
      const normalizedPerms = normalizePermissions(defaultPerms);

      if (!role) {
        await TenantRole.create({
          slug: roleDef.slug,
          name: roleDef.name,
          description: `System role for ${roleDef.name}`,
          isSystemRole: true,
          isActive: true,
          tenantId: tenant._id,
          permissions: normalizedPerms,
        });
        console.log(`[${tenant.name}] Created system role: ${roleDef.slug}`);
      } else {
        // Ensure it is marked as system role and has a tenantId
        role.isSystemRole = true;
        role.tenantId = tenant._id;
        
        // DO NOT overwrite permissions for existing admin roles unless necessary, 
        // but for safety let's just make sure it's a system role.
        await role.save();
      }
    }
    

  }

  console.log('Finished syncing roles for all tenants.');
  process.exit(0);
}

seedMissingTenantRoles().catch((err) => {
  console.error('Error seeding roles:', err);
  process.exit(1);
});
