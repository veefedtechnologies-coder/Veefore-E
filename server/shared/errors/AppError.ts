/**
 * Base application error class for typed, operational errors.
 *
 * All domain-specific errors extend this class to ensure consistent
 * error handling across the application.
 *
 * @module shared/errors
 *
 * @example
 * ```typescript
 * throw new AppError('Something went wrong', 500, 'INTERNAL_ERROR');
 * ```
 */
export class AppError extends Error {
  /** HTTP status code associated with this error. */
  public readonly statusCode: number;

  /**
   * Indicates the error is a known, expected operational error (not a
   * programming bug). Operational errors are safe to expose to clients.
   */
  public readonly isOperational: boolean;

  /** Machine-readable error code string used for client-side handling. */
  public readonly code: string;

  /**
   * Constructs a new AppError.
   *
   * @param message   Human-readable description of what went wrong.
   * @param statusCode HTTP status code to send to the client. Defaults to 500.
   * @param code       Machine-readable error code. Defaults to 'INTERNAL_ERROR'.
   */
  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR'
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    // Maintains proper stack trace in V8 environments (Node.js / Chrome).
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serializes the error into a plain object suitable for JSON responses.
   *
   * @returns A plain error payload without internal stack trace details.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
    };
  }

  /**
   * Type guard that checks whether an unknown value is an AppError instance.
   *
   * @param value - The value to test.
   * @returns `true` if `value` is an AppError.
   *
   * @example
   * ```typescript
   * try {
   *   doSomething();
   * } catch (err) {
   *   if (AppError.isAppError(err)) {
   *     res.status(err.statusCode).json(err.toJSON());
   *   }
   * }
   * ```
   */
  static isAppError(value: unknown): value is AppError {
    return value instanceof AppError;
  }
}
