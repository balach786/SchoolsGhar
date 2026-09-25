import fs from 'fs';
import path from 'path';

function refactorStaffController() {
  const file = path.resolve(process.cwd(), 'src/controllers/staff.controller.ts');
  let content = fs.readFileSync(file, 'utf8');

  // Add getTenantModels import
  if (!content.includes('getTenantModels')) {
    content = content.replace(
      "import { Staff, publicStaff } from '../models/Staff';",
      "import { publicStaff } from '../models/Staff';\nimport { getTenantModels } from '../services/TenantModelRegistry';"
    );
  }

  // Remove global imports
  content = content.replace(/import \{ Staff, IStaff, publicStaff \} from '\.\.\/models\/Staff';/, "import { IStaff, publicStaff } from '../models/Staff';\nimport { getTenantModels } from '../services/TenantModelRegistry';");
  content = content.replace(/import \{ User \} from '\.\.\/models\/User';/, '');
  content = content.replace(/import \{ Role \} from '\.\.\/models\/Role';/, '');

  // Add standard injection to all functions
  const functionsToInject = [
    'listStaff',
    'getStaff',
    'createStaff',
    'updateStaff',
    'archiveStaff',
    'restoreStaff',
  ];

  functionsToInject.forEach(fn => {
    const regex = new RegExp(`(export const ${fn} = asyncHandler\\(async \\(req: AuthRequest, res: Response\\) => \\{\n)`);
    content = content.replace(regex, `$1  if (!req.tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');\n  const { Staff, User, Role } = getTenantModels(req.tenantDb);\n`);
  });

  fs.writeFileSync(file, content, 'utf8');
}

refactorStaffController();
console.log('Staff controller refactored');
