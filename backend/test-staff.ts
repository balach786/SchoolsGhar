import mongoose from 'mongoose';
import { getMasterConnection } from './src/services/MasterConnectionManager';
import { getTenantConnection } from './src/services/TenantConnectionManager';
import { getTenantModels } from './src/services/TenantModelRegistry';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const masterDb = getMasterConnection();
    
    // Pick first tenant
    const Tenant = masterDb.model('Tenant');
    const tenant = await Tenant.findOne();
    if (!tenant) {
      console.log('No tenant found');
      process.exit(0);
    }
    
    const tenantDb = getTenantConnection(tenant.databaseName);
    const { Staff } = getTenantModels(tenantDb);
    
    console.log('Fetching staff...');
    const staffDocs = await Staff.find().limit(5).lean();
    console.log('Fetched staff:', staffDocs.length);
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}

run();
