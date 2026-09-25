/**
 * Index existence check for Prompt 9 (run via tsx from the backend dir).
 * Prints `INDEXCHECK {"collection":true,...}` for every required unique index.
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/db';

const REQUIRED: Array<[string, string[]]> = [
  ['users', ['email']],
  ['students', ['admissionNumber']],
  ['teachers', ['employeeId']],
  ['payments', ['receiptNumber']],
  ['studentattendances', ['studentId', 'sessionId', 'attendanceDate']],
  ['teacherattendances', ['teacherId', 'attendanceDate']],
  ['marks', ['studentId', 'sessionId', 'examId', 'subjectId']],
  ['submissions', ['assignmentId', 'studentId']],
];

async function main(): Promise<void> {
  await connectDatabase();
  const db = mongoose.connection.db!;
  const out: Record<string, boolean> = {};
  for (const [coll, keys] of REQUIRED) {
    const indexes = await db.collection(coll).indexes();
    const found = indexes.some((i) => {
      if (!i.unique) return false;
      const k = Object.keys(i.key).sort();
      const expected = coll === 'users' ? keys : ['tenantId', ...keys];
      return k.length === expected.length && expected.every((x) => k.includes(x));
    });
    out[coll] = Boolean(found);
  }
  console.log('INDEXCHECK ' + JSON.stringify(out));
  await disconnectDatabase();
  process.exit(0);
}

main().catch((err) => {
  console.error('INDEXCHECK failed', err);
  process.exit(1);
});

