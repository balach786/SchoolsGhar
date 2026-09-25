import re

# 1. Update IExamSnapshot in Result.ts
with open('backend/src/models/Result.ts', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'export interface IExamSnapshot \{\n  examName: string;\n  examTypeName\?: string;'
replacement = '''export interface IExamSnapshot {
  examName: string;
  examDate?: string | null;
  examTypeName?: string;'''
content = re.sub(pattern, replacement, content)

with open('backend/src/models/Result.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated Result.ts')

# 2. Update resultCalculation.service.ts to save examDate
with open('backend/src/services/resultCalculation.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'const examSnapshot = \{\n\s+examName: exam\.name,\n\s+gradeScaleName: scale\.name,'
replacement = '''const examSnapshot = {
          examName: exam.name,
          examDate: exam.examDate ? new Date(exam.examDate).toISOString() : null,
          gradeScaleName: scale.name,'''
content = re.sub(pattern, replacement, content)

with open('backend/src/services/resultCalculation.service.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated resultCalculation.service.ts')
