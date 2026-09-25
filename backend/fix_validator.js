const fs = require('fs');
const content = fs.readFileSync('src/controllers/resultV2.controller.ts', 'utf-8');

const regex = /function validateSnapshotConsistency\(cohort: any\[\]\) \{[\s\S]*?\} else \{[\s\S]*?\/\/ Record new subject encountered[\s\S]*?\}[\s\S]*?\}[\s\S]*?\}/;

const newLogic = \unction validateSnapshotConsistency(cohort: any[]) {
  if (cohort.length < 2) return;

  const firstDoc = cohort[0];
  const canonicalGradeScale = firstDoc.examSnapshot?.gradeScaleName;
  const canonicalBoundaries = JSON.stringify(firstDoc.examSnapshot?.gradeScaleBoundaries || []);
  
  const canonicalSubjects = (firstDoc.subjects || []).sort((a: any, b: any) => String(a.subjectId).localeCompare(String(b.subjectId)));
  const canonicalSubjectsStr = JSON.stringify(canonicalSubjects.map((s: any) => ({
    id: String(s.subjectId),
    name: s.subjectName,
    code: s.subjectCode,
    max: s.maximumMarks,
    pass: s.passMarks ?? null
  })));

  for (let i = 1; i < cohort.length; i++) {
    const doc = cohort[i];
    
    // 1. Check Grade Scale Name & Boundaries Match
    if (doc.examSnapshot?.gradeScaleName !== canonicalGradeScale) {
        throw new ApiError(409, \\\MIXED_SNAPSHOT_CONFIG: Student \\\ has a divergent Grade Scale (\\\) compared to cohort (\\\).\\\);
    }
    if (JSON.stringify(doc.examSnapshot?.gradeScaleBoundaries || []) !== canonicalBoundaries) {
        throw new ApiError(409, \\\MIXED_SNAPSHOT_CONFIG: Student \\\ has divergent Grade Scale boundaries.\\\);
    }

    // 2. Check Subject Config Consistency
    const docSubjects = (doc.subjects || []).sort((a: any, b: any) => String(a.subjectId).localeCompare(String(b.subjectId)));
    const docSubjectsStr = JSON.stringify(docSubjects.map((s: any) => ({
      id: String(s.subjectId),
      name: s.subjectName,
      code: s.subjectCode,
      max: s.maximumMarks,
      pass: s.passMarks ?? null
    })));

    if (canonicalSubjectsStr !== docSubjectsStr) {
      throw new ApiError(409, \\\MIXED_SNAPSHOT_CONFIG: Student \\\ has divergent subject configuration.\\\);
    }
  }
}\;

const updated = content.replace(regex, newLogic);
fs.writeFileSync('src/controllers/resultV2.controller.ts', updated);
