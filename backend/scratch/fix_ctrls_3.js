import fs from 'fs';
import path from 'path';

function fixDuplicatesAndReq(filename) {
  const file = path.resolve(process.cwd(), 'src/controllers', filename);
  let content = fs.readFileSync(file, 'utf8');

  // remove duplicate getTenantModels imports
  content = content.replace(/(import \{ getTenantModels \} from '\.\.\/services\/TenantModelRegistry';\n)+/g, "import { getTenantModels } from '../services/TenantModelRegistry';\n");

  // ensure req: AuthRequest where req.tenantDb is used
  content = content.replace(/export const ([\w]+) = asyncHandler\(async \(req: Request, res: Response\)/g, "export const $1 = asyncHandler(async (req: AuthRequest, res: Response)");
  content = content.replace(/export const ([\w]+) = asyncHandler\(async \(req, res\)/g, "export const $1 = asyncHandler(async (req: AuthRequest, res: Response)");

  // fix tenantDb on line 198 (which is probably resolveContext(tenantDb, ...))
  // Wait, if it says Cannot find name 'tenantDb', maybe it's `req.tenantDb!` that should be passed.
  content = content.replace(/resolveContext\(tenantDb,/g, 'resolveContext(req.tenantDb!,');

  fs.writeFileSync(file, content, 'utf8');
}

fixDuplicatesAndReq('section.controller.ts');
fixDuplicatesAndReq('student.controller.ts');
console.log('Fixed controllers again');
