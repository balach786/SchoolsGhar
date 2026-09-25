import mongoose from 'mongoose';
import crypto from 'crypto';
import { ApiError } from '../utils/ApiError';
import { FinancialIdempotency } from '../models/FinancialIdempotency';

/**
 * Deterministic hash of canonical business payload for idempotency.
 * Excludes timestamp / noise keys.
 */
export function hashPayload(payload: Record<string, any>): string {
  const clean: Record<string, any> = {};
  const sortedKeys = Object.keys(payload).sort();
  for (const k of sortedKeys) {
    if (['timestamp', 'createdAt', 'clientTimestamp', 'requestId'].includes(k)) continue;
    clean[k] = payload[k];
  }
  return crypto.createHash('sha256').update(JSON.stringify(clean)).digest('hex');
}

export interface IdempotencyLockResult {
  isCached: boolean;
  cachedResponse?: {
    status: number;
    body: Record<string, any>;
  };
  recordKey?: string;
  ownerToken?: string;
  stopHeartbeat?: () => void;
}

/**
 * Start heartbeat for active idempotency lock to prevent false stale reclaim while request is alive.
 */
function createHeartbeat(recordKey: string, ownerToken: string): () => void {
  const timer = setInterval(async () => {
    try {
      await FinancialIdempotency.updateOne(
        { _id: recordKey, ownerToken, status: 'in_progress' },
        { $set: { heartbeatAt: new Date() } }
      );
    } catch {}
  }, 3000);
  if (timer.unref) timer.unref();

  return () => {
    clearInterval(timer);
  };
}

/**
 * Acquire idempotency lock or return cached response.
 * Throws 409 if in progress or if key reused with different payload.
 */
export async function acquireIdempotency(
  tenantId: string | mongoose.Types.ObjectId,
  operation: string,
  idempotencyKey: string | undefined,
  payload: Record<string, any>,
  session?: mongoose.ClientSession,
  retentionDays = 7,
  staleTimeoutMs = 30000
): Promise<IdempotencyLockResult> {
  if (!idempotencyKey || !idempotencyKey.trim()) {
    return { isCached: false };
  }

  const cleanKey = idempotencyKey.trim();
  const tId = new mongoose.Types.ObjectId(String(tenantId));
  const recordKey = `${tId}:${operation}:${cleanKey}`;
  const requestHash = hashPayload(payload);
  const ownerToken = crypto.randomUUID();

  const existing = await FinancialIdempotency.findById(recordKey).session(session || null);
  if (existing) {
    if (existing.status === 'completed') {
      if (existing.requestHash !== requestHash) {
        throw ApiError.conflict(
          'Idempotency key has already been used with a different request payload',
          'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'
        );
      }
      return {
        isCached: true,
        cachedResponse: {
          status: existing.responseStatus || 200,
          body: existing.responseBody || {},
        },
      };
    }
    if (existing.status === 'in_progress') {
      const lastActive = existing.heartbeatAt || existing.createdAt;
      const inactiveMs = Date.now() - new Date(lastActive).getTime();

      // Only reclaim if strictly inactive (no heartbeat for longer than stale timeout) and same payload hash
      if (inactiveMs > staleTimeoutMs && existing.requestHash === requestHash) {
        const reclaimed = await FinancialIdempotency.findOneAndUpdate(
          { _id: recordKey, status: 'in_progress', ownerToken: existing.ownerToken },
          {
            $set: {
              ownerToken,
              heartbeatAt: new Date(),
              requestHash,
            },
          },
          { new: true }
        );

        if (reclaimed) {
          const stopHeartbeat = createHeartbeat(recordKey, ownerToken);
          return { isCached: false, recordKey, ownerToken, stopHeartbeat };
        }
      }

      throw ApiError.conflict(
        'A request with this idempotency key is currently in progress. Please retry shortly.',
        'REQUEST_IN_PROGRESS'
      );
    }
  }

  const expiresAt = new Date(Date.now() + retentionDays * 24 * 3600 * 1000);
  const lockDoc = new FinancialIdempotency({
    _id: recordKey,
    tenantId: tId,
    operation,
    idempotencyKey: cleanKey,
    requestHash,
    ownerToken,
    heartbeatAt: new Date(),
    status: 'in_progress',
    expiresAt,
  });

  try {
    await lockDoc.save({ session });
  } catch (err: any) {
    if (err.code === 11000 || err.message?.includes('E11000')) {
      throw ApiError.conflict(
        'A request with this idempotency key is currently in progress or was just committed.',
        'REQUEST_IN_PROGRESS'
      );
    }
    throw err;
  }

  const stopHeartbeat = createHeartbeat(recordKey, ownerToken);
  return { isCached: false, recordKey, ownerToken, stopHeartbeat };
}

/**
 * Release/clear in-progress idempotency lock on operation failure.
 * Does not remove completed idempotency records.
 * Protects lock ownership: Request A cannot accidentally delete Request B's lock.
 */
export async function releaseIdempotency(
  recordKey: string | undefined,
  ownerToken?: string
): Promise<void> {
  if (!recordKey) return;
  try {
    const filter: any = { _id: recordKey, status: 'in_progress' };
    if (ownerToken) filter.ownerToken = ownerToken;
    await FinancialIdempotency.deleteOne(filter);
  } catch {}
}

/**
 * Commit completed idempotency outcome inside the SAME MongoDB ClientSession transaction.
 * Ensures atomicity: financial mutations and idempotency completion commit together.
 */
export async function completeIdempotency(
  recordKey: string | undefined,
  resultRef: {
    paymentId?: string;
    examFeePaymentId?: string;
    salaryRecordId?: string;
    reversalId?: string;
    receiptNumber?: string;
  },
  responseStatus: number,
  responseBody: Record<string, any>,
  session?: mongoose.ClientSession,
  ownerToken?: string
): Promise<void> {
  if (!recordKey) return;
  const filter: any = { _id: recordKey, status: 'in_progress' };
  if (ownerToken) filter.ownerToken = ownerToken;

  const result = await FinancialIdempotency.updateOne(
    filter,
    {
      $set: {
        status: 'completed',
        resultRef,
        responseStatus,
        responseBody,
      },
    },
    { session }
  );

  if (result.matchedCount === 0) {
    const existing = await FinancialIdempotency.findById(recordKey).session(session || null);
    if (existing?.status === 'completed') {
      return;
    }
    throw ApiError.conflict('Idempotency lock ownership lost or expired', 'IDEMPOTENCY_LOCK_LOST');
  }
}
