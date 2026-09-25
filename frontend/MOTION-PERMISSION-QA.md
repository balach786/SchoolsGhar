# Motion, permissions and project QA — 9 September 2026

This report supersedes the earlier frontend-only handover. This pass includes backend authorization repairs. Automated mutation tests used named QA databases, not the working school's database. Four legacy timetable records in the configured database were repaired separately using their existing session ownership.

## 1. Motion System Added

Centralized Framer Motion variants and components in `src/lib/motion.ts` and `src/components/motion/index.tsx`. Shared timings are 180, 340 and 560 milliseconds. Reusable components cover reveals, staggered groups, cards, page entrances, sidebar entrances and active navigation indicators. The existing teal design and curved section transitions remain.

## 2. Scroll Reveal Implementation

Applied reveals to landing sections, hero content, feature/role groups, dashboard cards, profiles, reports and billing. Reveals run once; tall dashboard groups use an intersection threshold that cannot leave their content hidden on small screens. Reduced-motion variants render content visibly without translation or stagger.

## 3. Sidebar Animation

School and platform sidebars have separate shell entrances, staggered menu items and shared-layout active pills. Mobile drawers retain background scroll locking and focus trapping. Escape closes them and restores focus to the corresponding menu trigger. Verified in the browser.

## 4. Page Transition Changes

Route content uses a short opacity and 8-pixel entrance without remounting the persistent desktop sidebar. Dialogs, overlays, dropdowns and buttons use consistent transitions. Reduced-motion preferences disable unnecessary movement.

## 5. Permission Error Root Cause

The frontend treated platform administrators as authorized for school modules. The backend also trusted role information from an existing access token after the account's role changed. Role configuration and several user mutations lacked school isolation. These were authorization-context defects, not simply a wrong Users permission string.

## 6. Permission Fix Applied

Authentication resolves the live account, role, tenant and active status. School permission helpers reject platform and tenantless identities. School role overrides now belong to an individual tenant rather than modifying shared default roles. User reads/mutations, role membership lists and timetable operations enforce school ownership. `/users/roles` allows authorized Users managers to load role options without granting access to the permission editor. Auth loading and permission refresh states prevent premature forbidden screens; permission errors trigger a deduplicated refresh. Delayed token refresh responses cannot restore a signed-out session.

## 7. Role Access Verification

Checked all seven roles through API tests and browser sign-in/navigation: School Super Admin, School Admin, Teacher, Student, Accountant, Receptionist and Platform Admin. Default Users access succeeds for the two school administrator roles and is denied to the other school roles. A teacher's direct Users route renders Access Restricted with a dashboard link. A platform account redirects to its own dashboard. Existing tokens correctly gain or lose authorization after promotion/demotion. Custom Users-view access can load role options while remaining blocked from the role editor.

## 8. UI Bugs Fixed

Fixed the dashboard attendance total, narrow-screen card overflow, profile/report tab overflow, drawer focus restoration and profile headings showing missing values during loading. Student Attendance, Results and Fees tabs now load actual API records instead of development placeholders, with permission-aware empty/error/loading states and record pagination. Browser verification included a present attendance entry, a 180/200 result (90%, A+) with two subjects, and three fee balances. User creation, editing, role assignment, deactivation, reactivation and roster search were exercised using disposable QA records. Profile creation respects create permission separately from edit permission.

## 9. Console Errors Fixed

No console errors or warnings were observed in the final school and platform browser checks. Fixed a teacher dashboard module import that failed in the integration environment. Earlier development-server connection failures during interrupted runs were resolved by restarting the isolated preview.

## 10. API / Network Errors Fixed

Corrected false Users authorization failures, stale-role authorization, cross-school user changes, shared role overrides and timetable ownership gaps. Restored tenant attribution to login audit entries. The final API smoke run passed 72 permitted module reads plus all seven role login/dashboard/logout flows. Expected 401, 403, 404, 413 and 429 responses in negative security tests are intentional.

## 11. Responsive Fixes

Checked 375, 430, 768, 1024, 1280, 1440 and 1920-pixel widths across the landing page, school dashboard, Users, profiles, Reports, Billing and platform dashboard/customer views. Repaired the failures found at 375 pixels and rechecked those widths. Wide data tables scroll within their containers; page-level horizontal overflow is removed in the checked views. Viewport overrides were reset after testing.

## 12. Multi-Tenant Regression Test

The targeted permission suite passed 59 checks, the new timetable isolation suite passed 7, and the existing isolation/billing suite passed 42. Cross-school reads, edits, activation, deactivation, role membership and permission changes were tested. Timetable tests verify own-school visibility, blocked foreign references/edits, ineffective foreign deletion and successful owner cleanup. The legacy timetable backfill repaired four records; a second dry run found zero unassigned records. The utility defaults to dry-run and never guesses a tenant when the related session has none.

## 13. Subscription Regression Test

The SaaS suite passed 34 checks; the isolation/billing suite passed 42. Coverage includes registration/trials, tenant separation, plan status, payment-proof submission, platform approval, renewal and subscription history. Browser checks loaded billing, customer accounts, payment reviews, subscription tiers and payment methods. These tests use QA data; no real financial transfer was performed.

## 14. Frontend Test Results

18 automated frontend tests pass. Coverage includes permission guards, loading states, all-role navigation filtering, platform separation, reduced motion, rendering, currency and date handling. Frontend lint and TypeScript checks pass. All school navigation pages and all five platform navigation destinations were opened in the browser. Populated student profile API contracts also pass.

## 15. Backend Test Results

All 11 existing integration suites pass, totaling 582 checks:

| Suite | Passed | Failed |
| --- | ---: | ---: |
| Foundation | 12 | 0 |
| Authentication | 85 | 0 |
| Academic | 61 | 0 |
| Attendance and timetable | 52 | 0 |
| Exams | 64 | 0 |
| Finance | 84 | 0 |
| Communication and reports | 57 | 0 |
| Security / operational hardening | 24 | 0 |
| Role / application matrix | 67 | 0 |
| SaaS | 34 | 0 |
| Isolation and billing | 42 | 0 |

Backend TypeScript and lint have no errors. Lint reports 188 warnings, primarily existing broad types and unused variables. Updated index assertions to require tenant-scoped unique keys and removed immediate test-process exits that could crash Windows Node while output was still draining. Final suite logs are in `tests/qa-results/`.

## 16. Production Build Status

Frontend Vite/TypeScript and backend TypeScript production builds pass. The frontend build retains a large-chunk warning: approximately 1.49 MB of JavaScript before gzip (about 410 KB gzip). No deployment was requested or performed.

## 17. Remaining Known Limitations

The bundle-size warning and 188 backend lint warnings remain. Responsive checks used browser viewport emulation, not physical phones. Reduced-motion behavior was verified through variants, configuration and CSS; an operating-system preference switch was not manually exercised. Browser checks cover navigation, representative forms, drawers, profiles and populated/empty states; the remaining detailed module workflows are covered by API integration tests rather than every possible UI input combination. QA databases and logs are retained for review. This audit is not a claim of exhaustive penetration or load testing.
