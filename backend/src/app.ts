import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { env } from './config/env';
import { requestContext } from './utils/logger';

export function createApp(): Express {
  const app = express();

  // ── Security headers ────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // ── Request correlation & ID tracking (Step 4D.9) ────
  app.use((req, res, next) => {
    const headerReqId = req.headers['x-request-id'];
    const reqId = typeof headerReqId === 'string' && headerReqId.trim().length > 0
      ? headerReqId.trim()
      : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    res.setHeader('X-Request-Id', reqId);
    (req as any).id = reqId;

    requestContext.run({ requestId: reqId, method: req.method, path: req.path }, () => {
      next();
    });
  });

  // Step 4D.1: Unauthenticated public static /uploads mount removed.
  // Private files are served via authorized tenant-scoped endpoint: /api/files/proofs/:key

  // ── CORS (frontend URL from env) ─────────────────────
  const allowedOrigins = (env.frontendUrl || '').split(',').map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      origin(origin, callback) {
        // Allow exact matches or wildcard
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
        // Automatically allow any Vercel preview domain or custom domain for seamless testing
        if (origin.endsWith('.vercel.app') || origin.endsWith('.schoolsghar.site')) return callback(null, true);
        if (env.nodeEnv !== 'production' && /localhost|127\.0\.0\.1|e2b\.app/i.test(origin)) {
          return callback(null, true);
        }
        // Disallowed origin → no CORS headers (browser blocks the response).
        // Returning false keeps the request flowing without an error.
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // ── Parsing ─────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── Rate limiting (global + stricter auth limiter) ──
  app.set('trust proxy', 1);
  app.use(
    rateLimit({
      windowMs: env.apiRateLimitWindowMs,
      limit: env.apiRateLimitMax,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' } },
    })
  );

  // ── Request logging (skip in test) ──────────────────
  if (env.nodeEnv !== 'test') {
    app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  }

  // ── API routes ──────────────────────────────────────
  app.use('/api', routes);

  // ── 404 + centralized error handling ────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
