# School Management System

A production-quality School Management System: a React + TypeScript frontend backed by a Node.js + Express + TypeScript REST API, persisted in MongoDB (512 MB storage budget).

```text
React + TypeScript + Vite Frontend (Tailwind CSS + shadcn/ui)
      ↓ REST API (JSON, JWT bearer auth)
Node.js + Express + TypeScript Backend (Mongoose)
      ↓
MongoDB (512 MB storage budget)
```

Files, images and documents are stored externally — MongoDB holds only references (URLs). No file bytes or Base64 are ever stored in the database.

---

## Table of contents

0. [Multi-Tenant SaaS & Platform Admin Guide](#0-multi-tenant-saas--platform-admin-guide)
1. [Overview](#1-overview)
2. [Features](#2-features)
3. [Tech Stack](#3-tech-stack)
4. [Architecture](#4-architecture)
5. [Project Structure](#5-project-structure)
6. [Prerequisites](#6-prerequisites)
7. [Installation](#7-installation)
8. [Environment Variables](#8-environment-variables)
9. [Database Setup & Seeding](#9-database-setup--seeding)
10. [Running the App (Development)](#10-running-the-app-development)
11. [Running the Test Suites](#11-running-the-test-suites)
12. [Production Build & Run](#12-production-build--run)
13. [API Reference](#13-api-reference)
14. [Roles & Permissions](#14-roles--permissions)
15. [Security Features](#15-security-features)
16. [Storage, Indexes & Performance](#16-storage-indexes--performance)
17. [Backup & Restore](#17-backup--restore)
18. [Deployment](#18-deployment)
19. [Known Limitations](#19-known-limitations)
20. [Troubleshooting](#20-troubleshooting)

---

## 0. Multi-Tenant SaaS & Platform Admin Guide

This School Management System is a commercial, multi-tenant SaaS application allowing the software owner to operate and sell subscriptions to multiple educational institutions with complete tenant data isolation, automated trials, offline payment proof verification, and an executive Platform Admin control panel.

### A. SaaS Core Highlights
1. **Multi-Tenancy with Complete Isolation (`tenantId`)**:
   - Every collection (`Student`, `Teacher`, `Class`, `Section`, `Subject`, `AcademicSession`, `StudentAttendance`, `TeacherAttendance`, `Timetable`, `Exam`, `Mark`, `FeeStructure`, `StudentFee`, `Payment`, `Income`, `Expense`, `SalaryRecord`, `Assignment`, `Submission`, `Notice`, `Notification`, `LeaveRequest`, `AuditLog`, `StudentHistory`, `ReceiptCounter`, `SchoolSettings`) carries an indexed `tenantId: ObjectId`.
   - Compound indexes (e.g. `{ tenantId: 1, admissionNumber: 1 }`, `{ tenantId: 1, email: 1 }`) guarantee unique constraints are scoped strictly per institution.
   - All controller queries are strictly scoped to the authenticated tenant.
2. **7-Day Automatic Free Trial**:
   - Schools register self-service at `/register`.
   - Backend calculates `trialEndsAt = registrationDate + 7 days` (server-controlled, client cannot tamper).
   - Instant access with zero credit card required.
3. **Automated Trial & Subscription Expiration Enforcement**:
   - The backend `checkSubscriptionAccess` middleware runs on all operational school endpoints.
   - If trial/subscription period lapses, requests receive `403 SUBSCRIPTION_REQUIRED` with a structured code.
   - **Zero data loss**: Existing school records, student marks, and payment ledger are never deleted.
   - The `/billing` and `/subscription/*` endpoints remain accessible so school owners can select a plan and submit renewals even after expiry.
4. **Manual Payment System with Receipt Upload (Zero MongoDB Bloat)**:
   - Schools view official bank accounts / EasyPaisa / JazzCash details and transfer fees.
   - Proof screenshot / PDF slip is uploaded via `POST /api/subscription/payments`.
   - **Critical Storage Rule**: Proofs are written to disk (`backend/uploads/proofs/`) using Multer and served statically via `/uploads/proofs/`. **NEVER** stored as Base64 or binary in MongoDB, strictly protecting MongoDB's 512 MB storage budget.
5. **Platform Admin Control Panel (`/platform-admin/*`)**:
   - Executive dashboard for SaaS owners.
   - Real-time subscriber metrics (total schools, active subscriptions, trials, pending approvals, recorded revenue).
   - Customer directory with manual trial/subscription day extensions and emergency suspension controls.
   - Payment review queue: view receipt screenshots, 1-click atomic approval with race-condition prevention, rejection with client notes, and automatic early renewal balance stacking.
   - Subscription plan & payment method CRUD.
   - Real-time notification bell with badges for new school signups and submitted payment proofs.

### B. SaaS Environment Variables

The backend `.env` supports these additional parameters:

```env
# SaaS Platform Admin & Trial Configuration
PLATFORM_ADMIN_EMAIL=platformadmin@saas.school
PLATFORM_ADMIN_INITIAL_PASSWORD=PlatformAdmin2026!
TRIAL_DAYS=7
PAYMENT_PROOF_MAX_SIZE=5242880
```

### C. Migration & Bootstrap Scripts

Run from the `backend/` directory:

1. **Idempotent Multi-Tenant Migration** (Existing single-tenant data to multi-tenant):
   ```bash
   npm run migrate:saas
   ```
   - Creates the default tenant "Al-Huda School" (`al-huda-school`) with an active subscription.
   - Safely updates all existing database records to attach `tenantId` pointing to "Al-Huda School".
   - Seeds default subscription plans (Starter, Professional, Enterprise) and payment methods (HBL, EasyPaisa, JazzCash).
   - Safe to re-run multiple times (idempotent; skips existing documents).

2. **Platform Admin Bootstrap**:
   ```bash
   npm run bootstrap:platform-admin
   ```
   - Creates the SaaS Platform Owner account if it does not already exist.

### D. Default Credentials for Testing

| Role | Portal URL | Email | Password | Scope |
| --- | --- | --- | --- | --- |
| **SaaS Platform Owner** | `http://localhost:5173/platform-admin/login` | `platformadmin@saas.school` | `PlatformAdmin2026!` | Global SaaS Platform Control |
| **School Administrator** | `http://localhost:5173/login` | `admin@school.test` | `Password123` | Al-Huda School Workspace |
| **Public School Signup** | `http://localhost:5173/register` | *(Enter any new email)* | *(Your password)* | Instant 7-day trial instance |

### E. SaaS Customer & Owner Workflows

#### Customer Lifecycle:
1. Navigate to `/register`.
2. Enter institution name, administrator details, and password.
3. System automatically creates tenant, generates 7-day trial, provisions default school settings, and logs administrator into `/dashboard`.
4. Visual trial warning banner notifies when trial has 3 days or fewer remaining.
5. Administrator opens `/billing` to choose a plan (Starter, Professional, Enterprise).
6. Administrator selects official bank account / mobile wallet, transfers funds, and uploads transfer screenshot.
7. Payment appears in "Payment Verification History" with `Pending Review` status.

#### Platform Owner Lifecycle:
1. Navigate to `/platform-admin/login` and log in with platform owner credentials.
2. Review executive metrics on `/platform-admin/dashboard`.
3. Open `/platform-admin/payments` to review pending payment proofs.
4. Click **View Receipt** to inspect the screenshot proof in full resolution.
5. Click **Approve** (optionally add note):
   - Payment status transitions atomically to `approved` (preventing double-approval).
   - Customer account status becomes `active`.
   - Subscription end date extends by plan duration (if customer still had remaining days, duration is added to the remaining balance — zero lost days).
6. If a school violates terms, click **Suspend** in `/platform-admin/customers` to lock access immediately.

### F. SaaS Automated Test Suite

Run the full SaaS multi-tenancy and platform admin test suite from `backend/`:

```bash
npm run test:saas
```

**34 test scenarios verified automatically**:
- Platform Admin authentication
- Public subscription plans and payment methods retrieval
- Customer self-service 7-day trial registration
- Rejection of duplicate email registration
- Subscription status & days remaining computation
- Multipart payment proof upload with file type/size validation and disk persistence
- Platform Admin pending payment review queue
- Atomic payment approval & status transition
- Double-approval prevention
- Automatic subscription extension (early renewal duration stacking)
- Platform Admin dashboard metrics (revenue, active subscriptions, trials)
- Customer suspension and unsuspension enforcement (403 `ACCOUNT_SUSPENDED`)
- Strict multi-tenant data isolation (no cross-tenant leakage between schools)

---

## 1. Overview

The system covers the full administrative and academic lifecycle of a small/medium school:

- **Authentication & administration** — six roles (super_admin, admin, teacher, student, accountant, receptionist), configurable role/permission matrix stored in MongoDB, audit log of every sensitive action, user deactivation that invalidates live sessions immediately.
- **Academic core** — academic sessions (exactly one active at a time), classes, sections, subjects, students, teachers, and year-end promotion with immutable student history.
- **Attendance & timetable** — daily student and teacher attendance with duplicate prevention (per student + session + date, per teacher + date), per-student/per-class summaries, CSV export, and a day-wise timetable with teacher/class double-booking conflict detection (no room assignment anywhere, by design).
- **Exams & results** — exams, bulk mark entry, duplicate mark prevention (per student + session + exam + subject), result cards, class performance, ranks with ties and configurable grade boundaries — grades and ranks are always computed backend-side; there is no GPA anywhere.
- **Finance** — fee structures, per-student fee generation, ledger, payments with tamper-proof server-generated receipts (monotonic receipt numbers), incomes, expenses, salaries, dashboard aggregates and CSV reports. All money is stored in the smallest currency unit (paisa) — integers only, no floats.
- **Communication** — assignments, submissions, notices, notifications (compacted + retention), and leave requests.
- **Portals, search & settings** — role-scoped dashboard analytics, global search, printable/exportable reports, and school-wide branding settings.

## 2. Features

| Area | Highlights |
| --- | --- |
| Auth | JWT access + refresh, logout revocation, inactive accounts blocked at login AND on live requests |
| Users & roles | Full user CRUD, archive/deactivate/reactivate, Super-Admin-only management of Super Admin accounts, system roles cannot be deleted or deactivated |
| Students & teachers | Profiles linked to user accounts (`/students/me`, `/teachers/me`), class/section assignments, promotion with history |
| Attendance | Bulk marking, duplicate prevention, future-date rejection, section membership validation, role scoping (students see only themselves), summaries + CSV |
| Timetable | Day-wise periods, break periods, teacher/class conflict detection, period swapping, print metadata |
| Exams | Class-exam lifecycle, publish/unpublish, bulk marks with overwrite, unique mark records, result cards, ranks with ties |
| Grades | Configurable grade scales (percentage bands, labels, remarks) — no GPA |
| Finance | Fee structures, student fees, generation, adjustments, ledger, payments + receipts, incomes, expenses, salaries, reports + CSV |
| Communication | Assignments (file refs only), submissions with review, notices with audiences, compact notifications, leave requests |
| Search & reports | Global role-scoped search; exam, attendance, session and teacher-workload reports |
| Settings | School branding, receipt/result-card appearance, active session selection |
| System | 512 MB storage budget monitor with 70/80/90 % thresholds, retention cleanup, index audit/sync |

## 3. Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, react-router-dom, axios, lucide-react |
| Backend | Node.js, Express 4, TypeScript, Mongoose 8, Zod |
| Database | MongoDB (single replica/deployment; 512 MB budget) |
| Auth | JSON Web Tokens (access + refresh), bcryptjs password hashing |
| Security | helmet, CORS origin whitelist, express-rate-limit, 1 MB body limits |
| Logging | morgan (dev/prod), internal structured logger |
| Testing | Node-based integration suites (native `fetch`) run against a live server |

## 4. Architecture

```text
┌────────────────────────────┐
│  React SPA (frontend/)     │  Role-aware UI; permissions hide/allow actions
│  axios client (lib/api.ts) │  but the BACKEND always re-enforces them
└────────────┬───────────────┘
             │ REST /api/*  (JSON + JWT bearer)
┌────────────▼───────────────┐
│  Express app (backend/)    │
│  helmet → CORS → rateLimit │
│  → json(1 MB) → routes     │
│  route modules:            │
│   auth, users, roles,      │
│   audit, academic,         │
│   attendance, exams,       │
│   finance, prompt7 (comm), │
│   prompt8 (search/dash/    │
│   reports), system         │
│  middleware: authenticate  │  Every request re-verifies the user in DB
│  (live deactivation check),│  → deactivated accounts fail immediately
│  requirePermission (Mongo  │
│  matrix, short TTL cache)  │
│  controllers → services    │
│  → Mongoose models         │
└────────────┬───────────────┘
             │ Mongoose
┌────────────▼───────────────┐
│  MongoDB (512 MB budget)   │  Unique indexes enforce duplicate prevention
│  Files: references only    │  (URLs to external storage)
└────────────────────────────┘
```

Conventions that keep the system safe and small:

- **Money** is always the smallest currency unit (integer paisa). The backend computes every total, remaining balance, receipt number and collection amount — clients never supply them.
- **Sessions** — exactly one active academic session; promotion/archiving never mutates historical records.
- **Compact logs** — notifications and audit logs are trimmed by retention cleanup (read notifications 90 d, audit entries 180 d, configurable per call).
- **Pagination** — all large endpoints paginate (default 20, max 100) with projections and `.lean()`.

## 5. Project Structure

```text
school-management-system/
├── backend/
│   ├── src/
│   │   ├── config/        # env, db connection, permission matrix, retention policy
│   │   ├── controllers/   # one module per feature area
│   │   ├── middleware/    # authenticate, requirePermission, validate, error handler
│   │   ├── models/        # all Mongoose models + serializers
│   │   ├── routes/        # route modules, mounted via path-scoped regexes in index.ts
│   │   ├── services/      # auth, permissions, audit, finance, attendance, exams,
│   │   │                  # notifications, retention, storage reporting
│   │   ├── scripts/       # seed.ts, storageReport.ts, indexAudit.ts
│   │   ├── validators/    # Zod schemas (strict — extra keys rejected)
│   │   └── utils/
│   └── tests/             # integration suites (foundation, auth, academic,
│                          # attendance, exams, finance, prompt7, prompt9, prompt10)
├── frontend/
│   └── src/
│       ├── components/    # PageHeader, DataTable, StatCard, EmptyState, ConfirmDialog, ui/*
│       ├── context/       # AuthContext (token, user, permissions, can())
│       ├── lib/           # api client, format helpers (currency/paisa/dates)
│       ├── pages/         # one page per module incl. dashboards/portals
│       └── routes/        # route table + role/permission gating
├── docs/                  # BACKUP_RESTORE.md, DEPLOYMENT.md, FINAL_REPORT.md
└── README.md
```

## 6. Prerequisites

- Node.js ≥ 18 (tested on Node 20)
- npm ≥ 9
- MongoDB ≥ 6.0 (tested on MongoDB Community Server 7.0)
- Free disk space: the backend needs ~200 MB with dependencies; MongoDB is budgeted at **512 MB** of data + indexes.

## 7. Installation

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env        # then edit values (section 8)

# 2. Frontend
cd ../frontend
npm install
cp .env.example .env        # normally leave VITE_API_URL empty (dev proxy)
```

## 8. Environment Variables

**Backend (`backend/.env`)** — never commit real secrets; the repo ships `.env.example`:

| Variable | Purpose | Example |
| --- | --- | --- |
| `PORT` | HTTP port | `4000` |
| `NODE_ENV` | `development` / `test` / `production` | `development` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/school_management` |
| `JWT_ACCESS_SECRET` | Signs access tokens | long random string |
| `JWT_REFRESH_SECRET` | Signs refresh tokens | different long random string |
| `ACCESS_TOKEN_EXPIRES_IN` | Access token lifetime | `15m` |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token lifetime | `7d` |
| `FRONTEND_URL` | Allowed CORS origin in production | `https://school.example.com` |
| `AUTH_RATE_LIMIT_MAX` | Login attempts per window | `30` |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Login limiter window | `900000` |
| `API_RATE_LIMIT_MAX` | Global requests per window | `240` |
| `API_RATE_LIMIT_WINDOW_MS` | Global limiter window | `60000` |

**Frontend (`frontend/.env`)**:

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API origin in production (e.g. `https://api.yourschool.example`); empty in dev → same-origin Vite proxy |

The frontend never hardcodes an API host: `src/lib/api.ts` resolves `VITE_API_URL` with a same-origin fallback.

## 9. Database Setup & Seeding

1. Start MongoDB (`mongod --dbpath <dir>`).
2. Configure `MONGODB_URI` in `backend/.env`.
3. Seed demo data (explicit command only — seeding never runs automatically in production):

```bash
cd backend
npm run seed
```

The seed is idempotent (upserts) and creates:

- Six demo users — one per role — all with password **`Password123`**:
  `superadmin@school.test`, `admin@school.test`, `teacher@school.test`, `student@school.test`, `accountant@school.test`, `receptionist@school.test`
- An active academic session, classes/sections/subjects, teachers (T-1001…), students (linked to the demo student login), grade scale, exams, fee structures + generated student fees, a demo assignment, a pending leave request and notices.
- Role permission matrices are refreshed from `DEFAULT_ROLE_PERMISSIONS` on every seed run — re-run the seed after editing `src/config/permissions.ts`.
- Marks records missing a `sessionId` are backfilled automatically (one-time data migration).

## 10. Running the App (Development)

```bash
# Terminal 1 — backend (tsx watch, auto-restart)
cd backend && npm run dev        # http://localhost:4000

# Terminal 2 — frontend (Vite dev server with /api proxy)
cd frontend && npm run dev       # http://localhost:5173
```

Vite proxies `/api` to the backend during development, so the frontend never talks to a hardcoded host. Health check: `GET /api/health` returns `{ server, database, uptime, environment, timestamp }`.

## 11. Running the Test Suites

The backend ships nine integration suites (plain Node + `fetch` against a live server on port 4000). Start the backend, then:

```bash
cd backend
node tests/foundation.test.mjs    # security baseline (12 checks)
node tests/academic.test.mjs      # Prompt 3 — academic core (61)
node tests/attendance.test.mjs    # Prompt 4 — attendance + timetable (52)
node tests/exams.test.mjs         # Prompt 5 — exams/marks/results (64)
node tests/finance.test.mjs       # Prompt 6 — finance (84)
node tests/prompt7.test.mjs       # Prompts 7+8 — assignments…settings (57)
node tests/prompt10.test.mjs      # Prompt 10 — six-role QA (67)
node tests/prompt9.test.mjs       # Prompt 9 — storage & security (23) ← runs LAST
node tests/auth.test.mjs          # auth & sessions (85)                ← runs LAST
```

**Total: 505 checks.** Ordering notes:

- Run `prompt9` last: its final test deliberately bursts past the rate limiter, which then blocks other suites until the window resets.
- Run `auth` last: it performs many logins and exhausts the stricter login limiter.
- If a suite reports 429s, restart the backend (`npm run dev`) — rate counters live in memory.

## 12. Production Build & Run

```bash
# Backend
cd backend
npm run typecheck && npm run build   # compiles to dist/
NODE_ENV=production npm start        # node dist/server.js

# Frontend
cd frontend
npx tsc --noEmit && npm run build    # static bundle in dist/
```

Serve `frontend/dist/` from any static host and point `VITE_API_URL` (set at build time) at the API origin. Current build: 831.77 kB JS (229.09 kB gzip), single chunk warning only.

## 13. API Reference

All endpoints live under `/api` (except the health probe `/api/health`) and require `Authorization: Bearer <accessToken>` unless marked public. Standard response envelopes:

```jsonc
// success (list)
{ "success": true, "data": [...], "pagination": { "page": 1, "limit": 20, "total": 87, "totalPages": 5 } }
// success (single)
{ "success": true, "data": { ... } }
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

| Module | Endpoints |
| --- | --- |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` |
| Users | `GET/POST /users`, `GET/PATCH /users/:id`, `POST /users/:id/activate|deactivate|archive|restore` |
| Roles | `GET/POST /roles`, `GET/PATCH /roles/:id`, `GET /roles/:id/permissions`, `PUT /roles/:id/permissions` |
| Audit | `GET /audit-logs`, `GET /audit-logs/filters` |
| Academic | `/academic-sessions`, `/classes`, `/sections`, `/subjects`, `/students` (+ `/students/me`), `/teachers` (+ `/teachers/me`), `/promotions` |
| Attendance | `/student-attendance` (+ `/summary`, `/student-summary`), `/teacher-attendance` (+ `/summary`), `/my-attendance` |
| Timetable | `/timetables` (+ `/:id/swap`, `/:id/print`) |
| Exams | `/exams`, `/marks` (+ `/bulk`), `/results` (+ `/result-card/:studentId`, `/marks-sheet/:examId`, `/class-performance`), `/grade-scales` |
| Finance | `/fee-structures`, `/student-fees` (+ `/generate`, `/ledger`), `/payments` (+ `/:id/receipt`), `/incomes`, `/expenses` (+ `/categories`), `/salaries`, `/finance/dashboard`, `/finance/reports/*` |
| School settings | `GET/PATCH /school-settings` |
| Communication | `/assignments` (+ `/:id/archive|restore`), `/submissions` (+ `/:id/review`), `/notices` (+ `/:id/publish|archive`), `/notifications` (+ `/read-all`, `/:id/read`), `/leave-requests` (+ `/:id/review`) |
| Search & analytics | `/search`, `/dashboard/analytics` |
| Reports | `/reports/exams`, `/reports/attendance`, `/reports/session-overview`, `/reports/teacher-workload` (each supports `?format=csv`) |
| System | `GET /system/storage` (super_admin), `POST /system/cleanup` (super_admin) |

All finance/report list endpoints additionally accept `?format=csv` for UTF-8 BOM CSV downloads.

## 14. Roles & Permissions

Six system roles ship pre-seeded; the matrix lives in `backend/src/config/permissions.ts` (module × action) and is stored per-role in MongoDB, so it can be edited at runtime by administrators with the `roles` permission.

| Role | Highlights |
| --- | --- |
| Super Admin | Everything, including storage report + retention cleanup and Super-Admin account management |
| Admin | Full academic/exam/finance/communication management, users, roles, settings, reports |
| Teacher | Own profile, classes/subjects, attendance marking, exams/marks, assignments (own), notices, own leave |
| Student | Own profile/attendance/fees/results, assignments + submissions, notices, own leave |
| Accountant | Fees, payments, incomes, expenses, salaries, finance reports |
| Receptionist | View students/teachers/classes, mark attendance, view notices/notifications |

The frontend hides forbidden actions, but the backend enforces every rule via `requirePermission` — UI hiding is never security. Students' permission matrix contains no staff modules; verified by the QA suite.

## 15. Security Features

- **Passwords** — bcrypt-hashed; plaintext never logged or returned.
- **JWT** — access (15 m) + refresh (7 d); logout revokes the session server-side.
- **Deactivation** — deactivated accounts are rejected at login **and** their live sessions fail on the next request (the auth middleware re-checks the account in MongoDB on every call).
- **Helmet** security headers on every response.
- **CORS** — origin whitelist (`FRONTEND_URL`); disallowed origins get no CORS headers.
- **Rate limiting** — global API limiter + stricter login limiter with `RATE_LIMITED` payloads.
- **Request size** — JSON bodies capped at 1 MB (`PAYLOAD_TOO_LARGE` 413).
- **Mass assignment** — all create/update bodies pass strict Zod schemas plus explicit field whitelists in controllers; unknown keys are rejected.
- **Injection** — every user string used in `$regex` is escaped; query schemas are strict, so `$`-operator keys in query strings are rejected; sort fields are fixed server-side.
- **Error responses** — internal details (stack traces, DB internals) are never returned; production mode returns generic messages.
- **Sensitive fields** — teacher salaries are hidden unless the caller needs them; password hashes never appear in list payloads.

## 16. Storage, Indexes & Performance

The production MongoDB budget is **512 MB** (data + indexes).

- **Unique indexes** (duplicate prevention enforced at the database level): `users.email`, `students.admissionNumber`, `teachers.employeeId`, `payments.receiptNumber`, attendance tuples `(studentId, sessionId, attendanceDate)` and `(teacherId, attendanceDate)`, marks `(studentId, sessionId, examId, subjectId)`, submissions `(assignmentId, studentId)`.
- **Index audit** — `npm run indexes:audit` compares schemas vs the live database (duplicates/orphans/missing); `npm run indexes:sync` drops orphaned indexes.
- **Storage report** — `npm run storage:report` (CLI) or `GET /api/system/storage` (super_admin) prints per-collection sizes and usage against the 512 MB budget with thresholds: **70 % warning, 80 % elevated, 90 % critical**.
- **Retention** — `POST /api/system/cleanup` (super_admin) deletes read notifications older than 90 days and audit entries older than 180 days (windows configurable per call); unread notifications and source records are never touched.
- **Queries** — pagination everywhere (default 20, max 100), projections and `.lean()` on hot paths, minimal populate.
- **No binary** — MongoDB stores references only: no Base64, file bytes, PDFs or CSV exports are ever stored.

## 17. Backup & Restore

MongoDB-level backup/restore using `mongodump`/`mongorestore` (works while the app runs). Full walkthrough, including verification and disaster-recovery steps: see **[docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md)**.

```bash
mongodump --uri="$MONGODB_URI" --out=backup/$(date +%F)
mongorestore --uri="$MONGODB_URI" --drop backup/<timestamp>/school_management
```

External files (uploaded documents etc.) live outside MongoDB and must be backed up with their own storage provider — the database only references them.

## 18. Deployment

Documented, production-style deployment steps for a single VM (Node + PM2 + Caddy/nginx + MongoDB with auth): see **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

What was actually performed in this workspace (not invented): development build + production bundles for both apps, the full nine-suite QA run, storage report and index audit against a live MongoDB 7.0 instance. A real cloud deployment was **not** executed in this environment — the deployment guide documents the exact steps to perform elsewhere and marks clearly which steps still require manual configuration (secrets, DNS, TLS).

## 19. Known Limitations

- In-memory rate limiter — counters reset on backend restart (a Redis-backed store can be swapped in).
- Demo data in seed uses one shared password (`Password123`) — development only.
- File uploads are referenced by URL; no upload/binary storage endpoint ships with the app (per the external-storage constraint).
- No GPA, library, transport, parent portal or room-assignment modules — intentionally out of scope.
- Auth-session cleanup for expired refresh sessions relies on retention cleanup; the auth suite demonstrates live deactivation.
- The frontend production bundle emits one chunk-size warning (831 kB); acceptable for this scope.

## 20. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `MongoDB disconnected` / API refuses to start | Ensure `mongod` is running and `MONGODB_URI` is correct |
| Tests return `429 RATE_LIMITED` | Restart the backend (in-memory counters) and run `prompt9`/`auth` last |
| Login rejected after editing permissions | Re-run `npm run seed` — matrices are refreshed on seed |
| `VALIDATION_ERROR` on an old client | Zod schemas are strict; update the client payload to the documented shape |
| `PAYLOAD_TOO_LARGE` | Body exceeded 1 MB — shrink or paginate the upload |
| Storage report shows > 70 % | Run retention cleanup and consult `docs/BACKUP_RESTORE.md` archival section |

---

## Appendix — QA & final report

- QA summary: `docs/FINAL_REPORT.md` (11-section production readiness report: final status, modules verified, bugs found/fixed, security fixes, storage optimizations, tests executed, build status, remaining manual configuration, known limitations, deployment readiness).
- Test totals: **505 checks across 9 suites, all passing** (Prompt 9 suite intentionally exhausts the rate limiter as its final check).
