const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('No MONGODB_URI');
  
  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const staff = db.collection('staff');
    
    const hamza = await staff.findOne({ employeeId: 'EMP-009' });
    console.log('Hamza:', JSON.stringify(hamza, null, 2));

    const activeUnlinkedQuery = {
      staffType: 'teaching',
      isActive: true,
      isArchived: false,
      $or: [{ userId: null }, { userId: { $exists: false } }]
    };
    const activeUnlinked = await staff.find(activeUnlinkedQuery).toArray();
    console.log('Total active unlinked teachers:', activeUnlinked.length);
    const hasHamza = activeUnlinked.some(t => t.employeeId === 'EMP-009');
    console.log('Is Hamza in active unlinked teachers query?', hasHamza);

  } finally {
    await mongoose.disconnect();
  }
}
run().catch(console.dir);
