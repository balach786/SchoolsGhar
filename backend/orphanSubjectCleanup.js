const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.\n');
  const db = mongoose.connection.db;

  const targetIds = [
    '6aa9223cdf0fd8cc3e71b266',
    '6aa9241113c4c2e625723bfa',
    '6aa92731a0c316766c2de250',
    '6aa929468d88af8f2399bdfe',
    '6aa92a75d32a452b8b52b24f',
    '6aa92b74645a99258e727e5b',
    '6aa92c7061bc160b88b25340'
  ].map(id => new mongoose.Types.ObjectId(id));

  const subjects = await db.collection('subjects').find({ _id: { $in: targetIds } }).toArray();

  let allSafeToDelete = true;
  const safeToDeleteIds = [];

  for (const subj of subjects) {
    console.log(`\n--- Subject: ${subj._id} ---`);
    console.log(`name: ${subj.name}`);
    console.log(`code: ${subj.code}`);
    console.log(`tenantId: ${subj.tenantId}`);
    console.log(`sessionId: ${subj.sessionId}`);
    console.log(`classIds: ${subj.classIds}`);
    console.log(`teacherIds: ${subj.teacherIds}`);
    console.log(`createdAt: ${subj.createdAt}`);
    console.log(`updatedAt: ${subj.updatedAt}`);

    let isTest = subj.name.startsWith('TEST_');

    // Check Session
    const session = await db.collection('academicsessions').findOne({ _id: subj.sessionId });
    let sessionMissingOrTest = false;
    if (!session) {
      console.log(`Session missing: ${subj.sessionId}`);
      sessionMissingOrTest = true;
    } else {
      console.log(`Session exists: ${session.name}`);
      if (session.name.includes('TEST_')) sessionMissingOrTest = true;
    }

    // Check Classes
    let classesMissingOrTest = true;
    const classIdsArr = subj.classIds || [];
    for (const cid of classIdsArr) {
      const cls = await db.collection('classes').findOne({ _id: cid });
      if (!cls) {
        console.log(`Class missing: ${cid}`);
      } else {
        console.log(`Class exists: ${cls.name} (Session: ${cls.sessionId}, Tenant: ${cls.tenantId})`);
        if (!cls.name.includes('TEST_')) {
          classesMissingOrTest = false;
        }
      }
    }

    // Check Teachers
    const teacherIdsArr = subj.teacherIds || [];
    for (const tid of teacherIdsArr) {
      const t = await db.collection('teachers').findOne({ _id: tid });
      if (t) {
        console.log(`Teacher exists: ${t.firstName} ${t.lastName} (${tid})`);
      } else {
        console.log(`Teacher missing: ${tid}`);
      }
    }

    // Dependencies
    const deps = {
      timetables: await db.collection('timetables').countDocuments({ 'periods.subjectId': subj._id }),
      exams: await db.collection('exams').countDocuments({ subjectIds: subj._id }),
      results: await db.collection('results').countDocuments({ subjectId: subj._id })
    };
    const totalDeps = Object.values(deps).reduce((a, b) => a + b, 0);
    console.log(`Dependencies:`, deps);

    if (isTest && sessionMissingOrTest && classesMissingOrTest && totalDeps === 0) {
      console.log('=> STATUS: Proven TEST FIXTURE (Safe to delete)');
      safeToDeleteIds.push(subj._id);
    } else {
      console.log('=> STATUS: UNCERTAIN/REAL PROVENANCE (STOP)');
      allSafeToDelete = false;
    }
  }

  // Delete only if safe
  if (safeToDeleteIds.length > 0 && allSafeToDelete) {
    console.log('\n--- CLEANUP ---');
    const res = await db.collection('subjects').deleteMany({ _id: { $in: safeToDeleteIds } });
    console.log(`Deleted exact orphans: ${res.deletedCount} subjects.`);
  } else if (safeToDeleteIds.length > 0 && !allSafeToDelete) {
    console.log('\n--- CLEANUP ABORTED ---');
    console.log('At least one subject had uncertain/real provenance. No deletions were performed.');
  }

  // Global Sweep
  console.log('\n--- GLOBAL ACADEMIC ORPHAN SWEEP ---');
  const allSessions = await db.collection('academicsessions').distinct('_id');
  const allClasses = await db.collection('classes').distinct('_id');

  const c1 = await db.collection('classes').countDocuments({ sessionId: { $nin: allSessions } });
  const c2 = await db.collection('sections').countDocuments({ classId: { $nin: allClasses } });
  const c3 = await db.collection('sections').countDocuments({ sessionId: { $nin: allSessions } });
  const c4 = await db.collection('subjects').countDocuments({ sessionId: { $nin: allSessions } });

  const allSubjects = await db.collection('subjects').find({}).toArray();
  let c5 = 0;
  for (const s of allSubjects) {
    if (s.classIds && s.classIds.some(cid => !allClasses.some(ac => String(ac) === String(cid)))) {
      c5++;
    }
  }

  console.log(`1. Classes pointing to missing AcademicSession: ${c1}`);
  console.log(`2. Sections pointing to missing Class: ${c2}`);
  console.log(`3. Sections pointing to missing AcademicSession: ${c3}`);
  console.log(`4. Subjects pointing to missing AcademicSession: ${c4}`);
  console.log(`5. Subjects.classIds containing missing Classes: ${c5}`);

  await mongoose.disconnect();
}
run().catch(console.error);
