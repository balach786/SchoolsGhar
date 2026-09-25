import mongoose from 'mongoose';
import { env } from 'c:/Users/BK Magsi/Downloads/school-management-system/backend/src/config/env';
import { getMasterConnection } from 'c:/Users/BK Magsi/Downloads/school-management-system/backend/src/services/MasterConnectionManager';
import { getMasterModels } from 'c:/Users/BK Magsi/Downloads/school-management-system/backend/src/services/MasterModelRegistry';

async function main() {
  await mongoose.connect(env.mongodbUri);
  const masterDb = getMasterConnection();
  const masterModels = getMasterModels(masterDb);
  
  console.log('MongoDB connection = PASS');

  const tenants = await masterModels.Tenant.find().lean();
  const schoolDbCount = tenants.length;
  const activeTestTenants = tenants.filter(t => ['bkm', 'demo', 'thesk', 'test'].some(s => String(t.slug).includes(s))).length;
  console.log(`school DB count = ${schoolDbCount}`);
  console.log(`active test tenants = ${activeTestTenants}`);

  const sampleTenant = tenants.find(t => t.isDatabaseProvisioned && t.databaseName);
  if (sampleTenant) {
    const dbStats = await masterDb.useDb(sampleTenant.databaseName!).db!.stats();
    console.log(`collection count in representative tenant = ${dbStats.collections}`);
    console.log(`total index count in representative tenant = ${dbStats.indexes}`);
    
    const collections = await masterDb.useDb(sampleTenant.databaseName!).db!.collections();
    let maxIndexes = 0;
    for (const c of collections) {
      const idx = await c.indexes();
      if (idx.length > maxIndexes) maxIndexes = idx.length;
    }
    console.log(`largest indexes on one collection = ${maxIndexes}`);
    console.log(`stale test tenant candidates = ${activeTestTenants}`);
  }

  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
