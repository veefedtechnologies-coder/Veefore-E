/**
 * Redis-backed implementation of the {@link AnalyticsCache} port
 * (08-backend-api-architecture.md Ch 6). Caches assembled dashboard response
 * envelopes in Redis so repeated dashboard loads — across instances — are
 * served from cache instead of re-running the read store / metric engine.
 *
 * Falls back gracefully: when Redis is not connected, every operation is a
 * no-op (the route then computes fresh each time, exactly like the in-memory
 * default). Never throws into the request path.
 */

import { getRedisClient } from '../../../lib/redis'
import type { AnalyticsCache } from './cache'

const KEY_PREFIX = 'analytics:cache:'

export class RedisAnalyticsCache implements AnalyticsCache {
  private ready(): ReturnType<typeof getRedisClient> | null {
    try {
      const client = getRedisClient()
      return client && client.status === 'ready' ? client : null
    } catch {
      return null
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const client = this.ready()
    if (!client) return undefined
    try {
      const raw = await client.get(KEY_PREFIX + key)
      return raw ? (JSON.parse(raw) as T) : undefined
    } catch {
      return undefined
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const client = this.ready()
    if (!client) return
    try {
      await client.set(KEY_PREFIX + key, JSON.stringify(value), 'PX', Math.max(1, ttlMs))
    } catch {
      // best-effort
    }
  }

  async invalidate(prefix: string): Promise<void> {
    const client = this.ready()
    if (!client) return
    try {
      const pattern = `${KEY_PREFIX}${prefix}*`
      const stream = client.scanStream({ match: pattern, count: 100 })
      const keys: string[] = []
      for await (const batch of stream as AsyncIterable<string[]>) {
        keys.push(...batch)
      }
      if (keys.length > 0) await client.del(...keys)
    } catch {
      // best-effort
    }
  }
}
