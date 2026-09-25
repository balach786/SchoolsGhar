import re

with open('backend/src/controllers/exam.controller.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# I will find where updateExam checks body properties
check_code = '''
  // Lock academic configuration if published snapshots exist
  const { Result } = await import('../models/Result');
  const hasPublishedSnapshots = await Result.exists({ examId: doc._id, tenantId });

  if (hasPublishedSnapshots) {
    if (req.body.subjects !== undefined) {
      // Allow if it matches identically, else reject
      const existingStr = JSON.stringify(doc.subjects.map(s => ({ subjectId: String(s.subjectId), maxMarks: s.maxMarks, passMarks: s.passMarks })));
      const newStr = JSON.stringify(normalizeSubjects(req.body.subjects).map(s => ({ subjectId: String(s.subjectId), maxMarks: s.maxMarks, passMarks: s.passMarks })));
      if (existingStr !== newStr) throw ApiError.badRequest('Cannot modify exam subjects or marks after results are published. Use re-publish workflow instead.', 'IMMUTABLE_FIELD');
    }
    if (req.body.gradeScaleId !== undefined && String(req.body.gradeScaleId) !== String(doc.gradeScaleId)) {
      throw ApiError.badRequest('Cannot change Grade Scale after results are published.', 'IMMUTABLE_FIELD');
    }
  }

  let nextSubjects = doc.subjects.map((s) => ({
'''

content = content.replace('  let nextSubjects = doc.subjects.map((s) => ({', check_code)

with open('backend/src/controllers/exam.controller.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated exam.controller')
