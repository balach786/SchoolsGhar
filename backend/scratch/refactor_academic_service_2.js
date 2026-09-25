import fs from 'fs';
import path from 'path';

const file = path.resolve(process.cwd(), 'src/services/academic.service.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /export async function requireSession\(\s*id: string,\s*tenantDb: mongoose\.Connection,\s*allowArchived = false,\s*tenantId\?: string \| mongoose\.Types\.ObjectId,\s*mongoSession\?: mongoose\.ClientSession\s*\) \{/g,
  `export async function requireSession(
  id: string,
  allowArchived = false,
  tenantId?: string | mongoose.Types.ObjectId,
  mongoSession?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
) {`
).replace(
  /let q = models\.AcademicSession\.findOne\(query\);/g,
  `const models = tenantDb ? getTenantModels(tenantDb) : { AcademicSession, Class, Section, Subject, Staff, Student, Role, User };\n  let q = models.AcademicSession.findOne(query);`
);

content = content.replace(
  /export async function requireClass\(\s*id: string,\s*tenantDb: mongoose\.Connection,\s*tenantId\?: string \| mongoose\.Types\.ObjectId,\s*mongoSession\?: mongoose\.ClientSession\s*\) \{/g,
  `export async function requireClass(
  id: string,
  tenantId?: string | mongoose.Types.ObjectId,
  mongoSession?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
) {`
).replace(
  /let q = models\.Class\.findOne\(query\);/g,
  `const models = tenantDb ? getTenantModels(tenantDb) : { AcademicSession, Class, Section, Subject, Staff, Student, Role, User };\n  let q = models.Class.findOne(query);`
);

content = content.replace(
  /export async function requireSection\(\s*id: string,\s*tenantDb: mongoose\.Connection,\s*tenantId\?: string \| mongoose\.Types\.ObjectId,\s*mongoSession\?: mongoose\.ClientSession\s*\) \{/g,
  `export async function requireSection(
  id: string,
  tenantId?: string | mongoose.Types.ObjectId,
  mongoSession?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
) {`
).replace(
  /let q = models\.Section\.findOne\(query\);/g,
  `const models = tenantDb ? getTenantModels(tenantDb) : { AcademicSession, Class, Section, Subject, Staff, Student, Role, User };\n  let q = models.Section.findOne(query);`
);

content = content.replace(
  /export async function requireSectionOfClass\(\s*sectionId: string,\s*classId: string,\s*tenantDb: mongoose\.Connection,\s*tenantId\?: string \| mongoose\.Types\.ObjectId,\s*mongoSession\?: mongoose\.ClientSession\s*\) \{/g,
  `export async function requireSectionOfClass(
  sectionId: string,
  classId: string,
  tenantId?: string | mongoose.Types.ObjectId,
  mongoSession?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
) {
  const section = await requireSection(sectionId, tenantId, mongoSession, tenantDb);`
);

content = content.replace(
  /export async function requireTeachingStaff\(\s*id: string,\s*tenantDb: mongoose\.Connection,\s*tenantId\?: string \| mongoose\.Types\.ObjectId,\s*allowInactive = false\s*\) \{/g,
  `export async function requireTeachingStaff(
  id: string,
  tenantId?: string | mongoose.Types.ObjectId,
  allowInactive = false,
  tenantDb?: mongoose.Connection
) {`
).replace(
  /const staff = await models\.Staff\.findOne\(query\);/g,
  `const models = tenantDb ? getTenantModels(tenantDb) : { AcademicSession, Class, Section, Subject, Staff, Student, Role, User };\n  const staff = await models.Staff.findOne(query);`
);

content = content.replace(
  /export async function requireTeacher\(id: string, tenantDb: mongoose\.Connection, allowInactive = false, tenantId\?: string \| mongoose\.Types\.ObjectId\) \{/g,
  `export async function requireTeacher(id: string, allowInactive = false, tenantId?: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection) {`
).replace(
  /return requireTeachingStaff\(id, tenantDb, tenantId, allowInactive\);/g,
  `return requireTeachingStaff(id, tenantId, allowInactive, tenantDb);`
);

content = content.replace(
  /export async function requireSubject\(id: string, tenantDb: mongoose\.Connection, tenantId\?: string \| mongoose\.Types\.ObjectId\) \{/g,
  `export async function requireSubject(id: string, tenantId?: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection) {`
).replace(
  /const doc = await models\.Subject\.findOne\(query\);/g,
  `const models = tenantDb ? getTenantModels(tenantDb) : { AcademicSession, Class, Section, Subject, Staff, Student, Role, User };\n  const doc = await models.Subject.findOne(query);`
);

content = content.replace(
  /export async function ensureClassesInSession\(classIds: string\[\], sessionId: string, tenantDb: mongoose\.Connection, tenantId\?: string \| mongoose\.Types\.ObjectId\) \{/g,
  `export async function ensureClassesInSession(classIds: string[], sessionId: string, tenantId?: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection) {`
).replace(
  /const docs = await models\.Class\.find\(query\)/g,
  `const models = tenantDb ? getTenantModels(tenantDb) : { AcademicSession, Class, Section, Subject, Staff, Student, Role, User };\n  const docs = await models.Class.find(query)`
);

content = content.replace(
  /export async function ensureSubjectsInSession\(subjectIds: string\[\], sessionId: string, tenantDb: mongoose\.Connection, classId\?: string\) \{/g,
  `export async function ensureSubjectsInSession(subjectIds: string[], sessionId: string, classId?: string, tenantDb?: mongoose.Connection) {`
).replace(
  /const docs = await models\.Subject\.find\(\{ _id: \{ \$in: unique \} \}\)/g,
  `const models = tenantDb ? getTenantModels(tenantDb) : { AcademicSession, Class, Section, Subject, Staff, Student, Role, User };\n  const docs = await models.Subject.find({ _id: { $in: unique } })`
);

content = content.replace(
  /export async function requireUserLink\(\s*userId: string \| null \| undefined,\s*expectedRole: 'student' \| 'teacher' \| 'staff' \| string,\s*tenantDb: mongoose\.Connection,\s*excludeProfileId\?: string,\s*tenantId\?: string \| mongoose\.Types\.ObjectId,\s*session\?: mongoose\.ClientSession\s*\): Promise<mongoose\.Types\.ObjectId \| undefined> \{\s*if \(\!userId\) return undefined;\s*const models = getTenantModels\(tenantDb\);/g,
  `export async function requireUserLink(
  userId: string | null | undefined,
  expectedRole: 'student' | 'teacher' | 'staff' | string,
  excludeProfileId?: string,
  tenantId?: string | mongoose.Types.ObjectId,
  session?: mongoose.ClientSession,
  tenantDb?: mongoose.Connection
): Promise<mongoose.Types.ObjectId | undefined> {
  if (!userId) return undefined;
  const models = tenantDb ? getTenantModels(tenantDb) : { AcademicSession, Class, Section, Subject, Staff, Student, Role, User };`
);

// We need to carefully remove duplicate `const models = getTenantModels(tenantDb);` lines if they exist.
content = content.replace(/const models = getTenantModels\(tenantDb\);\n  const models = tenantDb/g, 'const models = tenantDb');

fs.writeFileSync(file, content, 'utf8');
console.log('academic.service.ts refactored correctly');
