import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MODELS = [
  'Timetable',
  'LeaveRequest',
  'Assignment',
  'Submission',
  'ExportPreset',
  'DataHistory',
  'Notice',
  'Notification',
  'AuditLog'
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('=== BATCH 8 RAW PLACEMENT & INDEX VERIFICATION ===\n');

  const masterDb = mongoose.connection.useDb('schoolsghar_master');
  const tenants = await masterDb.collection('tenants').find({}).limit(1).toArray();
  if (tenants.length === 0) throw new Error('No tenants found');
  const tenant = tenants[0];
  const tenantDb = mongoose.connection.useDb(tenant.databaseName);

  for (const modelName of MODELS) {
    console.log(`\n--- ${modelName} ---`);
    
    // Check if model exists in global DB (should be 0)
    let globalCount = 0;
    try {
      const collectionName = (mongoose as any).pluralize()(modelName);
      globalCount = await mongoose.connection.useDb('schoolsghar').collection(collectionName).countDocuments();
      console.log(`Global DB (schoolsghar) count: ${globalCount}`);
    } catch (e) {
      console.log(`Global DB count: Error/Not found`);
    }

    // Check if collection exists in Tenant DB
    try {
      const collectionName = (mongoose as any).pluralize()(modelName);
      const tenantCount = await tenantDb.collection(collectionName).countDocuments();
      console.log(`Tenant DB (${tenant.databaseName}) count: ${tenantCount}`);
      
      const indexes = await tenantDb.collection(collectionName).indexes();
      console.log(`Indexes in Tenant DB:`);
      indexes.forEach(idx => {
        const keys = Object.keys(idx.key).join(', ');
        console.log(`  - ${idx.name}: { ${keys} }`);
      });
      
    } catch (e: any) {
      console.log(`Tenant DB collection error: ${e.message}`);
    }
  }

  process.exit(0);
}

main().catch(console.error);
