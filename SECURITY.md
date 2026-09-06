# Security Policy

## Reporting a vulnerability

Please do **not** publish exploitable security details in a public GitHub issue.

Use the repository's **Security → Report a vulnerability** / private vulnerability reporting feature when available. Include the affected version or commit, reproduction steps, impact, and any suggested mitigation.

## Secrets

Never commit production API keys, Firebase service-account credentials, OAuth client secrets, private keys, or employee/payroll data to this repository. Firebase web client configuration is intentionally public; access control must be enforced with Firebase Authentication, Firestore Security Rules, authorized domains, and API restrictions.

ThinkTime Pro's production AI path is BYOK-only. Provider keys are not stored in Firestore by the application. The optional `GEMINI_API_KEY` fallback is limited to local development.

## Supported version

Security fixes target the current `main` branch until formal versioned releases are established.
