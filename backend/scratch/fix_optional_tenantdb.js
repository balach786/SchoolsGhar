import fs from 'fs';
import path from 'path';

function fixOptionalTenantDb(filename) {
  const file = path.resolve(process.cwd(), 'src/controllers', filename);
  let content = fs.readFileSync(file, 'utf8');

  // requireSession(sessionId as string, false, tenantId) -> requireSession(sessionId as string, false, tenantId, undefined, req.tenantDb!)
  // requireClass(..., tenantId) -> requireClass(..., tenantId, undefined, req.tenantDb!)
  // requireSectionOfClass(..., tenantId) -> requireSectionOfClass(..., tenantId, undefined, req.tenantDb!)
  // requireUserLink(...) -> requireUserLink(..., undefined, req.tenantDb!)

  // In student.controller.ts:
  // requireSession(String(body.sessionId), false, tenantId);
  content = content.replace(/requireSession\(([^,]+),\s*([^,]+),\s*([^,)]+)\)/g, 'requireSession($1, $2, $3, undefined, req.tenantDb!)');
  
  // requireClass(String(body.classId), tenantId);
  // requireClass(classId, tenantId)
  content = content.replace(/requireClass\(([^,]+),\s*([^,)]+)\)/g, 'requireClass($1, $2, undefined, req.tenantDb!)');

  // requireSectionOfClass(String(body.sectionId), String(cls._id), tenantId);
  content = content.replace(/requireSectionOfClass\(([^,]+),\s*([^,]+),\s*([^,)]+)\)/g, 'requireSectionOfClass($1, $2, $3, undefined, req.tenantDb!)');

  // requireUserLink(body.userId, "student", undefined, tenantId, mongoSession) -> requireUserLink(..., undefined, req.tenantDb!)
  content = content.replace(/requireUserLink\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,)]+)\)/g, 'requireUserLink($1, $2, $3, $4, $5, req.tenantDb!)');

  fs.writeFileSync(file, content, 'utf8');
}

fixOptionalTenantDb('class.controller.ts');
fixOptionalTenantDb('section.controller.ts');
fixOptionalTenantDb('student.controller.ts');
console.log('Fixed optional tenantDb in controllers');
