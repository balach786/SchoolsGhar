import re

with open('backend/src/controllers/resultV2.controller.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('examDate: null, ', 'examDate: doc.examSnapshot?.examDate ?? null, // LEGACY FALLBACK handled at frontend if needed\n      ')
content = content.replace(
    'examDate: exam.examDate ? new Date(exam.examDate).toISOString() : null,',
    "examDate: canonicalConfigDoc?.examSnapshot?.examDate ?? (exam.examDate ? new Date(exam.examDate).toISOString() : null), // LEGACY FALLBACK to exam.examDate"
)

with open('backend/src/controllers/resultV2.controller.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated fallback in resultV2')
