const fs = require('fs');
let content = fs.readFileSync('src/services/resultCalculation.service.ts', 'utf-8');

// Add import
if (!content.includes('import { validateSnapshotConsistency }')) {
    content = "import { validateSnapshotConsistency } from '../utils/snapshotValidator';\n" + content;
}

// Find republishStudentResult block where it fetches latest
const regex = /const latest = await Result\.findOne\(\{[\s\S]*?\}\)[\s\S]*?\.lean\(\);[\s\S]*?if \(\!latest\) \{/;
const replacement = \// Load entire latest cohort to ensure global config consistency
        const publishedDocs = await Result.find({ tenantId, examId: exam._id }).sort({ version: -1 }).lean();
        const latestMap = new Map<string, any>();
        for (const doc of publishedDocs) {
          const sKey = String(doc.studentId);
          if (!latestMap.has(sKey)) {
            latestMap.set(sKey, doc);
          }
        }
        const cohort = Array.from(latestMap.values());
        
        // Ensure the cohort is not already mixed before we republish
        validateSnapshotConsistency(cohort);
        const canonicalConfigDoc = cohort[0]; // Guaranteed safe by validator
        
        const latest = latestMap.get(String(studentId));
        if (!latest) {\;
        
content = content.replace(regex, replacement);

const regex2 = /const examSnapshot = latest\.examSnapshot;[\s\S]*?const subjectSnapshots: ISubjectResultSnapshot\[\] = r\.rows\.map\(\(row\) => \{[\s\S]*?const historicalSubject = latest\.subjects\.find\(\(s: any\) => String\(s\.subjectId\) === String\(row\.subjectId\)\);/;
const replacement2 = \const examSnapshot = canonicalConfigDoc.examSnapshot;

      const subjectSnapshots: ISubjectResultSnapshot[] = r.rows.map((row) => {
        const historicalSubject = canonicalConfigDoc.subjects.find((s: any) => String(s.subjectId) === String(row.subjectId));\;
content = content.replace(regex2, replacement2);

fs.writeFileSync('src/services/resultCalculation.service.ts', content);
