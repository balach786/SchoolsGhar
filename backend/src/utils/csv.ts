import { Response } from 'express';

/**
 * Shared CSV export helper — on-demand only, streamed from in-memory strings
 * (school-scale result sets). CSVs are NEVER stored in MongoDB.
 */

export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Prevent CSV Formula Injection (CWE-1236)
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvValue).join(','), ...rows.map((r) => r.map(escapeCsvValue).join(','))];
  return '\uFEFF' + lines.join('\r\n'); // BOM for Excel compatibility
}

/** Send a CSV download response with a useful filename. */
export function sendCsv(res: Response, filename: string, headers: string[], rows: unknown[][]): void {
  const csv = toCsv(headers, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

/** Return true when the request asked for a CSV download. */
export function wantsCsv(req: { query: Record<string, any> }): boolean {
  return req.query?.format === 'csv' || req.query?.download === 'csv';
}
