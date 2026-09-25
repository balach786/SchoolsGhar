/** Repair legacy timetable ownership from its existing academic session. Dry-run by default. */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { Timetable } from '../models/Timetable';
import { AcademicSession } from '../models/AcademicSession';

async function main() {
  await connectDatabase();
  const missing = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
  let found = 0, repairable = 0, updated = 0, unresolved = 0;
  for await (const period of Timetable.find(missing).cursor()) {
    found++;
    const session = await AcademicSession.findById(period.sessionId).select('tenantId').lean();
    if (!session?.tenantId) { unresolved++; continue; }
    repairable++;
    if (process.argv.includes('--apply')) {
      const result = await Timetable.updateOne({ _id: period._id, ...missing }, { $set: { tenantId: session.tenantId } });
      updated += result.modifiedCount;
    }
  }
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', found, repairable, updated, unresolved }));
  await disconnectDatabase();
  if (unresolved) process.exitCode = 1;
}
main().catch(async error => { console.error(error.message); await disconnectDatabase(); process.exitCode = 1; });
