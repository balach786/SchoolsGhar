import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { Tenant } from './src/models/Tenant';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const tenants = await Tenant.find({ databaseName: { $exists: true, $ne: '' } });
  for (const t of tenants) {
    if (t.databaseName && t.databaseName.length > 38) {
      t.databaseName = t.databaseName.substring(0, 38);
      await t.save();
      console.log('Fixed tenant databaseName:', t.databaseName);
    }
  }
  process.exit(0);
}
run();
