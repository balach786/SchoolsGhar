const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to:', mongoose.connection.client.s.url.split('@')[1] || mongoose.connection.client.s.url);
  console.log('Database name:', mongoose.connection.name);

  const exams = await mongoose.connection.db.collection('exams').countDocuments();
  const results = await mongoose.connection.db.collection('results').countDocuments();
  const examfees = await mongoose.connection.db.collection('examfees').countDocuments();
  const studentexamfees = await mongoose.connection.db.collection('studentexamfees').countDocuments();
  const examrollnumbers = await mongoose.connection.db.collection('examrollnumbers').countDocuments();
  const examschedules = await mongoose.connection.db.collection('examschedules').countDocuments();
  const marks = await mongoose.connection.db.collection('marks').countDocuments();

  console.log('exams:', exams);
  console.log('results:', results);
  console.log('examfees:', examfees);
  console.log('studentexamfees:', studentexamfees);
  console.log('examrollnumbers:', examrollnumbers);
  console.log('examschedules:', examschedules);
  console.log('marks:', marks);

  await mongoose.disconnect();
}

check().catch(console.error);
