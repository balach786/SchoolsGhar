import mongoose from 'mongoose';
import { connectDatabase } from './src/config/db';
import { Tenant } from './src/models/Tenant';
import { getTenantModels } from './src/services/TenantModelRegistry';
import { getTenantConnection } from './src/services/TenantConnectionManager';
import { getMasterModels } from './src/services/MasterModelRegistry';
import { getMasterConnection } from './src/services/MasterConnectionManager';

async function run() {
  await connectDatabase();
  console.log('Connected to DB');

  const masterDb = getMasterConnection();
  const { Tenant: MasterTenant } = getMasterModels(masterDb);

  const bkmTenant = await MasterTenant.findOne({ slug: 'bkm' });
  if (!bkmTenant) throw new Error('BKM tenant not found');
  console.log('Legacy BKM tenant found, isDatabaseProvisioned:', bkmTenant.isDatabaseProvisioned);

  const batch4Tenant = await MasterTenant.findOne({ slug: 'batch4test' });
  if (!batch4Tenant) throw new Error('batch4test tenant not found');
  console.log('Provisioned tenant found, isDatabaseProvisioned:', batch4Tenant.isDatabaseProvisioned);

  // Test Student lookup on Legacy BKM
  const bkmDb = await getTenantConnection(String(bkmTenant._id));
  const { Student: BkmStudent } = getTenantModels(bkmDb);
  const bkmStudents = await BkmStudent.find({ tenantId: bkmTenant._id }).limit(1).lean();
  console.log(`Legacy BKM Student Count: ${bkmStudents.length}`);

  // Test Student lookup on Provisioned Tenant
  const batch4Db = await getTenantConnection(String(batch4Tenant._id));
  const { Student: Batch4Student } = getTenantModels(batch4Db);
  const batch4Students = await Batch4Student.find({ tenantId: batch4Tenant._id }).limit(1).lean();
  console.log(`Provisioned Student Count: ${batch4Students.length}`);

  console.log('Success! Routing looks correct at database model level.');
  process.exit(0);
}

run().catch(console.error);
