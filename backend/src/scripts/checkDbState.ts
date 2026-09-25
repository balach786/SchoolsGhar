import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';

async function main() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db!;

  const timetableCount = await db.collection('timetables').countDocuments();
  console.log('TIMETABLE_DOC_COUNT:', timetableCount);

  const indexes = await db.collection('timetables').indexes();
  console.log('\nTIMETABLE_INDEXES:');
  indexes.forEach((idx: any) => {
    console.log(' -', JSON.stringify(idx.key), '|', idx.name);
  });

  const sampleAudit = await db.collection('auditlogs').findOne({ action: /TIMETABLE/ } as any);
  console.log('\nSAMPLE_TIMETABLE_AUDIT:', sampleAudit ? sampleAudit.action : 'none found');

  const archivedCount = await db.collection('timetables').countDocuments({ isArchived: true });
  console.log('\nARCHIVED_TIMETABLE_COUNT:', archivedCount);

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(e => { console.error('DB_ERROR:', e.message); process.exit(1); });
