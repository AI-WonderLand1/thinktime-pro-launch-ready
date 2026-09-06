# ThinkTime Pro — Launch-Ready Release Notes

## Completed in this release

- Added **Settings → AI / Bring Your Own Key (BYOK)** for administrators.
- Added Gemini, OpenAI, OpenRouter, Anthropic, and custom OpenAI-compatible AI providers.
- Added model selection, masked API key entry, show/hide, session-only or remembered browser storage, connection test, save, and remove controls.
- Routed AI report and payroll-email generation through the selected provider.
- Protected AI endpoints with Firebase ID-token verification, rate limiting, request size limits, and no-store responses.
- Corrected the AI Studio Firestore database ID to `ai-studio-thinktimepro-533f3657-be4e-4985-819e-a6f254e8d983`.
- Added Firestore rules and composite indexes for all collections currently used by the app.
- Prevented public registration from creating admin accounts and constrained self-created profiles.
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
