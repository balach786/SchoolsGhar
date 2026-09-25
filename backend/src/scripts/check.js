const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Class = mongoose.connection.collection('classes');
  const count = await Class.countDocuments({ classTeacherId: { $ne: null, $exists: true } });
  console.log('count:' + count);
  process.exit(0);
}
run().catch(console.error);
