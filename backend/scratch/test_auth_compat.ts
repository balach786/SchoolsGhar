import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/db';
import { User } from '../src/models/User';
import { Tenant } from '../src/models/Tenant';
import { env } from '../src/config/env';

async function verify() {
  await connectDatabase();
  console.log('Primary Connection DB:', mongoose.connection.name); 

  // Try to find a user
  const user = await User.findOne({ email: 'schoolsghar@gmail.com' });
  if (!user) {
    console.log('User not found. Is it in another DB?');
  } else {
    console.log('User found:', user.email, user.tenantId);
    
    // Simulate auth.ts Tenant lookup
    let tenantDoc = await Tenant.findById(user.tenantId).select('databaseName isDatabaseProvisioned isSuspended').lean();
    if (!tenantDoc) {
      console.log('Tenant not found using global model.');
    } else {
      console.log('Tenant found using global model.');
      let dbName = (tenantDoc as any).databaseName;
      if (!(tenantDoc as any).isDatabaseProvisioned || !dbName) {
         console.log('isDatabaseProvisioned is false or dbName is missing. Fallback logic triggered.');
         const legacyDbName = new URL(env.mongodbUri).pathname.slice(1) || 'schoolsghar';
         dbName = legacyDbName;
      }
      console.log('Resolved databaseName:', dbName);
    }
  }

  await disconnectDatabase();
}

verify().catch(console.error);
