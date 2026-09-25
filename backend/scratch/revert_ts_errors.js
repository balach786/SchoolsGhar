import fs from 'fs';
import path from 'path';

function replaceInFile(filepath, replaces) {
  const fullPath = path.resolve(process.cwd(), filepath);
  let content = fs.readFileSync(fullPath, 'utf8');
  for (const { regex, replacement } of replaces) {
    content = content.replace(regex, replacement);
  }
  fs.writeFileSync(fullPath, content, 'utf8');
}

replaceInFile('src/controllers/class.controller.ts', [
  { regex: /await requireSession\(sessionId as string, req\.tenantDb!, false, tenantId\)/g, replacement: 'await requireSession(sessionId as string, false, tenantId)' },
  { regex: /await requireClass\(req\.params\.id, req\.tenantDb!, tenantId\)/g, replacement: 'await requireClass(req.params.id, tenantId)' },
  { regex: /await ensureSubjectsInSession\(subjectIds \?\? \[\], String\(doc\.sessionId\), req\.tenantDb!\)/g, replacement: 'await ensureSubjectsInSession(subjectIds ?? [], String(doc.sessionId))' }
]);

replaceInFile('src/controllers/promotion.controller.ts', [
  { regex: /await requireSession\(String\(body\.fromSessionId\), req\.tenantDb!, false, tenantId, mongoSession\)/g, replacement: 'await requireSession(String(body.fromSessionId), false, tenantId, mongoSession)' },
  { regex: /await requireClass\(ref\.classId, req\.tenantDb!, tenantId, mongoSession\)/g, replacement: 'await requireClass(ref.classId, tenantId, mongoSession)' },
  { regex: /await requireSectionOfClass\(ref\.sectionId, ref\.classId, req\.tenantDb!, tenantId, mongoSession\)/g, replacement: 'await requireSectionOfClass(ref.sectionId, ref.classId, tenantId, mongoSession)' }
]);

replaceInFile('src/controllers/section.controller.ts', [
  { regex: /await requireClass\(classId, req\.tenantDb!, tenantId\)/g, replacement: 'await requireClass(classId, tenantId)' }
]);

replaceInFile('src/controllers/staff.controller.ts', [
  { regex: /await requireUserLink\(body\.userId, roleToCheck, req\.tenantDb!, undefined, tenantId, mongoSession\)/g, replacement: 'await requireUserLink(body.userId, roleToCheck, undefined, tenantId, mongoSession)' },
  { regex: /await requireUserLink\(body\.userId, roleToCheck, req\.tenantDb!, doc\.id, tenantId, mongoSession\)/g, replacement: 'await requireUserLink(body.userId, roleToCheck, doc.id, tenantId, mongoSession)' }
]);

replaceInFile('src/controllers/student.controller.ts', [
  { regex: /await requireSession\(String\(body\.sessionId\), req\.tenantDb!, false, tenantId\)/g, replacement: 'await requireSession(String(body.sessionId), false, tenantId)' },
  { regex: /await requireClass\(String\(body\.classId\), req\.tenantDb!, tenantId\)/g, replacement: 'await requireClass(String(body.classId), tenantId)' },
  { regex: /await requireSectionOfClass\(String\(body\.sectionId\), String\(body\.classId\), req\.tenantDb!, tenantId\)/g, replacement: 'await requireSectionOfClass(String(body.sectionId), String(body.classId), tenantId)' },
  { regex: /await requireUserLink\(body\.userId, "student", req\.tenantDb!, undefined, tenantId, mongoSession\)/g, replacement: 'await requireUserLink(body.userId, "student", undefined, tenantId, mongoSession)' },
  { regex: /await requireUserLink\(body\.userId, "student", req\.tenantDb!, student\.id, tenantId, mongoSession\)/g, replacement: 'await requireUserLink(body.userId, "student", student.id, tenantId, mongoSession)' }
]);

replaceInFile('src/controllers/subject.controller.ts', [
  { regex: /await requireSession\(sessionId as string, req\.tenantDb!, false, tenantId\)/g, replacement: 'await requireSession(sessionId as string, false, tenantId)' },
  { regex: /await ensureClassesInSession\(classIds \?\? \[\], sessionId, req\.tenantDb!, tenantId\)/g, replacement: 'await ensureClassesInSession(classIds ?? [], sessionId, tenantId)' },
  { regex: /await ensureClassesInSession\(classIds, String\(doc\.sessionId\), req\.tenantDb!, tenantId\)/g, replacement: 'await ensureClassesInSession(classIds, String(doc.sessionId), tenantId)' },
  { regex: /await requireSession\(String\(doc\.sessionId\), req\.tenantDb!, false, tenantId\)/g, replacement: 'await requireSession(String(doc.sessionId), false, tenantId)' }
]);

replaceInFile('src/controllers/teacher.controller.ts', [
  { regex: /await requireUserLink\(body\.userId, "teacher", req\.tenantDb!, undefined, tenantId, mongoSession\)/g, replacement: 'await requireUserLink(body.userId, "teacher", undefined, tenantId, mongoSession)' },
  { regex: /await requireUserLink\(body\.userId, "teacher", req\.tenantDb!, doc\.id, tenantId, mongoSession\)/g, replacement: 'await requireUserLink(body.userId, "teacher", doc.id, tenantId, mongoSession)' }
]);

replaceInFile('src/controllers/timetable.controller.ts', [
  { regex: /await ensureClassesInSession\(\[body\.classId\], body\.sessionId, req\.tenantDb!, tenantId\)/g, replacement: 'await ensureClassesInSession([body.classId], body.sessionId, tenantId)' }
]);

replaceInFile('src/services/exam.service.ts', [
  { regex: /await ensureSubjectsInSession\(subjectIds, sessionId, require\("mongoose"\)\.connection, classId\)/g, replacement: 'await ensureSubjectsInSession(subjectIds, sessionId, classId)' }
]);

console.log('Reverted TS error fixes in controllers');
