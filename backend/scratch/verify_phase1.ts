import mongoose from 'mongoose';
import { getTenantConnection } from '../src/services/TenantConnectionManager';
import { connectDatabase, disconnectDatabase } from '../src/config/db';
import { env } from '../src/config/env';

async function verify() {
  await connectDatabase();
  console.log('Primary Connection DB:', mongoose.connection.name); // Should be schoolsghar_master

  const conn1 = getTenantConnection('school_bkm_123');
  console.log('Conn1 DB:', conn1.name); // Should be school_bkm_123
  
  const conn2 = getTenantConnection('school_bkm_123');
  console.log('Conn1 === Conn2 ?', conn1 === conn2); // Should be true (useCache: true)

  const conn3 = getTenantConnection('school_demo_999');
  console.log('Conn3 DB:', conn3.name); // Should be school_demo_999

  await disconnectDatabase();
}

verify().catch(console.error);
