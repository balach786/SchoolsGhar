import os
import re

dirs = ['src/controllers', 'src/services']
for root, _, files in os.walk(os.path.join(os.getcwd(), 'src')):
    for file in files:
        if file.endswith('.ts') and file != 'finance.service.ts':
            p = os.path.join(root, file)
            with open(p, 'r', encoding='utf-8') as f:
                content = f.read()

            original = content
            
            content = re.sub(r'(resolveFeeContext\([^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+)\)', r'\1, tenantDb)', content)
            content = re.sub(r'(requireFeeStructure\([^,]+,\s*[^,]+)\)', r'\1, tenantDb)', content)
            content = re.sub(r'(generateStudentFees\([^,]+,\s*[^,]+)\)', r'\1, tenantDb)', content)
            content = re.sub(r'(adjustStudentFee\([^,]+,\s*[^,]+,\s*[^,]+)\)', r'\1, tenantDb)', content)
            content = re.sub(r'(recordPayment\([^,]+,\s*[^,]+,\s*[^,]+)\)', r'\1, tenantDb)', content)
            content = re.sub(r'(buildLedger\([^,]+,\s*[^,]+,\s*[^,]+)\)', r'\1, tenantDb)', content)
            content = re.sub(r'(requireStaffForSalary\([^,]+,\s*[^,]+)\)', r'\1, tenantDb)', content)
            content = re.sub(r'(createSalaryRecord\([^,]+,\s*[^,]+,\s*[^,]+)\)', r'\1, tenantDb)', content)
            content = re.sub(r'(ownStudentScope\([^,]+,\s*[^,]+)\)', r'\1, tenantDb)', content)
            
            if content != original:
                with open(p, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"Updated {file}")
