import fs from 'fs';
import path from 'path';

const file = path.resolve(process.cwd(), 'src/services/academic.service.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/const models = getTenantModels\(tenantDb\);\n/g, '');
content = content.replace(/const models = tenantDb \? getTenantModels\(tenantDb\) : \{ AcademicSession, Class, Section, Subject, Staff, Student, Role, User \};\n  const models = tenantDb \? getTenantModels\(tenantDb\) : \{ AcademicSession, Class, Section, Subject, Staff, Student, Role, User \};\n/g, 'const models = tenantDb ? getTenantModels(tenantDb) : { AcademicSession, Class, Section, Subject, Staff, Student, Role, User };\n');

// specifically for requireSession, etc, make sure `models` is only declared once:
content = content.replace(/const models = tenantDb \? getTenantModels\(tenantDb\) : \{ AcademicSession, Class, Section, Subject, Staff, Student, Role, User \};\s*const models = tenantDb \? getTenantModels\(tenantDb\) : \{ AcademicSession, Class, Section, Subject, Staff, Student, Role, User \};\s*/g, 'const models = tenantDb ? getTenantModels(tenantDb) : { AcademicSession, Class, Section, Subject, Staff, Student, Role, User };\n');

// There are a few that have:
// const models = tenantDb ? getTenantModels(tenantDb) : { AcademicSession, Class, Section, Subject, Staff, Student, Role, User };
// const models = tenantDb ? getTenantModels(tenantDb) : { AcademicSession, Class, Section, Subject, Staff, Student, Role, User };
// let q = models.AcademicSession...

content = content.replace(/(const models = tenantDb \? getTenantModels\(tenantDb\) : \{ AcademicSession, Class, Section, Subject, Staff, Student, Role, User \};\n\s*)+/g, 'const models = tenantDb ? getTenantModels(tenantDb) : { AcademicSession, Class, Section, Subject, Staff, Student, Role, User };\n  ');

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed duplicate models declarations');
