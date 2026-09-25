const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const uriMatch = env.match(/MONGODB_URI=(.*)/);
if (!uriMatch) throw new Error('No URI');
const uri = uriMatch[1].trim();

const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const admin = await db.collection('users').findOne({});
  console.log('Admin email:', admin.email);
  
  // Directly query the staff collection as well
  const filter = {
    staffType: 'teaching',
    isActive: true,
    isArchived: false,
    $or: [{ userId: null }, { userId: { $exists: false } }]
  };
  const unlinked = await db.collection('staff').find(filter).limit(20).toArray();
  console.log('Total unlinked teachers returned:', unlinked.length);
  const hasHamza = unlinked.some(t => t.employeeId === 'EMP-009');
  console.log('Is Hamza in there?', hasHamza);
  
  if (!hasHamza) {
     const hamza = await db.collection('staff').findOne({ employeeId: 'EMP-009' });
     console.log('Hamza doc:', JSON.stringify(hamza, null, 2));
  }

  await mongoose.disconnect();
}
run().catch(console.error);
