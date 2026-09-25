import fs from 'fs';
import path from 'path';

const file = path.resolve(process.cwd(), 'src/controllers/class.controller.ts');
let content = fs.readFileSync(file, 'utf8');

// 1. Import getTenantModels
if (!content.includes('getTenantModels')) {
  content = content.replace(/import \{ Class/g, "import { getTenantModels } from '../services/TenantModelRegistry';\nimport { Class");
}

// 2. Remove or alias the global imports so we don't accidentally use them for CRUD
// We might need the global types if they are used as types, but usually they are used as values.
// Actually, it's safer to just inject `const models = getTenantModels(req.tenantDb!);` at the top of each handler and change the usages.
// Let's use `const { Class, Section, AcademicSession, Staff, Subject, Student } = getTenantModels(req.tenantDb!);`
// But wait, the handlers might not have `req.tenantDb!` if they don't have `req`.
// All handlers in `class.controller.ts` are `asyncHandler(async (req, res) => { ... })`.

content = content.replace(/export const ([\w]+) = asyncHandler\(async \(req(: AuthRequest)?,\s*res(: Response)?\) => \{/g, 
  `export const $1 = asyncHandler(async (req$2, res$3) => {
  if (!req.tenantDb) throw ApiError.internal('Tenant database connection missing');
  const { Class, Section, AcademicSession, Staff, Subject, Student } = getTenantModels(req.tenantDb);`
);

fs.writeFileSync(file, content, 'utf8');
console.log('class.controller.ts rewritten');
