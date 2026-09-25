const fs = require('fs');
let fc = fs.readFileSync('src/controllers/finance.controller.ts', 'utf8');

// 1. Add isProvisioned to endpoint handlers
const handlers = ['dashboard', 'incomeReport', 'expenseReport', 'salaryReport', 'incomeVsExpense'];
for (const h of handlers) {
  const search = `export const ${h} = asyncHandler(async (req: Request, res: Response) => {`;
  const replace = `${search}\n  const isProvisioned = (req as any).tenant?.isDatabaseProvisioned === true;`;
  fc = fc.replace(search, replace);
}

// 2. Wrap aggregations safely (used inside Promise.all mostly)
fc = fc.replace(/Income\.aggregate\(\[/g, '(isProvisioned ? () => Promise.resolve([]) : Income.aggregate.bind(Income))([');
fc = fc.replace(/Expense\.aggregate\(\[/g, '(isProvisioned ? () => Promise.resolve([]) : Expense.aggregate.bind(Expense))([');
fc = fc.replace(/SalaryRecord\.aggregate\(\[/g, '(isProvisioned ? () => Promise.resolve([]) : SalaryRecord.aggregate.bind(SalaryRecord))([');
fc = fc.replace(/ExamExpense\.aggregate\(\[/g, '(isProvisioned ? () => Promise.resolve([]) : ExamExpense.aggregate.bind(ExamExpense))([');

// 3. Wrap finds
fc = fc.replace(/await Income\.find\(/g, 'await (isProvisioned ? Promise.resolve([]) : Income.find(');
fc = fc.replace(/await Expense\.find\(/g, 'await (isProvisioned ? Promise.resolve([]) : Expense.find(');
fc = fc.replace(/await SalaryRecord\.find\(/g, 'await (isProvisioned ? Promise.resolve([]) : SalaryRecord.find(');

// Add closing parentheses for the finds!
// 281: const docs = await Income.find(scopeQuery(req, filter)).sort({ date: 1 }).select('date category title amount reference').limit(2000).lean();
// We must replace `.lean();` with `.lean());` for the finds we wrapped!
// Wait, safer to just regex replace the specific lines:
fc = fc.replace(/await \(isProvisioned \? Promise.resolve\(\[\]\) : (Income|Expense|SalaryRecord)\.find\((.*?)\.lean\(\);/g, 'await (isProvisioned ? Promise.resolve([]) : $1.find($2.lean());');

fs.writeFileSync('src/controllers/finance.controller.ts', fc);
console.log('done');
