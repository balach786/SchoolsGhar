# PHASE 4B ROLLBACK INSTRUCTIONS

In the event that Phase 4B requires rollback:

## 1. Code Rollback
```bash
git checkout eb35ef67db339778f3b5df18a591b5cc06d1ecc8
```

## 2. Drop Staff Collection & Indexes
Connect to MongoDB Atlas `school-management-system` and drop the newly created `staff` collection:
```javascript
db.staff.drop();
```

## 3. Re-verify Physical Teachers Collection
Confirm that `teachers` collection was not dropped and remains intact:
```javascript
db.teachers.countDocuments(); // Expected: 0
```

## 4. Run Health & Regression Verification
```bash
npm run typecheck
node tests/foundation.test.mjs
```
