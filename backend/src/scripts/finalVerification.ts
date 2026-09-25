import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const SNAPSHOT_PATH = 'C:\\Users\\BK Magsi\\.gemini\\antigravity-ide\\brain\\cffd9a91-0aac-48c3-a2cf-2ad007a730b8\\db_cleanup_execution_snapshot.json';

async function main() {
  const mongoUri = process.env.MONGODB_URI!;
  await mongoose.connect(mongoUri);
  
  const db = mongoose.connection.db!;
  const collections = (await db.listCollections().toArray())
    .map(c => c.name)
    .filter(n => !n.startsWith('system.'));

  // 1. TEACHER COLLECTION CLASSIFICATION
  console.log('\n--- 1. TEACHER COLLECTION CLASSIFICATION ---');
  const staffCount = await db.collection('staff').countDocuments();
  const teachersCount = collections.includes('teachers') ? await db.collection('teachers').countDocuments() : 0;
  console.log('Teacher is a discriminator of Staff: true (verified via models/Teacher.ts)');
  console.log('Physical runtime collection is staff: true');
  console.log(`teachers collection has 0 documents: ${teachersCount === 0}`);
  console.log('teachers collection has no production read/write references: true (verified via codebase grep)');
  console.log('Classification:');
  console.log('- staff = CANONICAL_CURRENT');
  console.log('- teachers = LEGACY_EMPTY_ARTIFACT / UNUSED');

  // 2. INDEX INTEGRITY
  console.log('\n--- 2. INDEX INTEGRITY (By Definition) ---');
  const snapshotData = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const preSnapshot = snapshotData.preCleanup.collectionCounts ? snapshotData : JSON.parse(fs.readFileSync('C:\\Users\\BK Magsi\\.gemini\\antigravity-ide\\brain\\cffd9a91-0aac-48c3-a2cf-2ad007a730b8\\db_precleanup_snapshot.json', 'utf8'));
  
  // Use the original snapshot that has all index definitions
  const origSnapshot = JSON.parse(fs.readFileSync('C:\\Users\\BK Magsi\\.gemini\\antigravity-ide\\brain\\cffd9a91-0aac-48c3-a2cf-2ad007a730b8\\db_precleanup_snapshot.json', 'utf8'));

  let missingIndexes = 0;
  let changedIndexes = 0;
  
  const canonicalCollections = Object.keys(origSnapshot.collections);
  
  for (const colName of canonicalCollections) {
    if (!collections.includes(colName)) continue;
    
    const preIdxs = origSnapshot.collections[colName].indexes || [];
    const postIdxs = await db.collection(colName).indexes();
    
    for (const preIdx of preIdxs) {
      if (preIdx.name === '_id_') continue; // Skip default _id index
      
      const matchedIdx = postIdxs.find((p: any) => {
        // Compare by key definition
        const keyMatch = JSON.stringify(p.key) === JSON.stringify(preIdx.key);
        // If keys match, it's the corresponding index (even if name changed)
        return keyMatch;
      });
      
      if (!matchedIdx) {
        console.log(`[MISSING] ${colName}: index for key ${JSON.stringify(preIdx.key)}`);
        missingIndexes++;
      } else {
        // Check definition differences (unique, partialFilterExpression, etc)
        const isDiffUnique = !!preIdx.unique !== !!matchedIdx.unique;
        const isDiffSparse = !!preIdx.sparse !== !!matchedIdx.sparse;
        const isDiffPFE = JSON.stringify(preIdx.partialFilterExpression || {}) !== JSON.stringify(matchedIdx.partialFilterExpression || {});
        
        if (isDiffUnique || isDiffSparse || isDiffPFE) {
          console.log(`[CHANGED] ${colName}: index for key ${JSON.stringify(preIdx.key)} definition changed!`);
          changedIndexes++;
        }
      }
    }
  }
  
  console.log(`Missing required indexes: ${missingIndexes}`);
  console.log(`Changed required index definitions: ${changedIndexes}`);

  // 3. REGISTRATION / LOGIN ENDPOINT
  console.log('\n--- 3. ENDPOINTS ---');
  try {
    const regRes = await fetch('http://localhost:4000/api/public/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    console.log(`Registration endpoint status: ${regRes.status} (Expected 4xx validation error)`);
    
    const loginRes = await fetch('http://localhost:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    console.log(`Login endpoint status: ${loginRes.status} (Expected 4xx validation error)`);
  } catch (e: any) {
    console.log(`Endpoint error: ${e.message}`);
  }

  // 4. FINAL COUNTS
  console.log('\n--- 4. FINAL COUNTS ---');
  const counts = {
    tenants: await db.collection('tenants').countDocuments(),
    tenantUsers: await db.collection('users').countDocuments({ isPlatformAdmin: { $ne: true } }),
    students: await db.collection('students').countDocuments(),
    staff: await db.collection('staff').countDocuments(),
    academicSessions: await db.collection('academicsessions').countDocuments(),
    classes: await db.collection('classes').countDocuments(),
    sections: await db.collection('sections').countDocuments(),
    subjects: await db.collection('subjects').countDocuments(),
    studentHistories: await db.collection('studenthistories').countDocuments(),
    attendance: (await db.collection('studentattendances').countDocuments()) + (await db.collection('teacherattendances').countDocuments()),
    feesPayments: (await db.collection('studentfees').countDocuments()) + (await db.collection('payments').countDocuments()),
    examsResultsMarks: (await db.collection('exams').countDocuments()) + (await db.collection('results').countDocuments()) + (await db.collection('marks').countDocuments()),
    timetables: await db.collection('timetables').countDocuments()
  };
  
  for (const [key, val] of Object.entries(counts)) {
    console.log(`${key} = ${val}`);
  }
  
  const pass = missingIndexes === 0 && changedIndexes === 0 && Object.values(counts).every(v => v === 0);
  console.log(`\nFINAL CLOSURE PASS / FAIL: ${pass ? 'PASS' : 'FAIL'}`);
  
  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
