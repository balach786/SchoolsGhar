import fs from 'fs';
import path from 'path';

const searchTerms = [
  '/exams/dashboard',
  'ExamDashboardPage',
  '/exams/expenses',
  'ExamExpense',
  'examExpenses',
  '/exams/fees/generate',
  'Generate Fees',
  'Generate Results',
  'Publish Results',
  'exam.classId'
];

const counts: Record<string, number> = {};
searchTerms.forEach(t => counts[t] = 0);

function searchDir(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDir(fullPath);
    } else if (stat.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const term of searchTerms) {
        let count = (content.split(term).length - 1);
        if (count > 0) {
          counts[term] += count;
        }
      }
    }
  }
}

searchDir(path.join(__dirname, '../src'));
searchDir(path.join(__dirname, '../../frontend/src'));

console.log(JSON.stringify(counts, null, 2));
