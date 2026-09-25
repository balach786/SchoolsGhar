/**
 * Exam classIds Uniqueness Migration
 *
 * EXPLICIT MANUAL MIGRATION ONLY — never auto-run at server startup.
 * Fully idempotent — safe to run multiple times.
 *
 * Steps:
 * 1. Checks if the old single-class index exists and drops it.
 * 2. Checks if the new multi-key index exists and creates it.
 *
 * Usage: npx ts-node --transpile-only src/migrations/examClassIdsUniqueness.migration.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const OLD_INDEX_NAME = 'tenantId_1_name_1_sessionId_1_classId_1';
const NEW_INDEX_NAME = 'tenantId_1_name_1_sessionId_1_classIds_1';

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  const db = mongoose.connection.db!;
  const collection = db.collection('exams');

  const existingIndexes = await collection.indexes();
  
  // Step 1: Drop old index
  console.log('\n=== Step 1: Drop old single-class unique index ===');
  const hasOld = existingIndexes.some((idx: any) => idx.name === OLD_INDEX_NAME);
  if (hasOld) {
    console.log(`Dropping old index "${OLD_INDEX_NAME}"...`);
    await collection.dropIndex(OLD_INDEX_NAME);
    console.log(`✓ Dropped old index.`);
  } else {
    console.log(`✓ Old index "${OLD_INDEX_NAME}" not found. Skipping.`);
  }

  // Step 2: Create new multi-key index
  console.log('\n=== Step 2: Create new classIds multi-key unique index ===');
  const hasNew = existingIndexes.some((idx: any) => idx.name === NEW_INDEX_NAME);
  if (hasNew) {
    console.log(`✓ Index "${NEW_INDEX_NAME}" already exists. Skipping creation.`);
  } else {
    console.log(`Creating new index "${NEW_INDEX_NAME}"...`);
    try {
      await collection.createIndex(
        { tenantId: 1, name: 1, sessionId: 1, classIds: 1 },
        { unique: true, name: NEW_INDEX_NAME }
      );
      console.log(`✓ Created new multi-key index.`);
    } catch (error: any) {
      if (error.code === 11000) {
        console.error('\n❌ CONFLICT DETECTED — Cannot create unique index because duplicate exams exist.');
        console.error('Resolve duplicates manually before re-running this migration.');
      } else {
        console.error('\n❌ Failed to create index:', error.message);
      }
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  console.log('\nMigration completed successfully.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
