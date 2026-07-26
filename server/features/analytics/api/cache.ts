/**
 * Veefore Analytics — Dashboard Cache (Phase 8).
 *
 * Caching for dashboard responses (08-backend-api-architecture.md Ch 6: cache
 * aggregated summaries aggressively; invalidate after successful syncs; never
 * cache auth/permissions). A small in-memory TTL cache is the default; a
 * distributed cache can implement the same {@link AnalyticsCache} port later.
 */

/** Cache port for analytics responses. */
export interface AnalyticsCache {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T, ttlMs: number): Promise<void>
  /** Invalidate all keys beginning with `prefix` (e.g. a workspace). */
  invalidate(prefix: string): Promise<void>
}

interface Entry {
  value: unknown
  expiresAt: number
}

/** Process-local TTL cache. Suitable as a default; swap for Redis at scale. */
export class InMemoryTtlCache implements AnalyticsCache {
  private readonly store = new Map<string, Entry>()

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key)
      return undefined
    }
    return entry.value as T
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  async invalidate(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key)
    }
  }
}

/** Build a stable cache key for a dashboard request (workspace-prefixed). */
export function dashboardCacheKey(
  workspaceId: string,
  dashboardId: string,
  queryFingerprint: string
): string {
  return `analytics:${workspaceId}:dashboard:${dashboardId}:${queryFingerprint}`
}

/** Deterministic fingerprint of the query fields that affect the response. */
export function queryFingerprint(parts: Record<string, unknown>): string {
  return Object.keys(parts)
    .sort()
    .map((k) => `${k}=${JSON.stringify(parts[k])}`)
    .join('&')
}
