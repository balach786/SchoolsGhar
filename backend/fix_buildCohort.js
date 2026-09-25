const fs = require('fs');
let content = fs.readFileSync('src/controllers/resultV2.controller.ts', 'utf-8');

const regex = /\s*\}\n\s*\}\n\s*const results = Array\.from\(latestMap\.values\(\)\);/;
const replacement = \\n\nfunction buildCohortResults(publishedDocs: any[]) {\n  const latestMap = new Map<string, any>();\n  for (const doc of publishedDocs) {\n    const sKey = String(doc.studentId);\n    if (!latestMap.has(sKey)) {\n      latestMap.set(sKey, doc);\n    }\n  }\n  const results = Array.from(latestMap.values());\;

content = content.replace(regex, replacement);

fs.writeFileSync('src/controllers/resultV2.controller.ts', content);
