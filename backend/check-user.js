const mongoose = require('mongoose');

async function run() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required");
    await mongoose.connect(uri);
    const user = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId('6aa9b276cd9297d5a9957788') });
    console.log('USER:', user);
  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
  }
}
run();
