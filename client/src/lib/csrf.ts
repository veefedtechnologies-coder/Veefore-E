/**
 * CSRF token plumbing for the client (spec: production-security-hardening, Req 8).
 *
 * The server issues a JS-READABLE `vf_csrf` cookie and requires the same value to
 * be echoed in the `X-CSRF-Token` header on state-changing requests. That is the
 * signed double-submit pattern: a cross-site attacker can cause the browser to
 * SEND the cookie automatically, but same-origin policy prevents them from READING
 * it, so they cannot populate the matching header.
 *
 * The token is NOT a credential. On its own it grants nothing — the session cookie
 * remains httpOnly and unreadable. Making this one value readable is what allows
 * the header to be set at all.
 */

export const CSRF_COOKIE_NAME = 'vf_csrf';
export const CSRF_HEADER_NAME = 'X-CSRF-Token';

/** HTTP methods that change state and therefore require a token. */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Read the CSRF token from the cookie jar, or null when absent.
 *
 * Parsed manually rather than with a regex over the whole header so a cookie whose
 * NAME merely ends with `vf_csrf` cannot be mistaken for ours.
 */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    for (const part of document.cookie.split(';')) {
      const entry = part.trim();
      const eq = entry.indexOf('=');
      if (eq <= 0) continue;
      if (entry.slice(0, eq) !== CSRF_COOKIE_NAME) continue;
      const value = decodeURIComponent(entry.slice(eq + 1));
      return value.length > 0 ? value : null;
    }
  } catch {
    /* cookie access can throw in restricted contexts */
  }
  return null;
}

/** True when a request with this method needs a CSRF token. */
export function methodNeedsCsrf(method: string | undefined): boolean {
  return STATE_CHANGING_METHODS.has((method ?? 'GET').toUpperCase());
}

/**
 * Return the CSRF header to merge into a request, or an empty object when none is
 * needed or available.
 *
 * Deliberately does NOT throw when the token is missing: the server runs
 * report-only until enforcement is switched on, and a hard client-side failure
 * would break requests that the server would still accept. A missing token
 * surfaces as the server's own 403 once enforcing.
 */
export function csrfHeaders(method: string | undefined): Record<string, string> {
  if (!methodNeedsCsrf(method)) return {};
  const token = getCsrfToken();
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}

/**
 * Merge the CSRF header into an existing `RequestInit`, preserving whatever
 * headers the caller already set. Accepts the `Headers`, array, and plain-object
 * forms that `HeadersInit` allows.
 */
export function withCsrf(options: RequestInit = {}): RequestInit {
  const extra = csrfHeaders(options.method);
  if (Object.keys(extra).length === 0) return options;

  const existing = options.headers;
  let merged: Record<string, string> = {};

  if (existing instanceof Headers) {
    existing.forEach((value, key) => {
      merged[key] = value;
    });
  } else if (Array.isArray(existing)) {
    for (const [key, value] of existing) merged[key] = value;
  } else if (existing && typeof existing === 'object') {
    merged = { ...(existing as Record<string, string>) };
  }

  return { ...options, headers: { ...merged, ...extra } };
}

/**
 * Install a global `fetch` interceptor that attaches the CSRF header to
 * same-origin, state-changing requests.
 *
 * WHY A GLOBAL INTERCEPTOR RATHER THAN PATCHING CALL SITES
 * --------------------------------------------------------
 * Wiring the header into `apiRequest` alone was NOT sufficient: the client has
 * roughly a dozen modules that call `fetch` directly with
 * `credentials: 'include'` and a mutating method (workspace switching, video-editor
 * actions, the onboarding steps, brand selection). Those would each have 403'd the
 * moment `SECURITY_CSRF_ENFORCE=true` was set.
 *
 * Patching them individually would leave the same trap for the NEXT `fetch` someone
 * adds. Intercepting once means every current and future caller is covered by
 * construction, which is what makes enabling enforcement safe.
 *
 * SCOPE — deliberately narrow:
 *   - only same-origin requests (never leak the token to a third party);
 *   - only state-changing methods;
 *   - never overwrites a header the caller already set.
 *
 * Idempotent: safe to call more than once.
 */
let interceptorInstalled = false;

export function installCsrfFetchInterceptor(): void {
  if (interceptorInstalled) return;
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  interceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);

  /** True when the request targets our own origin. */
  const isSameOrigin = (input: RequestInfo | URL): boolean => {
    try {
      const raw =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      // Relative URLs are same-origin by definition.
      if (!/^https?:\/\//i.test(raw)) return true;
      return new URL(raw, window.location.href).origin === window.location.origin;
    } catch {
      // Unparseable → treat as cross-origin and send nothing.
      return false;
    }
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      // A Request object carries its own method; `init` overrides it when present.
      const method =
        init?.method ??
        (typeof input === 'object' && input !== null && 'method' in input
          ? (input as Request).method
          : 'GET');

      if (!methodNeedsCsrf(method) || !isSameOrigin(input)) {
        return originalFetch(input as any, init);
      }

      const token = getCsrfToken();
      if (!token) return originalFetch(input as any, init);

      // Merge without clobbering an explicit caller-supplied header.
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has(CSRF_HEADER_NAME)) headers.set(CSRF_HEADER_NAME, token);

      return originalFetch(input as any, { ...init, headers });
    } catch {
      // Never let the interceptor break a request; fall back to the original.
      return originalFetch(input as any, init);
    }
  };
}
