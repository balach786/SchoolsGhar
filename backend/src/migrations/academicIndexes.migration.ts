import mongoose from 'mongoose';
import { Class, normalizeName } from '../models/Class';
import { Section, normalizeSectionName } from '../models/Section';
import { Subject, normalizeSubjectCode } from '../models/Subject';

export interface MigrationResult {
  success: boolean;
  preflightDuplicatesFound: boolean;
  conflicts?: {
    classes: Array<{ key: string; duplicates: Array<{ _id: string; name: string }> }>;
    sections: Array<{ key: string; duplicates: Array<{ _id: string; name: string }> }>;
    subjects: Array<{ key: string; duplicates: Array<{ _id: string; code: string }> }>;
  };
  backfillCounts?: {
    classesUpdated: number;
    sectionsUpdated: number;
    subjectsUpdated: number;
    legacyArchivedFixed: number;
  };
  indexesCreated?: string[];
  existingIndexes?: string[];
  message: string;
}

export async function runAcademicIndexesMigration(): Promise<MigrationResult> {
  // =========================================================================
  // STEP 1: NON-MUTATING PREFLIGHT DUPLICATE DETECTION
  // =========================================================================
  // 1.1 Class duplicate analysis using source fields
  const activeClasses = await Class.find({
    $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
  })
    .select('_id tenantId sessionId name')
    .lean();

  const classMap = new Map<string, Array<{ _id: string; name: string }>>();
  for (const c of activeClasses) {
    const key = `${String(c.tenantId)}_${String(c.sessionId)}_${normalizeName(c.name)}`;
    const list = classMap.get(key) || [];
    list.push({ _id: String(c._id), name: c.name });
    classMap.set(key, list);
  }
  const classConflicts = Array.from(classMap.entries())
    .filter(([_, docs]) => docs.length > 1)
    .map(([key, docs]) => ({ key, duplicates: docs }));

  // 1.2 Section duplicate analysis using source fields
  const activeSections = await Section.find({
    $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
  })
    .select('_id tenantId classId name')
    .lean();

  const sectionMap = new Map<string, Array<{ _id: string; name: string }>>();
  for (const s of activeSections) {
    const key = `${String(s.tenantId)}_${String(s.classId)}_${normalizeSectionName(s.name)}`;
    const list = sectionMap.get(key) || [];
    list.push({ _id: String(s._id), name: s.name });
    sectionMap.set(key, list);
  }
  const sectionConflicts = Array.from(sectionMap.entries())
    .filter(([_, docs]) => docs.length > 1)
    .map(([key, docs]) => ({ key, duplicates: docs }));

  // 1.3 Subject duplicate analysis using source fields
  const activeSubjects = await Subject.find({
    $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
  })
    .select('_id tenantId sessionId code')
    .lean();

  const subjectMap = new Map<string, Array<{ _id: string; code: string }>>();
  for (const sb of activeSubjects) {
    const key = `${String(sb.tenantId)}_${String(sb.sessionId)}_${normalizeSubjectCode(sb.code)}`;
    const list = subjectMap.get(key) || [];
    list.push({ _id: String(sb._id), code: sb.code });
    subjectMap.set(key, list);
  }
  const subjectConflicts = Array.from(subjectMap.entries())
    .filter(([_, docs]) => docs.length > 1)
    .map(([key, docs]) => ({ key, duplicates: docs }));

  const hasConflicts =
    classConflicts.length > 0 || sectionConflicts.length > 0 || subjectConflicts.length > 0;

  if (hasConflicts) {
    return {
      success: false,
      preflightDuplicatesFound: true,
      conflicts: {
        classes: classConflicts,
        sections: sectionConflicts,
        subjects: subjectConflicts,
      },
      message:
        'Migration ABORTED safely: Existing duplicate conflicts detected in source data. No mutations performed.',
    };
  }

  // =========================================================================
  // STEP 2: LEGACY FIELD INTEGRITY (isArchived normalization)
  // =========================================================================
  const legacyClassRes = await Class.updateMany(
    { isArchived: { $exists: false } },
    { $set: { isArchived: false } }
  );
  const legacySecRes = await Section.updateMany(
    { isArchived: { $exists: false } },
    { $set: { isArchived: false } }
  );
  const legacySubRes = await Subject.updateMany(
    { isArchived: { $exists: false } },
    { $set: { isArchived: false } }
  );
  const legacyArchivedFixed =
    legacyClassRes.modifiedCount + legacySecRes.modifiedCount + legacySubRes.modifiedCount;

  // =========================================================================
  // STEP 3: BACKFILL NORMALIZED FIELDS
  // =========================================================================
  // 3.1 Class normalizedName
  const classesToUpdate = await Class.find({
    $or: [{ normalizedName: { $exists: false } }, { normalizedName: null }],
  }).select('_id name');
  let classesUpdated = 0;
  for (const c of classesToUpdate) {
    const norm = normalizeName(c.name);
    await Class.updateOne({ _id: c._id }, { $set: { normalizedName: norm } });
    classesUpdated++;
  }

  // 3.2 Section normalizedName
  const sectionsToUpdate = await Section.find({
    $or: [{ normalizedName: { $exists: false } }, { normalizedName: null }],
  }).select('_id name');
  let sectionsUpdated = 0;
  for (const s of sectionsToUpdate) {
    const norm = normalizeSectionName(s.name);
    await Section.updateOne({ _id: s._id }, { $set: { normalizedName: norm } });
    sectionsUpdated++;
  }

  // 3.3 Subject code canonicalization
  const subjectsToUpdate = await Subject.find({}).select('_id code');
  let subjectsUpdated = 0;
  for (const sb of subjectsToUpdate) {
    const canonical = normalizeSubjectCode(sb.code);
    if (sb.code !== canonical) {
      await Subject.updateOne({ _id: sb._id }, { $set: { code: canonical } });
      subjectsUpdated++;
    }
  }

  // =========================================================================
  // STEP 4: CREATE IDEMPOTENT PARTIAL UNIQUE INDEXES
  // =========================================================================
  const classIndexes = await Class.collection.indexes();
  const sectionIndexes = await Section.collection.indexes();
  const subjectIndexes = await Subject.collection.indexes();

  const classIdxName = 'idx_class_tenant_session_normname_unique';
  const sectionIdxName = 'idx_section_tenant_class_normname_unique';
  const subjectIdxName = 'idx_subject_tenant_session_code_unique';

  const indexesCreated: string[] = [];
  const existingIndexes: string[] = [];

  // Class partial unique index
  if (!classIndexes.some((idx) => idx.name === classIdxName)) {
    await Class.collection.createIndex(
      { tenantId: 1, sessionId: 1, normalizedName: 1 },
      {
        name: classIdxName,
        unique: true,
        partialFilterExpression: { isArchived: false },
      }
    );
    indexesCreated.push(classIdxName);
  } else {
    existingIndexes.push(classIdxName);
  }

  // Section partial unique index
  if (!sectionIndexes.some((idx) => idx.name === sectionIdxName)) {
    await Section.collection.createIndex(
      { tenantId: 1, classId: 1, normalizedName: 1 },
      {
        name: sectionIdxName,
        unique: true,
        partialFilterExpression: { isArchived: false },
      }
    );
    indexesCreated.push(sectionIdxName);
  } else {
    existingIndexes.push(sectionIdxName);
  }

  // Subject code partial unique index
  if (!subjectIndexes.some((idx) => idx.name === subjectIdxName)) {
    await Subject.collection.createIndex(
      { tenantId: 1, sessionId: 1, code: 1 },
      {
        name: subjectIdxName,
        unique: true,
        partialFilterExpression: { isArchived: false },
      }
    );
    indexesCreated.push(subjectIdxName);
  } else {
    existingIndexes.push(subjectIdxName);
  }

  return {
    success: true,
    preflightDuplicatesFound: false,
    backfillCounts: {
      classesUpdated,
      sectionsUpdated,
      subjectsUpdated,
      legacyArchivedFixed,
    },
    indexesCreated,
    existingIndexes,
    message: 'Academic unique indexes migration executed successfully.',
  };
}

// Allow running directly via CLI
if (require.main === module) {
  const dotenv = require('dotenv');
  const path = require('path');
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';

  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log('Running Academic Indexes Migration...');
      const result = await runAcademicIndexesMigration();
      console.log('Migration Result:\n', JSON.stringify(result, null, 2));
      await mongoose.disconnect();
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Migration failed with error:', err);
      process.exit(1);
    });
}
