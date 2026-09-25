const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const allSessions = await db.collection('academicsessions').distinct('_id');
  const subjectsMissingSession = await db.collection('subjects').find({ sessionId: { $nin: allSessions } }).toArray();

  console.log('Subjects missing session:', subjectsMissingSession.map(s => ({ id: s._id, name: s.name, code: s.code, classIds: s.classIds, sessionId: s.sessionId })));

  await mongoose.disconnect();
}
run().catch(console.error);
