import fs from 'fs';
import path from 'path';

function refactorController(filename) {
  const file = path.resolve(process.cwd(), 'src/controllers', filename);
  let content = fs.readFileSync(file, 'utf8');

  // 1. Import getTenantModels
  if (!content.includes('getTenantModels')) {
    content = content.replace(/import \{ [\w]+ /g, (match) => `import { getTenantModels } from '../services/TenantModelRegistry';\n${match}`);
  }

  // 2. Inject `const models = getTenantModels(req.tenantDb);` at the top of each handler
  content = content.replace(/export const ([\w]+) = asyncHandler\(async \(req(: AuthRequest)?,\s*res(: Response)?\) => \{/g, 
    `export const $1 = asyncHandler(async (req$2, res$3) => {
  if (!req.tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');
  const { Class, Section, AcademicSession, Staff, Subject, Student, StudentHistory, ReceiptCounter, Role, User } = getTenantModels(req.tenantDb);`
  );

  fs.writeFileSync(file, content, 'utf8');
  console.log(`${filename} rewritten`);
}

refactorController('section.controller.ts');
refactorController('student.controller.ts');
