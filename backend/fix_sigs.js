const fs = require('fs');
let content = fs.readFileSync('src/services/finance.service.ts', 'utf8');
content = content.replace(/tenantId(\?)?:\s*string\s*\|\s*mongoose\.Types\.ObjectId/g, 'tenantId$1: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection');
content = content.replace(/tenantIdOverride(\?)?:\s*string\s*\|\s*mongoose\.Types\.ObjectId/g, 'tenantIdOverride$1: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection');
// Clean up any double tenantDb params in case some were partially correct
content = content.replace(/tenantDb\?:\s*mongoose\.Connection,\s*tenantDb\?:\s*mongoose\.Connection/g, 'tenantDb?: mongoose.Connection');
fs.writeFileSync('src/services/finance.service.ts', content);
