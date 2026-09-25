import mongoose from 'mongoose';

async function run() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/school-management-system');
    const doc = await mongoose.connection.db.collection('feestructures').findOne({ _id: new mongoose.Types.ObjectId('6aa9b9653b54fa90d2ec2486') });
    console.log('Found:', doc);
  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
  }
}
run();
