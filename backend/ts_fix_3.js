const { Project, SyntaxKind } = require('ts-morph');
const fs = require('fs');

const project = new Project();
project.addSourceFilesAtPaths('src/**/*.ts');

const financeController = project.getSourceFile('src/controllers/finance.controller.ts');
const studentFeeController = project.getSourceFile('src/controllers/studentFee.controller.ts');
const feeManagementService = project.getSourceFile('src/services/feeManagement.service.ts');

if (financeController) {
  // Fix incomeVsExpense matches
  const calls = financeController.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
     const expr = call.getExpression().getText();
     if (expr === 'incomeExpenseMatch' || expr === 'paymentMatch' || expr === 'reversalMatch') {
         call.getExpression().replaceWithText('tMatch');
     }
     
     // 466: Expected 2 arguments, but got 1. (Might be `sendCsv(res, 'something.csv')` missing the data array?)
     // Let's check sendCsv calls:
     if (expr === 'sendCsv') {
        const args = call.getArguments();
        // sendCsv(res, filename, headers, rows) -> if it has fewer, maybe something is wrong.
     }
  }

  // finance.controller.ts(466,37): expected 2 arguments, but got 1.
  // Could be `getSchoolCustomRange(...)`.
  // Wait, `getSchoolCustomRange(req.query.from ? String(req.query.from) : undefined, req.query.to ? String(req.query.to) : undefined)` 
  // It has 2 arguments, but maybe `undefined` is not accepted? Or maybe it's `getMonthlyCollectionBreakdown(tenantId)` missing tenantDb?
  for (const call of calls) {
     const expr = call.getExpression().getText();
     if (expr === 'getMonthlyCollectionBreakdown' || expr === 'getRegularFeeCollection') {
         const args = call.getArguments();
         if (args.length === 1 && args[0].getText() === 'tenantId') {
             call.addArgument('tenantDb');
         } else if (args.length === 1) {
             call.addArgument('tenantDb');
         }
     }
  }
}

if (studentFeeController) {
  const calls = studentFeeController.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
    if (call.getExpression().getText() === 'adjustStudentFee') {
       const args = call.getArguments();
       if (args.length === 3) {
           call.addArgument('tenantDb');
       }
    }
  }
}

if (feeManagementService) {
  const calls = feeManagementService.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
     const name = call.getExpression().getText();
     if (name === 'applyDiscount') {
         const args = call.getArguments();
         if (args.length !== 2) {
             // ensure it's just (fee, tenantDb)
             if (args.length > 2) {
                 for(let i=args.length-1; i>=2; i--) {
                    call.removeArgument(i);
                 }
                 if(args.length >= 2 && args[1].getText() !== 'tenantDb') {
                    call.removeArgument(1);
                    call.addArgument('tenantDb');
                 }
             } else if (args.length === 1) {
                 call.addArgument('tenantDb');
             }
         } else if (args[1].getText() !== 'tenantDb') {
             call.removeArgument(1);
             call.addArgument('tenantDb');
         }
     } else if (name === 'calculateLateFee') {
         const args = call.getArguments();
         if (args.length === 2 && args[1].getText() !== 'tenantDb' && args[1].getText() !== 'undefined') {
             const arg1 = args[1].getText();
             call.removeArgument(1);
             call.addArgument('tenantDb');
             call.addArgument(arg1);
         } else if (args.length === 2 && args[1].getText() === 'undefined') {
             call.removeArgument(1);
             call.addArgument('tenantDb');
         } else if (args.length === 1) {
             call.addArgument('tenantDb');
         }
     }
  }
}

project.saveSync();

// Also patch incomeVsExpense missing export in finance.routes.ts, verifyFinalClosure, verifyReportsHardening
// Let's just remove the import errors if they are not needed, or make sure incomeVsExpense is exported.
let fc = fs.readFileSync('src/controllers/finance.controller.ts', 'utf8');
if (!fc.includes('export const incomeVsExpense =')) {
  // missing incomeVsExpense completely!
  let endpointsFile = '';
  try {
    endpointsFile = fs.readFileSync('C:\\Users\\BK Magsi\\.gemini\\antigravity-ide\\brain\\a886dc81-c45c-48a1-b670-73576b5e4547\\scratch\\finance.endpoints.ts', 'utf8');
  } catch(e) {}
  if (endpointsFile) {
     const incomeVsExpenseRegex = /\/\*\* GET \/api\/finance\/reports\/income-vs-expense \*\/[\s\S]*/;
     const match = endpointsFile.match(incomeVsExpenseRegex);
     if (match) fc += '\n' + match[0];
  }
  fs.writeFileSync('src/controllers/finance.controller.ts', fc);
}

console.log("Done AST fix 3");
