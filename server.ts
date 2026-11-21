import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {
  authenticateUser,
  consumePasswordResetToken,
  createPasswordResetToken,
  createSession,
  createUser,
  createVisit,
  deleteSession,
  deleteVisit,
  getUserBySessionToken,
  getVisitById,
  listVisits,
  updateVisit,
} from './server/db.ts';
import {
  UpstreamApiError,
  extractClinicalVisit,
  generateDistrictBrief,
  generateVoiceHealthcareGuidance,
  synthesizeFieldReadback,
  transcribeFieldAudio,
} from './server/ai.ts';
import { createModuleRouter } from './server/moduleRoutes.ts';
import { createCareModuleRouter } from './server/careModuleRoutes.ts';
import { KARNATAKA_DISTRICTS, getDistrictCoords } from './src/data/nfhs5Karnataka.ts';
import type {
  AuthUser,
  BeneficiaryCategory,
  BeneficiaryGender,
  RiskLevel,
  UserRole,
  VisitInput,
  VisitLanguage,
} from './src/types.ts';

interface AuthedRequest extends Request {
  user?: AuthUser;
  authToken?: string;
}

const VALID_CATEGORIES = new Set<BeneficiaryCategory>([
  'Pregnant Woman',
  'Lactating Mother',
  'Child (0-5y)',
  'Adolescent Girl',
]);
const VALID_GENDERS = new Set<BeneficiaryGender>(['Female', 'Male', 'Other']);
const VALID_LANGUAGES = new Set<VisitLanguage>(['kn', 'hi', 'en']);
const VALID_RISKS = new Set<RiskLevel>(['Low', 'Moderate', 'High']);
const VALID_ROLES = new Set<UserRole>(['asha', 'supervisor']);
const ALLOWED_AUDIO_MIMES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
]);

const SESSION_COOKIE_NAME = 'ashasakhi_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

function isHttpsRequest(req: Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] ?? '').toLowerCase();
  return req.secure || proto.includes('https');
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (isHttpsRequest(req)) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (isHttpsRequest(req)) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

function extractSessionCookie(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[SESSION_COOKIE_NAME]?.trim();
  return raw && raw.length >= 32 ? raw : null;
}

function isCsrfSafeForCookieMutation(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (req.headers['x-requested-with']) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const expectedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
    return Boolean(expectedHost && originHost === expectedHost);
  } catch {
    return false;
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 160;
}

function isValidMobile(mobile: string): boolean {
  const digits = mobile.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function validatePasswordStrength(password: string): string | null {
  if (password.length < 8 || password.length > 128) {
    return 'Password must be between 8 and 128 characters.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one number.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include at least one special character (e.g. @, #, $, !).';
  }
  return null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const bearerToken = extractBearerToken(req);
  const cookieToken = bearerToken ? null : extractSessionCookie(req);
  const token = bearerToken || cookieToken;

  if (!token) {
    res.status(401).json({ error: 'Please sign in to access AshaSakhi.' });
    return;
  }

  if (cookieToken && !isCsrfSafeForCookieMutation(req)) {
    res.status(403).json({ error: 'Cross-site request blocked. Please retry from AshaSakhi.' });
    return;
  }

  const user = getUserBySessionToken(token);
  if (!user) {
    if (cookieToken) {
      clearSessionCookie(req, res);
    }
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    return;
  }
  req.user = user;
  req.authToken = token;
  next();
}

function toNullableNumber(val: unknown, min: number, max: number): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return num;
}

function validateVisitBody(
  body: Record<string, unknown>
): { ok: true; data: VisitInput } | { ok: false; error: string } {
  const beneficiary_name = String(body.beneficiary_name ?? '').trim();
  if (beneficiary_name.length < 2 || beneficiary_name.length > 120) {
    return { ok: false, error: 'Beneficiary name must be between 2 and 120 characters.' };
  }

  const beneficiary_gender = String(body.beneficiary_gender ?? 'Female') as BeneficiaryGender;
  const safeGender: BeneficiaryGender = VALID_GENDERS.has(beneficiary_gender)
    ? beneficiary_gender
    : 'Female';

  const beneficiary_category = String(body.beneficiary_category ?? '') as BeneficiaryCategory;
  if (!VALID_CATEGORIES.has(beneficiary_category)) {
    return { ok: false, error: 'Invalid beneficiary category.' };
  }

  const district = String(body.district ?? '').trim();
  if (district.length < 2 || district.length > 80) {
    return { ok: false, error: 'Please select a valid Karnataka district.' };
  }

  const village = String(body.village ?? '').trim();
  if (village.length < 2 || village.length > 120) {
    return { ok: false, error: 'Village or ward name must be between 2 and 120 characters.' };
  }

  const phc_center = String(body.phc_center ?? '').trim() || `PHC ${district}`;
  const language = String(body.language ?? 'kn') as VisitLanguage;
  if (!VALID_LANGUAGES.has(language)) {
    return { ok: false, error: 'Language must be Kannada (kn), Hindi (hi), or English (en).' };
  }

  const risk_level = String(body.risk_level ?? 'Low') as RiskLevel;
  if (!VALID_RISKS.has(risk_level)) {
    return { ok: false, error: 'Risk level must be Low, Moderate, or High.' };
  }

  const fallbackCoords = getDistrictCoords(district);
  const lat = toNullableNumber(body.lat, 11.0, 19.0) ?? fallbackCoords.lat;
  const lng = toNullableNumber(body.lng, 73.5, 79.0) ?? fallbackCoords.lng;

  const visit_date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.visit_date ?? ''))
    ? String(body.visit_date)
    : new Date().toISOString().slice(0, 10);

  const follow_up_date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.follow_up_date ?? ''))
    ? String(body.follow_up_date)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const risk_flags = Array.isArray(body.risk_flags)
    ? body.risk_flags
        .map((item) => String(item).trim())
        .filter((s) => s.length > 0 && s.length <= 160)
        .slice(0, 10)
    : [];

  const validStatuses = new Set(['Completed', 'Scheduled', 'Follow-up Due']);
  const rawStatus = String(body.status ?? 'Completed');
  const status = (validStatuses.has(rawStatus) ? rawStatus : 'Completed') as
    | 'Completed'
    | 'Scheduled'
    | 'Follow-up Due';

  return {
    ok: true,
    data: {
      family_id: toNullableNumber(body.family_id, 1, 1_000_000),
      person_id: toNullableNumber(body.person_id, 1, 1_000_000),
      beneficiary_name,
      beneficiary_phone: String(body.beneficiary_phone ?? '').trim().slice(0, 24),
      beneficiary_age: toNullableNumber(body.beneficiary_age, 0, 110),
      beneficiary_gender: safeGender,
      beneficiary_category,
      district,
      village,
      phc_center: phc_center.slice(0, 120),
      language,
      purpose: String(body.purpose ?? 'Routine Home Visit').trim().slice(0, 160),
      status,
      notes: String(body.notes ?? '').trim().slice(0, 1000),
      transcript: String(body.transcript ?? '').trim().slice(0, 4000),
      bp_systolic: toNullableNumber(body.bp_systolic, 50, 260),
      bp_diastolic: toNullableNumber(body.bp_diastolic, 30, 160),
      blood_sugar_mgdl: toNullableNumber(body.blood_sugar_mgdl, 20, 700),
      hemoglobin_gdl: toNullableNumber(body.hemoglobin_gdl, 2.0, 22.0),
      weight_kg: toNullableNumber(body.weight_kg, 1.0, 180.0),
      gestational_weeks: toNullableNumber(body.gestational_weeks, 1, 44),
      immunization_status: String(body.immunization_status ?? 'Checked').trim().slice(0, 120),
      ifa_tablets_given: Math.max(
        0,
        Math.min(365, Math.round(Number(body.ifa_tablets_given ?? 0) || 0))
      ),
      symptoms: String(body.symptoms ?? '').trim().slice(0, 500),
      symptom_duration: String(body.symptom_duration ?? '').trim().slice(0, 120),
      risk_level,
      risk_flags,
      recommended_action: String(body.recommended_action ?? '').trim().slice(0, 600),
      follow_up_date,
      lat,
      lng,
      visit_date,
    },
  };
}

function parseCliPort(argv: string[]): number | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isInteger(n) && n > 0 && n < 65536) return n;
    } else if (arg.startsWith('--port=')) {
      const n = Number(arg.slice('--port='.length));
      if (Number.isInteger(n) && n > 0 && n < 65536) return n;
    }
  }
  return null;
}

async function startServer(): Promise<void> {
  const app = express();
  const cliPort = parseCliPort(process.argv);
  const envPortRaw = Number(process.env.PORT);
  const envPort =
    Number.isInteger(envPortRaw) && envPortRaw > 0 && envPortRaw < 65536 ? envPortRaw : null;
  const PRIMARY_PORT = cliPort ?? 3000;

  app.use(express.json({ limit: '16mb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'AshaSakhi-AI' });
  });

  // Auth routes
  app.post('/api/auth/register', (req, res) => {
    const full_name = String(req.body?.full_name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const mobile_number = String(req.body?.mobile_number ?? '').trim();
    const password = String(req.body?.password ?? '');
    const confirm_password =
      req.body?.confirm_password !== undefined ? String(req.body.confirm_password) : password;
    const rawRole = String(req.body?.role ?? 'asha').trim().toLowerCase();
    const role: UserRole =
      rawRole === 'admin' || rawRole === 'supervisor' || rawRole === 'healthcare_admin'
        ? 'supervisor'
        : rawRole === 'asha'
        ? 'asha'
        : (rawRole as UserRole);
    const district = String(req.body?.district ?? 'Raichur').trim() || 'Raichur';
    const phc_center = String(req.body?.phc_center ?? `PHC ${district}`).trim() || `PHC ${district}`;

    if (full_name.length < 2 || full_name.length > 80) {
      res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (!isValidMobile(mobile_number)) {
      res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
      return;
    }
    const passwordErr = validatePasswordStrength(password);
    if (passwordErr) {
      res.status(400).json({ error: passwordErr });
      return;
    }
    if (password !== confirm_password) {
      res.status(400).json({ error: 'Password and Confirm Password do not match.' });
      return;
    }
    if (!VALID_ROLES.has(role)) {
      res.status(400).json({ error: 'Please select a valid role (ASHA Worker or Healthcare Administrator).' });
      return;
    }

    try {
      const user = createUser({
        email,
        mobile_number,
        full_name,
        role,
        district,
        phc_center,
        password,
      });
      const token = createSession(user.id);
      setSessionCookie(req, res, token);
      res.status(201).json({ user, token });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('UNIQUE') || message.includes('DUPLICATE')) {
        res.status(409).json({
          error: 'An account with this email address already exists. Please sign in instead.',
        });
        return;
      }
      res.status(500).json({ error: 'Could not complete registration. Please try again.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const emailOrUsername = String(req.body?.email ?? req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!emailOrUsername || !password) {
      res.status(400).json({ error: 'Email address and password are required.' });
      return;
    }
    const user = authenticateUser(emailOrUsername, password);
    if (!user) {
      res.status(401).json({ error: 'Invalid email address or password.' });
      return;
    }
    const token = createSession(user.id);
    setSessionCookie(req, res, token);
    res.json({ user, token });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.user, token: req.authToken });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = extractBearerToken(req) || extractSessionCookie(req);
    if (token) {
      deleteSession(token);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const mobile_number = String(req.body?.mobile_number ?? '').trim();
    if (!isValidEmail(email) || !isValidMobile(mobile_number)) {
      res.status(400).json({ error: 'Please enter your registered email address and mobile number.' });
      return;
    }
    const resetToken = createPasswordResetToken(email, mobile_number);
    if (!resetToken) {
      res.status(400).json({
        error: 'We could not verify that email address and mobile number combination.',
      });
      return;
    }
    res.json({
      ok: true,
      resetToken,
      message: 'Account verified. Choose a strong new password below.',
    });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const resetToken = String(req.body?.resetToken ?? '').trim();
    const newPassword = String(req.body?.newPassword ?? '');
    const confirmPassword = String(req.body?.confirmPassword ?? '');

    if (!resetToken) {
      res.status(400).json({ error: 'Password reset verification token is missing or expired.' });
      return;
    }
    const passwordErr = validatePasswordStrength(newPassword);
    if (passwordErr) {
      res.status(400).json({ error: passwordErr });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'New password and confirmation do not match.' });
      return;
    }

    const updated = consumePasswordResetToken(resetToken, newPassword);
    if (!updated) {
      res.status(400).json({ error: 'Reset session has expired or was already used. Please try again.' });
      return;
    }
    clearSessionCookie(req, res);
    res.json({ ok: true, message: 'Password updated successfully. Please sign in with your new password.' });
  });

  // Field Visits routes (Protected)
  app.get('/api/visits', requireAuth, (req, res) => {
    const visits = listVisits({
      district: typeof req.query.district === 'string' ? req.query.district : undefined,
      risk_level: typeof req.query.risk_level === 'string' ? req.query.risk_level : undefined,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
    });
    res.json({ visits });
  });

  app.post('/api/visits', requireAuth, (req: AuthedRequest, res) => {
    const validated = validateVisitBody(req.body ?? {});
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }
    const created = createVisit(req.user!, validated.data);
    res.status(201).json({ visit: created });
  });

  app.put('/api/visits/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid visit ID.' });
      return;
    }
    const existing = getVisitById(id);
    if (!existing) {
      res.status(404).json({ error: 'Visit record not found.' });
      return;
    }
    if (req.user!.role !== 'supervisor' && existing.worker_id !== null && existing.worker_id !== req.user!.id) {
      res.status(403).json({
        error: 'Only the recording ASHA worker or a PHC supervisor can edit this record.',
      });
      return;
    }

    const validated = validateVisitBody({ ...existing, ...(req.body ?? {}) });
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }
    const updated = updateVisit(id, validated.data);
    res.json({ visit: updated });
  });

  app.delete('/api/visits/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid visit ID.' });
      return;
    }
    const existing = getVisitById(id);
    if (!existing) {
      res.status(404).json({ error: 'Visit record not found.' });
      return;
    }
    if (req.user!.role !== 'supervisor' && existing.worker_id !== null && existing.worker_id !== req.user!.id) {
      res.status(403).json({
        error: 'Only the recording ASHA worker or a PHC supervisor can remove this record.',
      });
      return;
    }
    deleteVisit(id);
    res.json({ ok: true });
  });

  // Server-side STT route (Protected; supports both direct binary audio/* uploads and JSON base64)
  app.post(
    '/api/ai/transcribe',
    requireAuth,
    express.raw({ type: ['audio/*', 'video/webm', 'application/octet-stream'], limit: '12mb' }),
    async (req, res) => {
      const contentType = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      let audioInput: string | Buffer;
      let rawMime: string;
      let language: string;

      if (Buffer.isBuffer(req.body)) {
        audioInput = req.body;
        const normalizedCt = contentType === 'video/webm' ? 'audio/webm' : contentType;
        rawMime = ALLOWED_AUDIO_MIMES.has(normalizedCt) ? normalizedCt : 'audio/wav';
        language = String(req.query.language ?? req.headers['x-visit-language'] ?? 'kn');
        if (audioInput.length < 44 || audioInput.length > 10_500_000) {
          res.status(400).json({ error: 'Audio recording is empty or exceeds the 10MB limit.' });
          return;
        }
      } else {
        const audioBase64 = String(req.body?.audioBase64 ?? '').trim();
        rawMime = String(req.body?.mimeType ?? 'audio/wav').split(';')[0].trim().toLowerCase();
        language = String(req.body?.language ?? 'kn');
        if (!audioBase64 || audioBase64.length > 14_000_000) {
          res.status(400).json({ error: 'Audio recording is empty or exceeds the 10MB limit.' });
          return;
        }
        audioInput = audioBase64;
      }

      if (!ALLOWED_AUDIO_MIMES.has(rawMime)) {
        res.status(400).json({
          error: `Unsupported audio format "${rawMime}". Convert recording to WAV, MP3, OGG, FLAC, AAC, or M4A.`,
        });
        return;
      }
      const validAudioLangs = new Set(['en', 'kn', 'hi', 'te', 'ta', 'mr']);
      if (!validAudioLangs.has(language)) {
        res.status(400).json({ error: 'Language must be en, kn, hi, te, ta, or mr.' });
        return;
      }

      try {
        const result = await transcribeFieldAudio(audioInput, rawMime, language);
        res.json(result);
      } catch (err: unknown) {
        const status = err instanceof UpstreamApiError ? err.statusCode : 422;
        const message = err instanceof Error ? err.message : 'Gnani audio transcription failed.';
        res.status(status).json({
          error: message,
          ...(err instanceof UpstreamApiError && err.upstreamStatus
            ? { upstreamStatus: err.upstreamStatus }
            : {}),
          ...(err instanceof UpstreamApiError && err.errorCode
            ? { errorCode: err.errorCode }
            : {}),
        });
      }
    }
  );

  // Server-side Qwen (OpenRouter) structured clinical extraction route (Protected)
  app.post('/api/ai/extract', requireAuth, async (req, res) => {
    const transcript = String(req.body?.transcript ?? '').trim();
    const language = String(req.body?.language ?? 'kn') as VisitLanguage;

    if (transcript.length < 8 || transcript.length > 4000) {
      res.status(400).json({ error: 'Please provide a visit note between 8 and 4000 characters.' });
      return;
    }
    if (!VALID_LANGUAGES.has(language)) {
      res.status(400).json({ error: 'Invalid language selection.' });
      return;
    }

    try {
      const result = await extractClinicalVisit(transcript, language);
      res.json(result);
    } catch (err: unknown) {
      const status = err instanceof UpstreamApiError ? err.statusCode : 422;
      const message = err instanceof Error ? err.message : 'Qwen clinical field extraction failed.';
      res.status(status).json({
        error: message,
        ...(err instanceof UpstreamApiError && err.upstreamStatus
          ? { upstreamStatus: err.upstreamStatus }
          : {}),
      });
    }
  });

  // Server-side TTS route (Protected)
  app.post('/api/ai/tts', requireAuth, async (req, res) => {
    const text = String(req.body?.text ?? '').trim();
    const language = String(req.body?.language ?? 'kn');
    const voiceName = typeof req.body?.voiceName === 'string' ? req.body.voiceName.trim() : undefined;

    if (text.length < 2 || text.length > 800) {
      res.status(400).json({ error: 'Readback text must be between 2 and 800 characters.' });
      return;
    }
    const validAudioLangs = new Set(['en', 'kn', 'hi', 'te', 'ta', 'mr']);
    if (!validAudioLangs.has(language)) {
      res.status(400).json({ error: 'Invalid language selection.' });
      return;
    }

    try {
      const result = await synthesizeFieldReadback(text, language, voiceName);
      res.json(result);
    } catch (err: unknown) {
      const status = err instanceof UpstreamApiError ? err.statusCode : 422;
      const message = err instanceof Error ? err.message : 'Gnani voice readback synthesis failed.';
      res.status(status).json({
        error: message,
        ...(err instanceof UpstreamApiError && err.upstreamStatus
          ? { upstreamStatus: err.upstreamStatus }
          : {}),
        ...(err instanceof UpstreamApiError && err.errorCode
          ? { errorCode: err.errorCode }
          : {}),
      });
    }
  });

  // NFHS-5 District Operational Action Brief (Protected)
  app.post('/api/ai/district-brief', requireAuth, async (req, res) => {
    const districtName = String(req.body?.district ?? '').trim();
    const districtData = KARNATAKA_DISTRICTS.find(
      (d) => d.district.toLowerCase() === districtName.toLowerCase()
    );
    if (!districtData) {
      res.status(400).json({
        error: 'Selected Karnataka district was not found in the NFHS-5 dataset.',
      });
      return;
    }

    const districtVisits = listVisits({ district: districtData.district });
    const fieldStats = {
      totalVisits: districtVisits.length,
      highRiskCount: districtVisits.filter((v) => v.risk_level === 'High').length,
      moderateRiskCount: districtVisits.filter((v) => v.risk_level === 'Moderate').length,
    };

    try {
      const brief = await generateDistrictBrief(districtData, fieldStats);
      res.json({ brief });
    } catch (err: unknown) {
      const status = err instanceof UpstreamApiError ? err.statusCode : 422;
      const message =
        err instanceof Error ? err.message : 'Could not generate district public health brief.';
      res.status(status).json({ error: message });
    }
  });

  // Server-side Voice Healthcare Guidance route (Protected)
  app.post('/api/ai/guidance', requireAuth, async (req, res) => {
    const transcript = String(req.body?.transcript ?? '').trim();
    const language = String(req.body?.language ?? 'en').trim().slice(0, 12);
    if (transcript.length < 4 || transcript.length > 4000) {
      res.status(400).json({ error: 'Please speak or enter at least 4 characters of health information.' });
      return;
    }
    try {
      const result = await generateVoiceHealthcareGuidance(transcript, language);
      res.json(result);
    } catch (err: unknown) {
      const status = err instanceof UpstreamApiError ? err.statusCode : 422;
      const message = err instanceof Error ? err.message : 'Could not generate healthcare guidance.';
      res.status(status).json({ error: message });
    }
  });

  // SSRF-safe Karnataka Village / PHC Geocoding Proxy (Protected)
  app.get('/api/geocode', requireAuth, async (req, res) => {
    const rawQuery = String(req.query.q ?? '').trim();
    if (rawQuery.length < 2 || rawQuery.length > 100) {
      res.status(400).json({ error: 'Search query must be between 2 and 100 characters.' });
      return;
    }
    const cleanQuery = rawQuery.replace(/[^a-zA-Z0-9\s,.\-\u0C80-\u0CFF\u0900-\u097F]/g, '').trim();
    if (!cleanQuery) {
      res.status(400).json({ error: 'Invalid location query.' });
      return;
    }

    const scopedQuery = `${cleanQuery}, Karnataka, India`;
    try {
      const nomUrl = new URL('https://nominatim.openstreetmap.org/search');
      nomUrl.searchParams.set('q', scopedQuery);
      nomUrl.searchParams.set('format', 'json');
      nomUrl.searchParams.set('limit', '5');
      nomUrl.searchParams.set('countrycodes', 'in');

      const nomRes = await fetch(nomUrl.toString(), {
        headers: {
          'User-Agent': 'AshaSakhi-AI-Karnataka-Public-Health/1.0',
          Accept: 'application/json',
        },
      });

      if (nomRes.ok && (nomRes.headers.get('content-type') || '').includes('application/json')) {
        const items = (await nomRes.json()) as Array<{
          display_name: string;
          lat: string;
          lon: string;
        }>;
        const results = items
          .map((item) => ({
            label: item.display_name,
            lat: Number(item.lat),
            lng: Number(item.lon),
          }))
          .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
        if (results.length > 0) {
          res.json({ results, provider: 'OpenStreetMap Nominatim' });
          return;
        }
      }

      const photonUrl = new URL('https://photon.komoot.io/api/');
      photonUrl.searchParams.set('q', scopedQuery);
      photonUrl.searchParams.set('limit', '5');
      const photonRes = await fetch(photonUrl.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (photonRes.ok && (photonRes.headers.get('content-type') || '').includes('application/json')) {
        const data = (await photonRes.json()) as {
          features?: Array<{
            properties?: { name?: string; city?: string; district?: string; state?: string };
            geometry?: { coordinates?: [number, number] };
          }>;
        };
        const results = (data.features ?? [])
          .map((f) => ({
            label: [f.properties?.name, f.properties?.city || f.properties?.district, f.properties?.state]
              .filter(Boolean)
              .join(', '),
            lng: Number(f.geometry?.coordinates?.[0]),
            lat: Number(f.geometry?.coordinates?.[1]),
          }))
          .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
        res.json({ results, provider: 'Photon OSM' });
        return;
      }

      res.json({ results: [], provider: 'none' });
    } catch {
      res.status(502).json({ error: 'Geocoding service temporarily unavailable.' });
    }
  });

  // Mount all protected AshaSakhi community healthcare module routes
  app.use('/api', createModuleRouter(requireAuth));
  app.use('/api', createCareModuleRouter(requireAuth));

  // Guarantee unknown /api/* routes ALWAYS return JSON 404 (never fall through to Vite HTML index.html)
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // Guarantee Express body-parser / runtime errors on /api/* ALWAYS return JSON (never HTML)
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (!req.originalUrl.startsWith('/api')) {
      next(err);
      return;
    }
    const e = err as { type?: string; status?: number; message?: string };
    if (e?.type === 'entity.too.large' || e?.status === 413) {
      res.status(413).json({
        error: 'Uploaded audio payload is too large. Keep recordings under 30 seconds.',
      });
      return;
    }
    if (e?.type === 'entity.parse.failed' || e?.status === 400) {
      res.status(400).json({ error: 'Malformed JSON request payload.' });
      return;
    }
    console.error('[API Error]', err);
    res.status(e?.status && e.status >= 400 && e.status < 600 ? e.status : 500).json({
      error: e?.message || 'Unexpected internal server error.',
    });
  });

  // Mount Vite middleware in development, or static dist in production
  const distPath = path.resolve(process.cwd(), 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  const useViteDevMiddleware =
    process.env.NODE_ENV === 'development' ||
    process.env.npm_lifecycle_event === 'dev' ||
    !fs.existsSync(distIndexPath);

  if (useViteDevMiddleware) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexPath);
    });
  }

  // Always listen on PRIMARY_PORT (3000 by default for nginx reverse proxy / dev).
  // In direct Cloud Run deployments without nginx (where PORT=8080 is free),
  // also bind envPort if available and silently skip if nginx already occupies it.
  await new Promise<void>((resolve, reject) => {
    const primaryServer = http.createServer(app);
    primaryServer.once('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE' && envPort && envPort !== PRIMARY_PORT) {
        console.warn(`Port ${PRIMARY_PORT} in use; falling back to PORT=${envPort}`);
        const fallbackServer = http.createServer(app);
        fallbackServer.once('error', reject);
        fallbackServer.listen(envPort, '0.0.0.0', () => {
          console.log(`AshaSakhi-AI server running on http://0.0.0.0:${envPort}`);
          resolve();
        });
        return;
      }
      reject(err);
    });
    primaryServer.listen(PRIMARY_PORT, '0.0.0.0', () => {
      console.log(`AshaSakhi-AI server running on http://0.0.0.0:${PRIMARY_PORT}`);
      if (!useViteDevMiddleware && envPort && envPort !== PRIMARY_PORT) {
        const extraServer = http.createServer(app);
        extraServer.on('error', (err) => {
          if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
            console.warn(`Optional PORT=${envPort} listener skipped:`, err.message);
          }
        });
        extraServer.listen(envPort, '0.0.0.0', () => {
          console.log(`AshaSakhi-AI also listening on http://0.0.0.0:${envPort}`);
        });
      }
      resolve();
    });
  });
}

startServer().catch((err) => {
  console.error('Failed to start AshaSakhi-AI server:', err);
  process.exit(1);
});
