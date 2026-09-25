const fs = require('fs');
let content = fs.readFileSync('src/services/academicSession.service.ts', 'utf8');

content = content.replace(/import \{ AcademicSession, publicSession, normalizeSessionName, IAcademicSession \} from '\.\.\/models\/AcademicSession';/, 'import { publicSession, normalizeSessionName, IAcademicSession } from \'../models/AcademicSession\';');

const importsToRemove = ['SchoolSettings', 'Student', 'StudentHistory', 'Class', 'Section', 'Subject', 'StudentAttendance', 'TeacherAttendance', 'Timetable', 'FeeStructure', 'StudentFee', 'Payment', 'SalaryRecord', 'Exam', 'ExamSchedule', 'ExamFee', 'StudentExamFee', 'Mark', 'Result', 'Assignment', 'Expense', 'Income'];
for (const imp of importsToRemove) {
  content = content.replace(new RegExp('import \\{ ' + imp + ' \\} from \\\'\\.\\.\\/models\\/' + imp + '\\\';\\n?', 'g'), '');
}
content = content.replace(/import \{ Tenant \} from '\.\.\/models\/Tenant';\n/, 'import { Tenant } from \'../models/Tenant\';\n');

content = content.replace('export interface CreateCanonicalSessionParams {\n  tenantId', 'export interface CreateCanonicalSessionParams {\n  tenantDb: mongoose.Connection;\n  tenantId');

content = content.replace('export async function createCanonicalSession(params: CreateCanonicalSessionParams): Promise<IAcademicSession> {\n  const { tenantId, name, makeActive, createdBy, userAuditContext, mongoSession } = params;', 'export async function createCanonicalSession(params: CreateCanonicalSessionParams): Promise<IAcademicSession> {\n  const { tenantDb, tenantId, name, makeActive, createdBy, userAuditContext, mongoSession } = params;\n  const { AcademicSession, SchoolSettings } = getTenantModels(tenantDb);');

content = content.replace('export async function activateCanonicalSession(\n  tenantId: mongoose.Types.ObjectId | string,\n  sessionId: string | mongoose.Types.ObjectId,\n  userAuditContext?: any\n): Promise<IAcademicSession> {', 'export async function activateCanonicalSession(\n  tenantId: mongoose.Types.ObjectId | string,\n  sessionId: string | mongoose.Types.ObjectId,\n  userAuditContext: any,\n  tenantDb: mongoose.Connection\n): Promise<IAcademicSession> {\n  const { AcademicSession, SchoolSettings } = getTenantModels(tenantDb);');

content = content.replace('export async function archiveCanonicalSession(\n  tenantId: mongoose.Types.ObjectId | string,\n  sessionId: string | mongoose.Types.ObjectId,\n  restore: boolean,\n  userAuditContext?: any\n): Promise<IAcademicSession> {', 'export async function archiveCanonicalSession(\n  tenantId: mongoose.Types.ObjectId | string,\n  sessionId: string | mongoose.Types.ObjectId,\n  restore: boolean,\n  userAuditContext: any,\n  tenantDb: mongoose.Connection\n): Promise<IAcademicSession> {\n  const { AcademicSession } = getTenantModels(tenantDb);');

content = content.replace('const { Expense, Income } = getTenantModels(tenantDb);', 'const { AcademicSession, SchoolSettings, Expense, Income, Student, StudentHistory, Class, Section, Subject, StudentAttendance, TeacherAttendance, Timetable, FeeStructure, StudentFee, Payment, SalaryRecord, Exam, ExamSchedule, ExamFee, StudentExamFee, Mark, Result, Assignment } = getTenantModels(tenantDb);');

fs.writeFileSync('src/services/academicSession.service.ts', content);
