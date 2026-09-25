# Frontend revamp handover

Historical first-pass report. The later [motion, permission and QA report](MOTION-PERMISSION-QA.md) supersedes it and includes backend repairs.

1. **Design system:** Added the requested deep teal, primary teal, mint and warm-white palette, local Inter typography, reusable surface, spacing, control and motion tokens. Existing official logo assets remain unchanged.
2. **Landing page:** Rebuilt the public page with floating pill navigation, curved transitions, a clearly illustrative dashboard, feature sections, role descriptions, live plan pricing, FAQs and registration links.
3. **Login/register:** Added a shared split composition, consistent form styling, password visibility controls, validation and responsive layouts. Existing authentication and registration requests remain in use.
4. **Dashboard:** Improved hierarchy, real attendance/collection charts, empty states, role-specific summaries and permission-aware shortcuts. Fixed platform monthly revenue rendering and teacher attendance wording.
5. **App shell:** Redesigned sidebar, active navigation, header, search/account controls and mobile drawer; retained theme selection and permission filtering.
6. **Core modules:** Updated shared tables, cards, buttons, inputs, selects, dialogs, badges, page headings and filter layouts throughout academic, people, finance, reporting and communication pages. Added persistent request-error feedback.
7. **Billing:** Restyled subscription summaries, plans, history and payment submission. Removed invented plan-capacity fallbacks and aligned recommendations with the actual plan fields.
8. **Platform administration:** Updated dashboard, customers, plans, payment accounts and payment review. Receipt review places school/payment details beside the uploaded proof. Unsupported capacity controls were removed from plan editing; actual pricing, duration and feature fields remain.
9. **Animation:** Added restrained page transitions, hover feedback and public-page motion with reduced-motion support.
10. **Responsive checks:** Measured landing, registration, billing, teacher dashboard and platform payment methods at 375, 430, 768, 1024, 1280, 1440 and 1920 pixels without document-wide horizontal overflow. Visually inspected representative desktop, tablet and mobile views. Tables scroll horizontally where required.
11. **Regression checks:** Six UI tests passed. API smoke checks passed for six school roles plus platform admin, including 72 permitted module reads. The existing backend SaaS suite passed 34 checks, including registration, trial, payment-proof approval, duplicate approval prevention, subscription activation and tenant isolation. Browser checks covered school modules, all five platform sections, login/logout, teacher/student dashboards, mobile navigation, FAQ disclosure and receipt viewing. The SaaS suite created its own local test school/payment records. Every module's create/edit/delete workflow was not exercised in the browser.
12. **Build:** Production builds and lint passed during verification. The build includes TypeScript checking. Vite reports a large bundle warning; route-level splitting remains a performance improvement.
13. **Remaining limitations:** Forgot-password guidance directs users to their administrator because no password-reset endpoint exists. Public product previews deliberately use illustrative data; operational dashboards use server records. Plan feature descriptions are server-managed content. Verification used the local development environment, not a deployed production service. No backend source or authentication/tenant-enforcement logic was changed.

Local preview: http://127.0.0.1:5173/

Commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:api`, `npm run build`.
