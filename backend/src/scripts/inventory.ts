import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGODB_URI found');
    process.exit(1);
  }
  // Connect to schoolsghar_master
  uri = uri.replace('schoolsghar?', 'schoolsghar_master?');

  console.log('Connecting to Atlas...');
  try {
    await mongoose.connect(uri);
    console.log('Connected.');
    
    const tenants = await Tenant.find({}).lean();
    console.log('Found', tenants.length, 'tenants in schoolsghar_master:');
    
    for (const t of tenants as any[]) {
      console.log(`- Tenant ID: ${t._id}`);
      console.log(`  School: ${t.name}`);
      console.log(`  Code: ${t.schoolCode}`);
      console.log(`  Database: ${t.databaseName}`);
      console.log(`  isDatabaseProvisioned: ${t.isDatabaseProvisioned}`);
      console.log(`  status: ${t.status}`);
      console.log(`  ownerEmail: ${t.ownerEmail}`);
      console.log(`  createdAt: ${t.createdAt}`);
      
      // Get DB stats
      try {
          if (t.databaseName) {
            const adminDb = mongoose.connection.useDb(t.databaseName).db!;
            const stats = await adminDb.stats();
            console.log(`  Collections: ${stats.collections}`);
            console.log(`  Objects: ${stats.objects}`);
          }
      } catch (err) {
          console.log(`  Stats error: ${(err as Error).message}`);
      }

      console.log('---');
    }

    // Also check the deprecated database
    console.log('Checking deprecated schoolsghar database...');
    const depDb = mongoose.connection.useDb('schoolsghar').db!;
    const stats = await depDb.stats();
    console.log(`schoolsghar stats: ${stats.collections} collections, ${stats.objects} objects`);
    const collections = await depDb.listCollections().toArray();
    console.log('Collections in schoolsghar:', collections.map(c => c.name).join(', '));

  } catch (err) {
    console.error('Atlas connection/query failed:', (err as Error).message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
