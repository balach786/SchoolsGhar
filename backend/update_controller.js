const fs = require('fs');
let content = fs.readFileSync('src/controllers/resultV2.controller.ts', 'utf-8');

const regex = /function validateSnapshotConsistency\(cohort: any\[\]\) \{[\s\S]*?\}[\s\S]*?\n\nfunction buildCohortResults\(publishedDocs: any\[\]\) \{/;

content = content.replace(regex, "import { validateSnapshotConsistency } from '../utils/snapshotValidator';\n\nfunction buildCohortResults(publishedDocs: any[]) {");

// Also add import at the top if needed.
if (!content.includes('import { validateSnapshotConsistency }')) {
    content = "import { validateSnapshotConsistency } from '../utils/snapshotValidator';\n" + content;
}

fs.writeFileSync('src/controllers/resultV2.controller.ts', content);
