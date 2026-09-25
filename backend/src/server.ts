import { createApp } from './app';
import { connectDatabase } from './config/db';
import { env } from './config/env';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  const app = createApp();

  // Connect to MongoDB first — the API must never serve stale/absent data.
  await connectDatabase();

  const server = app.listen(env.port, '0.0.0.0', () => {
    logger.info(`API server listening on http://0.0.0.0:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — initiating graceful shutdown`);
    
    // 1. Mark readiness false so load balancers stop sending new requests
    const { markServerShuttingDown } = await import('./controllers/health.controller');
    markServerShuttingDown();

    // 2. Set hard deadline to prevent hung shutdown
    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timeout exceeded (10s) — forcing exit');
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    // 3. Stop accepting new HTTP connections and drain in-flight requests
    server.close(async (err) => {
      if (err) {
        logger.error('Error while closing HTTP server', err);
      } else {
        logger.info('HTTP server closed, active requests drained');
      }

      // 4. Safely close database connection after requests have drained
      try {
        const { disconnectDatabase } = await import('./config/db');
        await disconnectDatabase();
        logger.info('MongoDB connection closed gracefully');
      } catch (dbErr) {
        logger.error('Error disconnecting MongoDB', dbErr);
      }

      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exit(1);
});
