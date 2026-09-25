# Phase 2 Rollback Instructions

Run ID: phase2-20260913-145000
Generated At: 2026-09-13T09:50:12.687Z

## Automatic Rollback Script
Execute the rollback script:
```bash
npx tsx src/scripts/rollbackPhase2.ts
```

## Manual Rollback Steps
### 1. Database Index Rollback
#### Condition A: BEFORE Multi-Event Data Exists (Zero students have >1 record for same session)
1. Re-create the unique index:
```javascript
db.studenthistories.createIndex(
  { tenantId: 1, studentId: 1, sessionId: 1 },
  { unique: true, name: "tenantId_1_studentId_1_sessionId_1" }
);
```
2. Drop the newly added chronological indexes:
```javascript
db.studenthistories.dropIndex("tenantId_1_studentId_1_eventDate_-1");
db.studenthistories.dropIndex("tenantId_1_sessionId_1_eventDate_-1");
```

#### Condition B: AFTER Multi-Event Data Exists (At least one student has multiple events in same session)
1. Do NOT attempt to blind create unique index; it will fail with code 11000.
2. Inspect duplicate events:
```javascript
db.studenthistories.aggregate([
  { $group: { _id: { tenantId: "$tenantId", studentId: "$studentId", sessionId: "$sessionId" }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
]);
```
3. Resolve or archive the secondary events prior to unique index recreation.

### 2. Code Rollback
Revert git working tree to commit eb35ef67db339778f3b5df18a591b5cc06d1ecc8:
```bash
git checkout -- src/models/StudentHistory.ts src/models/Student.ts src/models/AuditLog.ts src/validators/academic.validators.ts src/controllers/student.controller.ts src/controllers/platformAdmin.controller.ts src/services/audit.service.ts src/services/dataTransfer/import.service.ts
```
