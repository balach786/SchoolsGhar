const { Project, SyntaxKind } = require('ts-morph');

const project = new Project();
project.addSourceFilesAtPaths('src/**/*.ts');

const financeController = project.getSourceFile('src/controllers/finance.controller.ts');
const studentFeeController = project.getSourceFile('src/controllers/studentFee.controller.ts');
const feeManagementService = project.getSourceFile('src/services/feeManagement.service.ts');

function cleanTenantDbDuplicates(file) {
  const funcs = file.getFunctions().concat(file.getVariableDeclarations().map(v => v.getInitializerIfKind(SyntaxKind.CallExpression)?.getArguments()[0]).filter(a => a?.getKind() === SyntaxKind.ArrowFunction));

  for (const func of funcs) {
    if (!func) continue;
    const block = func.getBody ? func.getBody() : null;
    if (block && block.getKind() === SyntaxKind.Block) {
      const stmts = block.getStatements();
      let foundFirstTenantDb = false;
      let foundFirstTenantModels = false;
      
      for (let i = 0; i < stmts.length; i++) {
        const stmt = stmts[i];
        const text = stmt.getText();
        
        if (text.includes('const tenantDb = (req as any).tenantDb')) {
          if (foundFirstTenantDb) {
            stmt.remove();
            i--;
          } else {
            foundFirstTenantDb = true;
          }
        }
        
        if (text.includes('const tenantModels = getTenantModels(tenantDb)')) {
          if (foundFirstTenantModels) {
            stmt.remove();
            i--;
          } else {
            foundFirstTenantModels = true;
          }
        }
      }
    }
  }
}

if (financeController) {
  cleanTenantDbDuplicates(financeController);

  // Missing incomeExpenseMatch etc in finance.controller.ts
  // Let's just find `incomeVsExpense` and ensure tenantModels is in scope.
  const ivE = financeController.getVariableDeclaration('incomeVsExpense');
  if (ivE) {
     const arrow = ivE.getInitializerIfKind(SyntaxKind.CallExpression)?.getArguments()[0];
     if (arrow && arrow.getKind() === SyntaxKind.ArrowFunction) {
        const block = arrow.getBody();
        if (block && block.getKind() === SyntaxKind.Block) {
            // Check if getTenantModels is called.
            const hasTenantModels = block.getStatements().some(s => s.getText().includes('const tenantModels = getTenantModels(tenantDb)'));
            if (!hasTenantModels) {
                block.insertStatements(0, 'const tenantModels = getTenantModels(tenantDb);');
            }
            const hasTenantDb = block.getStatements().some(s => s.getText().includes('const tenantDb = (req as any).tenantDb'));
            if (!hasTenantDb) {
                block.insertStatements(0, 'const tenantDb = (req as any).tenantDb as any;');
            }
        }
     }
  }
  
  financeController.fixMissingImports();
}

if (studentFeeController) {
  // src/controllers/studentFee.controller.ts(262,27): error TS2554: Expected 4 arguments, but got 3.
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
                    // replace arg 1
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
             // maybe it was (fee, date)
             // change to (fee, tenantDb, date)
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
console.log("Done AST fix");
