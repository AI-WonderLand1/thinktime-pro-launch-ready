# ThinkTime Pro

ThinkTime Pro is a React/Vite + Express + Firebase workforce timekeeping application with employee clock-in/out, manager OT/PTO approvals, admin payroll reporting, direct messages, Google Workspace export, and AI-assisted report/email generation.

This export is the AI Studio project:
`https://ai.studio/apps/533f3657-be4e-4985-819e-a6f254e8d983`

## What is launch-ready in this build

- React 19 + Vite production client build
- Express production server with Cloud Run-compatible `PORT`
- Firebase Email/Password authentication
- Admin, manager, and employee route separation
- Firestore rules for users, timesheets, messages, OT, PTO, settings, and reminders
- Required Firestore composite indexes included
- No public self-registration; workforce accounts are administrator-issued
- Admin-created staff receive a strong one-time temporary password instead of their employee ID
- Signed-in users can change their password in Settings
- AI routes require a valid Firebase ID token **and an administrator Firestore profile**
- Per-IP API rate limiting and basic security headers
- Settings → AI / Bring Your Own Key (BYOK)
- Gemini, OpenAI, OpenRouter, Anthropic, and custom OpenAI-compatible provider support
- AI keys are not written to Firestore or server logs by the app
- `GET /api/health` health endpoint

## Requirements

- Node.js 20+ (Node 22 recommended)
- A Firebase project with Email/Password Authentication enabled
- Firestore database
- For Google Docs/Sheets/Gmail export: Google provider configured in Firebase Auth and the corresponding Google APIs/scopes enabled

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

The checked-in Firebase client identifiers point to the original AI Studio Firebase project. To use another project, replace the `VITE_FIREBASE_*` values in `.env.local` and set `FIREBASE_PROJECT_ID` to the same project ID.

## Firebase deployment

Install/login to the Firebase CLI, then deploy the included Firestore rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project YOUR_FIREBASE_PROJECT_ID
```

The included `firebase.json` targets the AI Studio Firestore database ID. If you move ThinkTime to a different named database, update `firebase.json` and `VITE_FIREBASE_DATABASE_ID`.

### First administrator

Public self-registration is disabled. Bootstrap the first administrator in Firebase:

1. Create an Email/Password Auth user in Firebase Authentication. For Employee-ID style login, its email can use the app's internal form such as `emp123456@thinktime.local`.
2. In Firestore, create `users/<AUTH_UID>` with at least:

```json
{
  "email": "emp123456@thinktime.local",
  "name": "Administrator",
  "contactEmail": "admin@yourcompany.com",
  "role": "admin",
  "employeeId": "123456"
}
```

After the first admin exists, use **Team Management** to create managers and employees. ThinkTime stores a real `contactEmail` separately from the internal Employee-ID login alias so payroll/report email has a deliverable destination.

## AI BYOK

Sign in as an administrator and open:

**Settings → AI / Bring Your Own Key**

Supported providers:

- Google Gemini
- OpenAI
- OpenRouter
- Anthropic
- Custom OpenAI-compatible endpoint

Enter the provider API key and model ID, then click **Test Connection** and **Save AI Settings**.

By default, the API key is kept in browser session storage and disappears when that browser session ends. If **Remember API key on this device** is enabled, it is stored in that browser's local storage. Anyone who can access that browser profile may be able to read local-storage data, so leave Remember off on shared computers. ThinkTime sends the key over the same HTTPS origin to its authenticated server proxy for the AI request; the app does not store the BYOK key in Firestore.

For a custom provider, production base URLs must use HTTPS. Private-network/localhost custom endpoints are blocked in production to reduce SSRF risk; production also rejects custom-provider redirects and hostnames that resolve to private-network addresses. Localhost is permitted during development.

### Local development Gemini fallback

For local development only, `GEMINI_API_KEY` may be used when no BYOK key is supplied. Production is intentionally **BYOK-only**; a shared server AI key is not accepted in production, which prevents ordinary authenticated accounts from consuming a deployment-wide provider credential.

```bash
GEMINI_API_KEY=...
```

## Production build

```bash
npm run check
NODE_ENV=production npm start
```

`npm run check` runs TypeScript validation and creates the production build. Run `npm run build` first if you are not using `npm run check` immediately before `npm start`.

Typical container/Cloud Run flow:

```bash
npm install
npm run build
NODE_ENV=production npm start
```

The server honors the platform-provided `PORT` environment variable and listens on `0.0.0.0`.

## Health check

```text
GET /api/health
```

Expected response:

```json
{
  "ok": true,
  "service": "thinktime-pro",
  "aiByok": true
}
```

## Google Workspace export

The admin dashboard can request Google OAuth scopes for Gmail, Docs, Drive, and Sheets. In the Firebase/Google Cloud project, configure the Google sign-in provider, OAuth consent screen, authorized domains, and enable the APIs used by the app.

## Account recovery note

ThinkTime currently uses deterministic internal Firebase emails such as `emp123456@thinktime.local` so employees can sign in with an Employee ID. Those aliases are not deliverable email addresses, so Firebase's email-based reset flow cannot recover an ID-only account. Users can change their password while signed in under **Settings → Password & Security**. An administrator can recover a locked-out ID-only account through Firebase Authentication until a dedicated admin reset backend is added.

## Security notes

- Do not place private AI keys in `VITE_*` environment variables; Vite exposes those values to the browser bundle.
- Firebase web API keys are identifiers and are expected to be client-visible. Protect the data with Firebase Auth, Firestore Security Rules, API restrictions, and authorized domains.
- Deploy `firestore.rules` before production use. The original export referenced collections that were not covered by its rules.
- Production AI endpoints validate Firebase ID tokens before proxying requests.
- BYOK values are intentionally not persisted to Firestore.

## Install ThinkTime Pro on a PC

ThinkTime Pro ships as a Progressive Web App (PWA) plus a Linux desktop installer. On supported browsers, use **Install ThinkTime Pro on this PC** on the login screen or under **Settings → Desktop App**. On Debian/Ubuntu, the included installer creates a local production service and a **ThinkTime Pro** application-menu entry.

The app requires an internet connection for Firebase and cloud AI providers even when installed.

### Debian / Ubuntu local installer

A Linux installer is included for systems where the browser does not expose the PWA install prompt:

```bash
chmod +x install.sh
./install.sh
```

It verifies Node.js 20+, installs dependencies, builds the production app, creates a user-level `systemd` service, health-checks the service, and creates a **ThinkTime Pro** application-menu launcher. Chromium/Chrome/Edge use app-window mode. Firefox on Linux opens a dedicated browser window from the application-menu launcher.

Remove it with:

```bash
./scripts/uninstall-linux.sh
```

## Login credential privacy

The Employee ID/password login form intentionally disables browser credential autofill and keeps the credential fields read-only until the user interacts with them. ThinkTime Pro never pre-populates the user's real contact email into the Employee ID field. Password-manager behavior is ultimately controlled by the browser, but the app now opts out of automatic credential filling as strongly as browser standards allow.


## Payroll calculation boundary

ThinkTime's payroll summary is a **straight-time estimate only**: approved completed hours × the stored hourly rate. It does not calculate overtime premiums, taxes, deductions, benefits, paid/unpaid breaks, wage statements, or jurisdiction-specific payroll compliance. Use a payroll system or qualified payroll/accounting workflow for final wages.

## Production authentication checklist

In Firebase Authentication, enable **Email/Password** before using Employee-ID sign-in. Enable **Google** only if you intend to use the Google Docs/Sheets/Gmail export workflow. Keep public app registration disabled in the ThinkTime UI; create workforce accounts from **Team Management** after the first administrator is bootstrapped.
