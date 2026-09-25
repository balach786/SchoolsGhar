import mongoose from 'mongoose';
import { env } from '../src/config/env';

async function test() {
  const masterUri = new URL(env.mongodbUri);
  masterUri.pathname = '/schoolsghar_master';
  await mongoose.connect(masterUri.toString());
  
  console.log('Default connection DB:', mongoose.connection.name); // schoolsghar_master
  
  // Can we change it?
  const db = mongoose.connection.useDb('schoolsghar');
  console.log('useDb DB:', db.name);
  
  // What if we try to query a global model?
  const Student = mongoose.model('Student', new mongoose.Schema({ name: String }));
  console.log('Student DB:', Student.db.name); // schoolsghar_master
  
  await mongoose.disconnect();
}

test().catch(console.error);
