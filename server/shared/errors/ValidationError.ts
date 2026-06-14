import { AppError } from './AppError.js';

/**
 * Represents a client-supplied data validation failure (HTTP 400).
 *
 * Use this when request payloads fail schema or business-rule validation.
 * The optional `errors` map allows field-level detail to be surfaced to
 * API consumers for form feedback.
 *
 * @module shared/errors
 *
 * @example
 * ```typescript
 * throw new ValidationError('Invalid signup data', {
 *   email: ['Must be a valid email address'],
 *   password: ['Must be at least 8 characters', 'Must contain a number'],
 * });
 * ```
 */
export class ValidationError extends AppError {
  /**
   * Field-level validation messages keyed by field name.
   * Each entry is an array of human-readable error strings.
   */
  public readonly errors: Readonly<Record<string, readonly string[]>>;

  /**
   * Constructs a new ValidationError.
   *
   * @param message High-level description of the validation failure.
   * @param errors  Optional map of field names to arrays of error messages.
   *                Defaults to an empty map.
   */
  constructor(
    message: string,
    errors: Record<string, string[]> = {}
  ) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }

  /**
   * Serializes the error including field-level details.
   *
   * @returns A plain error payload including the `errors` map.
   */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
  }

  /**
   * Convenience factory that creates a ValidationError from a single
   * field/message pair.
   *
   * @param field   The field name that failed validation.
   * @param message The error message for that field.
   * @returns A new ValidationError scoped to a single field.
   *
   * @example
   * ```typescript
   * throw ValidationError.forField('email', 'Email is already in use');
   * ```
   */
  static forField(field: string, message: string): ValidationError {
    return new ValidationError(`Validation failed: ${message}`, {
      [field]: [message],
    });
  }
}
