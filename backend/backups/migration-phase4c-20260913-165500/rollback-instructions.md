# PHASE 4C ROLLBACK INSTRUCTIONS & PRODUCTION SAFETY GUIDANCE

## ARCHITECTURAL PRINCIPLE: SAFEGUARD PUBLISHED ACADEMIC RECORDS
Once official student Result snapshots have been published in production, they represent legal, historically binding academic credentials. They must NEVER be blindly destroyed during an application rollback or code revert.

---

## SCENARIO A: BEFORE ANY PRODUCTION PUBLISHED RESULTS EXIST (Pre-Go-Live / Failed Initial Test)
If Phase 4C rollback is required *before* real student results have been published in production:
1. Ensure no production records are present in `results`:
   ```javascript
   db.results.countDocuments(); // must be 0 or contain only test fixtures
   ```
2. Drop the empty/test `results` collection:
   ```javascript
   db.results.drop();
   ```
3. Revert code changes to git commit `eb35ef67db339778f3b5df18a591b5cc06d1ecc8`:
   ```bash
   git checkout eb35ef67db339778f3b5df18a591b5cc06d1ecc8
   ```
4. Re-verify TypeScript compilation:
   ```bash
   npm run typecheck
   ```

---

## SCENARIO B: AFTER OFFICIAL PRODUCTION RESULTS EXIST (Post-Go-Live)
> [!CAUTION]
> **CRITICAL PRODUCTION DEFENSE:** DO NOT EXECUTE `db.results.drop()` OR DELETE ANY DOCUMENT FROM `results`.
> Published results are permanent academic history.

If application rollback is necessitated after real students' Result snapshots have been published:

### 1. Freeze Academic Publication
Temporarily disable new publications and re-publications via feature flag, environment variable, or revoking `results.publish` and `results.republish` permissions from roles.

### 2. Export and Archive Published Results Snapshot First
Before altering any application code, take a cold, immutable export of the entire `results` collection:
```bash
# Export using mongoexport or TenantExportService Mode B
mongoexport --uri="$MONGODB_URI" --collection=results --out="backups/results-archive-$(date +%Y%m%d%H%M%S).json"
```

### 3. Application Code Revert With Backward Compatibility
1. Revert application code separately.
2. **Preserve the physical `results` collection and its indexes** in MongoDB Atlas.
3. The compound index `{ tenantId: 1, examId: 1, studentId: 1, version: -1 }` remains intact and valid for historical lookups.
4. Old Result snapshots will remain safely readable by reporting and archiving services.

### 4. Verification Post-Rollback
Verify that:
- Total documents in `results` matches the pre-rollback count.
- Students collection (`40` baseline students) is intact.
- Baseline exams and marks are unaffected.
