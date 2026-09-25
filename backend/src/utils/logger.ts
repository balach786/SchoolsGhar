import { AsyncLocalStorage } from 'async_hooks';

/**
 * Lightweight production-safe structured logger with correlation IDs.
 * Never logs passwords, tokens, JWTs, keys, or raw secrets.
 */
type Level = 'info' | 'warn' | 'error' | 'debug';

export interface RequestContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  method?: string;
  path?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

// Sensitive keys to sanitize from log metadata
const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'tokenhash',
  'authorization',
  'jwtaccesssecret',
  'jwtrefreshsecret',
  'backupencryptionkey',
  'secret',
  'key',
]);

function sanitizeMeta(meta: any): any {
  if (!meta || typeof meta !== 'object') return meta;
  if (meta instanceof Error) {
    return {
      message: meta.message,
      name: meta.name,
      stack: process.env.NODE_ENV === 'production' ? undefined : meta.stack,
    };
  }
  if (Array.isArray(meta)) {
    return meta.map(sanitizeMeta);
  }

  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (REDACTED_KEYS.has(k.toLowerCase())) {
      clean[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitizeMeta(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

function log(level: Level, message: string, meta?: unknown): void {
  const ctx = requestContext.getStore();
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    const payload: Record<string, any> = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...(ctx ? ctx : {}),
    };
    if (meta !== undefined) {
      payload.meta = sanitizeMeta(meta);
    }
    const out = JSON.stringify(payload);
    if (level === 'error') console.error(out);
    else if (level === 'warn') console.warn(out);
    else console.log(out);
  } else {
    // Development human-readable formatting
    const prefix = ctx?.requestId ? `[${ctx.requestId}] ` : '';
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${prefix}${message}`;
    const cleanMeta = meta !== undefined ? sanitizeMeta(meta) : '';
    if (level === 'error') console.error(line, cleanMeta);
    else if (level === 'warn') console.warn(line, cleanMeta);
    else console.log(line, cleanMeta);
  }
}

export const logger = {
  info: (m: string, meta?: unknown) => log('info', m, meta),
  warn: (m: string, meta?: unknown) => log('warn', m, meta),
  error: (m: string, meta?: unknown) => log('error', m, meta),
  debug: (m: string, meta?: unknown) => {
    if (process.env.NODE_ENV === 'development') log('debug', m, meta);
  },
};
