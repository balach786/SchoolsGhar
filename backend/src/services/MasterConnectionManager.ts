import mongoose, { Connection } from 'mongoose';

/**
 * Returns the explicit Master DB connection for Phase 3 platform data.
 * The primary mongoose connection established in db.ts is used.
 */
export function getMasterConnection(): Connection {
  return mongoose.connection.useDb('schoolsghar_master', { useCache: true });
}
