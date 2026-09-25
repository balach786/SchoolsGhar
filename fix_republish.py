import re

with open('backend/src/services/resultCalculation.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the examSnapshot and subjectSnapshots assignment in republishStudentResult
pattern = r'const examSnapshot = \{\s+examName: exam\.name,\s+examDate: exam\.examDate \? new Date\(exam\.examDate\)\.toISOString\(\) : null,\s+gradeScaleName: scale\.name,\s+gradeScaleBoundaries: scale\.boundaries\.map\(\(b\) => \(\{\s+grade: b\.grade,\s+minPercentage: b\.minPercentage,\s+\}\)\),\s+\};\s+const subjectSnapshots: ISubjectResultSnapshot\[\] = r\.rows\.map\(\(row\) => \(\{\s+subjectId: new mongoose\.Types\.ObjectId\(row\.subjectId\),\s+subjectName: row\.subjectName,\s+subjectCode: row\.subjectCode,\s+examScheduleId: row\.examScheduleId \? new mongoose\.Types\.ObjectId\(row\.examScheduleId\) : undefined,\s+marksObtained: row\.marksObtained,\s+maximumMarks: row\.maxMarks,\s+passMarks: row\.passMarks,\s+attendanceStatus: row\.attendanceStatus as ResultAttendanceStatus,\s+passed: row\.passed,\s+percentage: row\.percentage,\s+remarks: row\.remarks,\s+\}\)\);'

# Replace only the second occurrence (which is inside republishStudentResult)
matches = list(re.finditer(pattern, content, re.DOTALL))
if len(matches) > 1:
    match = matches[1]
    
    replacement = '''// Use the canonical historical config from the student's own latest snapshot
        const examSnapshot = latest.examSnapshot;
  
        const subjectSnapshots: ISubjectResultSnapshot[] = r.rows.map((row) => {
          const historicalSubject = latest.subjects.find((s: any) => String(s.subjectId) === String(row.subjectId));
          return {
            subjectId: new mongoose.Types.ObjectId(row.subjectId),
            subjectName: historicalSubject ? historicalSubject.subjectName : row.subjectName,
            subjectCode: historicalSubject ? historicalSubject.subjectCode : row.subjectCode,
            examScheduleId: row.examScheduleId ? new mongoose.Types.ObjectId(row.examScheduleId) : undefined,
            marksObtained: row.marksObtained,
            maximumMarks: historicalSubject ? historicalSubject.maximumMarks : row.maxMarks,
            passMarks: historicalSubject ? historicalSubject.passMarks : row.passMarks,
            attendanceStatus: row.attendanceStatus as ResultAttendanceStatus,
            passed: row.passed,
            percentage: row.percentage,
            remarks: row.remarks,
          };
        });'''
    
    content = content[:match.start()] + replacement + content[match.end():]
    
    with open('backend/src/services/resultCalculation.service.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replaced successfully')
else:
    print('Could not find matches')
