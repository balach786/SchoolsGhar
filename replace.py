import re

with open('backend/src/controllers/resultV2.controller.ts', 'r', encoding='utf-8') as f:
    content = f.read()

new_functions = '''
function buildCohortResults(publishedDocs: any[]) {
  const latestMap = new Map<string, any>();
  for (const doc of publishedDocs) {
    const sKey = String(doc.studentId);
    if (!latestMap.has(sKey)) {
      latestMap.set(sKey, doc);
    }
  }
  const results = Array.from(latestMap.values());
  results.sort((a, b) => b.percentage - a.percentage || b.totalObtained - a.totalObtained);
  
  for (let i = 0; i < results.length; i++) {
    if (i > 0 && results[i].percentage === results[i - 1].percentage && results[i].totalObtained === results[i - 1].totalObtained) {
      results[i].rank = results[i - 1].rank;
    } else {
      results[i].rank = i + 1;
    }
  }
  return results;
}

function formatResultCard(doc: any, classStrength: number) {
  return {
    exam: {
      _id: String(doc.examId),
      name: doc.examSnapshot?.examName || '-',
      examDate: null, 
      isPublished: true,
    },
    student: {
      _id: String(doc.studentId),
      admissionNumber: doc.studentSnapshot?.admissionNumber ?? '-',
      rollNumber: doc.studentSnapshot?.rollNumber ?? '-',
      examRollNumber: doc.studentSnapshot?.examRollNumber ?? null,
      fullName: doc.studentSnapshot?.fullName ?? '-',
      fatherName: doc.studentSnapshot?.fatherName ?? null,
      guardianName: doc.studentSnapshot?.guardianName ?? null,
      gender: doc.studentSnapshot?.gender ?? '-',
      caste: doc.studentSnapshot?.caste ?? null,
      className: doc.studentSnapshot?.className ?? '-',
      sectionName: doc.studentSnapshot?.sectionName ?? '-',
      sessionName: doc.studentSnapshot?.sessionName ?? '-',
    },
    gradeScale: {
      name: doc.examSnapshot?.gradeScaleName || '-',
      boundaries: doc.examSnapshot?.gradeScaleBoundaries || [],
    },
    subjects: (doc.subjects || []).map((s: any) => ({
      subjectId: String(s.subjectId),
      name: s.subjectName,
      code: s.subjectCode,
      maxMarks: s.maximumMarks,
      passMarks: s.passMarks ?? 0,
      marksObtained: s.marksObtained ?? 0,
      status: s.attendanceStatus === 'absent' ? 'absent' : (s.passed ? 'pass' : 'fail'),
    })),
    total: { obtained: doc.totalObtained, max: doc.totalMaximum },
    percentage: doc.percentage,
    grade: doc.overallGrade || 'F',
    rank: doc.rank || 0,
    classStrength,
  };
}

export const getLatestPublishedResult = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as unknown as AuthedUser;
  const { examId, studentId } = req.params;
  const tenantId = getTenantObjectId(req);

  if (user.role === 'student') {
    const own = await getOwnStudent(user);
    if (String(own._id) !== String(studentId)) {
      throw ApiError.forbidden('You can only view your own result card', 'RESULTS_FORBIDDEN');
    }
  }

  // Fetch the full cohort to calculate rank and class strength accurately
  const publishedDocs = await Result.find({ examId, tenantId }).sort({ version: -1 }).lean();
  if (!publishedDocs.length) {
    throw ApiError.notFound('No published result found for this exam');
  }

  const cohort = buildCohortResults(publishedDocs);
  const studentDoc = cohort.find((d) => String(d.studentId) === String(studentId));

  if (!studentDoc) {
    throw ApiError.notFound('No published result found for this student in this exam');
  }

  ok(res, formatResultCard(studentDoc, cohort.length));
});

export const getPublishedSummary = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as unknown as AuthedUser;
  const examId = String(req.query.examId || '');
  if (!examId) throw ApiError.badRequest('examId is required', 'EXAM_REQUIRED');
  const tenantId = getTenantObjectId(req);

  const exam = await Exam.findOne(scopeQuery(req, { _id: examId })).lean();
  if (!exam) throw ApiError.notFound('Exam not found');
  if (!exam.isPublished) throw ApiError.badRequest('Exam is not published', 'EXAM_NOT_PUBLISHED');

  const publishedDocs = await Result.find({ examId: exam._id, tenantId }).sort({ version: -1 }).lean();
  const cohort = buildCohortResults(publishedDocs);

  // Rebuild subjects array solely from snapshot configurations
  const subjectsMap = new Map();
  for (const doc of cohort) {
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

  const firstDoc = cohort[0];

  ok(res, {
    exam: {
      _id: String(exam._id),
      name: firstDoc?.examSnapshot?.examName || exam.name,
      isPublished: true,
      examDate: exam.examDate ? new Date(exam.examDate).toISOString() : null,
    },
    gradeScale: firstDoc?.examSnapshot ? {
      name: firstDoc.examSnapshot.gradeScaleName,
      boundaries: firstDoc.examSnapshot.gradeScaleBoundaries
    } : null,
    classStrength: cohort.length,
    subjects: Array.from(subjectsMap.values()),
    students
  });
});
'''

content = re.sub(r'export const getLatestPublishedResult = asyncHandler[\s\S]*?ok\(res, publicResult\(latest as never\)\);\n  \}\);', '// WILL_BE_REPLACED_1', content)
content = re.sub(r'export const getPublishedSummary = asyncHandler[\s\S]*?\}\);', '// WILL_BE_REPLACED_2', content)

content = content.replace('// WILL_BE_REPLACED_1', '')
content = content.replace('// WILL_BE_REPLACED_2', new_functions)

with open('backend/src/controllers/resultV2.controller.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Replaced successfully')
