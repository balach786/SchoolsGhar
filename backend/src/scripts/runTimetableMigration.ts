import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { runTimetableArchiveAndIndexesMigration } from '../migrations/timetableArchiveAndIndexes.migration';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB at', mongoUri);

  console.log('\n--- RUNNING TIMETABLE MIGRATION (RUN 1) ---');
  const run1 = await runTimetableArchiveAndIndexesMigration();
  console.log('Run 1 Result:\n', JSON.stringify(run1, null, 2));

  console.log('\n--- RUNNING TIMETABLE MIGRATION (RUN 2 - IDEMPOTENCY CHECK) ---');
  const run2 = await runTimetableArchiveAndIndexesMigration();
  console.log('Run 2 Result:\n', JSON.stringify(run2, null, 2));

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB.');
}

main().catch((err) => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
