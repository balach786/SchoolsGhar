import { ApiError } from './ApiError';

export const SCHOOL_TIMEZONE = process.env.SCHOOL_TIMEZONE || 'Asia/Karachi';

/**
 * Convert local date components in SCHOOL_TIMEZONE to the exact UTC Date instant.
 */
export function schoolLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: SCHOOL_TIMEZONE,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(guess).map((p) => [p.type, parseInt(p.value, 10)])
    );
    if (parts.hour === 24) parts.hour = 0;
    const localAsUtc = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0)
    );
    const diff = guess.getTime() - localAsUtc.getTime();
    return new Date(guess.getTime() + diff);
  } catch {
    return guess;
  }
}

/**
 * Get current calendar date string (YYYY-MM-DD) in the school's local timezone.
 */
export function getSchoolTodayISO(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: SCHOOL_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Get current calendar month string (YYYY-MM) in the school's local timezone.
 */
export function getSchoolCurrentMonthISO(): string {
  return getSchoolTodayISO().slice(0, 7);
}

/**
 * Construct half-open boundary [startUtc, endExclusiveUtc] for a single school-local calendar day (YYYY-MM-DD).
 */
export function getSchoolDayRange(dateStr: string): { start: Date; endExclusive: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw ApiError.badRequest('Invalid date format (expected YYYY-MM-DD)', 'INVALID_DATE');
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = schoolLocalToUtc(y, m, d, 0, 0, 0);
  const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
  const endExclusive = schoolLocalToUtc(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth() + 1,
    nextDate.getUTCDate(),
    0,
    0,
    0
  );
  return { start, endExclusive };
}

/**
 * Construct half-open boundary [startUtc, endExclusiveUtc] for a school-local month (YYYY-MM).
 * E.g. '2026-09' in Asia/Karachi (UTC+05:00) -> start: 2026-08-31T19:00:00.000Z, endExclusive: 2026-09-30T19:00:00.000Z.
 * Never calculates September using 'September 31' or rolls over unintentionally.
 */
export function getSchoolMonthRange(monthStr: string): { start: Date; endExclusive: Date } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr)) {
    throw ApiError.badRequest('Invalid month format (expected YYYY-MM)', 'INVALID_MONTH');
  }
  const [y, m] = monthStr.split('-').map(Number);
  const start = schoolLocalToUtc(y, m, 1, 0, 0, 0);
  const nextYear = m === 12 ? y + 1 : y;
  const nextMonth = m === 12 ? 1 : m + 1;
  const endExclusive = schoolLocalToUtc(nextYear, nextMonth, 1, 0, 0, 0);
  return { start, endExclusive };
}

/**
 * Construct half-open boundary for custom range [from YYYY-MM-DD, to YYYY-MM-DD inclusive].
 * If 'to' is provided, endExclusive is set to the start of the following school-local day.
 */
export function getSchoolCustomRange(fromStr?: string, toStr?: string): { start?: Date; endExclusive?: Date } {
  let start: Date | undefined;
  let endExclusive: Date | undefined;

  if (fromStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr)) {
      throw ApiError.badRequest('Invalid from date format (expected YYYY-MM-DD)', 'INVALID_FROM_DATE');
    }
    const [y, m, d] = fromStr.split('-').map(Number);
    start = schoolLocalToUtc(y, m, d, 0, 0, 0);
  }

  if (toStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      throw ApiError.badRequest('Invalid to date format (expected YYYY-MM-DD)', 'INVALID_TO_DATE');
    }
    const [y, m, d] = toStr.split('-').map(Number);
    const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
    endExclusive = schoolLocalToUtc(
      nextDate.getUTCFullYear(),
      nextDate.getUTCMonth() + 1,
      nextDate.getUTCDate(),
      0,
      0,
      0
    );
  }

  return { start, endExclusive };
}
