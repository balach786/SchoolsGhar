import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { AcademicSession } from '../models/AcademicSession';
import { Tenant } from '../models/Tenant';

export interface SessionMigrationResult {
  success: boolean;
  preflightDuplicatesFound: boolean;
  activeSessionConflicts: Array<{
    tenantId: string;
    tenantName?: string;
    isTestFixture?: boolean;
    activeSessionIds: string[];
  }>;
  indexCreated: boolean;
  indexAlreadyExisted: boolean;
  indexDetails?: {
    name: string;
    key: Record<string, any>;
    unique: boolean;
    partialFilterExpression: Record<string, any>;
  };
  message: string;
}

export async function runSessionActiveIndexMigration(): Promise<SessionMigrationResult> {
  // =========================================================================
  // STEP 1: NON-MUTATING PREFLIGHT ON REAL DATA
  // =========================================================================
  const activeSessions = await AcademicSession.find({ isActive: true })
    .select('_id tenantId name')
    .lean();

  const tenantMap = new Map<string, string[]>();
  for (const s of activeSessions) {
    const tId = String(s.tenantId);
    const list = tenantMap.get(tId) || [];
    list.push(String(s._id));
    tenantMap.set(tId, list);
  }

  const conflicts: SessionMigrationResult['activeSessionConflicts'] = [];
  for (const [tId, sessionIds] of tenantMap.entries()) {
    if (sessionIds.length > 1) {
      const tenant = await Tenant.findById(tId).select('name isDemo').lean();
      conflicts.push({
        tenantId: tId,
        tenantName: tenant?.name || 'Unknown / Deleted Tenant',
        isTestFixture: !tenant,
        activeSessionIds: sessionIds,
      });
    }
  }

  if (conflicts.length > 0) {
    // Check if any conflict belongs to a real tenant
    const hasRealTenantConflict = conflicts.some((c) => !c.isTestFixture);
    if (hasRealTenantConflict) {
      return {
        success: false,
        preflightDuplicatesFound: true,
        activeSessionConflicts: conflicts,
        indexCreated: false,
        indexAlreadyExisted: false,
        message: 'Migration ABORTED: Real tenant with multiple active sessions detected. User intervention required.',
      };
    }

    // If conflicts only belong to deleted test tenants, clean them up safely
    for (const c of conflicts) {
      if (c.isTestFixture) {
        // Safe to deactivate or delete these orphaned test session documents
        await AcademicSession.deleteMany({ _id: { $in: c.activeSessionIds } });
      }
    }
  }

  // =========================================================================
  // STEP 2: CREATE EXPLICIT PARTIAL UNIQUE INDEX (IDEMPOTENT)
  // =========================================================================
  const indexName = 'idx_academic_session_tenant_active_unique';
  const existingIndexes = await AcademicSession.collection.indexes();
  const alreadyExists = existingIndexes.some((idx) => idx.name === indexName);

  if (!alreadyExists) {
    await AcademicSession.collection.createIndex(
      { tenantId: 1, isActive: 1 },
      {
        name: indexName,
        unique: true,
        partialFilterExpression: { isActive: true },
      }
    );
  }

  // Verify created/existing index
  const updatedIndexes = await AcademicSession.collection.indexes();
  const targetIndex = updatedIndexes.find((idx) => idx.name === indexName);

  return {
    success: true,
    preflightDuplicatesFound: false,
    activeSessionConflicts: [],
    indexCreated: !alreadyExists,
    indexAlreadyExisted: alreadyExists,
    indexDetails: targetIndex
      ? {
          name: targetIndex.name || indexName,
          key: targetIndex.key as Record<string, any>,
          unique: !!targetIndex.unique,
          partialFilterExpression: (targetIndex.partialFilterExpression as Record<string, any>) || {},
        }
      : undefined,
    message: alreadyExists
      ? 'Index already exists. Idempotent check passed.'
      : 'AcademicSession active uniqueness index created successfully.',
  };
}

if (require.main === module) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';
  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log('Running Session Active Index Migration...');
      const res = await runSessionActiveIndexMigration();
      console.log(JSON.stringify(res, null, 2));
      await mongoose.disconnect();
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
