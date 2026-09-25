import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("NO_URI_FOUND");
        process.exit(1);
    }
    await mongoose.connect(uri);
    const dbName = mongoose.connection.db?.databaseName;
    const host = mongoose.connection.host;
    console.log(`CONNECTION_SUCCESS`);
    console.log(`DATABASE_NAME: ${dbName}`);
    
    // Ensure no old Atlas is used
    if (host.includes('3mpjmll.mongodb.net') || host.includes('School-Managment-System-Database')) {
       console.log('WARNING: STILL USING OLD ATLAS CLUSTER');
    } else {
       console.log('SUCCESS: NOT USING OLD ATLAS CLUSTER');
    }

    process.exit(0);
  } catch(e: any) {
    console.error('CONNECTION_FAILED', e.message);
    process.exit(1);
  }
}
run();
