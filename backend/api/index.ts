import { createApp } from '../src/app';
import { connectDatabase } from '../src/config/db';

let isConnected = false;
const app = createApp();

export default async function handler(req: any, res: any) {
  if (!isConnected) {
    await connectDatabase();
    isConnected = true;
  }
  return app(req, res);
}
