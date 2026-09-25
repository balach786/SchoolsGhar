import ExcelJS from 'exceljs';

/**
 * Sanitizes user-generated string data to prevent CSV/Excel Formula Injection.
 * Prepends a single quote if the text starts with dangerous formula triggers (=, +, -, @).
 */
export function sanitizeCell(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  
  return value;
}

/**
 * Strips defensive single quotes if previously prepended for formula safety during import.
 */
export function desanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (str.startsWith("'") && ['=', '+', '-', '@'].some((char) => str.slice(1).trim().startsWith(char))) {
    return str.slice(1).trim();
  }
  return str;
}

export interface ColumnDefinition {
  header: string;
  key: string;
  width?: number;
  type?: 'string' | 'number' | 'date' | 'currency';
  required?: boolean;
  description?: string;
  allowedValues?: string;
  example?: string;
}

/**
 * Applies Deep Teal brand styling to an ExcelJS worksheet.
 */
export function styleWorksheet(worksheet: ExcelJS.Worksheet, columns: ColumnDefinition[]) {
  // Freeze header row
  worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];

  // Setup columns
  worksheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || Math.max(col.header.length + 5, 16),
  }));

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF053433' }, // Deep Teal brand color
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF0C9C8F' } },
    };
  });
}

/**
 * Adds an "Instructions" sheet to a workbook with guidance for teachers and school staff.
 */
export function addInstructionsSheet(
  workbook: ExcelJS.Workbook,
  moduleName: string,
  columns: ColumnDefinition[],
  generalNotes?: string[]
) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];

  sheet.columns = [
    { header: 'Column Header', key: 'header', width: 26 },
    { header: 'Required?', key: 'required', width: 14 },
    { header: 'Format / Allowed Values', key: 'allowed', width: 32 },
    { header: 'Description', key: 'desc', width: 44 },
    { header: 'Sample Example', key: 'example', width: 26 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F7E75' }, // Primary Teal
    };
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle' };
  });

  columns.forEach((col) => {
    sheet.addRow({
      header: col.header,
      required: col.required ? 'REQUIRED' : 'Optional',
      allowed: col.allowedValues || (col.type === 'date' ? 'YYYY-MM-DD' : 'Text'),
      desc: col.description || '',
      example: col.example || '',
    });
  });

  // Highlight REQUIRED labels
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const reqCell = row.getCell('required');
      if (reqCell.value === 'REQUIRED') {
        reqCell.font = { bold: true, color: { argb: 'FFB91C1C' } };
      }
    }
  });

  // General notes at the bottom
  const emptyRow = sheet.addRow([]);
  const notesHeader = sheet.addRow(['Important Notes:']);
  notesHeader.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF053433' } };

  const defaultNotes = [
    'Do not change or rename the column headers on the Data sheet.',
    'Dates must strictly follow the YYYY-MM-DD format (e.g. 2026-09-11).',
    'Do not include platform administrator or cross-tenant accounts.',
    'Files must be .xlsx or .csv and less than 10 MB in total size.',
  ];

  (generalNotes || defaultNotes).forEach((note, index) => {
    sheet.addRow([`${index + 1}. ${note}`]);
  });
}

/**
 * Builds an Error Sheet XLSX buffer containing row-by-row validation failures.
 */
export async function buildErrorSheetWorkbook(
  errors: { rowNumber: number; identifier: string; status: string; field?: string; message: string }[],
  format: 'xlsx' | 'csv' = 'xlsx'
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'School Management System';
  const worksheet = workbook.addWorksheet('Import Errors');

  worksheet.columns = [
    { header: 'Row #', key: 'rowNumber', width: 10 },
    { header: 'Identifier', key: 'identifier', width: 25 },
    { header: 'Field', key: 'field', width: 20 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Error Description', key: 'message', width: 50 },
  ];

  worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];

  const headerRow = worksheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF991B1B' }, // Red tone for errors
    };
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle' };
  });

  errors.forEach((err) => {
    worksheet.addRow({
      rowNumber: err.rowNumber,
      identifier: sanitizeCell(err.identifier),
      field: err.field || 'General',
      status: err.status.toUpperCase(),
      message: sanitizeCell(err.message),
    });
  });

  if (format === 'csv') {
    const csvBuffer = await workbook.csv.writeBuffer();
    return Buffer.from(csvBuffer);
  }
  const xlsxBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(xlsxBuffer);
}

/**
 * Helper to convert standard JavaScript Date to YYYY-MM-DD string without timezone drift.
 */
export function formatDateOnly(date?: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
