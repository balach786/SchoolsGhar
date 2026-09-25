const fs = require('fs');
let content = fs.readFileSync('src/controllers/resultV2.controller.ts', 'utf-8');

// Remove the local validateSnapshotConsistency function
const regex = /function validateSnapshotConsistency\(cohort: any\[\]\) \{[\s\S]*?\}\n\nfunction buildCohortResults/;
content = content.replace(regex, "function buildCohortResults");

fs.writeFileSync('src/controllers/resultV2.controller.ts', content);

let content2 = fs.readFileSync('src/services/resultCalculation.service.ts', 'utf-8');
if (!content2.includes('import { validateSnapshotConsistency }')) {
    content2 = "import { validateSnapshotConsistency } from '../utils/snapshotValidator';\n" + content2;
}
fs.writeFileSync('src/services/resultCalculation.service.ts', content2);
