import mongoose from 'mongoose';
import { connectDatabase } from './src/config/db';
import { env } from './src/config/env';
import { Role } from './src/models/Role';
import { Tenant } from './src/models/Tenant';
import { getTenantModels } from './src/services/TenantModelRegistry';

async function main() {
  const masterDb = await connectDatabase();
  console.log(`Connected to global DB: ${env.mongodbUri}`);

  const globalRoles = await Role.find({}).lean();
  console.log(`Global Roles (${globalRoles.length}):`);
  globalRoles.forEach(r => console.log(` - ${r.slug} (system: ${r.isSystemRole}, tenant: ${r.tenantId || 'global'})`));

  // Find a tenant
  const tenants = await Tenant.find({}).lean();
  if (tenants.length === 0) {
    console.log('No tenants found.');
    process.exit(0);
  }

  const tenant = tenants[0];
  console.log(`\nFound tenant: ${tenant.name} (${tenant._id})`);
  const tenantDbUri = tenant.databaseUrl || `${env.mongodbUri}_${tenant._id}`;
  const tenantDb = mongoose.createConnection(tenantDbUri);
  await new Promise((resolve) => tenantDb.once('open', resolve));

  const { Role: TenantRole } = getTenantModels(tenantDb);
  const tenantRoles = await TenantRole.find({}).lean();
  console.log(`Tenant Roles (${tenantRoles.length}):`);
  tenantRoles.forEach(r => console.log(` - ${r.slug} (system: ${r.isSystemRole})`));

  process.exit(0);
}

main().catch(console.error);
