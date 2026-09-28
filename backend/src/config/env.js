"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProd = exports.env = void 0;
var dotenv_1 = __importDefault(require("dotenv"));
var path_1 = __importDefault(require("path"));
// Load .env from the backend directory (works both from project root and backend cwd)
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
function required(name, fallback) {
    var _a;
    var value = (_a = process.env[name]) !== null && _a !== void 0 ? _a : fallback;
    if (!value) {
        throw new Error("Missing required environment variable: ".concat(name));
    }
    return value;
}
var authMax = Number(process.env.AUTH_RATE_LIMIT_MAX);
var authWindow = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS);
var apiMax = Number(process.env.API_RATE_LIMIT_MAX);
var apiWindow = Number(process.env.API_RATE_LIMIT_WINDOW_MS);
var trialDays = Number(process.env.TRIAL_DAYS) || 7;
var paymentProofMaxSize = Number(process.env.PAYMENT_PROOF_MAX_SIZE) || 5 * 1024 * 1024;
exports.env = {
    port: Number((_a = process.env.PORT) !== null && _a !== void 0 ? _a : 4000),
    nodeEnv: process.env.NODE_ENV || 'development',
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
    trialDays: trialDays,
    paymentProofMaxSize: paymentProofMaxSize,
    uploadDir: process.env.UPLOAD_DIR || path_1.default.resolve(__dirname, '../../uploads'),
};
exports.isProd = exports.env.nodeEnv === 'production';
// Step 4D.15: Production Security & Secret Entropy Validation
if (exports.isProd) {
    if (exports.env.jwtAccessSecret === exports.env.jwtRefreshSecret) {
        throw new Error('FATAL_SECURITY_CONFIG: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not be identical in production.');
    }
    if (exports.env.jwtAccessSecret.length < 32 || exports.env.jwtRefreshSecret.length < 32) {
        throw new Error('FATAL_SECURITY_CONFIG: JWT secrets must be at least 32 characters long in production.');
    }
    if (exports.env.jwtAccessSecret.includes('dev') || exports.env.jwtRefreshSecret.includes('dev')) {
        throw new Error('FATAL_SECURITY_CONFIG: Development JWT secrets are forbidden in production.');
    }
    if (exports.env.platformAdminInitialPassword === 'PlatformAdmin2026!') {
        throw new Error('FATAL_SECURITY_CONFIG: Default PLATFORM_ADMIN_INITIAL_PASSWORD must be changed in production.');
    }
}
