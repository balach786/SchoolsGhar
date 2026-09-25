import { getTenantModels } from '../../services/TenantModelRegistry';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import mongoose from 'mongoose';
import { Student } from '../../models/Student';
import { StudentHistory } from '../../models/StudentHistory';
import { Teacher } from '../../models/Teacher';
import { Staff } from '../../models/Staff';
import { User } from '../../models/User';
import { Role } from '../../models/Role';
import { Class } from '../../models/Class';
import { Section } from '../../models/Section';
import { Subject } from '../../models/Subject';
import { AcademicSession } from '../../models/AcademicSession';
import { FeeStructure } from '../../models/FeeStructure';
import { StudentAttendance } from '../../models/StudentAttendance';
import { Exam } from '../../models/Exam';
import { Mark } from '../../models/Mark';
import { DataHistory } from '../../models/DataHistory';
import { AuditLog } from '../../models/AuditLog';
import {
  ColumnDefinition,
  styleWorksheet,
  addInstructionsSheet,
  desanitizeCell,
} from './spreadsheet.utils';

export interface RowValidationResult {
  rowNumber: number;
  identifier: string;
  status: 'valid' | 'warning' | 'error';
  field?: string;
  message?: string;
  data: Record<string, any>;
}

export interface ImportPreviewResult {
  module: string;
  totalRows: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  previewRows: RowValidationResult[];
  errors: { rowNumber: number; identifier: string; status: string; field?: string; message: string }[];
  canImport: boolean;
}

export interface ImportExecutionResult {
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  historyId: string;
}

export class ImportService {
  /**
   * 1. Generate downloadable blank templates with instructions.
   */
  static async generateTemplate(
    module: string,
    format: 'xlsx' | 'csv' = 'xlsx',
    tenantId?: string,
    context?: { classId?: string; className?: string; sectionName?: string }
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'School Management System';

    let columns: ColumnDefinition[] = [];
    let sampleRows: Record<string, any>[] = [];
    let instructions: string[] = [];

    switch (module) {
      case 'students': {
        let sampleClass = context?.className || 'CLASS 01';
        let sampleSection = context?.sectionName || 'A';

        if (tenantId) {
          try {
            const tId = new mongoose.Types.ObjectId(tenantId);
            const [classes, sections] = await Promise.all([
              Class.find({ tenantId: tId, isArchived: false }).sort({ name: 1 }).lean(),
              Section.find({ tenantId: tId, isArchived: false }).lean(),
            ]);

            if (classes.length > 0) {
              const matchedClass = context?.classId
                ? classes.find((c) => String(c._id) === context.classId)
                : context?.className
                ? classes.find((c) => c.name.toLowerCase() === context.className?.toLowerCase())
                : classes[0];

              sampleClass = matchedClass ? matchedClass.name : classes[0].name;
              const matchedSec = matchedClass
                ? sections.find((s) => String(s.classId) === String(matchedClass._id))
                : sections[0];
              sampleSection = matchedSec ? matchedSec.name : 'A';
            }
          } catch {
            // fallback to defaults
          }
        }

        columns = [
          { header: 'Admission Number', key: 'admissionNumber', width: 18, required: true, description: 'Unique school admission ID', example: 'ADM-2026-001' },
          { header: 'Roll Number', key: 'rollNumber', width: 14, required: false, description: 'Class roll number', example: '01' },
          { header: 'Student Name', key: 'fullName', width: 24, required: true, description: 'Full student name', example: 'Muhammad Ali' },
          { header: 'Father Name', key: 'fatherName', width: 24, required: false, description: 'Father name', example: 'Tariq Mehmood' },
          { header: 'Caste', key: 'caste', width: 16, required: false, description: 'Student caste', example: 'Rajput' },
          { header: 'Email', key: 'email', width: 24, required: false, description: 'Student email', example: 'student@example.com' },
          { header: 'Gender', key: 'gender', width: 12, required: true, allowedValues: 'male, female', example: 'male' },
          { header: 'Date of Birth', key: 'dateOfBirth', width: 16, required: true, allowedValues: 'YYYY-MM-DD', example: '2015-05-14' },
          { header: 'Class Name', key: 'className', width: 16, required: true, description: 'Class name (e.g. CLASS 01)', example: sampleClass },
          { header: 'Section Name', key: 'sectionName', width: 14, required: false, description: 'Section name (defaults to A if blank)', example: sampleSection },
          { header: 'Phone', key: 'phone', width: 16, required: false, description: 'Contact phone number', example: '03001234567' },
          { header: 'Address', key: 'address', width: 30, required: false, description: 'Residential address', example: 'Street 4, Sector G-9, Islamabad' },
          { header: 'Guardian Name', key: 'guardianName', width: 24, required: true, description: 'Guardian name', example: 'Tariq Mehmood' },
          { header: 'Guardian Phone', key: 'guardianPhone', width: 18, required: false, description: 'Guardian mobile number', example: '03007654321' },
          { header: 'Guardian Relationship', key: 'guardianRelationship', width: 18, required: false, description: 'Relationship to student', example: 'Father' },
          { header: 'Admission Date', key: 'admissionDate', width: 16, required: true, allowedValues: 'YYYY-MM-DD', example: '2026-08-01' },
          { header: 'Previous School', key: 'previousSchool', width: 24, required: false, description: 'Previous school attended', example: 'Former School Name' },
        ];

        sampleRows = [
          {
            admissionNumber: 'ADM-2026-001',
            rollNumber: '01',
            fullName: 'Muhammad Ali',
            fatherName: 'Tariq Mehmood',
            caste: 'Rajput',
            email: 'ali@example.com',
            gender: 'male',
            dateOfBirth: '2015-05-14',
            className: sampleClass,
            sectionName: sampleSection,
            phone: '03001234567',
            address: 'Street 4, Sector G-9, Islamabad',
            guardianName: 'Tariq Mehmood',
            guardianPhone: '03007654321',
            guardianRelationship: 'Father',
            admissionDate: '2026-08-01',
            previousSchool: 'City Public School',
          },
          {
            admissionNumber: 'ADM-2026-002',
            rollNumber: '02',
            fullName: 'Fatima Noor',
            fatherName: 'Ahmed Raza',
            caste: '',
            email: 'fatima@example.com',
            gender: 'female',
            dateOfBirth: '2015-09-20',
            className: sampleClass,
            sectionName: sampleSection,
            phone: '03009876543',
            address: 'House 12, Block B, Rawalpindi',
            guardianName: 'Ahmed Raza',
            guardianPhone: '03001122334',
            guardianRelationship: 'Father',
            admissionDate: '2026-08-01',
            previousSchool: '',
          },
        ];

        instructions = [
          'Admission Number must be unique across each student in your school (e.g. ADM-001, 1001, etc.).',
          `Class Name must match your school class (e.g. "${sampleClass}").`,
          `Section Name matches your section (e.g. "${sampleSection}"). If left blank, it defaults to Section A.`,
          'Gender must be either "male" or "female".',
          'Dates must be strictly formatted as YYYY-MM-DD (e.g. 2015-05-14).',
          'Google Sheets: You can fill in Google Sheets, then click File > Download > Microsoft Excel (.xlsx) or CSV (.csv) to upload.',
        ];
        break;
      }

      case 'staff':
        columns = [
          { header: 'Employee ID', key: 'employeeId', width: 16, required: true, description: 'Unique staff employee code', example: 'EMP-001' },
          { header: 'Name', key: 'fullName', width: 24, required: true, description: 'Full legal name', example: 'Dr. Tariq Khan' },
          { header: 'Role', key: 'role', width: 16, required: true, allowedValues: 'teacher, accountant, receptionist', example: 'teacher' },
          { header: 'Email', key: 'email', width: 24, required: false, description: 'Email address', example: 'tariq@example.com' },
          { header: 'Phone', key: 'phone', width: 18, required: false, description: 'Contact phone', example: '03009988776' },
          { header: 'Qualification', key: 'qualification', width: 22, required: false, description: 'Degree or certification', example: 'M.Sc Mathematics' },
          { header: 'Joining Date', key: 'joiningDate', width: 16, required: true, allowedValues: 'YYYY-MM-DD', example: '2025-01-15' },
          { header: 'Salary (PKR)', key: 'salary', width: 16, required: false, description: 'Monthly salary in PKR', example: '45000' },
        ];
        sampleRows = [
          {
            employeeId: 'EMP-001',
            fullName: 'Dr. Tariq Khan',
            role: 'teacher',
            email: 'tariq@example.com',
            phone: '03009988776',
            qualification: 'M.Sc Mathematics',
            joiningDate: '2025-01-15',
            salary: '45000',
          },
        ];
        instructions = [
          'Employee ID must be unique per employee.',
          'Roles are limited to school staff (teacher, accountant, receptionist). Platform Admin and Super Admin roles cannot be imported.',
          'Joining Date must be in YYYY-MM-DD format.',
        ];
        break;

      case 'fees':
        columns = [
          { header: 'Class Name', key: 'className', width: 18, required: true, description: 'Target class', example: 'Grade 8' },
          { header: 'Fee Type', key: 'feeType', width: 20, required: true, allowedValues: 'monthly_tuition, admission_fee, other', example: 'monthly_tuition' },
          { header: 'Amount (PKR)', key: 'amount', width: 16, required: true, description: 'Standard amount in PKR', example: '3500' },
          { header: 'Due Day of Month', key: 'dueDay', width: 18, required: false, description: 'Day of the month (1-28)', example: '10' },
        ];
        sampleRows = [
          { className: 'Grade 8', feeType: 'monthly_tuition', amount: '3500', dueDay: '10' },
        ];
        instructions = [
          'This template configures Fee Structures for classes.',
          'Importing existing paid receipts or overriding payment history is prohibited.',
          'Amount must be a positive integer or decimal.',
        ];
        break;

      case 'academic':
        columns = [
          { header: 'Type', key: 'type', width: 14, required: true, allowedValues: 'class, section, subject', example: 'class' },
          { header: 'Name', key: 'name', width: 24, required: true, description: 'Name of the class, section, or subject', example: 'Grade 8' },
          { header: 'Code', key: 'code', width: 14, required: false, description: 'Short code (optional)', example: 'G8' },
          { header: 'Parent Class', key: 'parentClass', width: 20, required: false, description: 'Required when Type is section or subject', example: 'Grade 8' },
        ];
        sampleRows = [
          { type: 'class', name: 'Grade 8', code: 'G8', parentClass: '' },
          { type: 'section', name: 'A', code: 'A', parentClass: 'Grade 8' },
          { type: 'subject', name: 'Mathematics', code: 'MATH8', parentClass: 'Grade 8' },
        ];
        instructions = [
          'Type must be one of: class, section, subject.',
          'When creating a section or subject, Parent Class must match an existing class or a class defined earlier in this file.',
        ];
        break;

      default:
        throw new Error(`Template not supported for module: ${module}`);
    }

    const dataSheet = workbook.addWorksheet('Data');
    styleWorksheet(dataSheet, columns);
    sampleRows.forEach((row) => dataSheet.addRow(row));

    if (format === 'xlsx') {
      addInstructionsSheet(workbook, module, columns, instructions);
    }

    const fileName = `${module}_Import_Template.${format}`;
    const buffer = format === 'csv'
      ? Buffer.from(await workbook.csv.writeBuffer())
      : Buffer.from(await workbook.xlsx.writeBuffer());

    return { buffer, fileName };
  }

  /**
   * 2. Parse file buffer (.xlsx or .csv) into structured raw rows.
   */
  private static async parseSpreadsheetBuffer(buffer: Buffer, originalName: string): Promise<Record<string, any>[]> {
    const isCsv = originalName.toLowerCase().endsWith('.csv');
    const workbook = new ExcelJS.Workbook();

    if (isCsv) {
      await workbook.csv.read(buffer as any);
    } else {
      let finalBuffer = buffer;
      try {
        const zip = await JSZip.loadAsync(buffer);
        let modified = false;
        for (const [filename, fileEntry] of Object.entries(zip.files)) {
          if (filename.endsWith('.xml') || filename.endsWith('.rels')) {
            const content = await fileEntry.async('string');
            // Clean namespace prefixes on spreadsheet XML elements (e.g. <x:workbook>, <x:sheet>)
            if (content.includes('<x:') || content.includes('</x:')) {
              const cleaned = content
                .replace(/<(\/?)x:([a-zA-Z0-9]+)/g, '<$1$2')
                .replace(/\sxmlns:x="[^"]*"/g, '');
              zip.file(filename, cleaned);
              modified = true;
            }
          }
        }
        if (modified) {
          finalBuffer = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer;
        }
      } catch {
        // If zip preprocessing encounters any format issue, fallback to raw buffer
      }
      await workbook.xlsx.load(finalBuffer as any);
    }

    // Select worksheet that contains data rows (prefer 'Data', 'Students', or non-instructions sheet)
    let worksheet = workbook.worksheets.find(
      (ws) =>
        ws.name.toLowerCase() === 'data' ||
        ws.name.toLowerCase() === 'students' ||
        ws.name.toLowerCase() === 'sheet1'
    );
    if (!worksheet) {
      worksheet =
        workbook.worksheets.find(
          (ws) => ws.name.toLowerCase() !== 'instructions' && ws.rowCount > 1
        ) || workbook.worksheets[0];
    }

    if (!worksheet || worksheet.rowCount < 2) {
      throw new Error('Spreadsheet contains no data rows');
    }

    // Read header row
    const headers: string[] = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      const val = cell.value ? String(cell.value).trim() : '';
      headers[colNumber] = val;
    });

    const rows: Record<string, any>[] = [];
    const maxRows = 5000;

    for (let r = 2; r <= worksheet.rowCount; r++) {
      if (rows.length >= maxRows) break;
      const row = worksheet.getRow(r);
      const rowObj: Record<string, any> = { _rowNumber: r };
      let hasData = false;

      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber];
        if (header) {
          let cellValue = cell.value;
          // Format Date cells cleanly if detected
          if (cellValue instanceof Date) {
            cellValue = cellValue.toISOString().slice(0, 10);
          } else if (typeof cellValue === 'object' && cellValue !== null && 'text' in cellValue) {
            cellValue = (cellValue as any).text;
          }
          const cleanVal = desanitizeCell(cellValue);
          if (cleanVal !== '') hasData = true;
          rowObj[header] = cleanVal;
        }
      });

      if (hasData) {
        rows.push(rowObj);
      }
    }

    return rows;
  }

  /**
   * 3. Read-Only Preview & Validation:
   * Validates schema, database relationships, duplicate keys, and role limits.
   * WRITES ZERO DATA TO DATABASE.
   */
  static async previewImport(
    tenantDb: mongoose.Connection,
    tenantId: string,
    module: string,
    fileBuffer: Buffer,
    fileName: string,
    options?: { skipDuplicates?: boolean }
  ): Promise<ImportPreviewResult> {
    const rows = await this.parseSpreadsheetBuffer(fileBuffer, fileName);
    const tId = new mongoose.Types.ObjectId(tenantId);

    const validationResults: RowValidationResult[] = [];
    const allErrors: { rowNumber: number; identifier: string; status: string; field?: string; message: string }[] = [];

    const { Class, Section, AcademicSession, Student, Staff } = getTenantModels(tenantDb);

    // Pre-load tenant reference caches for fast in-memory validation
    const [classes, sections, sessions] = await Promise.all([
      Class.find({ tenantId: tId }).lean(),
      Section.find({ tenantId: tId }).lean(),
      AcademicSession.find({ tenantId: tId }).lean(),
    ]);

    const classMap = new Map(classes.map((c) => [c.name.toLowerCase().trim(), c]));
    const sessionActive = sessions.find((s) => s.isActive) || sessions[0];

    // In-file duplicate trackers
    const seenAdmissionNumbers = new Set<string>();
    const seenEmployeeIds = new Set<string>();

    // Database duplicate trackers
    const existingStudents = module === 'students'
      ? await Student.find({ tenantId: tId, isArchived: false }, 'admissionNumber rollNumber sessionId classId sectionId').lean()
      : [];
    const existingAdmissionSet = new Set(existingStudents.map((s) => s.admissionNumber.toLowerCase().trim()));
    const existingRollSet = new Set(
      existingStudents
        .filter((s) => s.rollNumber)
        .map((s) => `${String(s.sessionId)}_${String(s.classId)}_${String(s.sectionId || 'none')}_${String(s.rollNumber).toLowerCase().trim()}`)
    );
    const seenRollKeys = new Set<string>();

    const existingStaff = module === 'staff'
      ? await Staff.find({ tenantId: tId }, 'employeeId').lean()
      : [];
    const existingEmployeeSet = new Set(existingStaff.map((t) => t.employeeId.toLowerCase().trim()));

    for (const row of rows) {
      const rowNumber = row._rowNumber;
      let status: 'valid' | 'warning' | 'error' = 'valid';
      let identifier = '';
      let field: string | undefined;
      let message: string | undefined;

      switch (module) {
        case 'students': {
          const adm = String(row['Admission Number'] || '').trim();
          const name = String(row['Student Name'] || '').trim();
          const className = String(row['Class Name'] || row['Class'] || '').trim();
          const secName = String(row['Section Name'] || row['Section'] || '').trim();
          const gender = String(row['Gender'] || '').trim().toLowerCase();
          const dob = String(row['Date of Birth'] || '').trim();
          const admDate = String(row['Admission Date'] || '').trim();

          identifier = adm || name || `Row ${rowNumber}`;

          if (!adm) {
            status = 'error'; field = 'Admission Number'; message = 'Admission Number is required';
          } else if (!name) {
            status = 'error'; field = 'Student Name'; message = 'Student Name is required';
          } else if (!className) {
            status = 'error'; field = 'Class Name'; message = 'Class Name is required';
          } else if (!['male', 'female'].includes(gender)) {
            status = 'error'; field = 'Gender'; message = 'Gender must be "male" or "female"';
          } else if (dob && isNaN(new Date(dob).getTime())) {
            status = 'error'; field = 'Date of Birth'; message = 'Invalid Date of Birth format';
          } else if (admDate && isNaN(new Date(admDate).getTime())) {
            status = 'error'; field = 'Admission Date'; message = 'Invalid Admission Date format';
          } else {
            // Check in-file duplicate
            if (seenAdmissionNumbers.has(adm.toLowerCase())) {
              status = 'error'; field = 'Admission Number'; message = `Duplicate Admission Number "${adm}" inside uploaded file`;
            } else {
              seenAdmissionNumbers.add(adm.toLowerCase());

              // Check existing DB duplicate
              if (existingAdmissionSet.has(adm.toLowerCase())) {
                if (options?.skipDuplicates) {
                  status = 'warning'; field = 'Admission Number'; message = `Admission Number "${adm}" already exists (will be skipped)`;
                } else {
                  status = 'error'; field = 'Admission Number'; message = `Admission Number "${adm}" already exists in database`;
                }
              }

              // Validate class & section relationship
              const cls = classMap.get(className.toLowerCase());
              if (!cls) {
                status = 'error'; field = 'Class Name'; message = `Class "${className}" does not exist in your school`;
              } else {
                let sec = secName ? sections.find((s) => String(s.classId) === String(cls._id) && s.name.toLowerCase().trim() === secName.toLowerCase()) : null;
                if (!sec && !secName) {
                  sec = sections.find((s) => String(s.classId) === String(cls._id));
                }
                if (!sec && secName) {
                  status = 'error'; field = 'Section Name'; message = `Section "${secName}" does not exist for Class "${className}"`;
                } else {
                  // Validate roll number uniqueness
                  const roll = String(row['Roll Number'] || '').trim();
                  if (roll) {
                    const effectiveSecId = sec ? String(sec._id) : 'none';
                    const effectiveSessionId = String(sessionActive?._id || cls.sessionId);
                    const rollKey = `${effectiveSessionId}_${String(cls._id)}_${effectiveSecId}_${roll.toLowerCase()}`;
                    if (seenRollKeys.has(rollKey)) {
                      status = 'error'; field = 'Roll Number'; message = `Duplicate Roll Number "${roll}" in Class "${className}"${sec ? ` Section "${sec.name}"` : ''} inside uploaded file`;
                    } else {
                      seenRollKeys.add(rollKey);
                      if (existingRollSet.has(rollKey)) {
                        status = 'error'; field = 'Roll Number'; message = `Roll Number "${roll}" is already assigned in Class "${className}"${sec ? ` Section "${sec.name}"` : ''}`;
                      }
                    }
                  }
                }
              }
            }
          }
          break;
        }

        case 'staff': {
          const empId = String(row['Employee ID'] || '').trim();
          const name = String(row['Name'] || '').trim();
          const role = String(row['Role'] || '').trim().toLowerCase();
          const joiningDate = String(row['Joining Date'] || '').trim();

          identifier = empId || name || `Row ${rowNumber}`;

          if (!empId) {
            status = 'error'; field = 'Employee ID'; message = 'Employee ID is required';
          } else if (!name) {
            status = 'error'; field = 'Name'; message = 'Name is required';
          } else if (!['teacher', 'accountant', 'receptionist'].includes(role)) {
            status = 'error'; field = 'Role'; message = 'Invalid or unauthorized role. Cannot import platform/admin accounts.';
          } else if (joiningDate && isNaN(new Date(joiningDate).getTime())) {
            status = 'error'; field = 'Joining Date'; message = 'Invalid Joining Date format';
          } else {
            if (seenEmployeeIds.has(empId.toLowerCase())) {
              status = 'error'; field = 'Employee ID'; message = `Duplicate Employee ID "${empId}" inside uploaded file`;
            } else {
              seenEmployeeIds.add(empId.toLowerCase());
              if (existingEmployeeSet.has(empId.toLowerCase())) {
                status = 'error'; field = 'Employee ID'; message = `Employee ID "${empId}" already exists in database`;
              }
            }
          }
          break;
        }

        case 'marks': {
          const adm = String(row['Admission Number'] || '').trim();
          const obtStr = String(row['Obtained Marks'] || '').trim();
          const totStr = String(row['Total Marks'] || '100').trim();
          const absStr = String(row['Absent'] || '').trim().toUpperCase();

          identifier = adm || `Row ${rowNumber}`;
          const isAbs = absStr === 'YES' || absStr === 'TRUE' || absStr === '1';

          if (!adm) {
            status = 'error'; field = 'Admission Number'; message = 'Admission Number is required';
          } else if (!isAbs && obtStr === '') {
            status = 'error'; field = 'Obtained Marks'; message = 'Obtained Marks is required unless marked Absent';
          } else if (!isAbs) {
            const obt = Number(obtStr);
            const tot = Number(totStr);
            if (isNaN(obt) || obt < 0) {
              status = 'error'; field = 'Obtained Marks'; message = 'Obtained Marks must be a non-negative number';
            } else if (obt > tot) {
              status = 'error'; field = 'Obtained Marks'; message = `Obtained Marks (${obt}) cannot exceed Total Marks (${tot})`;
            }
          }
          break;
        }

        default:
          identifier = `Row ${rowNumber}`;
          break;
      }

      if (status === 'error' || status === 'warning') {
        allErrors.push({
          rowNumber,
          identifier,
          status,
          field,
          message: message || 'Validation note',
        });
      }

      validationResults.push({
        rowNumber,
        identifier,
        status,
        field,
        message,
        data: row,
      });
    }

    const validCount = validationResults.filter((r) => r.status === 'valid').length;
    const warningCount = validationResults.filter((r) => r.status === 'warning').length;
    const errorCount = validationResults.filter((r) => r.status === 'error').length;

    return {
      module,
      totalRows: rows.length,
      validCount,
      warningCount,
      errorCount,
      previewRows: validationResults.slice(0, 50),
      errors: allErrors,
      canImport: validCount > 0,
    };
  }

  /**
   * 4. Import Execution: Commits valid rows to database in batches with tenant safety.
   */
  static async executeImport(
    tenantDb: mongoose.Connection,
    tenantId: string,
    userId: string,
    module: string,
    fileBuffer: Buffer,
    fileName: string,
    options?: { skipDuplicates?: boolean; examId?: string; subjectId?: string }
  ): Promise<ImportExecutionResult> {
    const preview = await this.previewImport(tenantDb, tenantId, module, fileBuffer, fileName, options);
    const tId = new mongoose.Types.ObjectId(tenantId);
    const uId = new mongoose.Types.ObjectId(userId);

    const rows = await this.parseSpreadsheetBuffer(fileBuffer, fileName);

    let importedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const { Class, Section, AcademicSession, Student, Staff, StudentHistory } = getTenantModels(tenantDb);

    const [classes, sections, sessions] = await Promise.all([
      Class.find({ tenantId: tId }).lean(),
      Section.find({ tenantId: tId }).lean(),
      AcademicSession.find({ tenantId: tId }).lean(),
    ]);

    const classMap = new Map(classes.map((c) => [c.name.toLowerCase().trim(), c]));
    const defaultSession = sessions.find((s) => s.isActive) || sessions[0];

    // Process based on module
    switch (module) {
      case 'students': {
        const toInsert: any[] = [];
        const existingStudents = await Student.find({ tenantId: tId, isArchived: false }, 'admissionNumber rollNumber sessionId classId sectionId').lean();
        const existingSet = new Set(existingStudents.map((s) => s.admissionNumber.toLowerCase().trim()));
        const existingRollSet = new Set(
          existingStudents
            .filter((s) => s.rollNumber)
            .map((s) => `${String(s.sessionId)}_${String(s.classId)}_${String(s.sectionId || 'none')}_${String(s.rollNumber).toLowerCase().trim()}`)
        );
        const seenRollKeys = new Set<string>();

        for (const row of rows) {
          const adm = String(row['Admission Number'] || '').trim();
          const name = String(row['Student Name'] || '').trim();
          const className = String(row['Class Name'] || row['Class'] || '').trim();
          const secName = String(row['Section Name'] || row['Section'] || '').trim();
          const gender = String(row['Gender'] || '').trim().toLowerCase();
          const roll = String(row['Roll Number'] || '').trim();

          if (!adm || !name || !className || !['male', 'female'].includes(gender)) {
            failedCount++;
            continue;
          }

          if (existingSet.has(adm.toLowerCase())) {
            if (options?.skipDuplicates) {
              skippedCount++;
              continue;
            } else {
              failedCount++;
              continue;
            }
          }

          const cls = classMap.get(className.toLowerCase());
          if (!cls) { failedCount++; continue; }

          let sec = secName ? sections.find((s) => String(s.classId) === String(cls._id) && s.name.toLowerCase().trim() === secName.toLowerCase()) : null;
          if (!sec && !secName) {
            sec = sections.find((s) => String(s.classId) === String(cls._id));
          }
          if (secName && !sec) { failedCount++; continue; }

          if (roll) {
            const effectiveSecId = sec ? String(sec._id) : 'none';
            const effectiveSessionId = String(defaultSession?._id);
            const rollKey = `${effectiveSessionId}_${String(cls._id)}_${effectiveSecId}_${roll.toLowerCase()}`;
            if (seenRollKeys.has(rollKey) || existingRollSet.has(rollKey)) {
              failedCount++;
              continue;
            }
            seenRollKeys.add(rollKey);
          }

          toInsert.push({
            tenantId: tId,
            admissionNumber: adm,
            rollNumber: roll,
            fullName: name,
            fatherName: String(row['Father Name'] || '').trim() || undefined,
            caste: String(row['Caste'] || '').trim() || undefined,
            email: String(row['Email'] || '').trim() || undefined,
            guardianName: String(row['Guardian Name'] || row['Father / Guardian Name'] || 'Guardian').trim(),
            gender,
            dateOfBirth: row['Date of Birth'] ? new Date(row['Date of Birth']) : new Date('2010-01-01'),
            admissionDate: row['Admission Date'] ? new Date(row['Admission Date']) : new Date(),
            phone: String(row['Phone'] || '').trim() || undefined,
            guardianPhone: String(row['Guardian Phone'] || '').trim() || undefined,
            guardianRelationship: String(row['Guardian Relationship'] || '').trim() || undefined,
            address: String(row['Address'] || '').trim() || undefined,
            previousSchool: String(row['Previous School'] || '').trim() || undefined,
            sessionId: defaultSession?._id,
            classId: cls._id,
            sectionId: sec ? sec._id : undefined,
            isActive: true,
            isArchived: false,
          });
          existingSet.add(adm.toLowerCase());
        }

        if (toInsert.length > 0) {
          const inserted = await Student.insertMany(toInsert, { ordered: false });
          importedCount = inserted.length;

          if (inserted.length > 0) {
            const histories = inserted.map((s) => ({
              tenantId: s.tenantId,
              studentId: s._id,
              sessionId: s.sessionId,
              classId: s.classId,
              sectionId: s.sectionId,
              status: 'admitted',
              eventDate: s.admissionDate || new Date(),
              date: s.admissionDate || new Date(),
              remarks: 'Admitted via bulk import.',
            }));
            await StudentHistory.insertMany(histories, { ordered: false });
          }
        }
        break;
      }

      case 'staff': {
        const toInsertStaff: any[] = [];
        const existingStaff = await Staff.find({ tenantId: tId }, 'employeeId').lean();
        const existingSet = new Set(existingStaff.map((s) => s.employeeId.toLowerCase().trim()));

        for (const row of rows) {
          const empId = String(row['Employee ID'] || '').trim().toUpperCase();
          const name = String(row['Name'] || '').trim();
          const role = String(row['Role'] || '').trim().toLowerCase();

          if (!empId || !name || !['teacher', 'accountant', 'receptionist'].includes(role)) {
            failedCount++;
            continue;
          }

          if (existingSet.has(empId.toLowerCase())) {
            if (options?.skipDuplicates) {
              skippedCount++;
              continue;
            } else {
              failedCount++;
              continue;
            }
          }

          const isTeaching = role === 'teacher';
          const staffType = isTeaching ? 'teaching' : 'non_teaching';
          const designation = isTeaching ? 'Teacher' : (role === 'accountant' ? 'Accountant' : 'Receptionist');
          const department = isTeaching ? 'Academics' : (role === 'accountant' ? 'Finance' : 'Administration');

          toInsertStaff.push({
            tenantId: tId,
            employeeId: empId,
            staffType,
            designation,
            department,
            fullName: name,
            email: String(row['Email'] || '').trim().toLowerCase() || undefined,
            phone: String(row['Phone'] || '').trim() || undefined,
            qualification: String(row['Qualification'] || '').trim() || undefined,
            joiningDate: row['Joining Date'] ? new Date(row['Joining Date']) : new Date(),
            salary: row['Salary (PKR)'] ? Math.round(Number(row['Salary (PKR)']) * 100) : 0,
            isActive: true,
            isArchived: false,
          });
          existingSet.add(empId.toLowerCase());
        }

        if (toInsertStaff.length > 0) {
          await Staff.insertMany(toInsertStaff, { ordered: false });
          importedCount = toInsertStaff.length;
        }
        break;
      }

      case 'marks': {
        if (!options?.examId || !options?.subjectId) {
          throw new Error('Exam ID and Subject ID are required for marks import');
        }

        const exam = await getTenantModels(tenantDb).Exam.findOne({ _id: options.examId, tenantId: tId }).lean();
        if (!exam) throw new Error('Exam not found');

        const students = await Student.find({ tenantId: tId, classId: exam.classId }).lean();
        const studentAdmMap = new Map(students.map((s) => [s.admissionNumber.toLowerCase().trim(), s]));

        const bulkOps = [];
        for (const row of rows) {
          const adm = String(row['Admission Number'] || '').trim();
          const obtStr = String(row['Obtained Marks'] || '').trim();
          const absStr = String(row['Absent'] || '').trim().toUpperCase();

          const student = studentAdmMap.get(adm.toLowerCase());
          if (!student) {
            failedCount++;
            continue;
          }

          const isAbsent = absStr === 'YES' || absStr === 'TRUE' || absStr === '1';
          const marksObtained = isAbsent ? 0 : Number(obtStr);

          if (isNaN(marksObtained) && !isAbsent) {
            failedCount++;
            continue;
          }

          bulkOps.push({
            updateOne: {
              filter: {
                tenantId: tId,
                examId: exam._id,
                studentId: student._id,
                subjectId: new mongoose.Types.ObjectId(options.subjectId),
              },
              update: {
                $set: {
                  tenantId: tId,
                  examId: exam._id,
                  sessionId: exam.sessionId,
                  studentId: student._id,
                  subjectId: new mongoose.Types.ObjectId(options.subjectId),
                  marksObtained: isAbsent ? 0 : marksObtained,
                  isAbsent,
                  markedBy: uId,
                },
              },
              upsert: true,
            },
          });
        }

        if (bulkOps.length > 0) {
          const res = await getTenantModels(tenantDb).Mark.bulkWrite(bulkOps);
          importedCount = (res.upsertedCount || 0) + (res.modifiedCount || 0);
        }
        break;
      }

      default:
        throw new Error(`Import execution not supported for module: ${module}`);
    }

    // Save compact history metadata
    const history = await DataHistory.create({
      tenantId: tId,
      type: 'import',
      module,
      format: fileName.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx',
      fileName,
      totalRows: rows.length,
      successCount: importedCount,
      warningCount: skippedCount,
      failedCount,
      status: failedCount === 0 ? 'completed' : importedCount > 0 ? 'partial' : 'failed',
      performedBy: uId,
    });

    // Create Audit Log
    await AuditLog.create({
      tenantId: tId,
      userId: uId,
      module: 'dataManagement',
      action: `${module.toUpperCase()}_BULK_IMPORTED`,
      metadata: {
        totalRows: rows.length,
        importedCount,
        skippedCount,
        failedCount,
        fileName,
      },
    });

    return {
      totalRows: rows.length,
      importedCount,
      skippedCount,
      failedCount,
      historyId: String(history._id),
    };
  }
}
