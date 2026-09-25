const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  // 1. Orphan check
  const deletedIds = ['6aa91f7f423515cbd936735c', '6aa91fcaa668a84ae96bb5a9', '6aa9202acfd6595f1e88db6f', '6aa9209ca9be59d07667377c', '6aa920ec03af714fe8b7791f', '6aa92357a01c2a0d8d36d5a9'].map(id => new mongoose.Types.ObjectId(id));
  const cols = ['students', 'studenthistories', 'classes', 'sections', 'subjects', 'studentattendances', 'feestructures', 'studentfees', 'exams', 'results', 'timetables'];
  
  const orphans = {};
  for (const c of cols) {
    orphans[c] = await db.collection(c).countDocuments({ sessionId: { $in: deletedIds } });
  }
  console.log('Orphan Dependencies:', orphans);

  // 2. Normalized Name check
  const sessions = db.collection('academicsessions');
  const total = await sessions.countDocuments({});
  const missing = await sessions.countDocuments({ normalizedName: { $exists: false } });
  const missingNull = await sessions.countDocuments({ normalizedName: null });
  const archived = await sessions.countDocuments({ isArchived: true });
  const archivedMissing = await sessions.countDocuments({ isArchived: true, normalizedName: { $exists: false } });
  const archivedMissingNull = await sessions.countDocuments({ isArchived: true, normalizedName: null });

  console.log('Session Stats:', {
    total,
    missing: missing + missingNull,
    archived,
    archivedMissing: archivedMissing + archivedMissingNull
  });

  await mongoose.disconnect();
}

run().catch(console.error);
