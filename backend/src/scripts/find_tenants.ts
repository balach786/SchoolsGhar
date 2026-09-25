import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const masterDb = mongoose.connection.useDb('schoolsghar_master');
  
  const tenants = await masterDb.collection('tenants').find({}).project({ slug: 1, databaseName: 1, contactEmail: 1 }).toArray();
  console.log('Tenants:', JSON.stringify(tenants, null, 2));
  
  // Find admin users for each tenant
  for (const t of tenants) {
    const db = mongoose.connection.useDb(t.databaseName);
    const admins = await db.collection('users').find({ role: 'super_admin' }).project({ email: 1, name: 1, role: 1 }).toArray();
    console.log(`\nTenant ${t.slug} (${t.databaseName}) admins:`, JSON.stringify(admins, null, 2));
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
