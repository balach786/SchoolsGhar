import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Single, reusable Mongoose connection.
 * Created once at server startup — never per-request.
 */
export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected');
  });
  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB connection error: ${err.message}`);
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  // TRANSITION COMPATIBILITY: We cannot make schoolsghar_master the primary connection yet 
  // because unconverted operational models (Phase 4) still rely on the default connection.
  // We will connect to the legacy MONGODB_URI to preserve all operational API behavior.
  await mongoose.connect(env.mongodbUri, {
    // 512 MB storage budget → keep internal overheads lean
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function databaseStatus(): 'connected' | 'disconnected' {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}
