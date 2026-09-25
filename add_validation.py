import re

with open('backend/src/controllers/resultV2.controller.ts', 'r', encoding='utf-8') as f:
    content = f.read()

validator_code = '''
function validateSnapshotConsistency(cohort: any[]) {
  if (cohort.length < 2) return;

  const firstDoc = cohort[0];
  const canonicalGradeScale = firstDoc.examSnapshot?.gradeScaleName;
  const sharedSubjectConfigs = new Map<string, { maxMarks: number; passMarks: number | null }>();
  
  for (const s of (firstDoc.subjects || [])) {
    sharedSubjectConfigs.set(String(s.subjectId), { maxMarks: s.maximumMarks, passMarks: s.passMarks ?? null });
  }

  for (let i = 1; i < cohort.length; i++) {
    const doc = cohort[i];
    
    // 1. Check Grade Scale Match
    if (doc.examSnapshot?.gradeScaleName !== canonicalGradeScale) {
      throw new ApiError(409, MIXED_SNAPSHOT_CONFIG: Student \ has a divergent Grade Scale (\) compared to cohort (\).);
    }

    // 2. Check Subject Config Consistency
    for (const s of (doc.subjects || [])) {
      const sId = String(s.subjectId);
      if (sharedSubjectConfigs.has(sId)) {
        const canonical = sharedSubjectConfigs.get(sId)!;
        if (canonical.maxMarks !== s.maximumMarks || canonical.passMarks !== (s.passMarks ?? null)) {
          throw new ApiError(409, MIXED_SNAPSHOT_CONFIG: Subject \ config diverges for student \. Expected Max \/\, got \/\);
        }
      } else {
        // Record new subject encountered in cohort to validate against subsequent students
        sharedSubjectConfigs.set(sId, { maxMarks: s.maximumMarks, passMarks: s.passMarks ?? null });
      }
    }
  }
}

function buildCohortResults(publishedDocs: any[]) {
'''

content = content.replace('function buildCohortResults(publishedDocs: any[]) {', validator_code)

validation_call = '''
  const cohort = buildCohortResults(publishedDocs);
  validateSnapshotConsistency(cohort);

  const studentDoc = cohort.find((d) => String(d.studentId) === String(studentId));
'''
content = content.replace('''
  const cohort = buildCohortResults(publishedDocs);
  const studentDoc = cohort.find((d) => String(d.studentId) === String(studentId));
''', validation_call)

validation_call_summary = '''
  const cohort = buildCohortResults(publishedDocs);
  validateSnapshotConsistency(cohort);

  // Rebuild subjects array
'''
content = content.replace('''
  const cohort = buildCohortResults(publishedDocs);

  // Rebuild subjects array
''', validation_call_summary)

with open('backend/src/controllers/resultV2.controller.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Added validation')
