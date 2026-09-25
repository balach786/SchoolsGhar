import path from 'path';
import fs from 'fs';
import mongoose from 'mongodb';
import { MongoClient, BSON } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

interface BackupSummary {
  timestamp: string;
  database: string;
  backupDirectory: string;
  totalCollections: number;
  totalDocuments: number;
  collections: {
    name: string;
    documentCount: number;
    indexCount: number;
    fileSizeKB: number;
  }[];
}

async function restore(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env file.');
  }

  // Parse target backup directory from command line arguments or use latest
  const argDir = process.argv[2];
  const backupBaseDir = path.resolve(process.cwd(), '..', 'backups');
  let targetBackupDir = argDir ? path.resolve(argDir) : path.join(backupBaseDir, 'latest');

  if (!fs.existsSync(targetBackupDir)) {
    console.error(`Error: Backup directory not found at: ${targetBackupDir}`);
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('       STARTING MONGODB DATABASE RESTORE             ');
  console.log('======================================================');
  console.log(`Source directory: ${targetBackupDir}`);

  const summaryPath = path.join(targetBackupDir, 'backup-summary.json');
  if (fs.existsSync(summaryPath)) {
    const summary: BackupSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    console.log(`Backup original timestamp: ${summary.timestamp}`);
    console.log(`Backup original database:  ${summary.database}`);
    console.log(`Expected collections:      ${summary.totalCollections}`);
    console.log(`Expected documents:        ${summary.totalDocuments}`);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  console.log(`Connected to Target Database: ${db.databaseName}\n`);

  // Find all collection dump files (excluding .indexes.json and summary)
  const files = fs.readdirSync(targetBackupDir);
  const collectionFiles = files.filter(
    (f) => f.endsWith('.json') && !f.endsWith('.indexes.json') && f !== 'backup-summary.json'
  );

  let totalRestoredDocs = 0;

  for (const file of collectionFiles) {
    const colName = file.replace(/\.json$/, '');
    const col = db.collection(colName);
    const content = fs.readFileSync(path.join(targetBackupDir, file), 'utf-8');

    // Parse with MongoDB Extended JSON to restore exact ObjectIds, Dates, etc.
    const docs = (BSON.EJSON.parse(content) as any[]) || [];

    // Drop current collection to do a clean restore
    const existingCollections = await db.listCollections({ name: colName }).toArray();
    if (existingCollections.length > 0) {
      await col.drop().catch(() => {});
    }

    if (docs.length > 0) {
      await col.insertMany(docs, { ordered: true });
    }

    // Recreate indexes if index file exists
    const indexFilePath = path.join(targetBackupDir, `${colName}.indexes.json`);
    let restoredIndexCount = 0;
    if (fs.existsSync(indexFilePath)) {
      try {
        const rawIndexes = JSON.parse(fs.readFileSync(indexFilePath, 'utf-8'));
        // Filter out the default _id_ index as it cannot be manually recreated
        const customIndexes = rawIndexes
          .filter((idx: any) => idx.name !== '_id_')
          .map((idx: any) => {
            const { v, ns, ...indexSpecs } = idx;
            return indexSpecs;
          });

        if (customIndexes.length > 0) {
          await col.createIndexes(customIndexes);
          restoredIndexCount = customIndexes.length;
        }
      } catch (err: any) {
        console.warn(`    Warning recreating indexes for ${colName}: ${err.message}`);
      }
    }

    totalRestoredDocs += docs.length;
    console.log(`  ✓ [${colName}] -> Restored ${docs.length} docs, ${restoredIndexCount} custom indexes`);
  }

  console.log('──────────────────────────────────────────────────────');
  console.log(`✓ Database restore completed successfully!`);
  console.log(`  Collections processed: ${collectionFiles.length}`);
  console.log(`  Total docs restored:   ${totalRestoredDocs}`);
  console.log('======================================================\n');

  await client.close();
}

restore()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Restore failed:', err);
    process.exit(1);
  });
