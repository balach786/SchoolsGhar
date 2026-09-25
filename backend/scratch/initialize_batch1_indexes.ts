import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

async function run() {
  await mongoose.connect(MONGODB_URI!);
  const masterDb = mongoose.connection.useDb('schoolsghar_master');

  const latestTenant = await masterDb.collection('tenants').findOne(
    { slug: { $regex: /^phase-3-test-school-/ }, isDatabaseProvisioned: true, provisioningStatus: 'ready' },
    { sort: { _id: -1 } }
  );

  if (!latestTenant) { console.error('No provisioned Phase-3 tenant found'); process.exit(1); }

  const tenantDbName = latestTenant.databaseName as string;
  const tenantDb = mongoose.connection.useDb(tenantDbName);

  console.log(`Initializing Phase 4 Batch 1 indexes for Phase-3 test tenant on DB: ${tenantDbName}`);

  const { getTenantModels } = await import('../src/services/TenantModelRegistry.js');
  const models = getTenantModels(tenantDb);

  await Promise.all([
    models.Class.createIndexes(),
    models.Section.createIndexes(),
    models.Student.createIndexes(),
    models.StudentHistory.createIndexes(),
    models.ReceiptCounter.createIndexes(),
    models.Staff.createIndexes(),
    models.Subject.createIndexes(),
    models.ClassTeacherAssignment.createIndexes()
  ]);

  console.log('✅ Successfully created indexes without dropping existing ones.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
