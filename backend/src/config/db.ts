import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

// Survive serverless warm invocations: if the Node.js process is reused,
// mongoose.connection is already open — no need to call connect() again.
declare global {
  // eslint-disable-next-line no-var
  var _mongooseConnected: boolean | undefined;
}

/**
 * Single, reusable Mongoose connection.
 * Created once at server startup — never per-request.
 * On serverless (Vercel), the global flag prevents redundant reconnects
 * when the same function instance handles multiple requests (warm start).
 */
export async function connectDatabase(): Promise<void> {
  // Fast-path: already connected in this process (warm serverless invocation)
  if (global._mongooseConnected && mongoose.connection.readyState === 1) {
    return;
  }

  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected');
    global._mongooseConnected = true;
  });
  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB connection error: ${err.message}`);
    global._mongooseConnected = false;
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
    global._mongooseConnected = false;
  });

  // TRANSITION COMPATIBILITY: We cannot make schoolsghar_master the primary connection yet 
  // because unconverted operational models (Phase 4) still rely on the default connection.
  // We will connect to the legacy MONGODB_URI to preserve all operational API behavior.
  await mongoose.connect(env.mongodbUri, {
    maxPoolSize: 5,          // Reduced from 10: serverless reuses fewer concurrent sockets
    minPoolSize: 0,          // Don't hold idle connections between invocations
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
