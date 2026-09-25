import fs from 'fs';
import path from 'path';

const file = path.resolve(process.cwd(), 'src/services/academic.service.ts');
let content = fs.readFileSync(file, 'utf8');

// Replace function signatures and model references
content = content.replace(
  /export async function requireSession\(\s*id: string,\s*allowArchived = false,\s*tenantId\?: string \| mongoose\.Types\.ObjectId,\s*mongoSession\?: mongoose\.ClientSession\s*\) \{/g,
  `export async function requireSession(
  id: string,
  tenantDb: mongoose.Connection,
  allowArchived = false,
  tenantId?: string | mongoose.Types.ObjectId,
  mongoSession?: mongoose.ClientSession
) {
  const models = getTenantModels(tenantDb);`
).replace(
  /let q = AcademicSession\.findOne\(query\);/g,
  `let q = models.AcademicSession.findOne(query);`
);

content = content.replace(
  /export async function requireClass\(\s*id: string,\s*tenantId\?: string \| mongoose\.Types\.ObjectId,\s*mongoSession\?: mongoose\.ClientSession\s*\) \{/g,
  `export async function requireClass(
  id: string,
  tenantDb: mongoose.Connection,
  tenantId?: string | mongoose.Types.ObjectId,
  mongoSession?: mongoose.ClientSession
) {
  const models = getTenantModels(tenantDb);`
).replace(
  /let q = Class\.findOne\(query\);/g,
  `let q = models.Class.findOne(query);`
);

content = content.replace(
  /export async function requireSection\(\s*id: string,\s*tenantId\?: string \| mongoose\.Types\.ObjectId,\s*mongoSession\?: mongoose\.ClientSession\s*\) \{/g,
  `export async function requireSection(
  id: string,
  tenantDb: mongoose.Connection,
  tenantId?: string | mongoose.Types.ObjectId,
  mongoSession?: mongoose.ClientSession
) {
  const models = getTenantModels(tenantDb);`
).replace(
  /let q = Section\.findOne\(query\);/g,
  `let q = models.Section.findOne(query);`
);

content = content.replace(
  /export async function requireSectionOfClass\(\s*sectionId: string,\s*classId: string,\s*tenantId\?: string \| mongoose\.Types\.ObjectId,\s*mongoSession\?: mongoose\.ClientSession\s*\) \{/g,
  `export async function requireSectionOfClass(
  sectionId: string,
  classId: string,
  tenantDb: mongoose.Connection,
  tenantId?: string | mongoose.Types.ObjectId,
  mongoSession?: mongoose.ClientSession
) {
  const section = await requireSection(sectionId, tenantDb, tenantId, mongoSession);`
).replace(
  /const section = await requireSection\(sectionId, tenantId, mongoSession\);/g,
  ``
);

content = content.replace(
  /export async function requireTeachingStaff\(\s*id: string,\s*tenantId\?: string \| mongoose\.Types\.ObjectId,\s*allowInactive = false\s*\) \{/g,
  `export async function requireTeachingStaff(
  id: string,
  tenantDb: mongoose.Connection,
  tenantId?: string | mongoose.Types.ObjectId,
  allowInactive = false
) {
  const models = getTenantModels(tenantDb);`
).replace(
  /const staff = await Staff\.findOne\(query\);/g,
  `const staff = await models.Staff.findOne(query);`
);

content = content.replace(
  /export async function requireTeacher\(id: string, allowInactive = false, tenantId\?: string \| mongoose\.Types\.ObjectId\) \{/g,
  `export async function requireTeacher(id: string, tenantDb: mongoose.Connection, allowInactive = false, tenantId?: string | mongoose.Types.ObjectId) {`
).replace(
  /return requireTeachingStaff\(id, tenantId, allowInactive\);/g,
  `return requireTeachingStaff(id, tenantDb, tenantId, allowInactive);`
);

content = content.replace(
  /export async function requireSubject\(id: string, tenantId\?: string \| mongoose\.Types\.ObjectId\) \{/g,
  `export async function requireSubject(id: string, tenantDb: mongoose.Connection, tenantId?: string | mongoose.Types.ObjectId) {
  const models = getTenantModels(tenantDb);`
).replace(
  /const doc = await Subject\.findOne\(query\);/g,
  `const doc = await models.Subject.findOne(query);`
);

content = content.replace(
  /export async function ensureClassesInSession\(classIds: string\[\], sessionId: string, tenantId\?: string \| mongoose\.Types\.ObjectId\) \{/g,
  `export async function ensureClassesInSession(classIds: string[], sessionId: string, tenantDb: mongoose.Connection, tenantId?: string | mongoose.Types.ObjectId) {
  const models = getTenantModels(tenantDb);`
).replace(
  /const docs = await Class\.find\(query\)/g,
  `const docs = await models.Class.find(query)`
);

content = content.replace(
  /export async function ensureSubjectsInSession\(subjectIds: string\[\], sessionId: string, classId\?: string\) \{/g,
  `export async function ensureSubjectsInSession(subjectIds: string[], sessionId: string, tenantDb: mongoose.Connection, classId?: string) {
  const models = getTenantModels(tenantDb);`
).replace(
  /const docs = await Subject\.find\(\{ _id: \{ \$in: unique \} \}\)/g,
  `const docs = await models.Subject.find({ _id: { $in: unique } })`
);

content = content.replace(
  /export async function requireUserLink\([\s\S]*?tenantId\?: string \| mongoose\.Types\.ObjectId,[\s\S]*?session\?: mongoose\.ClientSession[\s\S]*?\) {/g,
  `export async function requireUserLink(
  userId: string | null | undefined,
  expectedRole: 'student' | 'teacher' | 'staff' | string,
  tenantDb: mongoose.Connection,
  excludeProfileId?: string,
  tenantId?: string | mongoose.Types.ObjectId,
  session?: mongoose.ClientSession
): Promise<mongoose.Types.ObjectId | undefined> {
  const models = getTenantModels(tenantDb);`
);

content = content.replace(
  /let userQuery = User\.findOne\(query\)/g,
  `let userQuery = models.User.findOne(query)`
).replace(
  /let roleQuery = Role\.findById\(user\.roleId\)/g,
  `let roleQuery = models.Role.findById(user.roleId)`
).replace(
  /let studentCheck = Student\.findOne/g,
  `let studentCheck = models.Student.findOne`
).replace(
  /let staffCheck = Staff\.findOne/g,
  `let staffCheck = models.Staff.findOne`
);

fs.writeFileSync(file, content, 'utf8');
console.log('academic.service.ts refactored');
