import re

with open('backend/src/controllers/resultV2.controller.ts', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = '''
  const publishedDocs = await Result.find({ examId: exam._id, tenantId }).sort({ version: -1 }).lean();
  const cohort = buildCohortResults(publishedDocs);

  // Rebuild subjects array solely from snapshot configurations, prioritizing highest versions
  const subjectsMap = new Map();
  // Iterate over publishedDocs (which is sorted by version: -1) to guarantee highest-version deterministic resolution
  for (const doc of publishedDocs) {
    for (const s of (doc.subjects || [])) {
      if (!subjectsMap.has(String(s.subjectId))) {
        subjectsMap.set(String(s.subjectId), {
          subjectId: String(s.subjectId),
          name: s.subjectName,
          code: s.subjectCode,
          maxMarks: s.maximumMarks,
          passMarks: s.passMarks ?? null,
        });
      }
    }
  }

  const students = cohort.map(doc => ({
    studentId: String(doc.studentId),
    admissionNumber: doc.studentSnapshot?.admissionNumber ?? '-',
    rollNumber: doc.studentSnapshot?.rollNumber ?? '-',
    examRollNumber: doc.studentSnapshot?.examRollNumber ?? null,
    fullName: doc.studentSnapshot?.fullName ?? '-',
    fatherName: doc.studentSnapshot?.fatherName ?? null,
    guardianName: doc.studentSnapshot?.guardianName ?? null,
    gender: doc.studentSnapshot?.gender ?? '-',
    caste: doc.studentSnapshot?.caste ?? null,
    totalObtained: doc.totalObtained,
    totalMax: doc.totalMaximum,
    percentage: doc.percentage,
    grade: doc.overallGrade || 'F',
    rank: doc.rank || 0,
  }));

  const canonicalConfigDoc = publishedDocs[0];

  ok(res, {
    exam: {
      _id: String(exam._id),
      name: canonicalConfigDoc?.examSnapshot?.examName || exam.name,
      isPublished: true,
      examDate: exam.examDate ? new Date(exam.examDate).toISOString() : null,
    },
    gradeScale: canonicalConfigDoc?.examSnapshot ? {
      name: canonicalConfigDoc.examSnapshot.gradeScaleName,
      boundaries: canonicalConfigDoc.examSnapshot.gradeScaleBoundaries
    } : null,
    classStrength: cohort.length,
    subjects: Array.from(subjectsMap.values()),
    students
  });
});
'''

# Match everything from const publishedDocs = await Result.find to the end of getPublishedSummary
pattern = r'  const publishedDocs = await Result\.find\(\{ examId: exam\._id, tenantId \}\)\.sort\(\{ version: -1 \}\)\.lean\(\);\s+const cohort = buildCohortResults\(publishedDocs\);[\s\S]*?ok\(res, \{[\s\S]*?\}\);\n\}\);'
content = re.sub(pattern, replacement.strip(), content)

with open('backend/src/controllers/resultV2.controller.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Replaced summary logic')
