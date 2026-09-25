import fs from 'fs';
import path from 'path';

function fixDataTransfer() {
  const file = path.resolve(process.cwd(), 'src/controllers/dataTransfer.controller.ts');
  let content = fs.readFileSync(file, 'utf8');

  // import AuthRequest
  if (!content.includes('AuthRequest')) {
    content = content.replace(/import \{ Request, Response \} from 'express';/, "import { Request, Response } from 'express';\nimport { AuthRequest } from '../types/express';");
  }

  // replace Request with AuthRequest
  content = content.replace(/static async exportData\(req: Request, res: Response\)/, 'static async exportData(req: AuthRequest, res: Response)');
  content = content.replace(/static async importData\(req: Request, res: Response\)/, 'static async importData(req: AuthRequest, res: Response)');

  // In export.service.ts, Student.find(query) etc., Mongoose has issues with Union types of models if we aren't careful.
  fs.writeFileSync(file, content, 'utf8');
}

function fixExportService() {
  const file = path.resolve(process.cwd(), 'src/services/dataTransfer/export.service.ts');
  let content = fs.readFileSync(file, 'utf8');

  // Student is a Model | typeof Model. We need to cast it or just ignore TS
  // Actually, getTenantModels returns specific types.
  content = content.replace(/Student\.find\(/g, '(Student as mongoose.Model<any>).find(');
  
  fs.writeFileSync(file, content, 'utf8');
}

fixDataTransfer();
fixExportService();
console.log('Fixed export issues');
