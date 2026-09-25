# Backup & Restore

The School Management System persists everything in MongoDB. This guide covers full backup/restore of the database, scheduling, verification, and disaster recovery. **Only the database is covered here** — any externally stored files (uploaded documents, photos) live outside MongoDB and must be backed up with their own storage provider.

## 1. What to back up

- The entire MongoDB database (default name: `school_management`) — data + indexes.
- External file storage (if any): the app only stores URLs/references to external files, so back those files up wherever they live.
- Configuration: `backend/.env` (secrets) — keep a copy in a secure vault, **never in git**.

## 2. Online backup with mongodump (no downtime)

`mongodump` reads from a live deployment without stopping the app. With authentication enabled on production MongoDB:

```bash
# Ad-hoc dump to a timestamped folder
mongodump --uri="$MONGODB_URI" --out="backup/$(date +%F-%H%M)"

# Compress it
tar -czf "backup/$(date +%F-%H%M).tgz" "backup/$(date +%F-%H%M)"
```

For the URI format with credentials:
`mongodb://backupuser:password@127.0.0.1:27017/school_management?authSource=admin`

## 3. Restore with mongorestore

Restoring **replaces** existing documents when `--drop` is used. Do this during a maintenance window (or accept a brief inconsistency for the few seconds it takes on a 512 MB dataset).

```bash
# Restore into the SAME database, dropping collections present in the dump
mongorestore --uri="$MONGODB_URI" --drop "backup/2026-09-04-1200/school_management"

# Restore to a DIFFERENT database name (dry-run first!)
mongorestore --uri="mongodb://127.0.0.1:27017" \
  --nsFrom='school_management.*' --nsTo='school_management_restored.*' \
  --drop "backup/2026-09-04-1200/school_management"
```

## 4. Verify a backup / restored database

1. Restore to a scratch database (previous section).
2. Run sanity queries:

```bash
mongosh "mongodb://127.0.0.1:27017/school_management_restored" --quiet --eval '
  db.users.countDocuments({});            // expect ≥ 6 (seeded roles)
  db.academicsessions.countDocuments({isActive: true});  // expect exactly 1
  db.students.countDocuments({});
  db.payments.countDocuments({});
'
```

3. Point a throwaway backend instance at the scratch database and run the auth suite:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/school_management_restored npm run dev
node tests/auth.test.mjs
```

4. Check the storage footprint after restore: `npm run storage:report` — usage must stay under the 512 MB budget (70/80/90 % thresholds).

## 5. Point-in-time / journaling

For tighter RPOs, enable MongoDB replication (single-node replica set is sufficient) and use the Oplog with `mongodump --oplog`. Full PITR is beyond this app's scope; nightly logical dumps are the documented baseline.

## 6. Scheduling (cron)

Nightly at 02:30, keep 14 days:

```cron
30 2 * * * cd /opt/sms && mongodump --uri="$MONGODB_URI" --gzip --archive="backup/nightly-$(date +\%F).gz" && find backup -name 'nightly-*.gz' -mtime +14 -delete
```

Test the restore path **at least once a month** — an untested backup is not a backup.

## 7. Disaster recovery runbook

1. Bring up MongoDB (fresh install or existing node).
2. Restore the latest good dump with `--drop` (section 3).
3. Verify (section 4).
4. Start the backend (`npm start`), then check `GET /api/health` → `database: connected`.
5. If the dump predates recent changes, re-run the idempotent seed **only if this is a development environment** (`npm run seed`) — in production, the restored dump is authoritative.
6. Re-create any server-side secrets (`.env`) from your vault if the VM was rebuilt.
7. Confirm the frontend build's `VITE_API_URL` still points at the API.

## 8. Retention & archival of application data

- Within MongoDB, compact logs are trimmed by retention cleanup: `POST /api/system/cleanup` (super_admin) or `npm run storage:report` to review sizes.
- For long-term archival of old academic sessions: export the relevant reports (`/api/reports/session-overview?format=csv`, finance CSV reports), store the files externally, then delete only obsolete compact logs (audit/notifications) — never source records.
