# Rollback Instructions — Phase 4E

## Pre-Rollback Verification
1. Verify the backup timestamp directory exists: `backups/migration-phase4e-20260913-183000`.
2. Ensure no non-test production financial data was committed.

## Rollback Procedure
1. Revert code modifications:
   ```bash
   git checkout src/models/StudentFee.ts
   git checkout src/services/finance.service.ts
   git checkout src/controllers/payment.controller.ts
   git checkout src/controllers/examFee.controller.ts
   git checkout src/controllers/salary.controller.ts
   git checkout src/controllers/finance.controller.ts
   ```
2. Drop newly created collections (if created):
   - `financialidempotencies`
   - `financialreferences`
   - `paymentreversals`
3. Verify collection counts match `collection-counts-before.json`.
4. Re-run TypeScript check: `npm run build`.
