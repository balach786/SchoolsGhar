import mongoose, { Connection } from 'mongoose';
import { ApiError } from '../utils/ApiError';

/**
 * Manages dynamically switching between tenant databases
 * using the primary Mongoose Atlas connection pool.
 */
export function getTenantConnection(databaseName: string): Connection {
  if (!databaseName || typeof databaseName !== 'string' || databaseName.trim() === '') {
    throw new ApiError(500, 'Invalid database name requested for tenant connection', 'INTERNAL_ERROR');
  }

  // useDb caches connections automatically when useCache: true is set
  // This reuses the primary Mongoose Atlas pool established in config/db.ts
  return mongoose.connection.useDb(databaseName, { useCache: true });
}
