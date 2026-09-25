const fs = require('fs');
let top = fs.readFileSync('clean_top.tsx', 'utf8');
const bottom = fs.readFileSync('bottom.txt', 'utf8');

const requiredImports = `
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DataTable, Column } from '@/components/DataTable';
`;

if(!top.includes('import { Dialog')) top = requiredImports + '\n' + top;
fs.writeFileSync('c:/Users/BK Magsi/Downloads/school-management-system/frontend/src/pages/FeeSetupPage.tsx', top + '\n' + bottom);
