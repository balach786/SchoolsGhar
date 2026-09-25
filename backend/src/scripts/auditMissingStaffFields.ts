import mongoose from 'mongoose';
import { Staff } from '../models/Staff';
import { connectDatabase } from '../config/db';
import { env } from '../config/env';

async function audit() {
  await connectDatabase();
  console.log(`Auditing staff collection in ${env.mongodbUri}`);

  const missingFatherNameCount = await Staff.countDocuments({
    $or: [{ fatherName: { $exists: false } }, { fatherName: '' }, { fatherName: null }]
  });

  const missingCasteCount = await Staff.countDocuments({
    $or: [{ caste: { $exists: false } }, { caste: '' }, { caste: null }]
  });

  const missingBothCount = await Staff.countDocuments({
    $and: [
      { $or: [{ fatherName: { $exists: false } }, { fatherName: '' }, { fatherName: null }] },
      { $or: [{ caste: { $exists: false } }, { caste: '' }, { caste: null }] }
    ]
  });

  console.log(`Total missing fatherName: ${missingFatherNameCount}`);
  console.log(`Total missing caste: ${missingCasteCount}`);
  console.log(`Total missing both: ${missingBothCount}`);

  // We could prepare a safe update payload, e.g.
  // db.staff.updateMany({ fatherName: { $exists: false } }, { $set: { fatherName: 'Unknown', caste: 'Unknown' } })
  // But per instructions, do not execute the update.

  process.exit(0);
}

audit().catch(err => {
  console.error(err);
  process.exit(1);
});
