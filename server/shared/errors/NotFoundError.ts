import { AppError } from './AppError.js';

/**
 * Thrown when a requested resource does not exist (HTTP 404).
 *
 * Provides optional resource-type and identifier context so that error
 * messages are actionable without leaking sensitive data.
 *
 * @module shared/errors
 *
 * @example
 * ```typescript
 * // With resource type and ID
 * throw new NotFoundError('User', userId);
 *
 * // With resource type only
 * throw new NotFoundError('Instagram account');
 *
 * // Bare 404
 * throw new NotFoundError();
 * ```
 */
export class NotFoundError extends AppError {
  /** The type/name of the resource that was not found, if provided. */
  public readonly resource: string | undefined;

  /** The identifier used in the failed lookup, if provided. */
  public readonly resourceId: string | undefined;

  /**
   * Constructs a new NotFoundError.
   *
   * @param resource   Optional human-readable name of the resource type (e.g. 'User').
   * @param resourceId Optional identifier that was looked up (e.g. a UUID string).
   */
  constructor(resource?: string, resourceId?: string) {
    const message = NotFoundError.buildMessage(resource, resourceId);
    super(message, 404, 'NOT_FOUND');

    this.resource = resource;
    this.resourceId = resourceId;
  }

  /**
   * Serializes the error including resource context.
   *
   * @returns A plain error payload with optional `resource` and `resourceId` fields.
   */
  override toJSON(): Record<string, unknown> {
    const base = super.toJSON();
    if (this.resource !== undefined) {
      (base as Record<string, unknown>)['resource'] = this.resource;
    }
    if (this.resourceId !== undefined) {
      (base as Record<string, unknown>)['resourceId'] = this.resourceId;
    }
    return base;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static buildMessage(
    resource?: string,
    resourceId?: string
  ): string {
    if (resource && resourceId) {
      return `${resource} with id '${resourceId}' not found`;
    }
    if (resource) {
      return `${resource} not found`;
    }
    return 'Resource not found';
  }

  // ── Convenience factories ──────────────────────────────────────────────────

  /**
   * Creates a NotFoundError for a given route path.
   * Useful in Express catch-all 404 middleware.
   *
   * @param path The request path that produced no match.
   * @returns NotFoundError scoped to a route.
   *
   * @example
   * ```typescript
   * app.use((req, _res, next) => {
   *   next(NotFoundError.forRoute(req.path));
   * });
   * ```
   */
  static forRoute(path: string): NotFoundError {
    const err = new NotFoundError();
    // Override message while keeping resource fields undefined
    Object.defineProperty(err, 'message', { value: `Route '${path}' not found` });
    return err;
  }
}
