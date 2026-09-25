import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ok, fail } from '../utils/apiResponse';
import { env } from '../config/env';

let isShuttingDown = false;

export function markServerShuttingDown(): void {
  isShuttingDown = true;
}

export function resetShutdownStateForTesting(): void {
  isShuttingDown = false;
}

export function isServerShuttingDown(): boolean {
  return isShuttingDown;
}

/**
 * GET /api/health
 * Backward-compatible combined liveness + readiness check.
 */
export function healthCheck(_req: Request, res: Response): void {
  const dbConnected = mongoose.connection.readyState === 1;
  const status = dbConnected ? 'connected' : 'disconnected';
  const healthy = dbConnected && !isShuttingDown;

  if (healthy) {
    ok(res, {
      server: 'healthy',
      database: 'connected',
      uptime: Math.round(process.uptime()),
      environment: env.nodeEnv,
      timestamp: new Date().toISOString(),
    });
  } else {
    fail(res, 503, 'SERVICE_UNAVAILABLE', 'Service unavailable', {
      server: isShuttingDown ? 'shutting_down' : 'healthy',
      database: status,
    });
  }
}

/**
 * GET /api/health/liveness
 * Checks process viability (returns 200 as long as Node process is alive).
 */
export function livenessCheck(_req: Request, res: Response): void {
  ok(res, {
    status: 'alive',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/health/readiness
 * Checks if application can serve incoming traffic.
 * Becomes 503 if MongoDB is disconnected or if the server has entered shutdown.
 */
export function readinessCheck(_req: Request, res: Response): void {
  const dbConnected = mongoose.connection.readyState === 1;
  const isReady = dbConnected && !isShuttingDown;

  if (isReady) {
    ok(res, {
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } else {
    fail(res, 503, 'NOT_READY', 'Service not ready to accept traffic', {
      server: isShuttingDown ? 'shutting_down' : 'ready',
      database: dbConnected ? 'connected' : 'disconnected',
    });
  }
}
