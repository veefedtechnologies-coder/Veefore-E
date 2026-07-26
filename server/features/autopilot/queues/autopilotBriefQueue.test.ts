/**
 * Tests for the autopilot-brief queue's null-safe degradation.
 *
 * Verifies the researchQueue-style contract: when `REDIS_URL` is absent the queue
 * is `null`, `isAutopilotBriefQueueAvailable()` is `false`, and scheduling a brief
 * delivery is an inline no-op that returns `false` (so the caller keeps the brief
 * pending and retries later) — all without opening a Redis connection.
 *
 * Satisfies Requirements: 7.3, 7.4, 7.5 (graceful degradation without Redis)
 */

import { describe, it, expect, afterEach, vi } from 'vitest'

const originalRedisUrl = process.env.REDIS_URL

afterEach(() => {
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = originalRedisUrl
  vi.resetModules()
})

describe('autopilot-brief queue — null-safe without Redis', () => {
  it('exposes a null queue and no-op scheduling when REDIS_URL is unset', async () => {
    delete process.env.REDIS_URL
    vi.resetModules()

    const mod = await import('./autopilotBriefQueue')

    expect(mod.autopilotBriefQueue).toBeNull()
    expect(mod.isAutopilotBriefQueueAvailable()).toBe(false)

    const scheduled = await mod.AutopilotBriefQueueManager.scheduleBriefDelivery({
      briefId: 'brief-1',
      missionId: 'mission-1',
      workspaceId: 'ws-1',
      slotId: 'slot-1',
      sendAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      leadTimeMs: 10 * 60 * 60 * 1000,
      target: { userId: 'user-1' },
    })

    expect(scheduled).toBe(false)
  })
})
