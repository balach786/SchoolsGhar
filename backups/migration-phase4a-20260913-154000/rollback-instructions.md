# Phase 4A Rollback Instructions

In case of any unexpected regression during Phase 4A:

## 1. Code Rollback
Revert Git code modifications:
```bash
git checkout HEAD -- backend/src/models/ backend/src/controllers/ backend/src/services/
```

## 2. Index Rollback
If indexes were added:
```javascript
// In mongosh or via rollback script:
db.schoolsettings.dropIndex("tenantId_1");
db.schoolsettings.createIndex({ tenantId: 1 }); // restore non-unique

// Roll number indexes if created:
db.students.dropIndex("tenantId_1_sessionId_1_classId_1_sectionId_1_rollNumber_1");
db.students.dropIndex("tenantId_1_sessionId_1_classId_1_rollNumber_1");
```

## 3. Data Integrity
Phase 4A performs zero bulk data mutations on baseline business documents.
All 40 existing student records and core entities remain identical.
