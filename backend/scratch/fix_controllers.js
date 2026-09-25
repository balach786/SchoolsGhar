import fs from 'fs';
import path from 'path';

function fixStudentController() {
  const file = path.resolve(process.cwd(), 'src/controllers/student.controller.ts');
  let content = fs.readFileSync(file, 'utf8');

  // remove duplicate imports
  content = content.replace(/(import \{ getTenantModels \} from '\.\.\/services\/TenantModelRegistry';\n)+/g, "import { getTenantModels } from '../services/TenantModelRegistry';\n");

  // fix resolveContext
  content = content.replace(/async function resolveContext\(students:/g, 'async function resolveContext(tenantDb: mongoose.Connection, students:');
  content = content.replace(/const \[sessions, classes, sections\] = await Promise\.all\(\[/g, 'const { AcademicSession, Class, Section } = getTenantModels(tenantDb);\n  const [sessions, classes, sections] = await Promise.all([');

  // fix assertRollNumberFree
  content = content.replace(/async function assertRollNumberFree\(\n  rollNumber: string,\n  sessionId: string,\n  classId: string,\n  sectionId\?: string,\n  tenantId\?: unknown,\n  excludeStudentId\?: string\n\) \{/g, `async function assertRollNumberFree(
  tenantDb: mongoose.Connection,
  rollNumber: string,
  sessionId: string,
  classId: string,
  sectionId?: string,
  tenantId?: unknown,
  excludeStudentId?: string
) {
  const { Student } = getTenantModels(tenantDb);`);

  // inject tenantDb into calls of resolveContext
  content = content.replace(/resolveContext\(/g, 'resolveContext(req.tenantDb!, ');

  // inject tenantDb into calls of assertRollNumberFree
  content = content.replace(/assertRollNumberFree\(/g, 'assertRollNumberFree(req.tenantDb!, ');

  fs.writeFileSync(file, content, 'utf8');
}

function fixSectionController() {
  const file = path.resolve(process.cwd(), 'src/controllers/section.controller.ts');
  let content = fs.readFileSync(file, 'utf8');

  // remove duplicate imports
  content = content.replace(/(import \{ getTenantModels \} from '\.\.\/services\/TenantModelRegistry';\n)+/g, "import { getTenantModels } from '../services/TenantModelRegistry';\n");

  fs.writeFileSync(file, content, 'utf8');
}

function fixClassController() {
  const file = path.resolve(process.cwd(), 'src/controllers/class.controller.ts');
  let content = fs.readFileSync(file, 'utf8');

  // remove duplicate imports
  content = content.replace(/(import \{ getTenantModels \} from '\.\.\/services\/TenantModelRegistry';\n)+/g, "import { getTenantModels } from '../services/TenantModelRegistry';\n");

  fs.writeFileSync(file, content, 'utf8');
}

fixStudentController();
fixSectionController();
fixClassController();
console.log('Fixed controllers');
