import { GoogleGenAI, Type } from '@google/genai';
import type {
  BeneficiaryGender,
  DistrictPolicyBrief,
  ExtractedClinicalData,
  NFHS5District,
  VisitLanguage,
} from '../src/types.ts';
import { KARNATAKA_NFHS5_BASELINE } from '../src/data/nfhs5Karnataka.ts';

export class UpstreamApiError extends Error {
  statusCode: number;
  upstreamStatus?: number;
  errorCode?: string;

  constructor(
    message: string,
    statusCode = 422,
    upstreamStatus?: number,
    errorCode?: string
  ) {
    super(message);
    this.name = 'UpstreamApiError';
    // Never propagate 401/403/502/503 from third-party upstreams directly as the
    // proxy route status, because reverse proxies / Cloud Run ingress can
    // intercept those codes and replace our JSON body with an HTML error page.
    this.statusCode = statusCode === 400 ? 400 : 422;
    this.upstreamStatus = upstreamStatus;
    this.errorCode = errorCode;
  }
}

function isConfiguredKey(val: string | undefined): boolean {
  return Boolean(val && val.trim().length > 8 && !val.trim().startsWith('MY_'));
}

// Remembers an inactive/invalid Gnani API key so subsequent requests route directly
// to Gemini STT/TTS without repeating failing 403 upstream calls.
let inactiveGnaniKey: string | null = null;

function resolveGnaniApiKey(): string | null {
  const raw = process.env.GNANI_API_KEY;
  if (!isConfiguredKey(raw)) return null;
  const cleaned = raw!
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  return cleaned.length > 8 ? cleaned : null;
}

function formatGnaniUpstreamError(
  status: number,
  parsed: Record<string, unknown> | null,
  rawBody: string,
  serviceLabel: string
): { message: string; clientStatus: number; upstreamStatus: number; errorCode?: string } {
  let errorCode = '';
  let detailMessage = '';

  const detailObj =
    parsed?.detail && typeof parsed.detail === 'object' && !Array.isArray(parsed.detail)
      ? (parsed.detail as Record<string, unknown>)
      : null;

  if (detailObj) {
    if (typeof detailObj.error_code === 'string') errorCode = detailObj.error_code;
    if (typeof detailObj.message === 'string') detailMessage = detailObj.message;
  }

  if (!errorCode && typeof parsed?.error_code === 'string') {
    errorCode = parsed.error_code;
  }
  if (!detailMessage) {
    if (typeof parsed?.error === 'string') detailMessage = parsed.error;
    else if (typeof parsed?.message === 'string') detailMessage = parsed.message;
    else if (typeof parsed?.detail === 'string') detailMessage = parsed.detail;
    else detailMessage = sanitizeSnippet(rawBody) || `HTTP ${status}`;
  }

  const safeDetail = redactSecrets(detailMessage);

  if (errorCode === 'API_KEY_INACTIVE') {
    return {
      clientStatus: 422,
      upstreamStatus: status,
      errorCode,
      message: `Gnani ${serviceLabel} rejected the API key (Gnani HTTP 403 — API_KEY_INACTIVE): ${safeDetail}. Please activate or generate an active key in the Gnani Vachana dashboard and update GNANI_API_KEY in Settings > Secrets.`,
    };
  }

  if (errorCode === 'INVALID_API_KEY' || status === 401) {
    return {
      clientStatus: 422,
      upstreamStatus: status,
      errorCode: errorCode || 'INVALID_API_KEY',
      message: `Gnani ${serviceLabel} authentication failed (Gnani HTTP ${status}): ${safeDetail}. Verify GNANI_API_KEY in Settings > Secrets.`,
    };
  }

  const codeTag = errorCode ? ` — ${errorCode}` : '';
  return {
    clientStatus: 422,
    upstreamStatus: status,
    errorCode: errorCode || undefined,
    message: `Gnani ${serviceLabel} error (Gnani HTTP ${status}${codeTag}): ${safeDetail}`,
  };
}

function redactSecrets(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, '[redacted-key]')
    .replace(/Bearer\s+[a-zA-Z0-9._-]{10,}/gi, 'Bearer [redacted]');
}

function sanitizeSnippet(raw: string): string {
  return redactSecrets(raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 220);
}

/**
 * Resolves the official Gnani Vachana API origin.
 * Guards against dashboard URLs (e.g. https://app.gnani.ai/voice/api-keys) or
 * path suffixes accidentally stored in GNANI_API_BASE_URL, which return HTML instead of JSON.
 */
function resolveGnaniBaseUrl(): string {
  const DEFAULT_BASE = 'https://api.vachana.ai';
  const raw = (process.env.GNANI_API_BASE_URL || '').trim();
  if (!raw || raw.startsWith('MY_')) {
    return DEFAULT_BASE;
  }

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    // Dashboard / marketing domains serve HTML SPAs, never REST API JSON
    if (host === 'app.gnani.ai' || host === 'gnani.ai' || host === 'www.gnani.ai') {
      console.warn(
        `[Gnani Config] GNANI_API_BASE_URL pointed to web dashboard host "${host}"; normalizing to ${DEFAULT_BASE}`
      );
      return DEFAULT_BASE;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return DEFAULT_BASE;
    }
    return parsed.origin;
  } catch {
    console.warn(`[Gnani Config] Invalid GNANI_API_BASE_URL; defaulting to ${DEFAULT_BASE}`);
    return DEFAULT_BASE;
  }
}

function resolveGnaniSttModel(): string {
  const raw = (process.env.GNANI_STT_MODEL || '').trim();
  if (!raw || raw.startsWith('MY_') || raw.includes('://') || !/^prisma-v[0-9.]+$/i.test(raw)) {
    if (raw) {
      console.warn('[Gnani Config] Invalid GNANI_STT_MODEL value; defaulting to prisma-v3.0');
    }
    return 'prisma-v3.0';
  }
  return raw;
}

function resolveGnaniTtsModel(): string {
  const raw = (process.env.GNANI_TTS_MODEL || '').trim();
  if (!raw || raw.startsWith('MY_') || raw.includes('://') || !/^timbre-v[0-9.]+$/i.test(raw)) {
    return 'timbre-v3.0';
  }
  return raw;
}

const TIMBRE_V3_VOICES = new Set([
  'Shivani',
  'Avinash',
  'Lakshmi',
  'Kalpana',
  'Shubham',
  'Prakash',
  'Devansh',
  'Yashraj',
  'Chetana',
  'Vasudha',
  'Kavitha',
  'Riyaa',
  'Tarika',
]);

function resolveGnaniTtsVoice(model: string): string {
  const raw = (process.env.GNANI_TTS_VOICE || '').trim();
  if (!raw || raw.startsWith('MY_') || raw.includes('://') || raw.length > 32) {
    return 'Lakshmi';
  }
  // Timbre v3.0 strictly requires a v3.0 voice name
  if (model.toLowerCase().startsWith('timbre-v3') && !TIMBRE_V3_VOICES.has(raw)) {
    console.warn(
      `[Gnani Config] Voice "${raw}" is not in Timbre v3.0 voice set; using "Lakshmi"`
    );
    return 'Lakshmi';
  }
  return raw;
}

function resolveOpenRouterModel(): string {
  const DEFAULT_MODEL = 'qwen/qwen-2.5-72b-instruct';
  const raw = (process.env.OPENROUTER_QWEN_MODEL || '').trim();
  if (
    !raw ||
    raw.startsWith('MY_') ||
    raw.startsWith('sk-') ||
    raw.includes('://') ||
    !/^[a-z0-9_-]+\/[a-z0-9._:-]+$/i.test(raw)
  ) {
    if (raw) {
      console.warn(
        `[OpenRouter Config] OPENROUTER_QWEN_MODEL is not a valid provider/model slug; defaulting to ${DEFAULT_MODEL}`
      );
    }
    return DEFAULT_MODEL;
  }
  return raw;
}

function getGeminiClient(apiVersion?: 'v1beta'): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!isConfiguredKey(apiKey)) {
    throw new UpstreamApiError(
      'GEMINI_API_KEY is not configured. Please add your API key in Settings > Secrets.',
      422,
      503
    );
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const LANGUAGE_LABELS: Record<string, string> = {
  kn: 'Kannada (ಕನ್ನಡ)',
  hi: 'Hindi (हिन्दी)',
  en: 'English',
  te: 'Telugu (తెలుగు)',
  ta: 'Tamil (தமிழ்)',
  mr: 'Marathi (मराठी)',
};

const GNANI_LANGUAGE_CODES: Record<string, string> = {
  kn: 'kn-IN',
  hi: 'hi-IN',
  en: 'en-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  mr: 'mr-IN',
};

const MIME_TO_EXTENSION: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
};

/**
 * Detects pure digital silence or truncated data in a 16-bit PCM WAV buffer so we
 * never send empty/muted audio to Gemini STT.
 */
function inspectWavBuffer(buf: Buffer): { valid: boolean; silent: boolean } {
  if (buf.length < 48) return { valid: false, silent: true };
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return { valid: false, silent: true };
  }
  const bitsPerSample = buf.readUInt16LE(34);

  // Locate the 'data' chunk
  let offset = 12;
  let dataStart = -1;
  let dataLen = 0;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      dataStart = offset + 8;
      dataLen = Math.min(chunkSize, buf.length - dataStart);
      break;
    }
    if (chunkSize === 0 && offset + 8 >= buf.length) break;
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  // Fewer than 1600 bytes (< 50ms of 16kHz mono 16-bit PCM) cannot contain intelligible speech
  if (dataStart < 0 || dataLen < 1600) {
    return { valid: false, silent: true };
  }

  if (bitsPerSample !== 16) {
    return { valid: true, silent: false };
  }

  let maxSample = 0;
  for (let i = dataStart; i + 1 < dataStart + dataLen; i += 2) {
    const val = Math.abs(buf.readInt16LE(i));
    if (val > maxSample) {
      maxSample = val;
      if (maxSample >= 65) return { valid: true, silent: false };
    }
  }
  return { valid: true, silent: maxSample < 65 };
}

/**
 * Sniffs the actual audio container format from magic bytes and validates that the
 * recording contains real media payload (rejecting header-only WebM/MP4/OGG blobs
 * that trigger Gemini 400 INVALID_ARGUMENT corrupted-audio errors).
 */
function inspectAudioContainer(
  buf: Buffer,
  claimedMime: string
): { valid: boolean; silent: boolean; effectiveMime: string } {
  if (buf.length < 48) {
    return { valid: false, silent: true, effectiveMime: claimedMime };
  }

  // WAV: RIFF....WAVE
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    const wav = inspectWavBuffer(buf);
    return { valid: wav.valid, silent: wav.silent, effectiveMime: 'audio/wav' };
  }

  // WebM / Matroska: EBML header 0x1A 0x45 0xDF 0xA3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    // A valid WebM recording with actual audio frames must contain a Cluster ID (0x1F 0x43 0xB6 0x75)
    // and at least ~512 bytes of encoded audio data after the EBML header.
    const clusterSig = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
    const clusterIdx = buf.indexOf(clusterSig);
    const hasClusterPayload = clusterIdx > 0 && buf.length - clusterIdx > 64 && buf.length >= 512;
    return { valid: hasClusterPayload, silent: !hasClusterPayload, effectiveMime: 'audio/webm' };
  }

  // OGG: OggS
  if (buf.toString('ascii', 0, 4) === 'OggS') {
    const hasPayload = buf.length >= 512;
    return { valid: hasPayload, silent: !hasPayload, effectiveMime: 'audio/ogg' };
  }

  // FLAC: fLaC
  if (buf.toString('ascii', 0, 4) === 'fLaC') {
    const hasPayload = buf.length >= 512;
    return { valid: hasPayload, silent: !hasPayload, effectiveMime: 'audio/flac' };
  }

  // MP4 / M4A: ....ftyp
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const hasPayload = buf.length >= 512;
    return { valid: hasPayload, silent: !hasPayload, effectiveMime: 'audio/mp4' };
  }

  // MP3: ID3 tag or MPEG frame sync
  if (
    buf.toString('ascii', 0, 3) === 'ID3' ||
    (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
  ) {
    const hasPayload = buf.length >= 512;
    return { valid: hasPayload, silent: !hasPayload, effectiveMime: 'audio/mpeg' };
  }

  // Unrecognized / corrupted container header
  return { valid: false, silent: true, effectiveMime: claimedMime };
}

function isInvalidAudioMediaError(errMsg: string): boolean {
  const lower = errMsg.toLowerCase();
  return (
    lower.includes('invalid_argument') ||
    lower.includes('audio data is empty or corrupted') ||
    lower.includes('media data is empty, corrupted, or malformed') ||
    lower.includes('unable to process input audio') ||
    lower.includes('unable to process input')
  );
}

/**
 * Real Server-Side Gemini Speech-to-Text (`gemini-3.5-transcribe` with fallback on model error)
 * Used automatically whenever Gnani Vachana STT is unavailable or GNANI_API_KEY is inactive.
 */
async function transcribeAudioWithGemini(
  audioBuffer: Buffer,
  normalizedMime: string,
  language: string
): Promise<{
  transcript: string;
  provider: string;
  model: string;
  noSpeech?: boolean;
}> {
  const inspection = inspectAudioContainer(audioBuffer, normalizedMime);
  if (!inspection.valid || inspection.silent) {
    return {
      transcript: '',
      noSpeech: true,
      provider: 'AshaSakhi Speech-to-Text',
      model: 'gemini-3.5-transcribe',
    };
  }

  const effectiveMime = inspection.effectiveMime;
  const ai = getGeminiClient('v1beta');
  const langLabel = LANGUAGE_LABELS[language] || 'English or Indian regional language';
  const base64Audio = audioBuffer.toString('base64');

  const candidateModels = ['gemini-3.5-transcribe', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen'];
  let lastError: unknown = null;

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: effectiveMime,
                data: base64Audio,
              },
            },
            {
              text: `Listen carefully to this audio recording from an Indian community health worker (language hint: ${langLabel}; speech may include regional Indian languages or code-mixed English). Transcribe all spoken words accurately as plain text without commentary, timestamps, or labels. Do NOT invent or guess words if no human speech is audible; if there is no intelligible speech, reply with exactly: [NO_SPEECH]`,
            },
          ],
        },
      });

      const raw = (response.text ?? '').trim();
      const cleaned = raw
        .replace(/^\[NO_SPEECH\]$/i, '')
        .replace(/^["']|["']$/g, '')
        .trim();

      if (cleaned) {
        return {
          transcript: cleaned,
          provider: 'AshaSakhi Speech-to-Text',
          model,
        };
      }

      // Trust dedicated speech transcription model when it reports silence (prevents hallucination)
      return {
        transcript: '',
        noSpeech: true,
        provider: 'AshaSakhi Speech-to-Text',
        model,
      };
    } catch (err: unknown) {
      if (err instanceof UpstreamApiError) throw err;
      const errMsg = err instanceof Error ? err.message : String(err);

      // Do not cascade across fallback models when the uploaded audio itself is empty/corrupted
      if (isInvalidAudioMediaError(errMsg)) {
        return {
          transcript: '',
          noSpeech: true,
          provider: 'AshaSakhi Speech-to-Text',
          model,
        };
      }

      lastError = err;
    }
  }

  throw new UpstreamApiError(
    lastError instanceof Error
      ? `Audio transcription failed: ${lastError.message}`
      : 'Audio transcription failed.',
    422
  );
}

/**
 * Official Gnani AI Vachana Speech-to-Text (STT v3) with automatic fallback to
 * server-side Gemini Speech-to-Text (`gemini-3.5-transcribe`) when Gnani is unconfigured
 * or returns API_KEY_INACTIVE / auth errors.
 */
export async function transcribeFieldAudio(
  audioInput: string | Buffer,
  mimeType: string,
  language: string
): Promise<{
  transcript: string;
  provider: string;
  model: string;
  requestId?: string;
  noSpeech?: boolean;
}> {
  const rawNormalizedMime = mimeType.split(';')[0].trim().toLowerCase();
  const mappedMime = rawNormalizedMime === 'video/webm' ? 'audio/webm' : rawNormalizedMime;
  const audioBuffer = Buffer.isBuffer(audioInput)
    ? audioInput
    : Buffer.from(audioInput, 'base64');

  if (audioBuffer.length < 48) {
    return {
      transcript: '',
      noSpeech: true,
      provider: 'AshaSakhi Speech-to-Text',
      model: 'gemini-3.5-transcribe',
    };
  }

  const inspection = inspectAudioContainer(audioBuffer, mappedMime);
  if (!inspection.valid || inspection.silent) {
    return {
      transcript: '',
      noSpeech: true,
      provider: 'AshaSakhi Speech-to-Text',
      model: 'gemini-3.5-transcribe',
    };
  }

  const normalizedMime = inspection.effectiveMime;
  const ext = MIME_TO_EXTENSION[normalizedMime];
  if (!ext) {
    throw new UpstreamApiError(
      `Unsupported audio format "${normalizedMime}". Supported formats are WAV, WEBM, MP3, OGG, FLAC, AAC, and M4A.`,
      400
    );
  }

  const apiKey = resolveGnaniApiKey();
  const hasGeminiFallback = isConfiguredKey(process.env.GEMINI_API_KEY);
  const gnaniMarkedInactive = Boolean(apiKey && apiKey === inactiveGnaniKey);

  // Route directly to Gemini STT when Gnani key is absent, known inactive, or audio is WebM
  if (normalizedMime === 'audio/webm' || !apiKey || (gnaniMarkedInactive && hasGeminiFallback)) {
    if (hasGeminiFallback) {
      return transcribeAudioWithGemini(audioBuffer, normalizedMime, language);
    }
    throw new UpstreamApiError(
      'Speech-to-Text API key is not configured on the server. Add GEMINI_API_KEY or GNANI_API_KEY in Settings > Secrets.',
      422,
      503,
      'MISSING_API_KEY'
    );
  }

  const baseUrl = resolveGnaniBaseUrl();
  const endpoint = `${baseUrl}/stt/v3`;
  const sttModel = resolveGnaniSttModel();
  const languageCode = GNANI_LANGUAGE_CODES[language] || 'indic-auto';

  const formData = new FormData();
  const fileBlob = new Blob([new Uint8Array(audioBuffer)], { type: normalizedMime });
  formData.append('audio_file', fileBlob, `asha-visit.${ext}`);
  formData.append('model', sttModel);
  formData.append('language_code', languageCode);
  formData.append('format', 'transcribe');

  console.info(
    `[Gnani STT] Uploading ${audioBuffer.length} bytes (${normalizedMime}) to ${endpoint} (model=${sttModel}, lang=${languageCode})`
  );

  let gnaniError: UpstreamApiError | null = null;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-API-Key-ID': apiKey,
        Accept: 'application/json',
      },
      body: formData,
    });

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const rawBody = await response.text();
    const trimmedBody = rawBody.trim();

    console.info(
      `[Gnani STT] Response HTTP ${response.status} (${contentType || 'no content-type'}), bodyLen=${trimmedBody.length}`
    );

    const isHtml =
      contentType.includes('text/html') ||
      trimmedBody.startsWith('<!doctype') ||
      trimmedBody.startsWith('<!DOCTYPE') ||
      trimmedBody.startsWith('<html');

    if (isHtml) {
      gnaniError = new UpstreamApiError(
        `Gnani STT API returned an HTML page (HTTP ${response.status}).`,
        422,
        response.status
      );
    } else {
      let parsed: Record<string, unknown> = {};
      if (trimmedBody.length > 0) {
        try {
          parsed = JSON.parse(trimmedBody) as Record<string, unknown>;
        } catch {
          gnaniError = new UpstreamApiError(
            `Gnani STT API returned non-JSON response (HTTP ${response.status}): ${sanitizeSnippet(trimmedBody)}`,
            422,
            response.status
          );
        }
      }

      if (!gnaniError) {
        if (!response.ok || parsed.success === false) {
          const formatted = formatGnaniUpstreamError(
            response.status,
            parsed,
            trimmedBody,
            'Speech-to-Text'
          );
          if (
            response.status === 401 ||
            response.status === 403 ||
            formatted.errorCode === 'API_KEY_INACTIVE' ||
            formatted.errorCode === 'INVALID_API_KEY'
          ) {
            inactiveGnaniKey = apiKey;
          }
          if (hasGeminiFallback) {
            console.info(
              `[Gnani STT] Switching to AshaSakhi Speech-to-Text fallback (Gnani HTTP ${response.status} ${formatted.errorCode || ''}).`
            );
          } else {
            console.warn(
              `[Gnani STT] Upstream error HTTP ${response.status} (${formatted.errorCode || 'unknown'}).`
            );
          }
          gnaniError = new UpstreamApiError(
            formatted.message,
            formatted.clientStatus,
            formatted.upstreamStatus,
            formatted.errorCode
          );
        } else {
          const nestedData =
            parsed.data && typeof parsed.data === 'object'
              ? (parsed.data as Record<string, unknown>)
              : undefined;
          const transcriptCandidate =
            parsed.transcript ??
            parsed.text ??
            nestedData?.transcript ??
            nestedData?.text ??
            '';
          const transcript = String(transcriptCandidate).trim();
          if (transcript) {
            return {
              transcript,
              provider: 'Gnani Vachana STT',
              model: typeof parsed.model === 'string' ? parsed.model : sttModel,
              requestId: typeof parsed.request_id === 'string' ? parsed.request_id : undefined,
            };
          }
          return {
            transcript: '',
            noSpeech: true,
            provider: 'Gnani Vachana STT',
            model: typeof parsed.model === 'string' ? parsed.model : sttModel,
          };
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    console.info('[Gnani STT] Network failure; using Gemini STT fallback:', msg);
    gnaniError = new UpstreamApiError(`Could not reach Gnani Vachana STT API (${msg}).`, 422, 502);
  }

  // Fallback to real server-side Gemini Audio Transcription (`gemini-3.5-transcribe`)
  if (hasGeminiFallback) {
    try {
      return await transcribeAudioWithGemini(audioBuffer, normalizedMime, language);
    } catch (geminiErr: unknown) {
      if (geminiErr instanceof UpstreamApiError) {
        throw geminiErr;
      }
      throw new UpstreamApiError(
        geminiErr instanceof Error
          ? `Audio transcription failed: ${geminiErr.message}`
          : gnaniError?.message || 'Audio transcription failed.',
        422
      );
    }
  }

  throw gnaniError || new UpstreamApiError('Speech transcription failed.', 422);
}

/**
 * Qwen Clinical Extraction via OpenRouter
 * Extracts patient name, age, gender, BP, blood sugar, hemoglobin, weight,
 * gestational weeks, symptoms, symptom duration, and NHM clinical triage.
 */
export async function extractClinicalVisit(
  transcript: string,
  language: VisitLanguage
): Promise<{ data: ExtractedClinicalData; provider: string }> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!isConfiguredKey(openRouterKey)) {
    throw new UpstreamApiError(
      'OPENROUTER_API_KEY is not configured on the server. Add your OpenRouter API key in Settings > Secrets to run Qwen clinical extraction.',
      503
    );
  }

  const model = resolveOpenRouterModel();
  const todayIso = new Date().toISOString().slice(0, 10);

  const systemPrompt = `You are a clinical field-register structuring assistant for Karnataka NHM ASHA workers (AshaSakhi-AI).
Extract structured maternal, newborn, child, adolescent, or general patient health information from an ASHA worker's recognized speech transcript in Kannada, Hindi, or English.
Apply standard NHM Karnataka / PMSMA clinical triage rules:
- High Risk if: BP >= 140/90 mmHg, Blood Sugar >= 200 mg/dL (random) or >= 140 mg/dL (gestational), Hemoglobin < 7.0 g/dL (or < 8.0 with symptoms), danger signs (edema + headache, blurred vision, bleeding, convulsions, severe breathlessness, previous C-section near term, child severe acute malnutrition).
- Moderate Risk if: Hemoglobin 7.0–10.9 g/dL, elevated blood sugar (140–199 mg/dL), overdue vaccinations, underweight child, persistent fever/fatigue without red-flag danger signs.
- Low Risk if: vitals normal, Hb >= 11.0 g/dL, immunizations up to date, no danger signs.
Return ONLY a valid JSON object matching the exact keys requested. For readback_summary, write 2 short, warm verification sentences in ${LANGUAGE_LABELS[language]}.`;

  const userPrompt = `Current date: ${todayIso}
Language: ${LANGUAGE_LABELS[language]}

Extract a JSON object with these exact keys:
- beneficiary_name (string)
- beneficiary_phone (string, patient mobile/phone number if mentioned in speech, otherwise "")
- beneficiary_age (number or null)
- beneficiary_gender ("Female" | "Male" | "Other")
- beneficiary_category ("Pregnant Woman" | "Lactating Mother" | "Child (0-5y)" | "Adolescent Girl")
- district (official Karnataka district name in English, e.g. "Raichur", "Mysuru", "Kalaburagi", string)
- village (village or ward name, string)
- bp_systolic (integer or null)
- bp_diastolic (integer or null)
- blood_sugar_mgdl (number in mg/dL or null)
- hemoglobin_gdl (number in g/dL or null)
- weight_kg (number in kg or null)
- gestational_weeks (integer or null)
- immunization_status (string)
- ifa_tablets_given (integer)
- symptoms (string)
- symptom_duration (string, e.g. "3 days", "2 weeks", or "")
- risk_level ("Low" | "Moderate" | "High")
- risk_flags (array of strings)
- recommended_action (string)
- follow_up_date (YYYY-MM-DD)
- readback_summary (string in ${LANGUAGE_LABELS[language]})

Recognized Transcript:
${transcript}`;

  let orRes: Response;
  try {
    orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouterKey!.trim()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'AshaSakhi-AI',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    console.error('[OpenRouter Qwen] Network failure:', msg);
    throw new UpstreamApiError(`Could not reach OpenRouter Qwen API (${msg}).`, 502);
  }

  const contentType = (orRes.headers.get('content-type') || '').toLowerCase();
  const rawBody = await orRes.text();
  const trimmedBody = rawBody.trim();

  console.info(
    `[OpenRouter Qwen] POST /chat/completions (${model}) -> HTTP ${orRes.status} (${contentType || 'no content-type'})`
  );

  if (
    contentType.includes('text/html') ||
    trimmedBody.startsWith('<!doctype') ||
    trimmedBody.startsWith('<!DOCTYPE') ||
    trimmedBody.startsWith('<html')
  ) {
    throw new UpstreamApiError(
      `OpenRouter returned an HTML error page (HTTP ${orRes.status}). Please retry or verify OpenRouter availability.`,
      orRes.status >= 400 ? orRes.status : 502
    );
  }

  let payload: {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string } | string;
  };
  try {
    payload = JSON.parse(trimmedBody) as typeof payload;
  } catch {
    throw new UpstreamApiError(
      `OpenRouter returned non-JSON response (HTTP ${orRes.status}): ${sanitizeSnippet(trimmedBody)}`,
      502
    );
  }

  if (!orRes.ok) {
    const errMsg =
      typeof payload.error === 'string'
        ? payload.error
        : payload.error?.message || `HTTP ${orRes.status}`;
    const status = orRes.status === 401 || orRes.status === 403 ? 401 : 502;
    throw new UpstreamApiError(
      `Qwen OpenRouter error (HTTP ${orRes.status}): ${redactSecrets(errMsg)}`,
      status
    );
  }

  const rawContent = payload.choices?.[0]?.message?.content?.trim() || '';
  if (!rawContent) {
    throw new UpstreamApiError('Qwen returned an empty extraction response.', 502);
  }

  const cleanedJson = rawContent
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let extracted: Partial<ExtractedClinicalData>;
  try {
    extracted = JSON.parse(cleanedJson) as Partial<ExtractedClinicalData>;
  } catch {
    throw new UpstreamApiError(
      'Qwen returned malformed JSON during clinical extraction. Please retry.',
      502
    );
  }

  return {
    data: normalizeExtractedData(extracted),
    provider: `Qwen (${model})`,
  };
}

function normalizeExtractedData(raw: Partial<ExtractedClinicalData>): ExtractedClinicalData {
  const validCategories = [
    'Pregnant Woman',
    'Lactating Mother',
    'Child (0-5y)',
    'Adolescent Girl',
  ] as const;
  const category = validCategories.includes(
    raw.beneficiary_category as (typeof validCategories)[number]
  )
    ? (raw.beneficiary_category as ExtractedClinicalData['beneficiary_category'])
    : 'Pregnant Woman';

  const validGenders: BeneficiaryGender[] = ['Female', 'Male', 'Other'];
  const gender = validGenders.includes(raw.beneficiary_gender as BeneficiaryGender)
    ? (raw.beneficiary_gender as BeneficiaryGender)
    : 'Female';

  const validRisks = ['Low', 'Moderate', 'High'] as const;
  const riskLevel = validRisks.includes(raw.risk_level as (typeof validRisks)[number])
    ? (raw.risk_level as ExtractedClinicalData['risk_level'])
    : 'Low';

  const defaultFollowUp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return {
    beneficiary_name: (raw.beneficiary_name || '').trim(),
    beneficiary_phone: String(raw.beneficiary_phone || '').trim().slice(0, 24),
    beneficiary_age:
      typeof raw.beneficiary_age === 'number' && Number.isFinite(raw.beneficiary_age)
        ? Math.round(raw.beneficiary_age)
        : null,
    beneficiary_gender: gender,
    beneficiary_category: category,
    district: (raw.district || 'Mysuru').trim(),
    village: (raw.village || '').trim(),
    bp_systolic:
      typeof raw.bp_systolic === 'number' && Number.isFinite(raw.bp_systolic)
        ? Math.round(raw.bp_systolic)
        : null,
    bp_diastolic:
      typeof raw.bp_diastolic === 'number' && Number.isFinite(raw.bp_diastolic)
        ? Math.round(raw.bp_diastolic)
        : null,
    blood_sugar_mgdl:
      typeof raw.blood_sugar_mgdl === 'number' && Number.isFinite(raw.blood_sugar_mgdl)
        ? Number(raw.blood_sugar_mgdl.toFixed(1))
        : null,
    hemoglobin_gdl:
      typeof raw.hemoglobin_gdl === 'number' && Number.isFinite(raw.hemoglobin_gdl)
        ? Number(raw.hemoglobin_gdl.toFixed(1))
        : null,
    weight_kg:
      typeof raw.weight_kg === 'number' && Number.isFinite(raw.weight_kg)
        ? Number(raw.weight_kg.toFixed(1))
        : null,
    gestational_weeks:
      typeof raw.gestational_weeks === 'number' && Number.isFinite(raw.gestational_weeks)
        ? Math.round(raw.gestational_weeks)
        : null,
    immunization_status: (raw.immunization_status || 'Checked during visit').trim(),
    ifa_tablets_given:
      typeof raw.ifa_tablets_given === 'number' && Number.isFinite(raw.ifa_tablets_given)
        ? Math.max(0, Math.round(raw.ifa_tablets_given))
        : 0,
    symptoms: (raw.symptoms || '').trim(),
    symptom_duration: (raw.symptom_duration || '').trim(),
    risk_level: riskLevel,
    risk_flags: Array.isArray(raw.risk_flags)
      ? raw.risk_flags.map((f) => String(f).trim()).filter(Boolean)
      : [],
    recommended_action: (
      raw.recommended_action || 'Routine follow-up at next VHND session.'
    ).trim(),
    follow_up_date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.follow_up_date || ''))
      ? String(raw.follow_up_date)
      : defaultFollowUp,
    readback_summary: (
      raw.readback_summary || 'Field visit record structured and ready for verification.'
    ).trim(),
  };
}

const ALLOWED_GEMINI_TTS_VOICES = new Set(['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr']);

/**
 * Real Server-Side Gemini Text-to-Speech (`gemini-3.8-flash-lite-tts`)
 * Unary output is a complete 24kHz mono WAV file (`audio/wav`).
 */
async function synthesizeSpeechWithGemini(
  text: string,
  language: string,
  voiceName?: string
): Promise<{ audioBase64: string; mimeType: string; provider: string }> {
  const ai = getGeminiClient('v1beta');
  const langLabel = LANGUAGE_LABELS[language] || 'English';
  const safeVoice = voiceName && ALLOWED_GEMINI_TTS_VOICES.has(voiceName) ? voiceName : 'Kore';

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text,
            speechMetadata: {
              style: `Warm, clear, calm community health worker speaking ${langLabel}`,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: safeVoice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new UpstreamApiError('Speech synthesis did not return audio data.', 422);
  }

  return {
    audioBase64: base64Audio,
    mimeType: 'audio/wav',
    provider: `AshaSakhi Voice (${safeVoice})`,
  };
}

/**
 * Official Gnani AI Vachana Timbre v3.0 TTS with automatic fallback to
 * server-side Gemini TTS (`gemini-3.8-flash-lite-tts`) when Gnani is inactive.
 */
export async function synthesizeFieldReadback(
  text: string,
  language: string,
  voiceName?: string
): Promise<{ audioBase64: string; mimeType: string; provider: string }> {
  const apiKey = resolveGnaniApiKey();
  const hasGeminiFallback = isConfiguredKey(process.env.GEMINI_API_KEY);
  const gnaniMarkedInactive = Boolean(apiKey && apiKey === inactiveGnaniKey);

  // If user chose a Gemini voice, Gnani key is absent, or Gnani key is known inactive, use Gemini directly
  if (
    !apiKey ||
    (gnaniMarkedInactive && hasGeminiFallback) ||
    (voiceName && ALLOWED_GEMINI_TTS_VOICES.has(voiceName) && hasGeminiFallback)
  ) {
    if (hasGeminiFallback) {
      return synthesizeSpeechWithGemini(text, language, voiceName);
    }
    throw new UpstreamApiError(
      'TTS API key is not configured on the server. Add GEMINI_API_KEY or GNANI_API_KEY in Settings > Secrets.',
      422,
      503
    );
  }

  const baseUrl = resolveGnaniBaseUrl();
  const endpoint = `${baseUrl}/api/v1/tts/inference`;
  const ttsModel = resolveGnaniTtsModel();
  const voice = resolveGnaniTtsVoice(ttsModel);
  const langCode = GNANI_LANGUAGE_CODES[language] || 'en-IN';

  let gnaniErr: UpstreamApiError | null = null;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-API-Key-ID': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model: ttsModel,
        voice,
        language: langCode,
        speed: 1.0,
        audio_config: {
          sample_rate: 24000,
          encoding: 'linear_pcm',
          container: 'wav',
        },
      }),
    });

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!response.ok) {
      const errBody = await response.text();
      let parsedErr: Record<string, unknown> | null = null;
      try {
        parsedErr = JSON.parse(errBody) as Record<string, unknown>;
      } catch {
        parsedErr = null;
      }
      const formatted = formatGnaniUpstreamError(response.status, parsedErr, errBody, 'TTS');
      if (
        response.status === 401 ||
        response.status === 403 ||
        formatted.errorCode === 'API_KEY_INACTIVE' ||
        formatted.errorCode === 'INVALID_API_KEY'
      ) {
        inactiveGnaniKey = apiKey;
      }
      console.info(`[Gnani TTS] Switching to AshaSakhi Voice fallback (Gnani HTTP ${response.status}).`);
      gnaniErr = new UpstreamApiError(
        formatted.message,
        formatted.clientStatus,
        formatted.upstreamStatus,
        formatted.errorCode
      );
    } else if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
      const arrBuf = await response.arrayBuffer();
      return {
        audioBase64: Buffer.from(arrBuf).toString('base64'),
        mimeType: contentType.includes('audio/') ? contentType.split(';')[0] : 'audio/wav',
        provider: `Gnani Vachana TTS (${ttsModel})`,
      };
    } else {
      const rawText = await response.text();
      try {
        const data = JSON.parse(rawText) as {
          audio_base64?: string;
          audio?: string;
          data?: { audio_base64?: string; audio?: string };
        };
        const b64 = data.audio_base64 || data.audio || data.data?.audio_base64 || data.data?.audio;
        if (b64) {
          return {
            audioBase64: b64,
            mimeType: 'audio/wav',
            provider: `Gnani Vachana TTS (${ttsModel})`,
          };
        }
      } catch {
        // Fall through to Gemini TTS
      }
      gnaniErr = new UpstreamApiError('Gnani TTS returned an unexpected response format.', 422);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    gnaniErr = new UpstreamApiError(`Could not reach Gnani Vachana TTS API (${msg}).`, 422, 502);
  }

  if (hasGeminiFallback) {
    try {
      return await synthesizeSpeechWithGemini(text, language, voiceName);
    } catch (geminiErr: unknown) {
      console.error(
        '[Gemini TTS] Fallback synthesis failed:',
        geminiErr instanceof Error ? geminiErr.message : String(geminiErr)
      );
    }
  }

  throw gnaniErr || new UpstreamApiError('Voice readback synthesis failed.', 422);
}

export async function generateDistrictBrief(
  district: NFHS5District,
  fieldStats: { totalVisits: number; highRiskCount: number; moderateRiskCount: number }
): Promise<DistrictPolicyBrief> {
  const ai = getGeminiClient();

  const prompt = `Analyze Karnataka NFHS-5 (2019–21) district indicators for ${district.district} (${district.division} Division) versus the Karnataka State baseline, combined with current ASHA field register activity.

NFHS-5 District Metrics (${district.district}):
- Institutional Births: ${district.institutionalBirthsPct}% (State: ${KARNATAKA_NFHS5_BASELINE.institutionalBirthsPct}%)
- 4+ ANC Visits: ${district.fourPlusAncPct}% (State: ${KARNATAKA_NFHS5_BASELINE.fourPlusAncPct}%)
- IFA >= 100 days: ${district.ifa100DaysPct}% (State: ${KARNATAKA_NFHS5_BASELINE.ifa100DaysPct}%)
- Full Immunization (12–23m): ${district.fullImmunizationPct}% (State: ${KARNATAKA_NFHS5_BASELINE.fullImmunizationPct}%)
- Child Stunting (<5y): ${district.childStuntingPct}% (State: ${KARNATAKA_NFHS5_BASELINE.childStuntingPct}%)
- Child Wasting (<5y): ${district.childWastingPct}% (State: ${KARNATAKA_NFHS5_BASELINE.childWastingPct}%)
- Child Underweight (<5y): ${district.childUnderweightPct}% (State: ${KARNATAKA_NFHS5_BASELINE.childUnderweightPct}%)
- Pregnant Women Anaemia: ${district.pregnantAnaemiaPct}% (State: ${KARNATAKA_NFHS5_BASELINE.pregnantAnaemiaPct}%)
- Child Anaemia (6–59m): ${district.childAnaemiaPct}% (State: ${KARNATAKA_NFHS5_BASELINE.childAnaemiaPct}%)

Live ASHA Field Register in ${district.district}:
- Logged Visits: ${fieldStats.totalVisits}
- High-Risk Escalations: ${fieldStats.highRiskCount}
- Moderate-Risk Follow-ups: ${fieldStats.moderateRiskCount}

Produce a concise, practical NHM Karnataka District Health Officer & PHC action brief with specific quantitative comparisons.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are a Karnataka Public Health Intelligence specialist writing concise, evidence-based operational briefs for District Health Officers, Medical Officers, and ASHA supervisors. Keep every bullet under 22 words and grounded in the numbers provided.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          district: { type: Type.STRING },
          executiveSummary: { type: Type.STRING },
          priorityGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
          ashaFieldActions: { type: Type.ARRAY, items: { type: Type.STRING } },
          phcEscalationTargets: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          'district',
          'executiveSummary',
          'priorityGaps',
          'ashaFieldActions',
          'phcEscalationTargets',
        ],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as DistrictPolicyBrief;
  return {
    district: parsed.district || district.district,
    executiveSummary: parsed.executiveSummary || '',
    priorityGaps: Array.isArray(parsed.priorityGaps) ? parsed.priorityGaps : [],
    ashaFieldActions: Array.isArray(parsed.ashaFieldActions) ? parsed.ashaFieldActions : [],
    phcEscalationTargets: Array.isArray(parsed.phcEscalationTargets) ? parsed.phcEscalationTargets : [],
  };
}

const APP_LANGUAGE_NAMES: Record<string, string> = {
  en: 'simple English',
  kn: 'simple everyday Kannada (ಕನ್ನಡ)',
  hi: 'simple everyday Hindi (हिन्दी)',
  te: 'simple everyday Telugu (తెలుగు)',
  ta: 'simple everyday Tamil (தமிழ்)',
  mr: 'simple everyday Marathi (मराठी)',
};

const EMERGENCY_KEYWORDS =
  /\b(bleeding|hemorrhage|convulsion|seizure|fits|unconscious|chest pain|cannot breathe|breathless|severe headache|blurred vision|high bp|1[4-9]\d\/\d+|2\d\d\/\d+|hb\s*[2-6]\.|hemoglobin\s*[2-6]\.|high fever|stiff neck|blue lips|not drinking|lethargic)\b|ರಕ್ತಸ್ರಾವ|ಮೂರ್ಛೆ|ಉಸಿರಾಟದ ತೊಂದರೆ|ತೀವ್ರ ತಲೆನೋವು|अत्यधिक रक्तस्राव|बेहोश|सांस लेने में तकलीफ/i;

/**
 * Generates simple, understandable ASHA worker healthcare guidance in the requested
 * Indian regional language via OpenRouter Qwen, with mandatory emergency escalation
 * and medical disclaimer (never presenting AI as a replacement for doctors).
 */
export async function generateVoiceHealthcareGuidance(
  transcript: string,
  language: string
): Promise<{
  guidance: string;
  key_steps: string[];
  danger_signs: string[];
  is_emergency: boolean;
  medical_disclaimer: string;
  provider: string;
}> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const langName = APP_LANGUAGE_NAMES[language] || 'simple English';
  const keywordEmergency = EMERGENCY_KEYWORDS.test(transcript);

  const defaultDisclaimer =
    'AshaSakhi provides community health support only and does not replace a qualified doctor or nurse. For any emergency or danger signs, call 108 ambulance or visit the nearest PHC / FRU immediately.';

  if (!isConfiguredKey(openRouterKey)) {
    throw new UpstreamApiError(
      'OPENROUTER_API_KEY is not configured on the server. Add your OpenRouter API key in Settings > Secrets.',
      422,
      503,
      'MISSING_API_KEY'
    );
  }

  const model = resolveOpenRouterModel();
  const systemPrompt = `You are AshaSakhi, a simple, compassionate community healthcare assistant helping ASHA workers in India.
Respond in ${langName} using short, clear, easy-to-understand sentences suitable for spoken audio readback to village families.
CRITICAL SAFETY RULES:
- Never diagnose definitively or prescribe prescription drugs.
- Never present yourself as a replacement for qualified medical professionals.
- If ANY maternal, newborn, child, or general danger signs are mentioned (high BP >=140/90, bleeding, convulsions, severe headache + swelling, severe anaemia Hb <7, breathing difficulty, high persistent fever, unconsciousness, child unable to feed), set "is_emergency": true and instruct immediate 108 ambulance / PHC Medical Officer referral as Step 1.
Return ONLY valid JSON with exact keys:
- guidance (string: 2-4 simple sentences in ${langName})
- key_steps (array of 3-4 short practical action strings in ${langName})
- danger_signs (array of detected warning sign strings, empty if none)
- is_emergency (boolean)
- medical_disclaimer (string in ${langName} reminding that AI does not replace qualified doctors and emergencies need immediate 108/PHC care)`;

  let orRes: Response;
  try {
    orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouterKey!.trim()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'AshaSakhi',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `ASHA worker voice note / question:\n${transcript}` },
        ],
      }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    throw new UpstreamApiError(`Could not reach OpenRouter Qwen API (${msg}).`, 422, 502);
  }

  const rawBody = (await orRes.text()).trim();
  if (!orRes.ok) {
    throw new UpstreamApiError(
      `Qwen OpenRouter error (HTTP ${orRes.status}): ${sanitizeSnippet(rawBody)}`,
      422,
      orRes.status
    );
  }

  const payload = JSON.parse(rawBody) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = (payload.choices?.[0]?.message?.content || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const parsed = JSON.parse(content || '{}') as {
    guidance?: string;
    key_steps?: string[];
    danger_signs?: string[];
    is_emergency?: boolean;
    medical_disclaimer?: string;
  };

  const dangerSigns = Array.isArray(parsed.danger_signs)
    ? parsed.danger_signs.map((s) => String(s).trim()).filter(Boolean)
    : [];

  return {
    guidance: (parsed.guidance || 'Please escort the patient to the nearest PHC for clinical checkup.').trim(),
    key_steps: Array.isArray(parsed.key_steps)
      ? parsed.key_steps.map((s) => String(s).trim()).filter(Boolean)
      : ['Monitor symptoms closely and record vitals.', 'Escort to the nearest PHC Medical Officer if symptoms worsen.'],
    danger_signs: dangerSigns,
    is_emergency: Boolean(parsed.is_emergency) || keywordEmergency || dangerSigns.length > 0,
    medical_disclaimer: (parsed.medical_disclaimer || defaultDisclaimer).trim(),
    provider: `Qwen (${model})`,
  };
}

