import crypto from 'crypto';

/** Cryptographically secure random token (e.g. refresh session ids). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Short readable id suffix, e.g. for receipt numbers. */
export function randomDigits(length = 4): string {
  const n = crypto.randomInt(0, Math.pow(10, length));
  return n.toString().padStart(length, '0');
}

/**
 * Build a unique receipt number like RCP-20260904-7F3A21.
 * Uniqueness is still enforced at the DB level (unique index).
 */
export function generateReceiptNumber(prefix = 'RCP'): string {
  const d = new Date();
  const ymd = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${ymd}-${rand}`;
}

/** Generate admission numbers like ADM-2026-0042. Default to 4 digits padding matching school convention. */
export function generateAdmissionNumber(year: number, seq: number, minPadding = 4): string {
  return `ADM-${year}-${String(seq).padStart(minPadding, '0')}`;
}
