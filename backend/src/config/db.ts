import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

// Survive serverless warm invocations: if the Node.js process is reused,
// mongoose.connection is already open — no need to call connect() again.
declare global {
  // eslint-disable-next-line no-var
  var _mongoosePromise: Promise<typeof mongoose> | null | undefined;
}

let cachedPromise: Promise<typeof mongoose> | null = global._mongoosePromise || null;

/**
 * Single, reusable Mongoose connection.
 * Created once at server startup — never per-request.
 * On serverless (Vercel), the global flag prevents redundant reconnects
 * when the same function instance handles multiple requests (warm start).
 */
export async function connectDatabase() {
  // Fast-path: already connected
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // If not connected and not connecting, reset the promise to force a new connection
  if (mongoose.connection.readyState !== 2) {
    cachedPromise = null;
    global._mongoosePromise = null;
  }

  mongoose.set('strictQuery', true);
  mongoose.set('bufferCommands', false); // Disable buffering globally so queries fail fast

  if (!cachedPromise) {
    // TRANSITION COMPATIBILITY: We cannot make schoolsghar_master the primary connection yet 
    // because unconverted operational models (Phase 4) still rely on the default connection.
    // We will connect to the legacy MONGODB_URI to preserve all operational API behavior.
    cachedPromise = mongoose.connect(env.mongodbUri, {
      maxPoolSize: 50,         // Increased to 50 so concurrent Promise.all aggregations execute instantly
      minPoolSize: 0,          // Don't hold idle connections between invocations
      maxIdleTimeMS: 10000,    // CRITICAL FOR SERVERLESS: Close connections idle for >10s to prevent half-open socket hangs on thaw
      serverSelectionTimeoutMS: 5000, // Reduced to fail fast on cold starts if DB is unreachable
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      bufferCommands: false, // Prevents queries hanging indefinitely if connection fails
    });
    global._mongoosePromise = cachedPromise;
    
    // Only bind event listeners once when the promise is first created
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected');
    });
    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err.message}`);
    });
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
  }

  try {
    await cachedPromise;
  } catch (err) {
    cachedPromise = null;
    global._mongoosePromise = null;
    throw err;
  }

  return mongoose.connection;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function databaseStatus(): 'connected' | 'disconnected' {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}
