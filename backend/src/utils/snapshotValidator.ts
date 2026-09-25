import { ApiError } from './ApiError';

export function validateSnapshotConsistency(cohort: any[]) {
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
    
    // 1. Check Grade Scale Match
    if (doc.examSnapshot?.gradeScaleName !== canonicalGradeScale) {
        throw new ApiError(409, `MIXED_SNAPSHOT_CONFIG: Student ${doc.studentId} has a divergent Grade Scale (${doc.examSnapshot?.gradeScaleName}) compared to cohort (${canonicalGradeScale}).`);
    }
    if (JSON.stringify(doc.examSnapshot?.gradeScaleBoundaries || []) !== canonicalBoundaries) {
        throw new ApiError(409, `MIXED_SNAPSHOT_CONFIG: Student ${doc.studentId} has divergent Grade Scale boundaries.`);
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
      throw new ApiError(409, `MIXED_SNAPSHOT_CONFIG: Student ${doc.studentId} has divergent subject configuration.`);
    }
  }
}
