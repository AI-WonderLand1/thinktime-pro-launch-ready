# ThinkTime Pro — Launch-Ready Release Notes

## Completed in this release

- Added **Settings → AI / Bring Your Own Key (BYOK)** for administrators.
- Added Gemini, OpenAI, OpenRouter, Anthropic, and custom OpenAI-compatible AI providers.
- Added model selection, masked API key entry, show/hide, session-only or remembered browser storage, connection test, save, and remove controls.
- Routed AI report and payroll-email generation through the selected provider.
- Protected AI endpoints with Firebase ID-token verification, rate limiting, request size limits, and no-store responses.
- Corrected the AI Studio Firestore database ID to `ai-studio-thinktimepro-533f3657-be4e-4985-819e-a6f254e8d983`.
- Added Firestore rules and composite indexes for all collections currently used by the app.
- Removed public self-registration entirely; workforce profiles are administrator-issued and unprovisioned Firebase Auth accounts are signed out.
- Replaced predictable staff passwords with strong one-time temporary passwords.
- Added signed-in password change controls.
- Added a separate real contact/payroll email instead of trying to send email to internal `@thinktime.local` login aliases.
- Corrected Google Workspace OAuth scopes and prevented Workspace connection from switching the active Firebase user.
- Added response/error validation for Google Docs, Sheets, and Gmail exports.
- Added production `PORT` support, production static serving, health endpoint, Dockerfile, and environment template.
- Separated the production browser bundle (`dist/client`) from the server bundle (`dist/server.cjs`).
- Removed fake upcoming-shift data and misleading monthly-hours calculations.
- Added honest notification messaging: browser permission alone does not create a scheduling/push backend.

## Release validation performed

- TypeScript/TSX parser validation: 17 source/config TypeScript files, 0 syntax errors.
- JSON validation: 7 JSON configuration files parsed successfully.
- Import/package declaration consistency scan passed.
- Secret/stale-reference scan passed for the release source.

## Validation still required on a networked machine

This sandbox cannot resolve `registry.npmjs.org`, so it cannot install the project dependencies. Before production deployment, run:

```bash
npm install
npm run check
```

Then deploy the included Firestore rules/indexes and verify sign-in, clock in/out, AI BYOK Test Connection, and any Google Workspace integrations you intend to enable.

## Known operational limitation

Employee-ID accounts use internal Firebase aliases such as `emp123456@thinktime.local`. Those aliases cannot receive Firebase password reset mail. Signed-in users can change their own password in Settings. Locked-out account recovery currently requires an administrator through Firebase Authentication until a dedicated privileged reset service is added.

## Desktop install + login privacy update

- Completed the PWA manifest with 192px, 512px, and maskable application icons.
- Added an in-app **Install ThinkTime Pro on this PC** action on the login page and Settings page.
- Added Debian/Ubuntu `scripts/install-linux.sh` and `scripts/uninstall-linux.sh` helpers for a user-level local installation and application-menu launcher.
- Hardened the login form against browser autofill so a saved personal email/password is not automatically inserted into ThinkTime's Employee ID/password fields.

## Final launch hardening

- Disabled public self-registration; all workforce accounts are administrator-issued.
- Production AI is BYOK-only; shared server AI keys are limited to local development.
- Added DNS/private-address checks and redirect blocking for custom AI providers.
- Payroll summaries use approved completed time only.
- CSV, PDF, Google Sheets, Google Docs/AI, and Gmail exports honor the selected payroll date range.
- Prepared GitHub CI to install dependencies, type-check, build, and audit high-severity dependency findings.



## Final hardening pass (v1.1.0)

- Switched Firebase authentication persistence to session-only by default.
- Added an application error boundary and unknown-route recovery.
- Added administrator editing for team member name, contact email, role, manager assignment, and hourly rate while keeping Employee ID immutable.
- Hardened Employee-ID generation and creation error handling.
- Restricted administrator timesheet mutation to pending → approved status changes instead of arbitrary timesheet rewrites.
- Made manager OT/PTO decisions one-way after review at the Firestore-rule layer.
- Corrected payroll/export date-range handling so CSV, PDF, Google Sheets, AI Docs, Gmail reports, and employee summaries use the selected period.
- Payroll summary totals now use approved, completed timesheets only.
- Relabeled payroll amount as an estimated straight-time value and instructed AI generation not to infer overtime premiums, taxes, deductions, benefits, or legal compliance.
- Added CSV spreadsheet-formula injection protection and safer Gmail header construction.
- Added production CSP, HSTS, clickjacking, content-type, referrer, and permissions-policy headers.
- Added rate-limit bucket cleanup and configurable reverse-proxy trust.
- Improved Google Workspace reauthentication and token lifetime handling.
- Added safer service-worker notification parsing/click routing.
- Improved Linux installer Node version checks, reinstall safety, service health checks, and Firefox/Chromium behavior.

- Added server-side administrator Firestore role verification for every protected AI/report API route.
- Added cleanup of partially-created Firebase Auth users when team-profile creation fails.
