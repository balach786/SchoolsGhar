import { createApp } from '../src/app';
import { connectDatabase } from '../src/config/db';

const app = createApp();

export default async function handler(req: any, res: any) {
  // 1. Respond to preflight (OPTIONS) immediately without waiting for DB.
  // This prevents CORS errors from masking underlying connection timeouts.
  if (req.method === 'OPTIONS') {
    return app(req, res);
  }

  // 2. Safely connect to the database.
  try {
    await connectDatabase();
  } catch (err) {
    console.error('CRITICAL: Database connection failed during serverless invocation:', err);
    // Let the Express app handle the failure gracefully (it will hit the DB operation 
    // and correctly return a 500 error WITH proper CORS headers, because bufferCommands=false).
  }

  return app(req, res);
}
