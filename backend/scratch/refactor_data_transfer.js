import fs from 'fs';
import path from 'path';

function refactorExportService() {
  const file = path.resolve(process.cwd(), 'src/services/dataTransfer/export.service.ts');
  let content = fs.readFileSync(file, 'utf8');

  // Add getTenantModels import
  if (!content.includes('getTenantModels')) {
    content = "import { getTenantModels } from '../../services/TenantModelRegistry';\n" + content;
  }

  // Refactor exportStudents
  content = content.replace(/static async exportStudents\(\s*tenantId: string,/g, 'static async exportStudents(\n    tenantDb: mongoose.Connection | undefined,\n    tenantId: string,');
  content = content.replace(/exportStudents\([\s\S]*?const query/m, (match) => {
    return match.replace('const query', 'const { Student, Class, Section, AcademicSession } = tenantDb ? getTenantModels(tenantDb) : { Student: mongoose.model("Student"), Class: mongoose.model("Class"), Section: mongoose.model("Section"), AcademicSession: mongoose.model("AcademicSession") };\n    const query');
  });

  fs.writeFileSync(file, content, 'utf8');
}

function refactorImportService() {
  const file = path.resolve(process.cwd(), 'src/services/dataTransfer/import.service.ts');
  let content = fs.readFileSync(file, 'utf8');

  if (!content.includes('getTenantModels')) {
    content = "import { getTenantModels } from '../../services/TenantModelRegistry';\n" + content;
  }

  // Refactor processStudentsImport
  content = content.replace(/static async processStudentsImport\(\s*tenantId: string,/g, 'static async processStudentsImport(\n    tenantDb: mongoose.Connection | undefined,\n    tenantId: string,');
  content = content.replace(/processStudentsImport\([\s\S]*?const sessionMap/m, (match) => {
    return match.replace('const sessionMap', 'const { Student, Class, Section, AcademicSession } = tenantDb ? getTenantModels(tenantDb) : { Student: mongoose.model("Student"), Class: mongoose.model("Class"), Section: mongoose.model("Section"), AcademicSession: mongoose.model("AcademicSession") };\n    const sessionMap');
  });

  fs.writeFileSync(file, content, 'utf8');
}

function refactorDataTransferController() {
  const file = path.resolve(process.cwd(), 'src/controllers/dataTransfer.controller.ts');
  let content = fs.readFileSync(file, 'utf8');

  content = content.replace(/await ExportService\.exportStudents\(\s*tenantId,/g, 'await ExportService.exportStudents(\n            req.tenantDb,\n            tenantId,');
  content = content.replace(/await ImportService\.processStudentsImport\(\s*tenantId,/g, 'await ImportService.processStudentsImport(\n            req.tenantDb,\n            tenantId,');

  fs.writeFileSync(file, content, 'utf8');
}

refactorExportService();
refactorImportService();
refactorDataTransferController();
console.log('Refactored data transfer services');
