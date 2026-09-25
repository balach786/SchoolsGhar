import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

async function run() {
  await mongoose.connect(MONGODB_URI!);
  
  const legacyTenants = await mongoose.connection.useDb('schoolsghar').collection('tenants').find({}).toArray();
  console.log('Legacy Tenants:', legacyTenants.map(t => t.slug));

  const masterTenants = await mongoose.connection.useDb('schoolsghar_master').collection('tenants').find({}).toArray();
  console.log('Master Tenants:', masterTenants.map(t => t.slug));
  
  process.exit(0);
}

run();
