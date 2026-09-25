import mongoose from 'mongoose';
import { FeeStructure } from './backend/src/models/FeeStructure';

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/school-management-system'); // Assuming local DB
  const doc = await FeeStructure.findById('6aa9b9653b54fa90d2ec2486');
  console.log('Doc:', doc);
  process.exit(0);
}
check().catch(console.error);
