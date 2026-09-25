import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthUser } from '../types';

const SALT_ROUNDS = 10;

/** Hash a plain password with bcrypt. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Compare a plain password against a bcrypt hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface AccessTokenPayload {
  sub: string; // user id
  role: string; // role slug
  roleId: string; // role ObjectId
  email: string;
  name: string;
  tenantId?: string;
  isPlatformAdmin?: boolean;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string; // user id
  type: 'refresh';
  sid: string; // session id (opaque random)
  tenantId?: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.accessTokenExpiresIn,
  } as SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: env.refreshTokenExpiresIn,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.jwtRefreshSecret) as RefreshTokenPayload;
}

/** SHA-256 hash of a refresh token — only hashes are stored, never tokens. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Milliseconds until the refresh token's expiry (for session records). */
export function refreshTokenTtlMs(token: string): number {
  const payload = verifyRefreshToken(token);
  const exp = (payload as unknown as { exp?: number }).exp ?? 0;
  return Math.max(0, exp * 1000 - Date.now());
}

export function toAuthUser(u: {
  _id: unknown;
  role: string;
  roleId: unknown;
  email: string;
  name: string;
  tenantId?: unknown;
  isPlatformAdmin?: boolean;
}): AuthUser {
  return {
    _id: String(u._id),
    role: u.role,
    roleId: String(u.roleId),
    email: u.email,
    name: u.name,
    tenantId: u.tenantId ? String(u.tenantId) : undefined,
    isPlatformAdmin: Boolean(u.isPlatformAdmin),
  };
}
