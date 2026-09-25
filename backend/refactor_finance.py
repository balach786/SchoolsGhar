import os
import re

p = os.path.join(os.getcwd(), 'src', 'services', 'finance.service.ts')
with open(p, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add getTenantModels import
content = content.replace(
    "import { getOwnStudent, type AuthedUser } from './attendance.service';",
    "import { getOwnStudent, type AuthedUser } from './attendance.service';\nimport { getTenantModels } from './TenantModelRegistry';"
)

# 2. Add tenantDb to signatures
content = re.sub(r'tenantId\s*:\s*string\s*\|\s*mongoose\.Types\.ObjectId\)', 'tenantId: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection)', content)
content = re.sub(r'tenantId\?\s*:\s*string\s*\|\s*mongoose\.Types\.ObjectId\)', 'tenantId?: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection)', content)
content = re.sub(r'tenantIdOverride\?\s*:\s*string\s*\|\s*mongoose\.Types\.ObjectId\)', 'tenantIdOverride?: string | mongoose.Types.ObjectId, tenantDb?: mongoose.Connection)', content)

# 3. Replace direct model calls
models = ['FeeStructure', 'AcademicSession', 'Class', 'Section', 'Student', 'StudentFee', 'Payment', 'SalaryRecord', 'Staff']
for m in models:
    content = re.sub(fr'\b{m}\.', f'getTenantModels(tenantDb!).{m}.', content)

with open(p, 'w', encoding='utf-8') as f:
    f.write(content)
print("finance.service.ts refactored")
