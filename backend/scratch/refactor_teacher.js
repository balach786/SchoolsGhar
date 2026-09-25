import fs from 'fs';
import path from 'path';

function refactorTeacherController() {
  const file = path.resolve(process.cwd(), 'src/controllers/teacher.controller.ts');
  let content = fs.readFileSync(file, 'utf8');

  // Replace global imports
  content = content.replace(
    "import { Teacher, publicTeacher } from '../models/Teacher';",
    "import { publicTeacher } from '../models/Teacher';\nimport { getTenantModels } from '../services/TenantModelRegistry';"
  );
  content = content.replace(/import \{ Staff \} from '\.\.\/models\/Staff';\n/, '');
  content = content.replace(/import \{ Class \} from '\.\.\/models\/Class';\n/, '');
  content = content.replace(/import \{ Subject \} from '\.\.\/models\/Subject';\n/, '');
  content = content.replace(/import \{ User \} from '\.\.\/models\/User';\n/, '');
  content = content.replace(/import \{ Role \} from '\.\.\/models\/Role';\n/, '');
  content = content.replace(/import \{ AcademicSession \} from '\.\.\/models\/AcademicSession';\n/, '');

  // Add standard injection to all functions
  const functionsToInject = [
    'listTeachers',
    'getTeacher',
    'createTeacher',
    'updateTeacher',
    'archiveTeacher',
    'restoreTeacher',
    'getTeacherClasses',
    'getTeacherSubjects',
  ];

  functionsToInject.forEach(fn => {
    const regex = new RegExp(`(export const ${fn} = asyncHandler\\(async \\(req: AuthRequest, res: Response\\) => \\{\n)`);
    content = content.replace(regex, `$1  if (!req.tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');\n  const { Teacher, Staff, User, Role, Class, Subject, AcademicSession } = getTenantModels(req.tenantDb);\n`);
  });

  // Also refactor getOwnProfile
  const regexGetOwnProfile = /(export const getOwnProfile = asyncHandler\(async \(req: AuthRequest, res: Response\) => \{\n)/;
  content = content.replace(regexGetOwnProfile, `$1  if (!req.tenantDb) throw new ApiError(500, 'Tenant database connection missing', 'TENANT_DB_MISSING');\n`);

  fs.writeFileSync(file, content, 'utf8');
}

refactorTeacherController();
console.log('Teacher controller refactored');
