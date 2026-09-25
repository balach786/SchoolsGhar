# Phase 3 Rollback Instructions

Run ID: phase3-20260913-150500
Generated At: 2026-09-13T10:05:13.978Z

## Automatic Rollback Script
```bash
npx tsx src/scripts/rollbackPhase3.ts
```

## Manual Rollback Actions
1. Restore notification 6aa5ad3d06abfd0205323555:
```javascript
db.notifications.updateOne(
  { _id: ObjectId("6aa5ad3d06abfd0205323555") },
  { $unset: { tenantId: "" } }
);
```

2. Restore 9 AuditLog documents to un-scoped legacy state:
```javascript
db.auditlogs.updateMany(
  { tenantId: ObjectId("6aa5a3a2771a68376318390c"), createdAt: { $lte: new Date("2026-09-12T22:00:00Z") } },
  { $unset: { scope: "" } }
);
```

3. Code Rollback:
```bash
git checkout -- src/models/Notification.ts src/models/TeacherAttendance.ts src/models/Income.ts src/models/Expense.ts src/models/Assignment.ts src/controllers/schoolSettings.controller.ts
```
