import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school-management-system';
    console.log('Connecting to:', uri.substring(0, 30) + '...');
    await mongoose.connect(uri);
    const doc = await mongoose.connection.db.collection('feestructures').findOne({ _id: new mongoose.Types.ObjectId('6aa9b9653b54fa90d2ec2486') });
    console.log('DOCUMENT FOUND:', doc ? JSON.stringify(doc, null, 2) : 'NOT_FOUND');
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
}
check();
