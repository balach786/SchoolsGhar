import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not found');
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  console.log('======================================================');
  console.log('       PHASE 4E POST-VERIFY INITIAL AUDIT             ');
  console.log('======================================================\n');

  // 1. FeeStructure Inspection
  const feeStructures = await db.collection('feestructures').find().toArray();
  console.log('--- FeeStructure Document(s) ---');
  console.log(`Count: ${feeStructures.length}`);
  for (const fs of feeStructures) {
    console.log(JSON.stringify(fs, null, 2));
  }

  // 2. Physical Collection Inventory
  const collections = await db.listCollections().toArray();
  console.log(`\n--- Physical Collections Inventory (Total: ${collections.length}) ---`);
  const names = collections.map((c) => c.name).sort();
  names.forEach((name, i) => console.log(`${String(i + 1).padStart(2, ' ')}. ${name}`));

  // 3. Index Inspection
  console.log('\n--- Index Details for New and Related Collections ---');
  for (const colName of ['payments', 'paymentreversals', 'financialreferences', 'financialidempotencies', 'feestructures']) {
    try {
      const idxs = await db.collection(colName).indexes();
      console.log(`\nCollection: ${colName} (${idxs.length} indexes)`);
      for (const idx of idxs) {
        console.log(`  - Name: ${idx.name}, Key: ${JSON.stringify(idx.key)}, Unique: ${!!idx.unique}, Sparse: ${!!idx.sparse}`);
      }
    } catch (e: any) {
      console.log(`Collection: ${colName} (Not found or error: ${e.message})`);
    }
  }

  // Total index count across all collections
  let totalIndexes = 0;
  for (const c of collections) {
    try {
      const idxs = await db.collection(c.name).indexes();
      totalIndexes += idxs.length;
    } catch {}
  }
  console.log(`\nTotal Indexes across all physical collections: ${totalIndexes}`);

  await mongoose.disconnect();
}

run().catch(console.error);
