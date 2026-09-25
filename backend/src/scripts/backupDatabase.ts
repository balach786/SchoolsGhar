import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { BSON } from 'mongodb';
import { connectDatabase, disconnectDatabase } from '../config/db';

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

async function backup(): Promise<void> {
  console.log('\n======================================================');
  console.log('       STARTING FULL MONGODB DATABASE BACKUP         ');
  console.log('======================================================');

  await connectDatabase();
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Could not obtain MongoDB database instance.');
  }

  const dbName = db.databaseName || mongoose.connection.name || 'school-management-system';
  console.log(`Connected to Database: ${dbName}`);

  // Create timestamped folder in backups directory
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const backupBaseDir = path.resolve(process.cwd(), '..', 'backups');
  const backupDir = path.join(backupBaseDir, `backup-${timestamp}`);

  if (!fs.existsSync(backupBaseDir)) {
    fs.mkdirSync(backupBaseDir, { recursive: true });
  }
  fs.mkdirSync(backupDir, { recursive: true });

  const rawCollections = await db.listCollections().toArray();
  const collections = rawCollections
    .filter((c) => !c.name.startsWith('system.'))
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`Found ${collections.length} collections to back up.\n`);

  let totalDocs = 0;
  const summaryList: BackupSummary['collections'] = [];

  for (const colInfo of collections) {
    const colName = colInfo.name;
    const col = db.collection(colName);

    // Fetch all documents and indexes
    const docs = await col.find({}).toArray();
    const indexes = await col.indexes().catch(() => []);

    // Serialize documents using BSON Extended JSON (canonical format: preserves ObjectId, Date, etc.)
    const ejsonContent = BSON.EJSON.stringify(docs, { relaxed: false }, 2);
    const docFilePath = path.join(backupDir, `${colName}.json`);
    fs.writeFileSync(docFilePath, ejsonContent, 'utf-8');

    // Save indexes so restore can recreate exact indexes
    const indexFilePath = path.join(backupDir, `${colName}.indexes.json`);
    fs.writeFileSync(indexFilePath, JSON.stringify(indexes, null, 2), 'utf-8');

    const fileStat = fs.statSync(docFilePath);
    const fileSizeKB = Math.round((fileStat.size / 1024) * 100) / 100;
    totalDocs += docs.length;

    summaryList.push({
      name: colName,
      documentCount: docs.length,
      indexCount: indexes.length,
      fileSizeKB,
    });

    console.log(
      `  ✓ [${colName}] -> ${docs.length} docs, ${indexes.length} indexes (${fileSizeKB} KB)`
    );
  }

  // Create summary metadata file
  const summary: BackupSummary = {
    timestamp: now.toISOString(),
    database: dbName,
    backupDirectory: backupDir,
    totalCollections: collections.length,
    totalDocuments: totalDocs,
    collections: summaryList,
  };

  fs.writeFileSync(
    path.join(backupDir, 'backup-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf-8'
  );

  // Write a copy / pointer as latest
  const latestDir = path.join(backupBaseDir, 'latest');
  if (fs.existsSync(latestDir)) {
    fs.rmSync(latestDir, { recursive: true, force: true });
  }
  fs.mkdirSync(latestDir, { recursive: true });
  for (const file of fs.readdirSync(backupDir)) {
    fs.copyFileSync(path.join(backupDir, file), path.join(latestDir, file));
  }

  console.log('──────────────────────────────────────────────────────');
  console.log(`✓ Backup successfully completed!`);
  console.log(`  Database:          ${dbName}`);
  console.log(`  Total Collections: ${collections.length}`);
  console.log(`  Total Documents:   ${totalDocs}`);
  console.log(`  Backup Directory:  ${backupDir}`);
  console.log(`  Latest Directory:  ${latestDir}`);
  console.log('======================================================\n');

  await disconnectDatabase();
}

backup()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Backup failed:', err);
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  });
