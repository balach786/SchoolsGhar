import dotenv from 'dotenv';
import path from 'path';

// Load .env from the backend directory (works both from project root and backend cwd)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface Env {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  mongodbUri: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresIn: string;
  frontendUrl: string;
  /** Auth (login/refresh) rate limiting — brute-force protection. */
  authRateLimitMax: number;
  authRateLimitWindowMs: number;
  /** Global API rate limiting. */
  apiRateLimitMax: number;
  apiRateLimitWindowMs: number;
  /** SaaS Platform Admin bootstrap & trial settings */
  platformAdminEmail: string;
  platformAdminInitialPassword: string;
  trialDays: number;
  paymentProofMaxSize: number;
  uploadDir: string;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const authMax = Number(process.env.AUTH_RATE_LIMIT_MAX);
const authWindow = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS);
const apiMax = Number(process.env.API_RATE_LIMIT_MAX);
const apiWindow = Number(process.env.API_RATE_LIMIT_WINDOW_MS);
const trialDays = Number(process.env.TRIAL_DAYS) || 7;
const paymentProofMaxSize = Number(process.env.PAYMENT_PROOF_MAX_SIZE) || 5 * 1024 * 1024;

export const env: Env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: (process.env.NODE_ENV as Env['nodeEnv']) || 'development',
  mongodbUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/school_management'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  authRateLimitMax: Number.isFinite(authMax) && authMax > 0 ? authMax : 30,
  authRateLimitWindowMs: Number.isFinite(authWindow) && authWindow > 0 ? authWindow : 15 * 60 * 1000,
  apiRateLimitMax: Number.isFinite(apiMax) && apiMax > 0 ? apiMax : 240,
  apiRateLimitWindowMs: Number.isFinite(apiWindow) && apiWindow > 0 ? apiWindow : 60 * 1000,
  platformAdminEmail: process.env.PLATFORM_ADMIN_EMAIL || 'platformadmin@saas.school',
  platformAdminInitialPassword: process.env.PLATFORM_ADMIN_INITIAL_PASSWORD || 'PlatformAdmin2026!',
  trialDays,
  paymentProofMaxSize,
  uploadDir: process.env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads'),
};

export const isProd = env.nodeEnv === 'production';

// Step 4D.15: Production Security & Secret Entropy Validation
if (isProd) {
  if (env.jwtAccessSecret === env.jwtRefreshSecret) {
    throw new Error('FATAL_SECURITY_CONFIG: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not be identical in production.');
  }
  if (env.jwtAccessSecret.length < 32 || env.jwtRefreshSecret.length < 32) {
    throw new Error('FATAL_SECURITY_CONFIG: JWT secrets must be at least 32 characters long in production.');
  }
  if (env.jwtAccessSecret.includes('dev') || env.jwtRefreshSecret.includes('dev')) {
    throw new Error('FATAL_SECURITY_CONFIG: Development JWT secrets are forbidden in production.');
  }
  if (env.platformAdminInitialPassword === 'PlatformAdmin2026!') {
    throw new Error('FATAL_SECURITY_CONFIG: Default PLATFORM_ADMIN_INITIAL_PASSWORD must be changed in production.');
  }
}
