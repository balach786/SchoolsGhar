import { getTenantModels } from '../../services/TenantModelRegistry';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { Student } from '../../models/Student';
import { Teacher } from '../../models/Teacher';
import { Staff } from '../../models/Staff';
import { User } from '../../models/User';
import { Role } from '../../models/Role';
import { Class } from '../../models/Class';
import { Section } from '../../models/Section';
import { Subject } from '../../models/Subject';
import { AcademicSession } from '../../models/AcademicSession';
import { StudentFee } from '../../models/StudentFee';
import { StudentExamFee } from '../../models/StudentExamFee';
import { StudentAttendance } from '../../models/StudentAttendance';
import { TeacherAttendance } from '../../models/TeacherAttendance';
import { Exam } from '../../models/Exam';
import { ExamSchedule } from '../../models/ExamSchedule';
import { Expense } from '../../models/Expense';
import { Mark } from '../../models/Mark';
import {
  sanitizeCell,
  styleWorksheet,
  formatDateOnly,
  ColumnDefinition,
} from './spreadsheet.utils';

export interface ExportResult {
  buffer: Buffer;
  fileName: string;
  recordCount: number;
  format: 'xlsx' | 'csv';
  filtersSummary: string;
}

export class ExportService {
  /**
   * 1. Export Students with Class, Section, Session, and Status filters.
   */
  static async exportStudents(
    tenantDb: mongoose.Connection | undefined,
    tenantId: string,
    filters: {
      sessionId?: string;
      classId?: string;
      sectionId?: string;
      status?: 'active' | 'archived' | 'all';
      gender?: 'male' | 'female';
      admissionDateFrom?: string;
      admissionDateTo?: string;
    },
    format: 'xlsx' | 'csv' = 'xlsx'
  ): Promise<ExportResult> {
    if (!tenantDb) throw new Error('Tenant DB required');
    const { Student, Class, Section, AcademicSession } = getTenantModels(tenantDb);
    const query: any = { tenantId: new mongoose.Types.ObjectId(tenantId) };

    const summaryParts: string[] = [];

    if (filters.sessionId && mongoose.Types.ObjectId.isValid(filters.sessionId)) {
      query.sessionId = new mongoose.Types.ObjectId(filters.sessionId);
    }
    if (filters.classId && mongoose.Types.ObjectId.isValid(filters.classId)) {
      query.classId = new mongoose.Types.ObjectId(filters.classId);
    }
    if (filters.sectionId && mongoose.Types.ObjectId.isValid(filters.sectionId)) {
      query.sectionId = new mongoose.Types.ObjectId(filters.sectionId);
    }
    if (filters.gender) {
      query.gender = filters.gender;
      summaryParts.push(`Gender: ${filters.gender}`);
    }
    if (filters.status === 'archived') {
      query.isArchived = true;
      summaryParts.push('Status: Archived');
    } else if (filters.status === 'active' || !filters.status) {
      query.isArchived = false;
      query.isActive = true;
      summaryParts.push('Status: Active');
    }
    if (filters.admissionDateFrom || filters.admissionDateTo) {
      query.admissionDate = {};
      if (filters.admissionDateFrom) query.admissionDate.$gte = new Date(filters.admissionDateFrom);
      if (filters.admissionDateTo) query.admissionDate.$lte = new Date(filters.admissionDateTo);
      summaryParts.push(`Dates: ${filters.admissionDateFrom || 'Start'} to ${filters.admissionDateTo || 'End'}`);
    }

    const students = await (Student as mongoose.Model<any>).find(query)
      .populate('sessionId', 'name')
      .populate('classId', 'name')
      .populate('sectionId', 'name')
      .sort({ classId: 1, sectionId: 1, rollNumber: 1, fullName: 1 })
      .lean();

    const className = students[0]?.classId ? (students[0].classId as any).name : '';
    const sectionName = students[0]?.sectionId ? (students[0].sectionId as any).name : '';
    if (className) summaryParts.unshift(`Class: ${className}${sectionName ? ' ' + sectionName : ''}`);

    const columns: ColumnDefinition[] = [
      { header: 'Admission Number', key: 'admissionNumber', width: 18 },
      { header: 'Roll Number', key: 'rollNumber', width: 14 },
      { header: 'Student Name', key: 'fullName', width: 24 },
      { header: 'Father Name', key: 'fatherName', width: 24 },
      { header: 'Caste', key: 'caste', width: 16 },
      { header: 'Guardian Name', key: 'guardianName', width: 24 },
      { header: 'Gender', key: 'gender', width: 12 },
      { header: 'Date of Birth', key: 'dateOfBirth', width: 16 },
      { header: 'Class', key: 'className', width: 16 },
      { header: 'Section', key: 'sectionName', width: 12 },
      { header: 'Academic Session', key: 'sessionName', width: 18 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Guardian Phone', key: 'guardianPhone', width: 18 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'Admission Date', key: 'admissionDate', width: 16 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'School Management System';
    const worksheet = workbook.addWorksheet('Students');
    styleWorksheet(worksheet, columns);

    students.forEach((s: any) => {
      worksheet.addRow({
        admissionNumber: sanitizeCell(s.admissionNumber),
        rollNumber: sanitizeCell(s.rollNumber || ''),
        fullName: sanitizeCell(s.fullName),
        fatherName: sanitizeCell(s.fatherName || ''),
        caste: sanitizeCell(s.caste || ''),
        guardianName: sanitizeCell(s.guardianName),
        gender: s.gender === 'female' ? 'Female' : 'Male',
        dateOfBirth: formatDateOnly(s.dateOfBirth),
        className: sanitizeCell(s.classId?.name || ''),
        sectionName: sanitizeCell(s.sectionId?.name || ''),
        sessionName: sanitizeCell(s.sessionId?.name || ''),
        phone: sanitizeCell(s.phone || ''),
        guardianPhone: sanitizeCell(s.guardianPhone || ''),
        address: sanitizeCell(s.address || ''),
        admissionDate: formatDateOnly(s.admissionDate),
        status: s.isActive ? 'Active' : 'Inactive',
      });
    });

    // If XLSX, add Summary tab
    if (format === 'xlsx') {
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];
      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 30 },
        { header: 'Value', key: 'val', width: 20 },
      ];
      const sHead = summarySheet.getRow(1);
      sHead.height = 26;
      sHead.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F7E75' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      });
      const maleCount = students.filter((s: any) => s.gender === 'male').length;
      const femaleCount = students.filter((s: any) => s.gender === 'female').length;
      summarySheet.addRow({ metric: 'Total Students Exported', val: students.length });
      summarySheet.addRow({ metric: 'Male Students', val: maleCount });
      summarySheet.addRow({ metric: 'Female Students', val: femaleCount });
      summarySheet.addRow({ metric: 'Filter Criteria', val: summaryParts.join(' | ') || 'All Students' });
      summarySheet.addRow({ metric: 'Export Timestamp', val: new Date().toLocaleString() });
    }

    const todayStr = formatDateOnly(new Date());
    const safeName = className ? `${className.replace(/\s+/g, '_')}_Students_${todayStr}` : `Students_Export_${todayStr}`;
    const fileName = `${safeName}.${format}`;

    let buffer: Buffer;
    if (format === 'csv') {
      const csvBuf = await workbook.csv.writeBuffer();
      buffer = Buffer.from(csvBuf);
    } else {
      const xlsxBuf = await workbook.xlsx.writeBuffer();
      buffer = Buffer.from(xlsxBuf);
    }

    return {
      buffer,
      fileName,
      recordCount: students.length,
      format,
      filtersSummary: summaryParts.join(', ') || 'All Students',
    };
  }

  /**
   * 2. Export Staff (Teachers, Accountants, Staff).
   */
  static async exportStaff(tenantDb: mongoose.Connection | undefined, tenantId: string,
    filters: {
      role?: string;
      status?: 'active' | 'archived' | 'inactive' | 'all';
    },
    format: 'xlsx' | 'csv' = 'xlsx'
  ): Promise<ExportResult> {
    const tQuery: any = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (filters.status === 'archived') tQuery.isArchived = true;
    else if (filters.status === 'inactive') {
      tQuery.isArchived = false;
      tQuery.isActive = false;
    } else if (filters.status === 'active' || !filters.status) {
      tQuery.isArchived = false;
      tQuery.isActive = true;
    }

    if (filters.role) {
      const roleLower = filters.role.toLowerCase();
      if (roleLower === 'teacher') {
        tQuery.staffType = 'teaching';
      } else {
        tQuery.designation = new RegExp(`^${filters.role}$`, 'i');
      }
    }

    const staffMembers = await Staff.find(tQuery)
      .sort({ employeeId: 1 })
      .lean();



    const columns: ColumnDefinition[] = [
      { header: 'Employee ID', key: 'employeeId', width: 16 },
      { header: 'Name', key: 'fullName', width: 24 },
      { header: 'Father Name', key: 'fatherName', width: 24 },
      { header: 'Caste', key: 'caste', width: 16 },
      { header: 'Role/Designation', key: 'designation', width: 18 },
      { header: 'Staff Type', key: 'staffType', width: 16 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Email', key: 'email', width: 24 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Qualification', key: 'qualification', width: 22 },
      { header: 'Joining Date', key: 'joiningDate', width: 16 },

      { header: 'Status', key: 'status', width: 12 },
    ];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Staff');
    styleWorksheet(worksheet, columns);

    staffMembers.forEach((t: any) => {
      const idStr = String(t._id);
      worksheet.addRow({
        employeeId: sanitizeCell(t.employeeId),
        fullName: sanitizeCell(t.fullName),
        fatherName: sanitizeCell(t.fatherName || ''),
        caste: sanitizeCell(t.caste || ''),
        designation: sanitizeCell(t.designation || (t.staffType === 'teaching' ? 'Teacher' : 'Staff')),
        staffType: sanitizeCell(t.staffType || 'teaching'),
        department: sanitizeCell(t.department || ''),
        email: sanitizeCell(t.email || ''),
        phone: sanitizeCell(t.phone || ''),
        qualification: sanitizeCell(t.qualification || ''),
        joiningDate: formatDateOnly(t.joiningDate),

        status: t.isActive ? 'Active' : 'Inactive',
      });
    });

    const fileName = `Staff_List_${formatDateOnly(new Date())}.${format}`;
    const buffer = format === 'csv'
      ? Buffer.from(await workbook.csv.writeBuffer())
      : Buffer.from(await workbook.xlsx.writeBuffer());

    return {
      buffer,
      fileName,
      recordCount: staffMembers.length,
      format,
      filtersSummary: filters.role ? `Role: ${filters.role}` : 'All Teachers & Staff',
    };
  }

  /**
   * 3. Export Monthly Tuition Fees (Kept strictly separated from Exam Fees).
   */
  static async exportMonthlyFees(tenantDb: mongoose.Connection | undefined, tenantId: string,
    filters: {
      sessionId?: string;
      month?: number;
      classId?: string;
      sectionId?: string;
      status?: 'paid' | 'partial' | 'unpaid' | 'all';
    },
    format: 'xlsx' | 'csv' = 'xlsx'
  ): Promise<ExportResult> {
    const query: any = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      feeType: 'monthly_tuition',
    };

    if (filters.sessionId && mongoose.Types.ObjectId.isValid(filters.sessionId)) query.sessionId = new mongoose.Types.ObjectId(filters.sessionId);
    if (filters.classId && mongoose.Types.ObjectId.isValid(filters.classId)) query.classId = new mongoose.Types.ObjectId(filters.classId);
    if (filters.sectionId && mongoose.Types.ObjectId.isValid(filters.sectionId)) query.sectionId = new mongoose.Types.ObjectId(filters.sectionId);
    if (filters.month) query.month = Number(filters.month);
    if (filters.status && filters.status !== 'all') query.status = filters.status;

    const fees = await StudentFee.find(query)
      .populate('studentId', 'fullName admissionNumber rollNumber')
      .populate('classId', 'name')
      .populate('sectionId', 'name')
      .sort({ classId: 1, sectionId: 1, status: 1 })
      .lean();

    const columns: ColumnDefinition[] = [
      { header: 'Admission #', key: 'admissionNumber', width: 16 },
      { header: 'Student Name', key: 'studentName', width: 24 },
      { header: 'Class', key: 'className', width: 14 },
      { header: 'Section', key: 'sectionName', width: 12 },
      { header: 'Billing Month', key: 'month', width: 14 },
      { header: 'Fee Type', key: 'feeType', width: 16 },
      { header: 'Total (PKR)', key: 'total', width: 14 },
      { header: 'Discount (PKR)', key: 'discount', width: 14 },
      { header: 'Fine (PKR)', key: 'fine', width: 14 },
      { header: 'Net Payable (PKR)', key: 'netPayable', width: 16 },
      { header: 'Paid (PKR)', key: 'paid', width: 14 },
      { header: 'Remaining (PKR)', key: 'remaining', width: 16 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Due Date', key: 'dueDate', width: 14 },
    ];

    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Monthly Fees');
    styleWorksheet(worksheet, columns);

    fees.forEach((f: any) => {
      worksheet.addRow({
        admissionNumber: sanitizeCell(f.studentId?.admissionNumber || ''),
        studentName: sanitizeCell(f.studentId?.fullName || ''),
        className: sanitizeCell(f.classId?.name || ''),
        sectionName: sanitizeCell(f.sectionId?.name || ''),
        month: f.month ? monthNames[f.month] || String(f.month) : 'Annual',
        feeType: 'Tuition Fee',
        total: (f.originalAmount / 100).toFixed(2),
        discount: (f.discountAmount / 100).toFixed(2),
        fine: (f.fineAmount / 100).toFixed(2),
        netPayable: (f.netPayable / 100).toFixed(2),
        paid: (f.amountPaid / 100).toFixed(2),
        remaining: (f.remainingBalance / 100).toFixed(2),
        status: f.status.toUpperCase(),
        dueDate: formatDateOnly(f.dueDate),
      });
    });

    const fileName = `Monthly_Tuition_Fees_${formatDateOnly(new Date())}.${format}`;
    const buffer = format === 'csv'
      ? Buffer.from(await workbook.csv.writeBuffer())
      : Buffer.from(await workbook.xlsx.writeBuffer());

    return {
      buffer,
      fileName,
      recordCount: fees.length,
      format,
      filtersSummary: `Monthly Tuition Fees (${filters.status || 'All Statuses'})`,
    };
  }

  /**
   * 4. Export Exam Fees (Isolated from tuition fees).
   */
  static async exportExamFees(tenantDb: mongoose.Connection | undefined, tenantId: string,
    filters: {
      examId?: string;
      classId?: string;
      status?: 'paid' | 'partial' | 'unpaid' | 'all';
    },
    format: 'xlsx' | 'csv' = 'xlsx'
  ): Promise<ExportResult> {
    const query: any = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (filters.examId && mongoose.Types.ObjectId.isValid(filters.examId)) query.examId = new mongoose.Types.ObjectId(filters.examId);
    if (filters.classId && mongoose.Types.ObjectId.isValid(filters.classId)) query.classId = new mongoose.Types.ObjectId(filters.classId);
    if (filters.status && filters.status !== 'all') query.status = filters.status;

    const examFees = await StudentExamFee.find(query)
      .populate('studentId', 'fullName admissionNumber rollNumber')
      .populate('examId', 'name')
      .populate('classId', 'name')
      .sort({ examId: 1, classId: 1, status: 1 })
      .lean();

    const columns: ColumnDefinition[] = [
      { header: 'Exam', key: 'examName', width: 22 },
      { header: 'Admission #', key: 'admissionNumber', width: 16 },
      { header: 'Student Name', key: 'studentName', width: 24 },
      { header: 'Class', key: 'className', width: 14 },
      { header: 'Original Fee (PKR)', key: 'fee', width: 16 },
      { header: 'Discount (PKR)', key: 'discount', width: 14 },
      { header: 'Fine (PKR)', key: 'fine', width: 14 },
      { header: 'Net Payable (PKR)', key: 'netPayable', width: 16 },
      { header: 'Paid (PKR)', key: 'paid', width: 14 },
      { header: 'Remaining (PKR)', key: 'remaining', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Due Date', key: 'dueDate', width: 14 },
    ];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Exam Fees');
    styleWorksheet(worksheet, columns);

    examFees.forEach((ef: any) => {
      worksheet.addRow({
        examName: sanitizeCell(ef.examId?.name || ''),
        admissionNumber: sanitizeCell(ef.studentId?.admissionNumber || ''),
        studentName: sanitizeCell(ef.studentId?.fullName || ''),
        className: sanitizeCell(ef.classId?.name || ''),
        fee: (ef.originalAmount / 100).toFixed(2),
        discount: (ef.discountAmount / 100).toFixed(2),
        fine: (ef.fineAmount / 100).toFixed(2),
        netPayable: (ef.netPayable / 100).toFixed(2),
        paid: (ef.amountPaid / 100).toFixed(2),
        remaining: (ef.remainingBalance / 100).toFixed(2),
        status: ef.status.toUpperCase(),
        dueDate: formatDateOnly(ef.dueDate),
      });
    });

    const fileName = `Exam_Fees_Report_${formatDateOnly(new Date())}.${format}`;
    const buffer = format === 'csv'
      ? Buffer.from(await workbook.csv.writeBuffer())
      : Buffer.from(await workbook.xlsx.writeBuffer());

    return {
      buffer,
      fileName,
      recordCount: examFees.length,
      format,
      filtersSummary: `Exam Fees (${filters.status || 'All Statuses'})`,
    };
  }

  /**
   * 5. Download Pre-filled Marks Entry Sheet (Section 26 & Section 72 of Prompt).
   * Teachers only fill Obtained Marks and Absent.
   */
  static async exportMarksEntrySheet(tenantDb: mongoose.Connection | undefined, tenantId: string,
    params: {
      examId: string;
      classId?: string;
      sectionId?: string;
      subjectId: string;
    },
    format: 'xlsx' | 'csv' = 'xlsx'
  ): Promise<ExportResult> {
    const exam = await Exam.findOne({ _id: params.examId, tenantId }).lean();
    if (!exam) throw new Error('Exam not found');

    const subject = await Subject.findOne({ _id: params.subjectId, tenantId }).lean();
    if (!subject) throw new Error('Subject not found');

    // Find maxMarks configured on the exam for this subject
    const subjectConfig = (exam.subjects || []).find((s: any) => String(s.subjectId) === String(params.subjectId));
    const maxMarks = subjectConfig?.maxMarks ?? 100;
    const passMarks = subjectConfig?.passMarks ?? Math.round(maxMarks * 0.33);

    // Find enrolled students for this class / section / session
    const studentQuery: any = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      sessionId: exam.sessionId,
      classId: exam.classId,
      isActive: true,
      isArchived: false,
    };
    if (params.sectionId && mongoose.Types.ObjectId.isValid(params.sectionId)) {
      studentQuery.sectionId = new mongoose.Types.ObjectId(params.sectionId);
    }

    const students = await (Student as mongoose.Model<any>).find(studentQuery)
      .sort({ rollNumber: 1, fullName: 1 })
      .lean();

    // Fetch existing marks if any
    const existingMarks = await Mark.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      examId: exam._id,
      subjectId: subject._id,
    }).lean();

    const marksMap = new Map(existingMarks.map((m) => [String(m.studentId), m]));

    const columns: ColumnDefinition[] = [
      { header: 'Roll Number', key: 'rollNumber', width: 14, required: true },
      { header: 'Admission Number', key: 'admissionNumber', width: 18, required: true },
      { header: 'Student Name', key: 'fullName', width: 26, required: true },
      { header: 'Total Marks', key: 'totalMarks', width: 14, required: true },
      { header: 'Obtained Marks', key: 'obtainedMarks', width: 16, required: true, description: `Enter 0 to ${maxMarks}` },
      { header: 'Absent', key: 'absent', width: 12, description: 'Enter YES if absent, otherwise leave empty' },
    ];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Marks Entry');
    styleWorksheet(worksheet, columns);

    students.forEach((s: any) => {
      const existing = marksMap.get(String(s._id));
      worksheet.addRow({
        rollNumber: sanitizeCell(s.rollNumber || ''),
        admissionNumber: sanitizeCell(s.admissionNumber),
        fullName: sanitizeCell(s.fullName),
        totalMarks: maxMarks,
        obtainedMarks: existing && !existing.isAbsent ? existing.marksObtained : '',
        absent: existing?.isAbsent ? 'YES' : '',
      });
    });

    const safeExam = exam.name.replace(/\s+/g, '_');
    const safeSub = subject.name.replace(/\s+/g, '_');
    const fileName = `${safeExam}_${safeSub}_Marks_Sheet.${format}`;

    const buffer = format === 'csv'
      ? Buffer.from(await workbook.csv.writeBuffer())
      : Buffer.from(await workbook.xlsx.writeBuffer());

    return {
      buffer,
      fileName,
      recordCount: students.length,
      format,
      filtersSummary: `Exam: ${exam.name}, Subject: ${subject.name}, Max Marks: ${maxMarks}, Passing: ${passMarks}`,
    };
  }

  /**
   * 6. Export Results & Rankings (Class / Exam level).
   */
  static async exportResults(tenantDb: mongoose.Connection | undefined, tenantId: string,
    filters: {
      examId: string;
      classId?: string;
      sectionId?: string;
    },
    format: 'xlsx' | 'csv' = 'xlsx'
  ): Promise<ExportResult> {
    const exam = await Exam.findOne({ _id: filters.examId, tenantId }).populate('classId', 'name').lean();
    if (!exam) throw new Error('Exam not found');

    const marks = await Mark.find({ tenantId, examId: exam._id })
      .populate('studentId', 'fullName admissionNumber rollNumber')
      .populate('subjectId', 'name code')
      .lean();

    // Group marks by student
    const studentMap = new Map<string, {
      student: any;
      marks: { subject: string; obtained: number; isAbsent: boolean }[];
      totalObtained: number;
    }>();

    for (const m of marks) {
      const sId = String(m.studentId?._id || m.studentId);
      if (!studentMap.has(sId)) {
        studentMap.set(sId, { student: m.studentId, marks: [], totalObtained: 0 });
      }
      const entry = studentMap.get(sId)!;
      const val = m.isAbsent ? 0 : m.marksObtained;
      entry.marks.push({ subject: (m.subjectId as any)?.name || 'Subject', obtained: val, isAbsent: Boolean(m.isAbsent) });
      entry.totalObtained += val;
    }

    const totalMax = (exam.subjects || []).reduce((acc: number, s: any) => acc + (s.maxMarks || 100), 0);

    // Compute percentage and sort by position
    const rows = Array.from(studentMap.values()).map((item) => {
      const pct = totalMax > 0 ? (item.totalObtained / totalMax) * 100 : 0;
      let grade = 'F';
      if (pct >= 80) grade = 'A+';
      else if (pct >= 70) grade = 'A';
      else if (pct >= 60) grade = 'B';
      else if (pct >= 50) grade = 'C';
      else if (pct >= 40) grade = 'D';
      return {
        ...item,
        percentage: pct,
        grade,
        passed: pct >= 33,
      };
    }).sort((a, b) => b.totalObtained - a.totalObtained);

    const columns: ColumnDefinition[] = [
      { header: 'Position / Rank', key: 'rank', width: 16 },
      { header: 'Roll Number', key: 'rollNumber', width: 14 },
      { header: 'Admission Number', key: 'admissionNumber', width: 18 },
      { header: 'Student Name', key: 'fullName', width: 26 },
      { header: 'Total Marks', key: 'totalMax', width: 14 },
      { header: 'Obtained Marks', key: 'totalObtained', width: 16 },
      { header: 'Percentage', key: 'percentage', width: 14 },
      { header: 'Grade', key: 'grade', width: 12 },
      { header: 'Result Status', key: 'status', width: 14 },
    ];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Exam Results');
    styleWorksheet(worksheet, columns);

    rows.forEach((r, idx) => {
      worksheet.addRow({
        rank: idx + 1,
        rollNumber: sanitizeCell(r.student?.rollNumber || ''),
        admissionNumber: sanitizeCell(r.student?.admissionNumber || ''),
        fullName: sanitizeCell(r.student?.fullName || ''),
        totalMax,
        totalObtained: r.totalObtained,
        percentage: `${r.percentage.toFixed(2)}%`,
        grade: r.grade,
        status: r.passed ? 'PASSED' : 'FAILED',
      });
    });

    const fileName = `${exam.name.replace(/\s+/g, '_')}_Results.${format}`;
    const buffer = format === 'csv'
      ? Buffer.from(await workbook.csv.writeBuffer())
      : Buffer.from(await workbook.xlsx.writeBuffer());

    return {
      buffer,
      fileName,
      recordCount: rows.length,
      format,
      filtersSummary: `Exam: ${exam.name}, Total Assessed: ${rows.length}`,
    };
  }

  /**
   * 7. Export Student Attendance Records.
   */
  static async exportAttendance(tenantDb: mongoose.Connection | undefined, tenantId: string,
    filters: {
      startDate?: string;
      endDate?: string;
      classId?: string;
      sectionId?: string;
      status?: string;
    },
    format: 'xlsx' | 'csv' = 'xlsx'
  ): Promise<ExportResult> {
    const query: any = { tenantId: new mongoose.Types.ObjectId(tenantId) };
    if (filters.classId && mongoose.Types.ObjectId.isValid(filters.classId)) query.classId = new mongoose.Types.ObjectId(filters.classId);
    if (filters.sectionId && mongoose.Types.ObjectId.isValid(filters.sectionId)) query.sectionId = new mongoose.Types.ObjectId(filters.sectionId);
    if (filters.status && filters.status !== 'all') query.status = filters.status;

    if (filters.startDate || filters.endDate) {
      query.attendanceDate = {};
      if (filters.startDate) query.attendanceDate.$gte = new Date(filters.startDate);
      if (filters.endDate) query.attendanceDate.$lte = new Date(filters.endDate);
    }

    const records = await StudentAttendance.find(query)
      .populate('studentId', 'fullName admissionNumber rollNumber')
      .populate('classId', 'name')
      .populate('sectionId', 'name')
      .sort({ attendanceDate: -1, classId: 1, sectionId: 1 })
      .lean();

    const columns: ColumnDefinition[] = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Admission #', key: 'admissionNumber', width: 16 },
      { header: 'Roll #', key: 'rollNumber', width: 12 },
      { header: 'Student Name', key: 'studentName', width: 24 },
      { header: 'Class', key: 'className', width: 14 },
      { header: 'Section', key: 'sectionName', width: 12 },
      { header: 'Status', key: 'status', width: 14 },
    ];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance');
    styleWorksheet(worksheet, columns);

    records.forEach((r: any) => {
      worksheet.addRow({
        date: formatDateOnly(r.attendanceDate),
        admissionNumber: sanitizeCell(r.studentId?.admissionNumber || ''),
        rollNumber: sanitizeCell(r.studentId?.rollNumber || ''),
        studentName: sanitizeCell(r.studentId?.fullName || ''),
        className: sanitizeCell(r.classId?.name || ''),
        sectionName: sanitizeCell(r.sectionId?.name || ''),
        status: r.status.toUpperCase(),
      });
    });

    const fileName = `Student_Attendance_${formatDateOnly(new Date())}.${format}`;
    const buffer = format === 'csv'
      ? Buffer.from(await workbook.csv.writeBuffer())
      : Buffer.from(await workbook.xlsx.writeBuffer());

    return {
      buffer,
      fileName,
      recordCount: records.length,
      format,
      filtersSummary: `Attendance Export (${records.length} records)`,
    };
  }

  /**
   * 8. Export Academic Setup (Sessions, Classes, Sections, Subjects).
   */
  static async exportAcademicSetup(tenantDb: mongoose.Connection | undefined, tenantId: string,
    format: 'xlsx' | 'csv' = 'xlsx'
  ): Promise<ExportResult> {
    const tId = new mongoose.Types.ObjectId(tenantId);
    const [sessions, classes, sections, subjects] = await Promise.all([
      AcademicSession.find({ tenantId: tId }).sort({ startDate: -1 }).lean(),
      Class.find({ tenantId: tId }).sort({ order: 1, name: 1 }).lean(),
      Section.find({ tenantId: tId }).populate('classId', 'name').sort({ name: 1 }).lean(),
      Subject.find({ tenantId: tId }).populate('classIds', 'name').sort({ name: 1 }).lean(),
    ]);

    const workbook = new ExcelJS.Workbook();

    // Classes sheet
    const classSheet = workbook.addWorksheet('Classes');
    styleWorksheet(classSheet, [
      { header: 'Class Name', key: 'name', width: 22 },
      { header: 'Code', key: 'code', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
    ]);
    classes.forEach((c: any) => {
      classSheet.addRow({
        name: sanitizeCell(c.name),
        code: sanitizeCell(c.code || ''),
        status: c.isActive ? 'Active' : 'Inactive',
      });
    });

    // Sections sheet
    const secSheet = workbook.addWorksheet('Sections');
    styleWorksheet(secSheet, [
      { header: 'Class Name', key: 'className', width: 22 },
      { header: 'Section Name', key: 'name', width: 16 },
      { header: 'Capacity', key: 'capacity', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
    ]);
    sections.forEach((s: any) => {
      secSheet.addRow({
        className: sanitizeCell((s.classId as any)?.name || ''),
        name: sanitizeCell(s.name),
        capacity: s.capacity || 40,
        status: s.isActive ? 'Active' : 'Inactive',
      });
    });

    // Subjects sheet
    const subSheet = workbook.addWorksheet('Subjects');
    styleWorksheet(subSheet, [
      { header: 'Subject Name', key: 'name', width: 24 },
      { header: 'Subject Code', key: 'code', width: 14 },
      { header: 'Class Names', key: 'className', width: 24 },
      { header: 'Status', key: 'status', width: 14 },
    ]);
    subjects.forEach((sb: any) => {
      const classNames = Array.isArray(sb.classIds)
        ? sb.classIds.map((c: any) => (typeof c === 'object' && c?.name ? c.name : String(c))).filter(Boolean).join(', ')
        : '';
      subSheet.addRow({
        name: sanitizeCell(sb.name),
        code: sanitizeCell(sb.code || ''),
        className: sanitizeCell(classNames),
        status: sb.isActive ? 'Active' : 'Inactive',
      });
    });

    const fileName = `Academic_Setup_${formatDateOnly(new Date())}.${format}`;
    const buffer = format === 'csv'
      ? Buffer.from(await workbook.csv.writeBuffer())
      : Buffer.from(await workbook.xlsx.writeBuffer());

    return {
      buffer,
      fileName,
      recordCount: classes.length + sections.length + subjects.length,
      format,
      filtersSummary: `Academic Setup: ${classes.length} Classes, ${sections.length} Sections, ${subjects.length} Subjects`,
    };
  }
}
