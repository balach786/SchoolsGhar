import fs from 'fs';
import path from 'path';

function fixDuplicates(filename) {
  const file = path.resolve(process.cwd(), 'src/controllers', filename);
  let content = fs.readFileSync(file, 'utf8');

  // remove all getTenantModels imports
  content = content.replace(/import \{ getTenantModels \} from '\.\.\/services\/TenantModelRegistry';\r?\n/g, "");

  // add exactly one at the top
  content = "import { getTenantModels } from '../services/TenantModelRegistry';\n" + content;

  // fix the tenantDb error on line 198
  content = content.replace(/resolveContext\(req\.tenantDb!,\s*tenantDb,/g, 'resolveContext(req.tenantDb!,');

  fs.writeFileSync(file, content, 'utf8');
}

fixDuplicates('section.controller.ts');
fixDuplicates('student.controller.ts');
fixDuplicates('class.controller.ts');
console.log('Fixed imports');
