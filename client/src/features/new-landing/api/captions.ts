/**
 * Client fetch wrapper for the Caption_Proxy endpoint.
 *
 * The AI provider API key must never reach the client (Requirement 12.5), so
 * the browser only ever talks to the server-side proxy at
 * `POST /api/public/landing/captions`, which calls the AI provider on its behalf.
 *
 * Convention: this repo uses plain relative `fetch('/api/...')` for
 * unauthenticated endpoints (see `client/src/lib/auth.ts`); the
 * `authenticatedFetch` helper is reserved for routes that require a Firebase
 * token. The caption proxy is public, so we use a plain relative fetch here.
 *
 * Validates: Requirements 12.2, 12.7
 */

/** Endpoint for the server-side caption proxy (Caption_Proxy). */
const CAPTIONS_ENDPOINT = '/api/public/landing/captions';

export interface CaptionRequest {
  topic: string;
  niche: string;
  tone: string;
}

export interface CaptionResponse {
  captions: string[];
}

/**
 * Typed error thrown for non-2xx responses or malformed success payloads from
 * the Caption_Proxy. Carries the HTTP status (when available) so callers can
 * surface a descriptive message and offer a retry affordance (Requirement 12.7).
 */
export class CaptionApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CaptionApiError';
    this.status = status;
    // Restore prototype chain for instanceof checks when targeting ES5.
    Object.setPrototypeOf(this, CaptionApiError.prototype);
  }
}

/** Type guard: response payload is a valid `{ captions: string[] }`. */
function isValidCaptionResponse(value: unknown): value is CaptionResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const captions = (value as { captions?: unknown }).captions;
  return (
    Array.isArray(captions) &&
    captions.every((caption) => typeof caption === 'string')
  );
}

/**
 * Extract a human-readable message from a parsed error body, if present.
 * The proxy returns `{ error, message }` on 4xx/5xx (see design contract).
 */
function extractErrorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const { message, error } = body as { message?: unknown; error?: unknown };
  if (typeof message === 'string' && message.trim() !== '') {
    return message;
  }
  if (typeof error === 'string' && error.trim() !== '') {
    return error;
  }
  return undefined;
}

/**
 * Request AI captions from the Caption_Proxy.
 *
 * @param req    Topic / niche / tone for the generation request.
 * @param signal Optional AbortSignal; passed through to fetch so the caller can
 *               cancel the request (e.g. on component unmount). An AbortError is
 *               allowed to propagate unwrapped so callers can distinguish
 *               cancellation from genuine failures.
 * @returns      The parsed `{ captions: string[] }` payload.
 * @throws       {CaptionApiError} on non-2xx responses or malformed payloads.
 */
export async function generateCaptions(
  req: CaptionRequest,
  signal?: AbortSignal
): Promise<CaptionResponse> {
  const response = await fetch(CAPTIONS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
    signal,
  });

  if (!response.ok) {
    // Attempt to parse the error body for a descriptive message; fall back to
    // a generic status-based message when the body is missing or unparseable.
    let message: string | undefined;
    try {
      const errorBody: unknown = await response.json();
      message = extractErrorMessage(errorBody);
    } catch {
      // Ignore parse failures; we'll use the fallback message below.
    }
    throw new CaptionApiError(
      message ?? `Caption request failed with status ${response.status}.`,
      response.status
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new CaptionApiError(
      'Caption response was not valid JSON.',
      response.status
    );
  }

  if (!isValidCaptionResponse(data)) {
    throw new CaptionApiError(
      'Caption response did not contain a valid captions array.',
      response.status
    );
  }

  return { captions: data.captions };
}
