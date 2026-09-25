import mongoose from 'mongoose';
import { getMasterConnection } from 'c:/Users/BK Magsi/Downloads/school-management-system/backend/src/services/MasterConnectionManager';
import { getMasterModels } from 'c:/Users/BK Magsi/Downloads/school-management-system/backend/src/services/MasterModelRegistry';
import { getTenantConnection } from 'c:/Users/BK Magsi/Downloads/school-management-system/backend/src/services/TenantConnectionManager';
import { getTenantModels } from 'c:/Users/BK Magsi/Downloads/school-management-system/backend/src/services/TenantModelRegistry';
import { env } from 'c:/Users/BK Magsi/Downloads/school-management-system/backend/src/config/env';

async function main() {
  await mongoose.connect(env.mongodbUri);
  const masterDb = getMasterConnection();
  const masterModels = getMasterModels(masterDb);

  const tenants = await masterModels.Tenant.find({ isDatabaseProvisioned: true }).limit(2).lean();
  if (tenants.length < 2) {
    console.log("Not enough provisioned tenants for IDOR testing.");
    process.exit(0);
  }

  const tenantA = tenants[0];
  const tenantB = tenants[1];
  console.log(`Tenant A: ${tenantA.slug}`);
  console.log(`Tenant B: ${tenantB.slug}`);

  const dbA = getTenantConnection(tenantA.databaseName);
  const dbB = getTenantConnection(tenantB.databaseName);

  const modelsA = getTenantModels(dbA);
  const modelsB = getTenantModels(dbB);

  const studentB = await modelsB.Student.findOne().lean();
  if (studentB) {
    const studentViaA = await modelsA.Student.findOne({ _id: studentB._id }).lean();
    console.log(`IDOR Test (Read cross-tenant Student): ${studentViaA ? 'FAIL (Exposed)' : 'PASS (Not Found)'}`);
  }

  const staffB = await modelsB.Staff.findOne().lean();
  if (staffB) {
    const staffViaA = await modelsA.Staff.findOne({ _id: staffB._id }).lean();
    console.log(`IDOR Test (Read cross-tenant Staff): ${staffViaA ? 'FAIL (Exposed)' : 'PASS (Not Found)'}`);
  }

  const resultB = await modelsB.Result.findOne().lean();
  if (resultB) {
    const resultViaA = await modelsA.Result.findOne({ _id: resultB._id }).lean();
    console.log(`IDOR Test (Read cross-tenant Result): ${resultViaA ? 'FAIL (Exposed)' : 'PASS (Not Found)'}`);
  }

  process.exit(0);
}

main().catch(console.error);
