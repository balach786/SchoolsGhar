import mongoose from 'mongoose';
import { connectDatabase } from './src/config/db';
import { env } from './src/config/env';
import { Role } from './src/models/Role';

async function main() {
  await connectDatabase();
  const teacherRole = await Role.findOne({ slug: 'teacher' }).lean();
  console.log('Teacher role in global DB:', !!teacherRole);
  const allRoles = await Role.find({}).lean();
  console.log('All roles globally:', allRoles.map(r => r.slug));
  process.exit(0);
}

main().catch(console.error);
