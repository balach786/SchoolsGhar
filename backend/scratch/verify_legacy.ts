import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/db';
import { Tenant } from '../src/models/Tenant';
import { User } from '../src/models/User';

async function verify() {
  await connectDatabase();
  console.log('Primary Connection DB:', mongoose.connection.name); 

  const tenantCount = await Tenant.countDocuments();
  console.log('Tenant count in master:', tenantCount);

  const userCount = await User.countDocuments();
  console.log('User count in master:', userCount);

  await disconnectDatabase();
}

verify().catch(console.error);
