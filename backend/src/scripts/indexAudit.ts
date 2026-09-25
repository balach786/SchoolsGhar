/**
 * CLI: npm run indexes:audit   (report-only)
 *      npm run indexes:sync    (report + syncIndexes: drops indexes not in the schemas)
 *
 * Compares the indexes declared in the Mongoose schemas with the indexes that
 * actually exist in MongoDB. Detects duplicates and orphaned indexes left over
 * from older schema versions.
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { AcademicSession } from '../models/AcademicSession';
import { Class } from '../models/Class';
import { Section } from '../models/Section';
import { Subject } from '../models/Subject';
import { Student } from '../models/Student';
import { Teacher } from '../models/Teacher';
import { StudentHistory } from '../models/StudentHistory';
import { GradeScale } from '../models/GradeScale';
import { StudentAttendance } from '../models/StudentAttendance';
import { TeacherAttendance } from '../models/TeacherAttendance';
import { Timetable } from '../models/Timetable';
import { Exam } from '../models/Exam';
import { Mark } from '../models/Mark';
import { FeeStructure } from '../models/FeeStructure';
import { StudentFee } from '../models/StudentFee';
import { Payment } from '../models/Payment';
import { Income } from '../models/Income';
import { Expense } from '../models/Expense';
import { SalaryRecord } from '../models/SalaryRecord';
import { AuditLog } from '../models/AuditLog';
import { Notification } from '../models/Notification';
import { Notice } from '../models/Notice';
import { Assignment } from '../models/Assignment';
import { Submission } from '../models/Submission';
import { LeaveRequest } from '../models/LeaveRequest';
import { SchoolSettings } from '../models/SchoolSettings';

const MODELS: [string, mongoose.Model<any>][] = [
  ['users', User],
  ['roles', Role],
  ['academicsessions', AcademicSession],
  ['classes', Class],
  ['sections', Section],
  ['subjects', Subject],
  ['students', Student],
  ['teachers', Teacher],
  ['studenthistories', StudentHistory],
  ['gradescales', GradeScale],
  ['studentattendances', StudentAttendance],
  ['teacherattendances', TeacherAttendance],
  ['timetables', Timetable],
  ['exams', Exam],
  ['marks', Mark],
  ['feestructures', FeeStructure],
  ['studentfees', StudentFee],
  ['payments', Payment],
  ['incomes', Income],
  ['expenses', Expense],
  ['salaryrecords', SalaryRecord],
  ['auditlogs', AuditLog],
  ['notifications', Notification],
  ['notices', Notice],
  ['assignments', Assignment],
  ['submissions', Submission],
  ['leaverequests', LeaveRequest],
  ['schoolsettings', SchoolSettings],
];

function indexKey(keys: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(keys).sort());
}

interface Issue {
  collection: string;
  kind: 'duplicate_schema' | 'orphaned_db' | 'missing';
  detail: string;
}

async function main(): Promise<void> {
  const sync = process.argv.includes('--sync');
  await connectDatabase();

  const issues: Issue[] = [];

  for (const [collectionName, model] of MODELS) {
    const schemaIndexes = model.schema.indexes() as [Record<string, unknown>, { unique?: boolean; name?: string }?][];
    const declared = new Map<string, { keys: Record<string, unknown>; options?: { unique?: boolean; name?: string } }>();
    const duplicateKeys = new Set<string>();
    for (const [keys, options] of schemaIndexes) {
      const key = indexKey(keys);
      if (declared.has(key)) duplicateKeys.add(key);
      declared.set(key, { keys, options });
    }
    for (const key of duplicateKeys) {
      issues.push({ collection: collectionName, kind: 'duplicate_schema', detail: key });
    }

    let dbIndexes: any[] = [];
    try {
      dbIndexes = await model.collection.indexes();
    } catch {
      // Collection does not exist yet — nothing to compare.
      continue;
    }
    const dbKeys = new Set<string>();
    for (const idx of dbIndexes) {
      if (idx.name === '_id_') continue;
      dbKeys.add(indexKey(idx.key));
    }

    // Orphaned DB indexes (not declared in the schema).
    for (const idx of dbIndexes) {
      if (idx.name === '_id_') continue;
      const key = indexKey(idx.key);
      if (!declared.has(key)) {
        issues.push({ collection: collectionName, kind: 'orphaned_db', detail: `${idx.name} (${key})` });
      }
    }

    // Declared indexes missing from the DB.
    for (const [key, decl] of declared) {
      if (!dbKeys.has(key)) {
        issues.push({ collection: collectionName, kind: 'missing', detail: `${key} unique=${Boolean(decl.options?.unique)}` });
      }
    }
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  Index Audit — schemas vs MongoDB');
  console.log('══════════════════════════════════════════════════════════');
  if (issues.length === 0) {
    console.log('  ✓ No duplicate schema indexes, no orphaned DB indexes, nothing missing.');
  } else {
    for (const i of issues) {
      const tag = i.kind === 'duplicate_schema' ? 'DUPLICATE' : i.kind === 'orphaned_db' ? 'ORPHANED' : 'MISSING';
      console.log(`  [${tag.padEnd(9)}] ${i.collection} — ${i.detail}`);
    }
  }
  console.log('══════════════════════════════════════════════════════════\n');

  if (sync) {
    console.log('  Syncing indexes (syncIndexes drops indexes that are not in the schemas)…');
    for (const [, model] of MODELS) {
      try {
        await model.syncIndexes();
        console.log(`    ✓ ${model.collection.name}`);
      } catch (err) {
        console.error(`    ✗ ${model.collection.name}: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log('  Sync complete.\n');
  } else if (issues.some((i) => i.kind === 'orphaned_db' || i.kind === 'duplicate_schema')) {
    console.log('  Run `npm run indexes:sync` to drop orphaned/duplicate indexes.\n');
  }

  await disconnectDatabase();
  if (!sync && issues.some((i) => i.kind === 'duplicate_schema')) {
    process.exit(2);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('indexes:audit failed', err);
    process.exit(1);
  });
