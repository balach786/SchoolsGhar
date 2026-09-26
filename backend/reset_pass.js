const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.useDb('school_bkm-school_38810894');
  const hash = await bcrypt.hash('password123', 10);
  await db.collection('users').updateOne({ email: 'balach937@gmail.com' }, { '$set': { passwordHash: hash } });
  console.log('Password reset');
  process.exit(0);
});
