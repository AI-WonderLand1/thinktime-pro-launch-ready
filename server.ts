import express, { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'fabled-emissary-09v0l';
const FIREBASE_DATABASE_ID = process.env.FIREBASE_DATABASE_ID || 'ai-studio-thinktimepro-533f3657-be4e-4985-819e-a6f254e8d983';
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const AI_TIMEOUT_MS = 60_000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

type AIProvider = 'gemini' | 'openai' | 'openrouter' | 'anthropic' | 'custom';

type AIConfig = {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
};

type FirebaseJwtPayload = {
  aud?: string;
  iss?: string;
  sub?: string;
  exp?: number;
  iat?: number;
};

let certCache: { expiresAt: number; certs: Record<string, string> } | null = null;

function parseMaxAge(value: string | null): number {
  const match = value?.match(/max-age=(\d+)/i);
  return match ? Number(match[1]) : 3600;
}

async function getFirebaseCerts(): Promise<Record<string, string>> {
  if (certCache && certCache.expiresAt > Date.now()) return certCache.certs;

  const response = await fetch(FIREBASE_CERTS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Unable to load Firebase signing certificates.');

  const certs = await response.json() as Record<string, string>;
  const maxAge = parseMaxAge(response.headers.get('cache-control'));
  certCache = { certs, expiresAt: Date.now() + Math.max(60, maxAge - 60) * 1000 };
  return certs;
}

function decodeJwtPart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
}

async function verifyFirebaseIdToken(token: string): Promise<FirebaseJwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed authentication token.');

  const header = decodeJwtPart<{ alg?: string; kid?: string }>(parts[0]);
  const payload = decodeJwtPart<FirebaseJwtPayload>(parts[1]);

  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported authentication token.');

  const certs = await getFirebaseCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error('Unknown authentication signing key.');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(cert, Buffer.from(parts[2], 'base64url'))) {
    throw new Error('Invalid authentication signature.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now) throw new Error('Authentication token expired.');
  if (!payload.iat || payload.iat > now + 300) throw new Error('Authentication token issue time is invalid.');
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error('Authentication token audience mismatch.');
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) throw new Error('Authentication token issuer mismatch.');
  if (!payload.sub) throw new Error('Authentication token subject missing.');

  return payload;
}

async function requireFirebaseAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const payload = await verifyFirebaseIdToken(token);
    res.locals.firebaseUserId = payload.sub;
    res.locals.firebaseIdToken = token;
    next();
  } catch (error) {
    console.warn('Rejected API authentication:', error instanceof Error ? error.message : 'unknown error');
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

async function requireAdminProfile(_req: Request, res: Response, next: NextFunction) {
  const uid = String(res.locals.firebaseUserId || '');
  const idToken = String(res.locals.firebaseIdToken || '');
  if (!uid || !idToken) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const profileUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/${encodeURIComponent(FIREBASE_DATABASE_ID)}/documents/users/${encodeURIComponent(uid)}`;
    const response = await fetch(profileUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        return res.status(403).json({ error: 'Administrator access required.' });
      }
      throw new Error(`Firestore profile lookup failed (${response.status}).`);
    }
    const profile = await response.json() as { fields?: { role?: { stringValue?: string } } };
    if (profile.fields?.role?.stringValue !== 'admin') {
      return res.status(403).json({ error: 'Administrator access required.' });
    }
    next();
  } catch (error) {
    console.error('Failed to authorize API administrator:', error instanceof Error ? error.message : 'unknown error');
    return res.status(503).json({ error: 'Could not verify administrator access.' });
  }
}

function getClientIp(req: Request) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
let rateLimitChecks = 0;
function pruneRateBuckets(now: number) {
  rateLimitChecks += 1;
  if (rateBuckets.size < 5000 && rateLimitChecks % 500 !== 0) return;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
  if (rateBuckets.size > 50000) rateBuckets.clear();
}
function apiRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  pruneRateBuckets(now);
  const ip = getClientIp(req);
  const current = rateBuckets.get(ip);

  if (!current || current.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }

  if (current.count >= 60) {
    res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many API requests. Try again shortly.' });
  }

  current.count += 1;
  next();
}

function getHeader(req: Request, name: string): string {
  const value = req.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function isProvider(value: string): value is AIProvider {
  return value === 'gemini' || value === 'openai' || value === 'openrouter' || value === 'anthropic' || value === 'custom';
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some(n => n < 0 || n > 255)) return true;
  return octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

function validateCustomBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Custom AI base URL is invalid.');
  }

  const isLocalDev = !IS_PRODUCTION && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !isLocalDev) {
    throw new Error('Custom AI base URL must use HTTPS.');
  }
  if (isPrivateHost(url.hostname) && !isLocalDev) {
    throw new Error('Private-network AI base URLs are not allowed in production.');
  }
  if (url.username || url.password) throw new Error('Credentials are not allowed in the custom AI base URL.');

  return url.toString().replace(/\/+$/, '');
}

function isPrivateIpAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
  if (value.startsWith('::ffff:')) return isPrivateIpAddress(value.slice(7));
  if (isIP(value) === 4) return isPrivateHost(value);
  return false;
}

async function assertPublicCustomEndpoint(endpoint: string) {
  if (!IS_PRODUCTION) return;
  const url = new URL(endpoint);

  if (isIP(url.hostname)) {
    if (isPrivateIpAddress(url.hostname)) throw new Error('Private-network AI base URLs are not allowed in production.');
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Custom AI provider hostname could not be resolved.');
  }

  if (addresses.length === 0) {
    throw new Error('Custom AI provider hostname did not resolve to an address.');
  }
  if (addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new Error('Custom AI provider resolved to a private-network address, which is blocked in production.');
  }
}

function resolveAIConfig(req: Request): AIConfig {
  const providerValue = getHeader(req, 'X-ThinkTime-AI-Provider').toLowerCase();
  const provider = isProvider(providerValue) ? providerValue : 'gemini';
  let apiKey = getHeader(req, 'X-ThinkTime-AI-Key');
  let model = getHeader(req, 'X-ThinkTime-AI-Model');
  let baseUrl = getHeader(req, 'X-ThinkTime-AI-Base-Url');

  // Local-development convenience only. Production is BYOK-only so a shared
  // server key cannot be consumed by arbitrary authenticated accounts.
  if (!apiKey && process.env.GEMINI_API_KEY && !IS_PRODUCTION) {
    apiKey = process.env.GEMINI_API_KEY;
    if (!model) model = 'gemini-3.8-flash';
    return { provider: 'gemini', apiKey, model };
  }

  if (!apiKey) throw new Error('No BYOK API key was supplied. Configure AI in Settings.');
  if (apiKey.length > 10_000) throw new Error('AI API key is too long.');
  if (!model || model.length > 200) throw new Error('A valid AI model name is required.');

  if (provider === 'custom') {
    if (!baseUrl) throw new Error('Custom AI provider requires a base URL.');
    baseUrl = validateCustomBaseUrl(baseUrl);
  }

  return { provider, apiKey, model, ...(baseUrl ? { baseUrl } : {}) };
}

function customChatCompletionsUrl(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) return clean;
  if (clean.endsWith('/v1')) return `${clean}/chat/completions`;
  return `${clean}/v1/chat/completions`;
}

async function providerError(response: globalThis.Response): Promise<Error> {
  const body = (await response.text()).slice(0, 700).replace(/\s+/g, ' ').trim();
  return new Error(`AI provider returned ${response.status}${body ? `: ${body}` : ''}`);
}

async function generateAIText(config: AIConfig, prompt: string): Promise<string> {
  if (prompt.length > 250_000) throw new Error('AI prompt is too large.');

  if (config.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!response.ok) throw await providerError(response);
    const data = await response.json() as any;
    const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').join('').trim();
    if (!text) throw new Error('Gemini returned an empty response.');
    return text;
  }

  if (config.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: config.model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!response.ok) throw await providerError(response);
    const data = await response.json() as any;
    const text = data?.content?.filter((part: any) => part?.type === 'text').map((part: any) => part.text).join('\n').trim();
    if (!text) throw new Error('Anthropic returned an empty response.');
    return text;
  }

  if (config.provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, input: prompt }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!response.ok) throw await providerError(response);
    const data = await response.json() as any;
    const outputText = typeof data?.output_text === 'string'
      ? data.output_text
      : data?.output?.flatMap((item: any) => item?.content || [])
          .filter((item: any) => item?.type === 'output_text' && typeof item?.text === 'string')
          .map((item: any) => item.text)
          .join('\n');
    if (!outputText?.trim()) throw new Error('OpenAI returned an empty response.');
    return outputText.trim();
  }

  const endpoint = config.provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : customChatCompletionsUrl(config.baseUrl!);

  if (config.provider === 'custom') await assertPublicCustomEndpoint(endpoint);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };
  if (config.provider === 'openrouter') {
    headers['X-Title'] = 'ThinkTime Pro';
    if (process.env.APP_URL) headers['HTTP-Referer'] = process.env.APP_URL;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    ...(config.provider === 'custom' ? { redirect: 'error' as const } : {}),
  });
  if (!response.ok) throw await providerError(response);
  const data = await response.json() as any;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('AI provider returned an empty response.');
  return text.trim();
}

function sendAIError(res: Response, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  console.error(fallback, message);

  if (/BYOK|API key|model|base URL|provider/i.test(message)) {
    return res.status(400).json({ error: message });
  }
  if (/429|rate limit/i.test(message)) return res.status(429).json({ error: 'AI provider rate limit reached.' });
  return res.status(502).json({ error: fallback });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.TRUST_PROXY === 'false') {
    app.set('trust proxy', false);
  } else if (process.env.TRUST_PROXY) {
    const parsed = Number(process.env.TRUST_PROXY);
    app.set('trust proxy', Number.isFinite(parsed) ? parsed : process.env.TRUST_PROXY);
  } else if (IS_PRODUCTION) {
    app.set('trust proxy', 1);
  }
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    if (IS_PRODUCTION) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
        "script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; " +
        "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com wss://*.firebaseio.com; " +
        "frame-src https://*.firebaseapp.com https://accounts.google.com; worker-src 'self'; manifest-src 'self'"
      );
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, service: 'thinktime-pro', aiByok: true });
  });

  app.use('/api', apiRateLimit);
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', requireFirebaseAuth);
  app.use('/api', requireAdminProfile);

  app.post('/api/ai/test', async (req, res) => {
    try {
      const config = resolveAIConfig(req);
      const text = await generateAIText(config, 'Reply with exactly: ThinkTime AI connected');
      res.json({ ok: true, provider: config.provider, model: config.model, response: text.slice(0, 200) });
    } catch (error) {
      sendAIError(res, error, 'AI connection test failed.');
    }
  });

  app.post('/api/generate-report', async (req, res) => {
    try {
      const config = resolveAIConfig(req);
      const { companyName, llcNumber, dateRange, timesheets } = req.body || {};
      if (!Array.isArray(timesheets)) return res.status(400).json({ error: 'Timesheet data is required.' });

      const prompt = `
You are an automated HR assistant for ${companyName || 'the company'} (LLC/ID: ${llcNumber || 'N/A'}).
Generate a professional, narrative executive summary report of the following timesheet data.
Selected pay period: ${dateRange?.start || 'N/A'} to ${dateRange?.end || 'N/A'}.
Include the company name, LLC number, and selected pay period prominently at the top.
Summarize total hours worked and note pending approvals. Do not infer statutory overtime, overtime premiums, taxes, deductions, benefits, or legal compliance from this data.
Format it as a professional letter or memo suitable for a Google Doc.
Do not output markdown code blocks. Use clean, professional text formatting.

Timesheets Data:
${JSON.stringify(timesheets, null, 2)}
      `.trim();

      const reportText = await generateAIText(config, prompt);
      res.json({ reportText });
    } catch (error) {
      sendAIError(res, error, 'Failed to generate report.');
    }
  });

  app.post('/api/generate-email', async (req, res) => {
    try {
      const config = resolveAIConfig(req);
      const { template, employee, dateRange, timesheets, companyName } = req.body || {};
      if (!employee || !dateRange || !Array.isArray(timesheets)) {
        return res.status(400).json({ error: 'Payroll email data is incomplete.' });
      }

      const prompt = `
You are an HR/Payroll Assistant for ${companyName || 'the company'}.
Write a professional email to an employee based on the following context.

Employee Name: ${employee.name || 'Employee'}
Employee ID: ${employee.id || 'N/A'}
Pay Period: ${dateRange.start || 'N/A'} to ${dateRange.end || 'N/A'}
Total Hours Logged: ${Number(employee.totalHours || 0).toFixed(2)}
Hourly Rate: $${Number(employee.payRate || 0).toFixed(2)}
Estimated Straight-Time Pay (approved hours × hourly rate): $${Number(employee.grossPay || 0).toFixed(2)}
Template Type Requested: ${template || 'standard'}

Timesheet Records:
${JSON.stringify(timesheets, null, 2)}

INSTRUCTIONS:
1. Write the email subject on the first line starting with "SUBJECT: ".
2. Leave a blank line, then write the email body.
3. Match the requested template tone (Friendly, Detailed, or Standard).
4. Clearly call the pay amount an estimate only. Do not call it final payroll or gross wages. Do not infer overtime premiums, taxes, deductions, benefits, or legal compliance.
5. Do not include markdown code blocks or asterisks. Keep it plain text.
      `.trim();

      const responseText = await generateAIText(config, prompt);
      let subject = 'Payroll Update';
      let body = responseText;
      const lines = responseText.split('\n');
      if (lines[0]?.toUpperCase().startsWith('SUBJECT:')) {
        subject = lines[0].slice(lines[0].indexOf(':') + 1).trim() || subject;
        body = lines.slice(1).join('\n').trim();
      }

      res.json({ subject, body });
    } catch (error) {
      sendAIError(res, error, 'Failed to generate email.');
    }
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist', 'client');
    app.use(express.static(distPath, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const HOST = process.env.HOST || '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log(`ThinkTime Pro listening on ${HOST}:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('ThinkTime Pro failed to start:', error);
  process.exit(1);
});
