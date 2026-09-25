const fs = require('fs');
let content = fs.readFileSync('src/services/academic.service.ts', 'utf8');

const models = ['AcademicSession', 'Class', 'Section', 'Subject', 'Student', 'Teacher', 'User', 'Role'];
for (const m of models) {
  content = content.replace(new RegExp('import \\{ ' + m + '(, [^}]+)? \\} from \\\'\\.\\.\\/models\\/' + m + '\\\';\\n?', 'g'), '');
}
content = 'import { getTenantModels } from \'./TenantModelRegistry\';\n' + content;

content = content.replace(/export async function requireSession\(\n  sessionId: string,\n  requireActive: boolean = false,\n  tenantId: mongoose.Types.ObjectId\n\) \{/, 'export async function requireSession(sessionId: string, requireActive: boolean, tenantId: mongoose.Types.ObjectId, tenantDb: mongoose.Connection) {\n  const { AcademicSession } = getTenantModels(tenantDb);');

content = content.replace(/export async function requireClass\(classId: string, tenantId: mongoose.Types.ObjectId\) \{/, 'export async function requireClass(classId: string, tenantId: mongoose.Types.ObjectId, tenantDb: mongoose.Connection) {\n  const { Class } = getTenantModels(tenantDb);');

content = content.replace(/export async function requireSection\(sectionId: string, classId: string, tenantId: mongoose.Types.ObjectId\) \{/, 'export async function requireSection(sectionId: string, classId: string, tenantId: mongoose.Types.ObjectId, tenantDb: mongoose.Connection) {\n  const { Section } = getTenantModels(tenantDb);');

content = content.replace(/export async function requireTeachingStaff\(staffId: string, tenantId: mongoose.Types.ObjectId\) \{/, 'export async function requireTeachingStaff(staffId: string, tenantId: mongoose.Types.ObjectId, tenantDb: mongoose.Connection) {\n  const { Teacher } = getTenantModels(tenantDb);');

content = content.replace(/export async function requireSubject\(subjectId: string, tenantId: mongoose.Types.ObjectId\) \{/, 'export async function requireSubject(subjectId: string, tenantId: mongoose.Types.ObjectId, tenantDb: mongoose.Connection) {\n  const { Subject } = getTenantModels(tenantDb);');

content = content.replace(/export async function ensureValidIds\(\n  ids: string\[\],\n  model: mongoose.Model<mongoose.Document>,\n  tenantId: mongoose.Types.ObjectId,\n  label: string\n\) \{/, 'export async function ensureValidIds(ids: string[], model: any, tenantId: mongoose.Types.ObjectId, label: string) {');

content = content.replace(/export async function ensureClassesInSession\(classIds: string\[\], sessionId: string, tenantId: mongoose.Types.ObjectId\) \{/, 'export async function ensureClassesInSession(classIds: string[], sessionId: string, tenantId: mongoose.Types.ObjectId, tenantDb: mongoose.Connection) {\n  const { Class } = getTenantModels(tenantDb);');

content = content.replace(/export async function ensureSubjectsInClass\(subjectIds: string\[\], classId: string, tenantId: mongoose.Types.ObjectId\) \{/, 'export async function ensureSubjectsInClass(subjectIds: string[], classId: string, tenantId: mongoose.Types.ObjectId, tenantDb: mongoose.Connection) {\n  const { Subject } = getTenantModels(tenantDb);');

content = content.replace(/export async function resolveUserLink\(\n  userId: string,\n  tenantId: mongoose.Types.ObjectId,\n  type: 'student' \| 'staff'\n\) \{/, 'export async function resolveUserLink(userId: string, tenantId: mongoose.Types.ObjectId, type: \'student\' | \'staff\', tenantDb: mongoose.Connection) {\n  const { User, Role, Student, Teacher } = getTenantModels(tenantDb);');

content = content.replace(/export async function applyLinkOperation\(\n  tenantId: mongoose.Types.ObjectId,\n  updateFn: \(\) => Promise<any>\n\) \{/, 'export async function applyLinkOperation(tenantId: mongoose.Types.ObjectId, updateFn: () => Promise<any>) {');

fs.writeFileSync('src/services/academic.service.ts', content);
