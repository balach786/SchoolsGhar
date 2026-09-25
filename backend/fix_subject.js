const fs = require('fs');
let content = fs.readFileSync('src/controllers/subject.controller.ts', 'utf8');

// Replace Subject import
content = content.replace(/import \{ Subject, publicSubject \} from '\.\.\/models\/Subject';/, 'import { publicSubject } from \'../models/Subject\';\nimport { getTenantModels } from \'../services/TenantModelRegistry\';');
content = content.replace(/import \{ Class \} from '\.\.\/models\/Class';\n/, '');
content = content.replace(/import \{ Teacher \} from '\.\.\/models\/Teacher';\n/, '');

// Add tenantDb extraction to all controllers
const listSubjectsStart = 'export const listSubjects = asyncHandler(async (req: Request, res: Response) => {\n';
const listSubjectsReplace = listSubjectsStart + '  const tenantDb = (req as any).tenantDb as mongoose.Connection;\n  if (!tenantDb) throw new ApiError(500, \'Tenant database connection missing\', \'TENANT_DB_MISSING\');\n  const { Subject, Class } = getTenantModels(tenantDb);\n';
content = content.replace(listSubjectsStart, listSubjectsReplace);

const getSubjectStart = 'export const getSubject = asyncHandler(async (req: Request, res: Response) => {\n';
const getSubjectReplace = getSubjectStart + '  const tenantDb = (req as any).tenantDb as mongoose.Connection;\n  if (!tenantDb) throw new ApiError(500, \'Tenant database connection missing\', \'TENANT_DB_MISSING\');\n  const { Subject } = getTenantModels(tenantDb);\n';
content = content.replace(getSubjectStart, getSubjectReplace);

const createSubjectStart = '  const tenantId = getTenantObjectId(req);\n';
const createSubjectReplace = createSubjectStart + '  const tenantDb = (req as any).tenantDb as mongoose.Connection;\n  if (!tenantDb) throw new ApiError(500, \'Tenant database connection missing\', \'TENANT_DB_MISSING\');\n  const { Subject } = getTenantModels(tenantDb);\n';
content = content.replace(createSubjectStart, createSubjectReplace);

const updateSubjectStart = 'export const updateSubject = asyncHandler(async (req: AuthRequest, res: Response) => {\n';
const updateSubjectReplace = updateSubjectStart + '  const tenantDb = (req as any).tenantDb as mongoose.Connection;\n  if (!tenantDb) throw new ApiError(500, \'Tenant database connection missing\', \'TENANT_DB_MISSING\');\n  const { Subject } = getTenantModels(tenantDb);\n';
content = content.replace(updateSubjectStart, updateSubjectReplace);

const archiveSubjectStart = 'export const archiveSubject = asyncHandler(async (req: AuthRequest, res: Response) => {\n';
const archiveSubjectReplace = archiveSubjectStart + '  const tenantDb = (req as any).tenantDb as mongoose.Connection;\n  if (!tenantDb) throw new ApiError(500, \'Tenant database connection missing\', \'TENANT_DB_MISSING\');\n  const { Subject } = getTenantModels(tenantDb);\n';
content = content.replace(archiveSubjectStart, archiveSubjectReplace);

fs.writeFileSync('src/controllers/subject.controller.ts', content);
