/**
 * gemini-files.service — upload a file to the Gemini Files API and get back a
 * reusable `fileUri` the model can read by reference.
 *
 * WHY THIS EXISTS
 * Inlining a file's bytes in the request (base64 `inlineData`) is simple but has
 * a hard ~20MB per-request ceiling — a normal phone video blows past it, so it
 * silently became "bubble only" and the model never saw it. The Files API lifts
 * that: upload the bytes ONCE (up to ~2GB), then reference the returned
 * `fileUri` in `generateContent`. This is how large video/PDF analysis works —
 * the same model capability, just delivered by reference instead of by value.
 *
 * Implemented over REST (not the SDK) deliberately: it reuses the exact key +
 * `x-goog-api-key` header path that the image service already proves works with
 * this project's Google key, so there's ONE auth story for all Gemini calls.
 *
 * Files are scoped to the API KEY that uploaded them and auto-expire after ~48h,
 * so the SAME key must be used to upload and to reference (the caller passes the
 * key that `streamGemini` will use).
 */

/** Base endpoint for the Gemini generative-language API. */
const GENAI_BASE = 'https://generativelanguage.googleapis.com';

export interface GeminiUploadedFile {
  /** Resource name, e.g. `files/abc123`. */
  name: string;
  /** URI to reference in a `fileData` part. */
  fileUri: string;
  mimeType: string;
  /** `PROCESSING` | `ACTIVE` | `FAILED`. */
  state: string;
}

/**
 * The key to use for Files API calls. MUST match the key `streamGemini` uses so
 * the uploaded file is visible to the generateContent request that references
 * it. Prefers the user's own AI-Studio key, then the server key.
 */
export function resolveGeminiApiKey(preferences?: {
  googleAiStudioKey?: string;
}): string {
  return (
    preferences?.googleAiStudioKey ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ''
  );
}

/**
 * Upload raw bytes to the Gemini Files API using the resumable protocol, then
 * (for video/PDF, which Google processes asynchronously) poll until the file is
 * ACTIVE so it can be referenced immediately. Throws on failure — the caller
 * falls back to inline or bubble-only.
 */
export async function uploadFileToGemini(opts: {
  buffer: Buffer;
  mimeType: string;
  displayName?: string;
  apiKey: string;
  signal?: AbortSignal;
  /** Max time to wait for PROCESSING → ACTIVE (video). Default 120s. */
  activateTimeoutMs?: number;
}): Promise<GeminiUploadedFile> {
  const { buffer, mimeType, displayName, apiKey, signal } = opts;
  if (!apiKey) throw new Error('gemini-files: no API key configured');
  const numBytes = buffer.length;

  // ── 1. Start a resumable upload session ─────────────────────────────────────
  const startRes = await fetch(`${GENAI_BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(numBytes),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName || 'upload' } }),
    signal,
  });
  if (!startRes.ok) {
    const text = await startRes.text().catch(() => '');
    throw new Error(
      `gemini-files: start failed ${startRes.status} ${text.slice(0, 200)}`
    );
  }
  const uploadUrl =
    startRes.headers.get('x-goog-upload-url') ||
    startRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('gemini-files: no upload URL returned');

  // ── 2. Upload the bytes and finalize in one shot ────────────────────────────
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(numBytes),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buffer,
    signal,
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '');
    throw new Error(
      `gemini-files: upload failed ${uploadRes.status} ${text.slice(0, 200)}`
    );
  }
  const uploaded: any = await uploadRes.json();
  const file = uploaded?.file || {};
  let state = String(file.state || 'PROCESSING');
  const name = String(file.name || '');
  const fileUri = String(file.uri || '');
  if (!fileUri || !name) throw new Error('gemini-files: malformed upload response');

  // ── 3. Wait until ACTIVE (video/large PDF are processed async) ──────────────
  if (state !== 'ACTIVE') {
    state = await waitUntilActive({
      name,
      apiKey,
      signal,
      timeoutMs: opts.activateTimeoutMs ?? 120_000,
    });
  }
  if (state === 'FAILED') throw new Error('gemini-files: processing FAILED');

  return { name, fileUri, mimeType: String(file.mimeType || mimeType), state };
}

/** Poll `files.get` until the file leaves PROCESSING. Returns the final state. */
export async function waitUntilActive(opts: {
  name: string;
  apiKey: string;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<string> {
  const { name, apiKey, signal, timeoutMs } = opts;
  const deadline = Date.now() + timeoutMs;
  // Poll every 1.5s; video processing is usually a few seconds.
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('aborted');
    await new Promise(r => setTimeout(r, 1500));
    const res = await fetch(`${GENAI_BASE}/v1beta/${name}`, {
      headers: { 'x-goog-api-key': apiKey },
      signal,
    });
    if (!res.ok) continue;
    const json: any = await res.json().catch(() => ({}));
    const state = String(json?.state || 'PROCESSING');
    if (state !== 'PROCESSING') return state;
  }
  throw new Error('gemini-files: timed out waiting for ACTIVE');
}
