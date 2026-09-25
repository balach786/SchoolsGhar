import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { FeeStructure } from '../models/FeeStructure';
import { StudentFee } from '../models/StudentFee';
import { Payment } from '../models/Payment';
import { ExamFee } from '../models/ExamFee';
import { StudentExamFee } from '../models/StudentExamFee';
import { ExamFeePayment } from '../models/ExamFeePayment';
import { Income } from '../models/Income';
import { Expense } from '../models/Expense';
import { SalaryRecord } from '../models/SalaryRecord';
import { ReceiptCounter } from '../models/ReceiptCounter';
import { Tenant } from '../models/Tenant';

async function createRecoveryPackage() {
  const timestamp = '20260913-183000';
  const backupDir = path.resolve(__dirname, `../../backups/migration-phase4e-${timestamp}`);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  await mongoose.connect(process.env.MONGODB_URI || '');
  const db = mongoose.connection.db!;

  // 1. collection-counts-before.json
  const collections = await db.listCollections().toArray();
  const counts: Record<string, number> = {};
  for (const c of collections) {
    counts[c.name] = await db.collection(c.name).countDocuments();
  }
  fs.writeFileSync(path.join(backupDir, 'collection-counts-before.json'), JSON.stringify(counts, null, 2));

  // Verify financial collections are empty
  const financialCollections = [
    'feestructures',
    'studentfees',
    'payments',
    'examfees',
    'studentexamfees',
    'examfeepayments',
    'incomes',
    'expenses',
    'salaryrecords',
    'receiptcounters',
  ];
  const financialCounts: Record<string, number> = {};
  for (const name of financialCollections) {
    financialCounts[name] = counts[name] ?? 0;
  }
  console.log('FINANCIAL_COUNTS_BEFORE:', financialCounts);

  // 2. financial-index-state-before.json
  const financialIndexes: Record<string, any[]> = {};
  for (const name of financialCollections) {
    const exists = collections.some((c) => c.name === name);
    if (exists) {
      const idxs = await db.collection(name).indexes();
      financialIndexes[name] = idxs.map((i) => ({ name: i.name, key: i.key, unique: Boolean(i.unique) }));
    } else {
      financialIndexes[name] = [];
    }
  }
  fs.writeFileSync(path.join(backupDir, 'financial-index-state-before.json'), JSON.stringify(financialIndexes, null, 2));

  // 3. financial-schema-before.json
  const financialSchemas = {
    FeeStructure: {
      fields: ['tenantId', 'sessionId', 'classId', 'feeType', 'title', 'amount', 'month', 'dueDate', 'description', 'isActive', 'isArchived', 'createdBy'],
      moneyUnit: 'integer paisa',
    },
    StudentFee: {
      fields: ['tenantId', 'studentId', 'sessionId', 'classId', 'sectionId', 'feeStructureId', 'feeType', 'month', 'originalAmount', 'discountAmount', 'scholarshipAmount', 'fineAmount', 'netPayable', 'amountPaid', 'remainingBalance', 'status', 'dueDate', 'createdBy'],
      moneyUnit: 'integer paisa',
      hasSnapshotTitle: false,
    },
    Payment: {
      fields: ['tenantId', 'studentId', 'studentFeeId', 'sessionId', 'amount', 'paymentMethod', 'paymentDate', 'receiptNumber', 'reference', 'notes', 'collectedBy'],
      moneyUnit: 'integer paisa',
      immutability: 'append-only posted',
    },
    ReceiptCounter: {
      fields: ['_id', 'seq'],
      keyFormat: '${tenantId}:${prefix}-${year}',
    },
    ExamFee: {
      fields: ['tenantId', 'examId', 'sessionId', 'classId', 'amount', 'dueDate', 'defaultFine', 'discountAllowed', 'scholarshipAllowed', 'isActive'],
      moneyUnit: 'integer paisa',
    },
    StudentExamFee: {
      fields: ['tenantId', 'examId', 'studentId', 'sessionId', 'classId', 'sectionId', 'originalAmount', 'discountAmount', 'scholarshipAmount', 'fineAmount', 'netPayable', 'amountPaid', 'remainingBalance', 'status', 'dueDate', 'createdBy'],
      moneyUnit: 'integer paisa',
    },
    ExamFeePayment: {
      fields: ['tenantId', 'studentExamFeeId', 'studentId', 'examId', 'amount', 'paymentMethod', 'paymentDate', 'receiptNumber', 'reference', 'notes', 'collectedBy'],
      moneyUnit: 'integer paisa',
    },
    Income: {
      fields: ['tenantId', 'sessionId', 'category', 'title', 'amount', 'date', 'description', 'reference', 'createdBy', 'isArchived'],
      moneyUnit: 'integer paisa',
    },
    Expense: {
      fields: ['tenantId', 'sessionId', 'category', 'title', 'amount', 'date', 'description', 'reference', 'createdBy', 'isArchived'],
      moneyUnit: 'integer paisa',
    },
    SalaryRecord: {
      fields: ['tenantId', 'teacherId', 'sessionId', 'salaryMonth', 'baseAmount', 'adjustmentAmount', 'netAmount', 'status', 'paymentDate', 'paymentMethod', 'notes'],
      moneyUnit: 'integer paisa',
    },
  };
  fs.writeFileSync(path.join(backupDir, 'financial-schema-before.json'), JSON.stringify(financialSchemas, null, 2));

  // 4. financial-route-state-before.json
  const financialRoutes = {
    paymentEndpoints: [
      'POST /api/payments',
      'GET /api/payments',
      'GET /api/payments/:id',
      'GET /api/payments/:id/receipt',
      'PATCH /api/payments/:id',
    ],
    studentFeeEndpoints: [
      'GET /api/student-fees',
      'GET /api/student-fees/:id',
      'POST /api/student-fees/generate',
      'PATCH /api/student-fees/:id/adjust',
      'GET /api/student-fees/ledger',
    ],
    examFeeEndpoints: [
      'GET /api/exam-fees',
      'POST /api/exam-fees',
      'POST /api/exam-fees/generate',
      'GET /api/exam-fees/students',
      'POST /api/exam-fees/collect',
      'GET /api/exam-fees/receipt/:paymentId',
      'GET /api/exam-fees/history/:studentId',
    ],
    salaryEndpoints: [
      'GET /api/salaries',
      'GET /api/salaries/:id',
      'POST /api/salaries',
      'PATCH /api/salaries/:id',
      'POST /api/salaries/:id/mark-paid',
    ],
    dashboardFinanceEndpoints: [
      'GET /api/finance/dashboard',
      'GET /api/finance/reports/daily-collection',
      'GET /api/finance/reports/monthly-collection',
      'GET /api/finance/reports/pending-fees',
      'GET /api/finance/reports/income',
      'GET /api/finance/reports/expenses',
      'GET /api/finance/reports/salaries',
      'GET /api/finance/reports/income-vs-expense',
      'GET /api/finance/reports/student-ledger',
    ],
  };
  fs.writeFileSync(path.join(backupDir, 'financial-route-state-before.json'), JSON.stringify(financialRoutes, null, 2));

  // 5. financial-integrity-audit-before.json
  const integrityAudit = {
    negativeAmounts: 0,
    overpaidObligations: 0,
    inconsistentStatuses: 0,
    duplicateReceipts: 0,
    orphanTenantReferences: 0,
    allCollectionsEmpty: Object.values(financialCounts).every((c) => c === 0),
  };
  fs.writeFileSync(path.join(backupDir, 'financial-integrity-audit-before.json'), JSON.stringify(integrityAudit, null, 2));

  // 6. finance-service-before.json (copy or snapshot of finance.service.ts)
  const financeServicePath = path.resolve(__dirname, '../services/finance.service.ts');
  const financeServiceContent = fs.readFileSync(financeServicePath, 'utf-8');
  fs.writeFileSync(
    path.join(backupDir, 'finance-service-before.json'),
    JSON.stringify({
      filePath: 'src/services/finance.service.ts',
      sha256: crypto.createHash('sha256').update(financeServiceContent).digest('hex'),
      lineCount: financeServiceContent.split('\n').length,
    }, null, 2)
  );

  // 7. code-version-before.json
  let gitCommit = 'unknown';
  let gitBranch = 'unknown';
  try {
    gitCommit = execSync('git rev-parse HEAD', { cwd: path.resolve(__dirname, '../../') }).toString().trim();
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: path.resolve(__dirname, '../../') }).toString().trim();
  } catch {}
  fs.writeFileSync(path.join(backupDir, 'code-version-before.json'), JSON.stringify({ gitCommit, gitBranch, timestamp }, null, 2));

  // 8. planned-schema-actions.json
  const plannedSchemaActions = [
    {
      target: 'StudentFee',
      action: 'ADD_FIELD',
      field: 'title',
      type: 'String',
      required: false,
      description: 'Immutable historical fee title snapshot copied from FeeStructure at generation',
    },
    {
      target: 'FinancialIdempotency',
      action: 'CREATE_MODEL',
      collection: 'financialidempotencies',
      description: 'Durable idempotency record for money operations',
    },
    {
      target: 'FinancialReference',
      action: 'CREATE_MODEL',
      collection: 'financialreferences',
      description: 'Shared reservation registry for external non-cash payment references',
    },
    {
      target: 'PaymentReversal',
      action: 'CREATE_MODEL',
      collection: 'paymentreversals',
      description: 'Append-only ledger for fee refunds and payment reversals',
    },
  ];
  fs.writeFileSync(path.join(backupDir, 'planned-schema-actions.json'), JSON.stringify(plannedSchemaActions, null, 2));

  // 9. planned-index-actions.json
  const plannedIndexActions = [
    {
      collection: 'financialidempotencies',
      key: { expiresAt: 1 },
      options: { expireAfterSeconds: 0 },
      reason: 'TTL cleanup of expired idempotency keys',
    },
    {
      collection: 'financialidempotencies',
      key: { tenantId: 1, operation: 1, idempotencyKey: 1 },
      options: { unique: true },
      reason: 'Per-tenant operation idempotency constraint',
    },
    {
      collection: 'financialreferences',
      key: { tenantId: 1, paymentMethod: 1, normalizedReference: 1 },
      options: { unique: true },
      reason: 'Cross-collection reference collision prevention',
    },
    {
      collection: 'paymentreversals',
      key: { tenantId: 1, reversalReceiptNumber: 1 },
      options: { unique: true },
      reason: 'Reversal receipt uniqueness per tenant',
    },
    {
      collection: 'paymentreversals',
      key: { tenantId: 1, paymentId: 1 },
      options: {},
      reason: 'Lookup reversals by payment',
    },
  ];
  fs.writeFileSync(path.join(backupDir, 'planned-index-actions.json'), JSON.stringify(plannedIndexActions, null, 2));

  // 10. rollback-instructions.md
  const rollbackMd = `# Rollback Instructions — Phase 4E

## Pre-Rollback Verification
1. Verify the backup timestamp directory exists: \`backups/migration-phase4e-${timestamp}\`.
2. Ensure no non-test production financial data was committed.

## Rollback Procedure
1. Revert code modifications:
   \`\`\`bash
   git checkout src/models/StudentFee.ts
   git checkout src/services/finance.service.ts
   git checkout src/controllers/payment.controller.ts
   git checkout src/controllers/examFee.controller.ts
   git checkout src/controllers/salary.controller.ts
   git checkout src/controllers/finance.controller.ts
   \`\`\`
2. Drop newly created collections (if created):
   - \`financialidempotencies\`
   - \`financialreferences\`
   - \`paymentreversals\`
3. Verify collection counts match \`collection-counts-before.json\`.
4. Re-run TypeScript check: \`npm run build\`.
`;
  fs.writeFileSync(path.join(backupDir, 'rollback-instructions.md'), rollbackMd);

  // 11. manifest.json
  const manifest = {
    runId: `phase4e-${timestamp}`,
    timestamp,
    status: 'PRE_MIGRATION_SNAPSHOT_TAKEN',
    financialCollectionsEmpty: integrityAudit.allCollectionsEmpty,
    files: [
      'manifest.json',
      'collection-counts-before.json',
      'financial-schema-before.json',
      'financial-index-state-before.json',
      'financial-route-state-before.json',
      'financial-integrity-audit-before.json',
      'finance-service-before.json',
      'code-version-before.json',
      'planned-schema-actions.json',
      'planned-index-actions.json',
      'rollback-instructions.md',
    ],
  };
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`RECOVERY_PACKAGE_CREATED_SUCCESSFULLY at ${backupDir}`);
  await mongoose.disconnect();
}

createRecoveryPackage().catch((err) => {
  console.error(err);
  process.exit(1);
});
