import express, { Express } from 'express';
import path from 'path';
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

  // ── CORS (MUST be first, before helmet or any other middleware) ──
  const allowedOrigins = [
    'https://schoolsghar.site',
    'https://www.schoolsghar.site',
    'http://localhost:5173',
    'http://localhost:3000',
    ...(env.frontendUrl || '').split(',').map((o) => o.trim()).filter(Boolean)
  ];
  
  const corsOptions: cors.CorsOptions = {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
      // Automatically allow any Vercel preview domain or custom domain
      if (origin.endsWith('.vercel.app') || origin.endsWith('.schoolsghar.site')) return callback(null, true);
      if (env.nodeEnv !== 'production' && /localhost|127\.0\.0\.1|e2b\.app/i.test(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-tenant-id', 'Idempotency-Key'],
  };
  app.use(cors(corsOptions));

  // Explicit preflight handler — respond immediately to OPTIONS
  app.options('*', cors(corsOptions));

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

  // Serve public logos (use /tmp on serverless)
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const logosDir = isServerless
    ? path.join(require('os').tmpdir(), 'uploads', 'logos')
    : path.join(process.cwd(), 'uploads', 'logos');
  app.use('/uploads/logos', express.static(logosDir, {
    maxAge: '1d',
    fallthrough: true,
  }));
  
  // Private files are served via authorized tenant-scoped endpoint: /api/files/proofs/:key

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
