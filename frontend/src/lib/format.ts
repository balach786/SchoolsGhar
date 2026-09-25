import { format } from 'date-fns';

/** Format a date as e.g. "04 Sep 2026". */
export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return fallback;
  return format(d, 'dd MMM yyyy');
}

export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return fallback;
  return format(d, 'dd MMM yyyy, hh:mm a');
}

/** Format money (backend stores integer paisa; frontend divides by 100). */
export function formatCurrency(amountPaisa: number | null | undefined, currency = 'PKR'): string {
  if (amountPaisa === null || amountPaisa === undefined || Number.isNaN(amountPaisa)) return '—';
  const amount = amountPaisa / 100;
  try {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: currency === 'PKR' ? 'PKR' : currency,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

/** Alias for formatCurrency */
export const formatMoney = formatCurrency;

/** Convert a user-entered currency amount to integer paisa (backend unit). */
export function toPaisa(amount: number | string): number {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

/** Initials for avatar fallbacks. */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

/** CSV download helper for exports. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const escape = (cell: string | number | null | undefined) => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export const SCHOOL_TIMEZONE = 'Asia/Karachi';

/** Get current calendar date string (YYYY-MM-DD) in the school's local timezone. */
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

/** Get current calendar month string (YYYY-MM) in the school's local timezone. */
export function getSchoolCurrentMonthISO(): string {
  return getSchoolTodayISO().slice(0, 7);
}

export interface StudentIdentity {
  fullName: string;
  fatherName?: string | null;
  guardianName?: string | null;
  gender?: 'male' | 'female' | string;
}

/** Format a student's name along with their father/guardian information */
export function formatStudentIdentity(student: StudentIdentity | null | undefined): string {
  if (!student) return '—';
  
  const { fullName, fatherName, guardianName, gender } = student;
  
  if (fatherName && fatherName.trim().length > 0) {
    const relation = gender === 'female' ? 'D/O' : 'S/O';
    return `${fullName} (${relation} ${fatherName})`;
  } else if (guardianName && guardianName.trim().length > 0) {
    return `${fullName} (Guardian: ${guardianName})`;
  }
  
  return fullName;
}
