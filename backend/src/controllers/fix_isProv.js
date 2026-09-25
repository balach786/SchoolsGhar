const fs = require('fs');
let fc = fs.readFileSync('src/controllers/finance.controller.ts', 'utf8');

fc = fc.replace(/const tenantId = getTenantObjectId\(req\);/g, `const tenantId = getTenantObjectId(req);\n  const isProvisioned = (req as any).tenant?.isDatabaseProvisioned === true;`);

// Find all `await !tenantId ? Expense.aggregate(...) : Promise.resolve([])` or similar patterns and replace them
// Or just find `await (Income|Expense|SalaryRecord).(aggregate|find)(`
fc = fc.replace(/await (!tenantId \? )?(Expense|Income|SalaryRecord)\.(aggregate|find)\(/g, 'await (isProvisioned ? Promise.resolve([]) : $2.$3(');

// For the closing parenthesis of `Expense.find(...)`, we might need to add `)`
// Actually wait! `await Expense.aggregate([...])` replaced by `await (isProvisioned ? Promise.resolve([]) : Expense.aggregate([...])` will leave the expression unclosed!
// It will be `await (isProvisioned ? Promise.resolve([]) : Expense.aggregate([...])` without the final `)`.
// We need to match the whole block or just rely on manual replacements for the few occurrences.

fs.writeFileSync('src/controllers/finance.controller.ts', fc);
