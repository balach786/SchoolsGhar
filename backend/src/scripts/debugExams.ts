import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const exams = await db.collection('exams').find({}).toArray();
  console.log('Exams count:', exams.length);
  for (const e of exams) {
    if (!e.name) {
      console.log('Exam missing name:', e._id);
    }
  }

  const classIds = Array.from(new Set(exams.map((e) => e.classId).filter(Boolean).map(String)));
  console.log('Class IDs:', classIds);
  
  process.exit(0);
}

run().catch(console.error);
