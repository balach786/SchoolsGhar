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

  // If currently reconnecting (readyState === 2), wait for it to finish
  if (mongoose.connection.readyState === 2) {
    await new Promise<void>((resolve) => {
      mongoose.connection.once('connected', () => resolve());
      // Also resolve on error so we don't hang forever, the subsequent query will fail appropriately
      mongoose.connection.once('error', () => resolve()); 
    });
    return mongoose.connection;
  }

  // If disconnected, reset the promise to force a new connection
  cachedPromise = null;
  global._mongoosePromise = null;

  mongoose.set('strictQuery', true);
  // Disable buffering globally (though schemas may have already compiled with it, this helps dynamic models)
  mongoose.set('bufferCommands', false); 

  // Create new connection promise
  cachedPromise = mongoose.connect(env.mongodbUri, {
    maxPoolSize: 5,          // Reduced from 10: serverless reuses fewer concurrent sockets
    minPoolSize: 0,          // Don't hold idle connections between invocations
    maxIdleTimeMS: 10000,    // Close connections after 10s of idle time to prevent silent drops by NAT gateways
    serverSelectionTimeoutMS: 5000, // Reduced to fail fast on cold starts if DB is unreachable
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    bufferCommands: false, // Prevents queries hanging indefinitely if connection fails
  });
  global._mongoosePromise = cachedPromise;
  
  // Only bind event listeners once when the promise is first created
  mongoose.connection.removeAllListeners('connected');
  mongoose.connection.removeAllListeners('error');
  mongoose.connection.removeAllListeners('disconnected');

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected');
  });
  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB connection error: ${err.message}`);
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  try {
    await cachedPromise;
    return mongoose.connection;
  } catch (err) {
    cachedPromise = null;
    global._mongoosePromise = null;
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function databaseStatus(): 'connected' | 'disconnected' {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}
