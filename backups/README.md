# Database Backups

This directory contains full database backups for the School Management System (MongoDB).

## Structure
- Each backup is stored in its own timestamped directory: `backup-YYYY-MM-DDTHH-mm-ss-sssZ/`
- `latest/`: Contains a copy of the most recent backup.
- For each collection, two files are created:
  - `<collection>.json`: Canonical MongoDB Extended JSON (EJSON) containing all documents with exact BSON types (`ObjectId`, `Date`, numbers, etc.).
  - `<collection>.indexes.json`: Index definitions for recreating custom indexes during restore.
- `backup-summary.json`: Detailed backup metadata (timestamp, collection names, document counts, index counts, and sizes).

## How to Take a New Backup
From the `backend` folder, run:
```bash
npm run backup
```

## How to Restore / Re-import the Database
To restore from the latest backup:
```bash
npm run restore
```

To restore from a specific timestamped backup folder:
```bash
npm run restore -- ../backups/backup-2026-09-13T07-43-29-456Z
```
