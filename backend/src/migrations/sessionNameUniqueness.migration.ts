/**
 * Session Name Uniqueness Migration
 *
 * EXPLICIT MANUAL MIGRATION ONLY — never auto-run at server startup.
 * Fully idempotent — safe to run multiple times.
 *
 * Steps:
 * 1. Non-mutating conflict preflight for non-archived sessions
 * 2. Backfill normalizedName for ALL sessions (including archived)
 * 3. Create partial unique index (non-archived only)
 * 4. Verify index exists
 *
 * Usage: npx ts-node --transpile-only src/migrations/sessionNameUniqueness.migration.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function canonicalize(name: string): string {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const INDEX_NAME = 'idx_session_tenant_normalizedname_unique';

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  const db = mongoose.connection.db!;
  const collection = db.collection('academicsessions');

  // ── Step 1: Non-mutating conflict preflight ──────────────────────
  // Compute canonical names from raw AcademicSession.name (correction #17).
  // Only non-archived sessions are checked for uniqueness conflicts.
  console.log('\n=== Step 1: Conflict Preflight ===');
  const allNonArchived = await collection
    .find({ isArchived: { $ne: true } })
    .project({ _id: 1, tenantId: 1, name: 1, isArchived: 1 })
    .toArray();

  console.log(`Found ${allNonArchived.length} non-archived sessions.`);

  // Group by (tenantId, canonical)
  const groups = new Map<string, { canonical: string; tenantId: string; docs: any[] }>();
  for (const doc of allNonArchived) {
    const canonical = canonicalize(doc.name);
    const key = `${String(doc.tenantId)}::${canonical}`;
    if (!groups.has(key)) {
      groups.set(key, { canonical, tenantId: String(doc.tenantId), docs: [] });
    }
    groups.get(key)!.docs.push(doc);
  }

  const conflicts = [...groups.values()].filter((g) => g.docs.length > 1);
  if (conflicts.length > 0) {
    console.error('\n❌ CONFLICT DETECTED — Migration cannot proceed.\n');
    for (const c of conflicts) {
      console.error(
        `  Tenant ${c.tenantId} has ${c.docs.length} non-archived sessions ` +
          `with canonical name "${c.canonical}":`
      );
      for (const d of c.docs) {
        console.error(`    _id: ${d._id}, raw name: "${d.name}"`);
      }
    }
    console.error('\nResolve duplicates manually before re-running this migration.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('✓ No conflicts detected.');

  // ── Step 2: Backfill normalizedName for ALL sessions (correction #16) ──
  console.log('\n=== Step 2: Backfill normalizedName ===');
  const allSessions = await collection
    .find({})
    .project({ _id: 1, name: 1, normalizedName: 1 })
    .toArray();

  let backfilled = 0;
  let alreadySet = 0;

  for (const doc of allSessions) {
    const expected = canonicalize(doc.name);
    if (doc.normalizedName === expected) {
      alreadySet++;
      continue;
    }
    await collection.updateOne(
      { _id: doc._id },
      { $set: { normalizedName: expected } }
    );
    backfilled++;
  }

  console.log(`✓ Backfilled: ${backfilled}, Already set: ${alreadySet}, Total: ${allSessions.length}`);

  // ── Step 3: Create unique index (idempotent, correction #18) ─────
  console.log('\n=== Step 3: Create Unique Index ===');

  // Check existing indexes (no syncIndexes — correction #18)
  const existingIndexes = await collection.indexes();
  const alreadyExists = existingIndexes.some((idx: any) => idx.name === INDEX_NAME);

  if (alreadyExists) {
    console.log(`✓ Index "${INDEX_NAME}" already exists. Skipping creation.`);
  } else {
    console.log(`Creating index "${INDEX_NAME}"...`);
    await collection.createIndex(
      { tenantId: 1, normalizedName: 1 },
      {
        unique: true,
        partialFilterExpression: { isArchived: false },
        name: INDEX_NAME,
      }
    );
    console.log(`✓ Index "${INDEX_NAME}" created.`);
  }

  // ── Step 4: Verify index ─────────────────────────────────────────
  console.log('\n=== Step 4: Verification ===');
  const finalIndexes = await collection.indexes();
  const found = finalIndexes.find((idx: any) => idx.name === INDEX_NAME);
  if (found) {
    console.log(`✓ Index "${INDEX_NAME}" verified:`);
    console.log(`  key: ${JSON.stringify(found.key)}`);
    console.log(`  unique: ${found.unique}`);
    console.log(`  partialFilterExpression: ${JSON.stringify(found.partialFilterExpression)}`);
  } else {
    console.error(`❌ Index "${INDEX_NAME}" NOT found after creation!`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Also verify idx_academic_session_tenant_active_unique is still intact
  const activeIdx = finalIndexes.find(
    (idx: any) =>
      idx.name === 'idx_academic_session_tenant_active_unique' ||
      (idx.unique && idx.key?.tenantId === 1 && idx.key?.isActive === 1)
  );
  if (activeIdx) {
    console.log(`✓ Active-session unique index intact: ${activeIdx.name}`);
  } else {
    console.log('ℹ Active-session unique index not found by expected name (may use default Mongoose name).');
  }

  console.log('\n=== Migration Complete ===');
  console.log('All sessions have normalizedName. Partial unique index enforced for non-archived sessions.');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
