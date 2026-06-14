import { AppError } from './AppError.js';

/**
 * Describes the category of external service failure.
 *
 * - `TIMEOUT`          – The downstream call did not respond within the deadline.
 * - `RATE_LIMITED`     – The external API rejected the request due to quota exhaustion.
 * - `AUTHENTICATION`   – The service rejected our credentials / API key.
 * - `UNAVAILABLE`      – The service is down or unreachable (5xx / network error).
 * - `INVALID_RESPONSE` – The service responded but the payload was unexpected.
 * - `UNKNOWN`          – Catch-all for failures that do not fit any category above.
 */
export type ExternalServiceFailureType =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'AUTHENTICATION'
  | 'UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN';

/**
 * Thrown when a call to a third-party or external service fails (HTTP 502).
 *
 * Provides structured context about which service failed, why it failed,
 * and whether the caller should retry the operation.
 *
 * @module shared/errors
 *
 * @example
 * ```typescript
 * // Basic usage
 * throw new ExternalServiceError('OpenAI', 'Rate limit exceeded', 'RATE_LIMITED');
 *
 * // With original error and retry hint
 * throw new ExternalServiceError(
 *   'Instagram API',
 *   'Failed to publish media',
 *   'UNAVAILABLE',
 *   { retryable: true, originalError: err }
 * );
 * ```
 */
export class ExternalServiceError extends AppError {
  /** Human-readable name of the external service that failed. */
  public readonly service: string;

  /** Category of the failure (timeout, rate limit, etc.). */
  public readonly failureType: ExternalServiceFailureType;

  /**
   * Whether the calling code should attempt to retry the operation.
   * Defaults to `false` to be conservative.
   */
  public readonly retryable: boolean;

  /**
   * The original low-level error thrown by the HTTP client or SDK,
   * retained for internal logging (not serialized in responses).
   */
  public readonly originalError: Error | undefined;

  /**
   * Constructs a new ExternalServiceError.
   *
   * @param service       Name of the external service (e.g. 'OpenAI', 'Instagram API').
   * @param message       Description of what went wrong.
   * @param failureType   Category of failure. Defaults to 'UNKNOWN'.
   * @param options       Optional additional context.
   * @param options.retryable     Whether the operation is safe to retry. Default false.
   * @param options.originalError The underlying error, preserved for logging.
   */
  constructor(
    service: string,
    message: string,
    failureType: ExternalServiceFailureType = 'UNKNOWN',
    options: {
      retryable?: boolean;
      originalError?: Error;
    } = {}
  ) {
    super(`[${service}] ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');

    this.service = service;
    this.failureType = failureType;
    this.retryable = options.retryable ?? false;
    this.originalError = options.originalError;
  }

  /**
   * Serializes the error. The `originalError` is intentionally excluded
   * to prevent leaking internal stack traces to API consumers.
   *
   * @returns A plain error payload with `service`, `failureType`, and `retryable`.
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      service: this.service,
      failureType: this.failureType,
      retryable: this.retryable,
    };
  }

  // ── Convenience factories ──────────────────────────────────────────────────

  /**
   * Creates an ExternalServiceError for a request timeout.
   *
   * @param service       Name of the service that timed out.
   * @param timeoutMs     The timeout value that was exceeded, in milliseconds.
   * @returns ExternalServiceError with `TIMEOUT` failure type and `retryable: true`.
   */
  static timeout(service: string, timeoutMs: number): ExternalServiceError {
    return new ExternalServiceError(
      service,
      `Request timed out after ${timeoutMs}ms`,
      'TIMEOUT',
      { retryable: true }
    );
  }

  /**
   * Creates an ExternalServiceError for an exhausted rate limit.
   *
   * @param service       Name of the service that returned a rate-limit error.
   * @param retryAfterMs  Optional milliseconds to wait before retrying.
   * @returns ExternalServiceError with `RATE_LIMITED` failure type.
   */
  static rateLimited(
    service: string,
    retryAfterMs?: number
  ): ExternalServiceError {
    const detail = retryAfterMs
      ? ` Retry after ${retryAfterMs}ms.`
      : '';
    return new ExternalServiceError(
      service,
      `Rate limit exceeded.${detail}`,
      'RATE_LIMITED',
      { retryable: true }
    );
  }

  /**
   * Creates an ExternalServiceError for an authentication/authorization failure
   * with the external service (e.g. invalid API key, expired OAuth token).
   *
   * @param service Name of the service that rejected our credentials.
   * @returns ExternalServiceError with `AUTHENTICATION` failure type and `retryable: false`.
   */
  static authFailed(service: string): ExternalServiceError {
    return new ExternalServiceError(
      service,
      'Authentication with external service failed. Check API credentials.',
      'AUTHENTICATION',
      { retryable: false }
    );
  }

  /**
   * Creates an ExternalServiceError when the service is unreachable or returns 5xx.
   *
   * @param service       Name of the unavailable service.
   * @param originalError Optional underlying network or HTTP error.
   * @returns ExternalServiceError with `UNAVAILABLE` failure type and `retryable: true`.
   */
  static unavailable(
    service: string,
    originalError?: Error
  ): ExternalServiceError {
    return new ExternalServiceError(
      service,
      'Service is currently unavailable.',
      'UNAVAILABLE',
      { retryable: true, originalError }
    );
  }

  /**
   * Creates an ExternalServiceError when the service returned an unexpected payload.
   *
   * @param service Name of the service.
   * @param details Optional description of what was unexpected.
   * @returns ExternalServiceError with `INVALID_RESPONSE` failure type.
   */
  static invalidResponse(
    service: string,
    details?: string
  ): ExternalServiceError {
    const msg = details
      ? `Unexpected response: ${details}`
      : 'Received an unexpected or malformed response.';
    return new ExternalServiceError(service, msg, 'INVALID_RESPONSE', {
      retryable: false,
    });
  }
}
