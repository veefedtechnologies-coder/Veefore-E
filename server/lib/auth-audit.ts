/**
 * Authentication audit log (spec: production-security-hardening, Requirement 10).
 *
 * Records security-relevant authentication events durably so incidents can be
 * investigated after the fact: who authenticated, when, from where, and which
 * sessions were revoked or rejected.
 *
 * DESIGN CONSTRAINTS
 * ------------------
 * 1. NEVER fail the user-facing request (Requirement 10.5). Every write is
 *    fire-and-forget and swallows its own errors; a logging outage must not become
 *    an authentication outage. Failures surface on the operational console instead.
 * 2. NEVER record credentials, session cookie values, or tokens (Requirement 10.3).
 *    The event shape below has no field capable of carrying them, and the
 *    `redactValue` helper is applied to anything free-form.
 * 3. Append-only with respect to events (Requirement 10.4): this module exposes no
 *    update or delete operation.
 */

/** Security-relevant authentication events. */
export type AuthEventType =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'global_logout'
  | 'session_revoked'
  | 'session_expired'
  | 'csrf_failure'
  | 'rate_limit'
  | 'auth_failure'
  | 'tenant_violation';

export interface AuthEvent {
  type: AuthEventType;
  /** Application user id, when known. */
  userId?: string | null;
  /** Real client address behind the deployment proxy. */
  clientIp?: string | null;
  /** Request path, useful for locating the endpoint involved. */
  path?: string | null;
  /** Short machine-readable reason (e.g. 'session_invalidated'). */
  reason?: string | null;
  /** Non-sensitive extra context. Values are redacted defensively. */
  detail?: Record<string, unknown>;
}

/** Keys whose values must never be persisted, whatever a caller passes. */
const FORBIDDEN_DETAIL_KEYS = [
  'token', 'idtoken', 'accesstoken', 'refreshtoken', 'customtoken',
  'session', '__session', 'auth_token', 'cookie', 'password', 'secret',
  'authorization', 'csrf', 'apikey', 'api_key',
];

/**
 * Strip anything that could carry credential material, and cap value length so a
 * large body cannot be smuggled into the log.
 */
function redactDetail(detail?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!detail) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_DETAIL_KEYS.some((f) => lower.includes(f))) {
      safe[key] = '[redacted]';
      continue;
    }
    if (typeof value === 'string') {
      safe[key] = value.length > 200 ? value.slice(0, 200) + '…' : value;
    } else if (
      value === null ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      safe[key] = value;
    } else {
      // Objects/arrays could nest secrets; record only the shape.
      safe[key] = Array.isArray(value) ? `[array:${value.length}]` : '[object]';
    }
  }
  return safe;
}

/**
 * Extract the real client IP, honouring the deployment proxy (Requirement 9.4 /
 * 10.2). `req.ip` already respects Express's `trust proxy` setting when configured.
 */
export function clientIpOf(req: any): string | null {
  try {
    const forwarded = req?.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      // Left-most entry is the originating client.
      return forwarded.split(',')[0].trim() || null;
    }
    return req?.ip || req?.socket?.remoteAddress || null;
  } catch {
    return null;
  }
}

/** Build a normalised, redacted record ready to persist. */
export function buildAuthEventRecord(event: AuthEvent): Record<string, unknown> {
  return {
    type: event.type,
    userId: event.userId ? String(event.userId) : null,
    clientIp: event.clientIp ?? null,
    path: event.path ?? null,
    reason: event.reason ?? null,
    detail: redactDetail(event.detail),
    // Timestamp is assigned server-side; a caller cannot backdate an entry.
    createdAt: new Date(),
  };
}

/**
 * Record an authentication event. Fire-and-forget: returns immediately and never
 * throws, so no call site needs a try/catch or an await.
 */
export function recordAuthEvent(event: AuthEvent): void {
  const record = buildAuthEventRecord(event);

  // Always emit to the operational log, so the trail survives even when the
  // database is unavailable.
  console.log('[auth-audit]', JSON.stringify(record));

  void (async () => {
    try {
      const { AuthAuditEventModel } = await import('../models/Security/AuthAuditEvent');
      await AuthAuditEventModel.create(record);
    } catch (error) {
      // Requirement 10.5: never propagate. Surface it operationally instead.
      console.warn(
        '[auth-audit] failed to persist event (non-fatal):',
        error instanceof Error ? error.message : 'unknown'
      );
    }
  })();
}

/** Convenience wrapper that pulls ip/path straight off the request. */
export function recordAuthEventFromRequest(
  req: any,
  event: Omit<AuthEvent, 'clientIp' | 'path'>
): void {
  recordAuthEvent({
    ...event,
    clientIp: clientIpOf(req),
    path: req?.path ?? req?.originalUrl ?? null,
  });
}
