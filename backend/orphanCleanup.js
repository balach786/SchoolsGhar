const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.\n');
  const db = mongoose.connection.db;

  const deletedSessionIds = [
    '6aa91f7f423515cbd936735c', '6aa91fcaa668a84ae96bb5a9', 
    '6aa9202acfd6595f1e88db6f', '6aa9209ca9be59d07667377c', 
    '6aa920ec03af714fe8b7791f', '6aa92357a01c2a0d8d36d5a9'
  ].map(id => new mongoose.Types.ObjectId(id));

  // --- 1. IDENTIFY EXACT ORPHAN DOCUMENTS ---
  const orphanClasses = await db.collection('classes').find({ sessionId: { $in: deletedSessionIds } }).toArray();
  const orphanSections = await db.collection('sections').find({ sessionId: { $in: deletedSessionIds } }).toArray();
  const orphanSubjects = await db.collection('subjects').find({ sessionId: { $in: deletedSessionIds } }).toArray();

  const classIds = orphanClasses.map(c => c._id);
  const sectionIds = orphanSections.map(s => s._id);
  const subjectIds = orphanSubjects.map(s => s._id);

  console.log('--- 1. EXACT ORPHAN DOCUMENTS ---');
  console.log('Orphan Classes:', orphanClasses.map(c => ({ id: c._id, name: c.name, tenantId: c.tenantId, sessionId: c.sessionId })));
  console.log('\nOrphan Sections:', orphanSections.map(s => ({ id: s._id, name: s.name, classId: s.classId, tenantId: s.tenantId, sessionId: s.sessionId })));
  console.log('\nOrphan Subjects:', orphanSubjects.map(s => ({ id: s._id, name: s.name, code: s.code, classIds: s.classIds, tenantId: s.tenantId, sessionId: s.sessionId })));

  // Confirm parent AcademicSession no longer exists
  let parentExists = false;
  for (const sid of deletedSessionIds) {
    const s = await db.collection('academicsessions').findOne({ _id: sid });
    if (s) parentExists = true;
  }
  console.log('\nParent AcademicSession exists for any of the 6 IDs?', parentExists);


  // --- 2. PROVE TEST-FIXTURE PROVENANCE ---
  console.log('\n--- 2. PROVE TEST-FIXTURE PROVENANCE ---');
  let provenanceProven = true;
  for (const c of orphanClasses) {
    if (!c.name.includes('__') && !c.name.includes('TEST')) {
      console.log('WARNING: Class name looks real:', c.name);
      provenanceProven = false;
    }
  }
  for (const s of orphanSections) {
    if (!s.name.includes('__') && !s.name.includes('TEST')) {
      console.log('WARNING: Section name looks real:', s.name);
      provenanceProven = false;
    }
  }
  for (const s of orphanSubjects) {
    if (!s.name.includes('__') && !s.name.includes('TEST')) {
      console.log('WARNING: Subject name looks real:', s.name);
      provenanceProven = false;
    }
  }
  console.log('Proven test-fixture provenance YES/NO:', provenanceProven ? 'YES' : 'NO');
  if (!provenanceProven) {
    console.log('STOPPING DUE TO UNCERTAIN DATA.');
    process.exit(1);
  }


  // --- 3. CHECK DEPENDENCIES BY CHILD IDs ---
  console.log('\n--- 3. CHECK DEPENDENCIES BY CHILD IDs ---');
  const deps = {
    students: await db.collection('students').countDocuments({ $or: [{ classId: { $in: classIds } }, { sectionId: { $in: sectionIds } }] }),
    studenthistories: await db.collection('studenthistories').countDocuments({ $or: [{ classId: { $in: classIds } }, { previousClassId: { $in: classIds } }, { sectionId: { $in: sectionIds } }, { previousSectionId: { $in: sectionIds } }] }),
    studentattendances: await db.collection('studentattendances').countDocuments({ $or: [{ classId: { $in: classIds } }, { sectionId: { $in: sectionIds } }] }),
    feestructures: await db.collection('feestructures').countDocuments({ classId: { $in: classIds } }),
    studentfees: await db.collection('studentfees').countDocuments({ classId: { $in: classIds } }),
    exams: await db.collection('exams').countDocuments({ $or: [{ classId: { $in: classIds } }, { subjectIds: { $in: subjectIds } }] }),
    results: await db.collection('results').countDocuments({ $or: [{ classId: { $in: classIds } }, { sectionId: { $in: sectionIds } }, { subjectId: { $in: subjectIds } }] }),
    timetables: await db.collection('timetables').countDocuments({ $or: [{ classId: { $in: classIds } }, { sectionId: { $in: sectionIds } }, { 'periods.subjectId': { $in: subjectIds } }] }),
    subjects_ref_class: await db.collection('subjects').countDocuments({ classIds: { $in: classIds }, _id: { $nin: subjectIds } }),
    notices: await db.collection('notices').countDocuments({ $or: [{ classIds: { $in: classIds } }, { sectionIds: { $in: sectionIds } }] }),
  };
  
  console.log('Dependencies found:', deps);
  const totalDeps = Object.values(deps).reduce((a, b) => a + b, 0);

  // --- 4. & 5. CLEANUP CONDITION AND DELETION ---
  console.log('\n--- 4 & 5. CLEANUP ---');
  let deletedSubjects = 0;
  let deletedSections = 0;
  let deletedClasses = 0;

  if (provenanceProven && totalDeps === 0) {
    console.log('All conditions met. Proceeding with targeted cleanup...');
    const resSubj = await db.collection('subjects').deleteMany({ _id: { $in: subjectIds } });
    deletedSubjects = resSubj.deletedCount;
    
    const resSec = await db.collection('sections').deleteMany({ _id: { $in: sectionIds } });
    deletedSections = resSec.deletedCount;
    
    const resClass = await db.collection('classes').deleteMany({ _id: { $in: classIds } });
    deletedClasses = resClass.deletedCount;

    console.log(`Deleted exact orphans: ${deletedSubjects} subjects, ${deletedSections} sections, ${deletedClasses} classes.`);
  } else {
    console.log('Cleanup skipped due to failed conditions.');
  }

  // --- 6. POST-CLEANUP ORPHAN SWEEP ---
  console.log('\n--- 6. POST-CLEANUP ORPHAN SWEEP ---');
  
  // Find sessions that don't exist
  const allSessions = await db.collection('academicsessions').distinct('_id');
  const allClasses = await db.collection('classes').distinct('_id');

  const missingClasses = await db.collection('classes').countDocuments({ sessionId: { $nin: allSessions } });
  const missingSectionsClass = await db.collection('sections').countDocuments({ classId: { $nin: allClasses } });
  const missingSectionsSession = await db.collection('sections').countDocuments({ sessionId: { $nin: allSessions } });
  const missingSubjectsSession = await db.collection('subjects').countDocuments({ sessionId: { $nin: allSessions } });
  
  // For subject classIds array, it's slightly more complex (we can aggregate or just check if any subject has an orphan classId)
  const subjects = await db.collection('subjects').find({}).toArray();
  let missingSubjectsClass = 0;
  for (const subj of subjects) {
    if (subj.classIds && subj.classIds.some(cid => !allClasses.some(ac => String(ac) === String(cid)))) {
      missingSubjectsClass++;
    }
  }

  console.log('Post-cleanup Sweep:');
  console.log(`Classes missing Session: ${missingClasses}`);
  console.log(`Sections missing Class: ${missingSectionsClass}`);
  console.log(`Sections missing Session: ${missingSectionsSession}`);
  console.log(`Subjects missing Session: ${missingSubjectsSession}`);
  console.log(`Subjects missing Class: ${missingSubjectsClass}`);


  await mongoose.disconnect();
}

run().catch(console.error);
