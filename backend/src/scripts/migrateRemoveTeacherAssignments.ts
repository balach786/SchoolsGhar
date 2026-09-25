import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDatabase } from '../config/db';

// Load environment variables
dotenv.config();

async function runMigration() {
  console.log('Starting migration to remove Teacher assignments...');
  await connectDatabase();

  const isDryRun = !process.argv.includes('--execute');

  if (isDryRun) {
    console.log('====================================================');
    console.log(' DRY RUN MODE. NO CHANGES WILL BE SAVED TO THE DB. ');
    console.log(' Run with --execute to apply changes.              ');
    console.log('====================================================');
  } else {
    console.log('====================================================');
    console.log(' EXECUTE MODE. CHANGES WILL BE APPLIED TO THE DB.  ');
    console.log('====================================================');
  }

  const db = mongoose.connection.db;
  if (!db) {
    console.error('Database connection not established.');
    process.exit(1);
  }

  // 1. Remove assignedClasses and assignedSubjects from Staff/Teachers
  console.log('\n--- Checking Staff Collection ---');
  const staffCollection = db.collection('staffs');
  
  const staffWithFields = await staffCollection.countDocuments({
    $or: [
      { assignedClasses: { $exists: true } },
      { assignedSubjects: { $exists: true } }
    ]
  });

  console.log(`Found ${staffWithFields} staff members with assignedClasses or assignedSubjects.`);

  if (!isDryRun && staffWithFields > 0) {
    const result = await staffCollection.updateMany(
      {},
      { $unset: { assignedClasses: 1, assignedSubjects: 1 } }
    );
    console.log(`Updated ${result.modifiedCount} staff documents.`);
  }

  // 2. Remove classTeacherId from Classes
  console.log('\n--- Checking Classes Collection ---');
  const classCollection = db.collection('classes');

  const classesWithTeacher = await classCollection.countDocuments({
    classTeacherId: { $exists: true }
  });

  console.log(`Found ${classesWithTeacher} classes with a classTeacherId.`);

  if (!isDryRun && classesWithTeacher > 0) {
    const result = await classCollection.updateMany(
      {},
      { $unset: { classTeacherId: 1 } }
    );
    console.log(`Updated ${result.modifiedCount} class documents.`);
  }

  // 3. Remove teacherIds from Subjects
  console.log('\n--- Checking Subjects Collection ---');
  const subjectCollection = db.collection('subjects');

  const subjectsWithTeachers = await subjectCollection.countDocuments({
    teacherIds: { $exists: true }
  });

  console.log(`Found ${subjectsWithTeachers} subjects with teacherIds.`);

  if (!isDryRun && subjectsWithTeachers > 0) {
    const result = await subjectCollection.updateMany(
      {},
      { $unset: { teacherIds: 1 } }
    );
    console.log(`Updated ${result.modifiedCount} subject documents.`);
  }

  console.log('\nMigration script finished.');
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
