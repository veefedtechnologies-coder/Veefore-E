/**
 * Facebook API Error Mapper
 *
 * Classifies raw Facebook Graph API errors (from Axios responses, plain Error
 * objects, or arbitrary thrown values) into structured `FacebookApiError`
 * instances with typed `type` discriminators.
 *
 * Error code mapping (per Meta Graph API documentation):
 *   190           → TOKEN_EXPIRED      (REQUIRES_RECONNECT = true)
 *   10 / 200 / 803 → PERMISSION_DENIED  (REQUIRES_RECONNECT = false)
 *   80002 / 429   → RATE_LIMITED       (REQUIRES_RECONNECT = false)
 *   anything else → UNKNOWN
 *
 * Requirements: 12.1, 12.2, 12.3
 */

// ---------------------------------------------------------------------------
// FacebookApiError class
// ---------------------------------------------------------------------------

/**
 * Discriminated union type for all classified Facebook API error categories.
 *
 * - `TOKEN_EXPIRED`    — The page/user access token has expired (code 190).
 *                        Callers must mark the SocialAccount as REQUIRES_RECONNECT
 *                        and cease polling.
 * - `REQUIRES_RECONNECT` — Alias kept for callers that check this type directly.
 * - `PERMISSION_DENIED` — The token lacks a required OAuth permission
 *                         (codes 10, 200, 803). The specific missing scope is
 *                         stored in `missingPermission`.
 * - `RATE_LIMITED`     — The API quota has been exceeded (code 80002 / HTTP 429).
 *                        Retry after `retryAfter` seconds if provided.
 * - `UNKNOWN`          — Any other error not covered by the above categories.
 */
export type FacebookApiErrorType =
  | 'TOKEN_EXPIRED'
  | 'REQUIRES_RECONNECT'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'UNKNOWN'

/**
 * Structured Facebook API error — thrown by `FacebookProvider` methods and
 * caught by `FacebookRollupReadStore` and route handlers.
 *
 * Extends the native `Error` class so it integrates with standard `instanceof`
 * checks and stack-trace capture.
 */
export class FacebookApiError extends Error {
  /**
   * Discriminator for the error category.
   * Callers switch on this field to decide the appropriate recovery action.
   */
  readonly type: FacebookApiErrorType

  /**
   * The original Facebook Graph API error code, if one could be extracted.
   * Useful for debugging — do not use for control flow (use `type` instead).
   */
  readonly code?: number

  /**
   * When `type === 'PERMISSION_DENIED'`, contains the name of the missing OAuth
   * scope (e.g., `"pages_read_engagement"`), if it was present in the error body.
   */
  readonly missingPermission?: string

  /**
   * When `type === 'RATE_LIMITED'`, the number of seconds to wait before
   * retrying, if the API communicated a `Retry-After` value.
   */
  readonly retryAfter?: number

  constructor(params: {
    type: FacebookApiErrorType
    message: string
    code?: number
    missingPermission?: string
    retryAfter?: number
    cause?: unknown
  }) {
    super(params.message)
    this.name = 'FacebookApiError'
    this.type = params.type
    this.code = params.code
    this.missingPermission = params.missingPermission
    this.retryAfter = params.retryAfter

    // Preserve the original error as `cause` for stack-trace chaining
    if (params.cause !== undefined) {
      (this as any).cause = params.cause
    }

    // Maintain correct prototype chain in transpiled environments
    Object.setPrototypeOf(this, FacebookApiError.prototype)
  }
}

// ---------------------------------------------------------------------------
// Internal helpers for extracting fields from Facebook error shapes
// ---------------------------------------------------------------------------

/**
 * Represents the nested `error` object that Meta Graph API returns inside an
 * HTTP 200 body or inside an Axios error response's `data` field.
 *
 * Example Graph API error body:
 * ```json
 * {
 *   "error": {
 *     "message": "Invalid OAuth access token.",
 *     "type": "OAuthException",
 *     "code": 190,
 *     "error_subcode": 460,
 *     "error_user_title": "...",
 *     "fbtrace_id": "..."
 *   }
 * }
 * ```
 */
interface MetaGraphError {
  message?: string
  type?: string
  code?: number
  error_subcode?: number
  error_user_msg?: string
  /** Populated for permission errors — specifies which permission is missing. */
  required_permissions?: string[]
  fbtrace_id?: string
}

/** Shape of the data body returned by the Graph API (wraps MetaGraphError). */
interface MetaErrorBody {
  error?: MetaGraphError
}

/**
 * Attempts to extract a `MetaGraphError` object from any thrown value.
 *
 * Handles these shapes:
 * 1. Axios error: `err.response.data.error`
 * 2. Plain object with `.error.code`: `{ error: { code, message, ... } }`
 * 3. Plain object with top-level `.code`: `{ code, message }`
 * 4. Array of errors (batch responses): first item's `.error`
 */
function extractMetaGraphError(err: unknown): MetaGraphError | null {
  if (err == null || typeof err !== 'object') return null

  const obj = err as Record<string, unknown>

  // 1. Axios error shape: { response: { data: { error: {...} } } }
  if (
    obj['response'] != null &&
    typeof obj['response'] === 'object'
  ) {
    const response = obj['response'] as Record<string, unknown>
    if (response['data'] != null && typeof response['data'] === 'object') {
      const data = response['data'] as MetaErrorBody
      if (data.error != null) return data.error
    }
  }

  // 2. Direct Graph API body shape: { error: { code, message, ... } }
  if (obj['error'] != null && typeof obj['error'] === 'object') {
    const nested = obj['error'] as MetaGraphError
    if (nested.code != null) return nested
  }

  // 3. Top-level fields (some internal wrappers re-surface this)
  if (typeof obj['code'] === 'number') {
    return {
      code: obj['code'] as number,
      message: typeof obj['message'] === 'string' ? obj['message'] : undefined,
    }
  }

  // 4. Array batch shape: errors[0].error
  if (Array.isArray(obj)) {
    const first = obj[0]
    if (first != null && typeof first === 'object') {
      return extractMetaGraphError(first)
    }
  }

  return null
}

/**
 * Extracts the numeric Facebook error code from any thrown value.
 * Returns `undefined` when no code can be determined.
 */
function extractMetaCode(err: unknown): number | undefined {
  return extractMetaGraphError(err)?.code
}

/**
 * Extracts the Facebook error sub-code (used in some OAuth/permission errors).
 */
function extractMetaSubcode(err: unknown): number | undefined {
  return extractMetaGraphError(err)?.error_subcode
}

/**
 * Determines whether the error represents an HTTP 429 rate-limit response
 * (in addition to the Graph API-level code 80002).
 */
function isRateLimitError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false
  const obj = err as Record<string, unknown>

  // HTTP status 429 from Axios
  if (obj['response'] != null && typeof obj['response'] === 'object') {
    const response = obj['response'] as Record<string, unknown>
    if (response['status'] === 429) return true
  }

  // Some Facebook responses use a top-level `x-app-usage` header exhaustion
  // flagged with status 400 + type "OAuthException" + code 80002 (handled by
  // extractMetaCode), so no extra check is needed here.

  return false
}

/**
 * Extracts the `Retry-After` value (in seconds) from an HTTP response header
 * or from the Graph API error body if present.
 *
 * Returns `undefined` when no value can be determined.
 */
function extractRetryAfter(err: unknown): number | undefined {
  if (err == null || typeof err !== 'object') return undefined
  const obj = err as Record<string, unknown>

  // Check Axios response headers for `Retry-After`
  if (obj['response'] != null && typeof obj['response'] === 'object') {
    const response = obj['response'] as Record<string, unknown>

    if (response['headers'] != null && typeof response['headers'] === 'object') {
      const headers = response['headers'] as Record<string, unknown>
      const retryHeader = headers['retry-after'] ?? headers['Retry-After']
      if (retryHeader != null) {
        const parsed = parseInt(String(retryHeader), 10)
        if (!Number.isNaN(parsed) && parsed > 0) return parsed
      }
    }
  }

  return undefined
}

/**
 * Extracts the missing OAuth permission name from a permission-denied error.
 *
 * Meta's API sometimes populates `required_permissions` with the scope that
 * was missing. Falls back to `undefined` when not available.
 */
function extractMissingPermission(err: unknown): string | undefined {
  const graphError = extractMetaGraphError(err)
  if (graphError == null) return undefined

  // `required_permissions` array on the Graph API error object
  if (
    Array.isArray(graphError.required_permissions) &&
    graphError.required_permissions.length > 0
  ) {
    return graphError.required_permissions[0]
  }

  // Some error messages embed the permission name in the message string.
  // Example: "Permission error: pages_read_engagement"
  if (graphError.message) {
    const match = graphError.message.match(/\b(pages_[a-z_]+|read_insights|manage_[a-z_]+)\b/)
    if (match) return match[1]
  }

  return undefined
}

/**
 * Builds a human-readable error message from the raw error, falling back to a
 * generic string when no message is available.
 */
function buildMessage(err: unknown, fallback: string): string {
  const graphError = extractMetaGraphError(err)
  if (graphError?.message) return graphError.message
  if (err instanceof Error && err.message) return err.message
  return fallback
}

// ---------------------------------------------------------------------------
// Public mapper function
// ---------------------------------------------------------------------------

/**
 * Maps any thrown value from a Facebook Graph API call into a structured
 * `FacebookApiError` with a typed `type` discriminator.
 *
 * ### Classification rules
 * | Condition                                      | `type`              |
 * |------------------------------------------------|---------------------|
 * | `code === 190`                                 | `TOKEN_EXPIRED`     |
 * | `code === 10 \|\| code === 200 \|\| code === 803` | `PERMISSION_DENIED` |
 * | `code === 80002 \|\| HTTP 429`                 | `RATE_LIMITED`      |
 * | anything else                                  | `UNKNOWN`           |
 *
 * @param err - Any value caught from a Facebook Graph API call. May be an
 *              Axios error, a plain `Error`, a Graph API error body object,
 *              or a primitive.
 * @returns A `FacebookApiError` instance ready to be thrown or returned to
 *          the caller.
 *
 * Requirements: 12.1, 12.2, 12.3
 */
export function mapFacebookApiError(err: unknown): FacebookApiError {
  const code = extractMetaCode(err)
  const subcode = extractMetaSubcode(err)

  // ── TOKEN_EXPIRED (code 190) ─────────────────────────────────────────────
  // Meta error code 190 signals an expired or invalid access token.
  // The affected SocialAccount must be marked REQUIRES_RECONNECT and polling
  // must stop immediately.
  if (code === 190) {
    return new FacebookApiError({
      type: 'TOKEN_EXPIRED',
      message: buildMessage(err, 'Facebook access token has expired or been invalidated.'),
      code,
      cause: err,
    })
  }

  // ── PERMISSION_DENIED (codes 10, 200, 803) ───────────────────────────────
  // These codes indicate the token lacks one or more required OAuth permissions.
  // Only the affected features should be marked unavailable; unrelated features
  // remain functional.
  if (code === 10 || code === 200 || code === 803) {
    return new FacebookApiError({
      type: 'PERMISSION_DENIED',
      message: buildMessage(err, 'Facebook API call was denied due to missing permissions.'),
      code,
      missingPermission: extractMissingPermission(err),
      cause: err,
    })
  }

  // ── RATE_LIMITED (code 80002 or HTTP 429) ────────────────────────────────
  // The application has exceeded its Graph API rate quota.
  // The GovernedHttpClient handles exponential backoff; if all retries are
  // exhausted, the caller surfaces a non-blocking banner.
  if (code === 80002 || isRateLimitError(err)) {
    return new FacebookApiError({
      type: 'RATE_LIMITED',
      message: buildMessage(err, 'Facebook API rate limit reached. Please retry later.'),
      code,
      retryAfter: extractRetryAfter(err),
      cause: err,
    })
  }

  // ── UNKNOWN (any other error) ────────────────────────────────────────────
  // Covers network failures, unexpected HTTP status codes, malformed responses,
  // etc. Callers log these and return partial data where possible.
  return new FacebookApiError({
    type: 'UNKNOWN',
    message: buildMessage(err, 'An unexpected error occurred while communicating with the Facebook API.'),
    code,
    cause: err,
  })
}
