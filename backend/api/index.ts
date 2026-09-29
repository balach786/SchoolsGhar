import { createApp } from '../src/app';
import { connectDatabase } from '../src/config/db';

const app = createApp();

export default async function handler(req: any, res: any) {
  // connectDatabase handles fast-paths and reconnects safely.
  // It must be called on every serverless invocation to ensure 
  // the DB is ready before express handles the request.
  await connectDatabase();
  return app(req, res);
}
