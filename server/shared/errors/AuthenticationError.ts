import { AppError } from './AppError.js';

/**
 * Enumerates the reasons an authentication attempt may fail.
 * Used to produce specific error codes without leaking implementation details.
 */
export type AuthFailureReason =
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'TOKEN_MISSING'
  | 'SESSION_EXPIRED'
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_NOT_VERIFIED'
  | 'INSUFFICIENT_PERMISSIONS';

/**
 * Thrown when an authentication or authorization check fails (HTTP 401).
 *
 * Use this for:
 * - Missing, malformed, or expired JWT / session tokens
 * - Invalid credentials on login
 * - Disabled or unverified accounts attempting to authenticate
 *
 * For access-control failures where the identity *is* known but lacks
 * permission, prefer throwing `ForbiddenError` (HTTP 403) instead.
 *
 * @module shared/errors
 *
 * @example
 * ```typescript
 * // Token validation failure
 * throw new AuthenticationError('Token has expired', 'TOKEN_EXPIRED');
 *
 * // Generic unauthenticated access
 * throw new AuthenticationError();
 * ```
 */
export class AuthenticationError extends AppError {
  /** Specific reason for the authentication failure. */
  public readonly reason: AuthFailureReason;

  /**
   * Constructs a new AuthenticationError.
   *
   * @param message Human-readable description. Defaults to 'Authentication required'.
   * @param reason  Machine-readable failure reason. Defaults to 'TOKEN_MISSING'.
   */
  constructor(
    message: string = 'Authentication required',
    reason: AuthFailureReason = 'TOKEN_MISSING'
  ) {
    super(message, 401, reason);
    this.reason = reason;
  }

  /**
   * Serializes the error including the failure reason.
   *
   * @returns A plain error payload with the `reason` field.
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      reason: this.reason,
    };
  }

  // ── Convenience factories ──────────────────────────────────────────────────

  /**
   * Creates an error for an expired authentication token.
   *
   * @returns AuthenticationError with reason TOKEN_EXPIRED.
   */
  static tokenExpired(): AuthenticationError {
    return new AuthenticationError(
      'Your session has expired. Please log in again.',
      'TOKEN_EXPIRED'
    );
  }

  /**
   * Creates an error for a malformed or tampered token.
   *
   * @returns AuthenticationError with reason TOKEN_INVALID.
   */
  static tokenInvalid(): AuthenticationError {
    return new AuthenticationError(
      'Invalid authentication token.',
      'TOKEN_INVALID'
    );
  }

  /**
   * Creates an error for wrong email/password combinations.
   * Uses a deliberately vague message to avoid user enumeration.
   *
   * @returns AuthenticationError with reason INVALID_CREDENTIALS.
   */
  static invalidCredentials(): AuthenticationError {
    return new AuthenticationError(
      'Invalid email or password.',
      'INVALID_CREDENTIALS'
    );
  }

  /**
   * Creates an error for accounts that have not completed email verification.
   *
   * @returns AuthenticationError with reason ACCOUNT_NOT_VERIFIED.
   */
  static accountNotVerified(): AuthenticationError {
    return new AuthenticationError(
      'Please verify your email address before logging in.',
      'ACCOUNT_NOT_VERIFIED'
    );
  }

  /**
   * Creates an error for accounts that have been disabled by an administrator.
   *
   * @returns AuthenticationError with reason ACCOUNT_DISABLED.
   */
  static accountDisabled(): AuthenticationError {
    return new AuthenticationError(
      'Your account has been disabled. Please contact support.',
      'ACCOUNT_DISABLED'
    );
  }
}
