/**
 * Tests for the autopilot-loop repeatable queue.
 *
 * Two concerns:
 *   1. Null-safe degradation (researchQueue-style contract): when `REDIS_URL` is
 *      absent the queue is `null`, `isAutopilotLoopQueueAvailable()` is `false`,
 *      and scheduling/removing a mission loop is an inline no-op returning
 *      `false` — all without opening a Redis connection.
 *   2. Scheduling / removal semantics against an in-memory fake queue: a
 *      repeatable job per mission at a ≤60-min cadence (R3.2), de-duplicated by a
 *      stable jobId, and removed by that jobId on pause/stop (R3.5/R3.6).
 *
 * Satisfies Requirements: 3.2, 3.5, 3.6
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  clampLoopCadenceMs,
  loopJobId,
  scheduleMissionOn,
  removeMissionOn,
  MAX_LOOP_CADENCE_MS,
  MIN_LOOP_CADENCE_MS,
  DEFAULT_LOOP_CADENCE_MS,
  type LoopQueueLike,
  type AutopilotLoopJobData,
} from './autopilotLoopQueue'

const originalRedisUrl = process.env.REDIS_URL

afterEach(() => {
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = originalRedisUrl
  vi.resetModules()
})

// ── An in-memory fake modelling BullMQ's repeatable-job semantics ────────────
interface AddedRepeat {
  key: string
  id: string
  name: string
  every: number
  data: AutopilotLoopJobData
}

function makeFakeQueue() {
  const repeats = new Map<string, AddedRepeat>()
  const queue: LoopQueueLike & { repeats: Map<string, AddedRepeat> } = {
    repeats,
    async add(name, data, opts) {
      const jobId = String(opts.jobId)
      const every = (opts.repeat as { every: number }).every
      // BullMQ keys a repeatable by (name, jobId, every); same key de-duplicates.
      const key = `${name}:${jobId}:${every}`
      repeats.set(key, { key, id: jobId, name, every, data })
      return { id: jobId }
    },
    async getRepeatableJobs() {
      return [...repeats.values()].map((r) => ({ key: r.key, id: r.id, name: r.name }))
    },
    async removeRepeatableByKey(key: string) {
      repeats.delete(key)
    },
  }
  return queue
}

describe('autopilot-loop cadence clamping (R3.2)', () => {
  it('never exceeds the 60-minute ceiling', () => {
    expect(clampLoopCadenceMs(2 * 60 * 60 * 1000)).toBe(MAX_LOOP_CADENCE_MS)
    expect(MAX_LOOP_CADENCE_MS).toBe(60 * 60 * 1000)
  })

  it('floors a too-small cadence and defaults an absent one', () => {
    expect(clampLoopCadenceMs(1)).toBe(MIN_LOOP_CADENCE_MS)
    expect(clampLoopCadenceMs(undefined)).toBe(DEFAULT_LOOP_CADENCE_MS)
    expect(clampLoopCadenceMs(NaN)).toBe(DEFAULT_LOOP_CADENCE_MS)
  })

  it('passes through an in-range cadence unchanged', () => {
    expect(clampLoopCadenceMs(10 * 60 * 1000)).toBe(10 * 60 * 1000)
  })
})

describe('autopilot-loop scheduling / removal semantics', () => {
  it('registers one repeatable job per mission within the 60-min cadence (R3.2)', async () => {
    const queue = makeFakeQueue()
    const ok = await scheduleMissionOn(queue, { missionId: 'm1', workspaceId: 'ws1' })

    expect(ok).toBe(true)
    const jobs = await queue.getRepeatableJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0].id).toBe(loopJobId('m1'))
    const added = [...queue.repeats.values()][0]
    expect(added.every).toBeLessThanOrEqual(MAX_LOOP_CADENCE_MS)
    expect(added.data).toEqual({ missionId: 'm1', workspaceId: 'ws1' })
  })

  it('clamps an over-long requested cadence to ≤60 min (R3.2)', async () => {
    const queue = makeFakeQueue()
    await scheduleMissionOn(queue, { missionId: 'm1', workspaceId: 'ws1', cadenceMs: 6 * 60 * 60 * 1000 })
    const added = [...queue.repeats.values()][0]
    expect(added.every).toBe(MAX_LOOP_CADENCE_MS)
  })

  it('de-duplicates re-scheduling the same mission (stable jobId)', async () => {
    const queue = makeFakeQueue()
    await scheduleMissionOn(queue, { missionId: 'm1', workspaceId: 'ws1', cadenceMs: 10 * 60 * 1000 })
    await scheduleMissionOn(queue, { missionId: 'm1', workspaceId: 'ws1', cadenceMs: 10 * 60 * 1000 })
    expect(await queue.getRepeatableJobs()).toHaveLength(1)
  })

  it('schedules a separate repeatable job per mission', async () => {
    const queue = makeFakeQueue()
    await scheduleMissionOn(queue, { missionId: 'm1', workspaceId: 'ws1' })
    await scheduleMissionOn(queue, { missionId: 'm2', workspaceId: 'ws1' })
    expect(await queue.getRepeatableJobs()).toHaveLength(2)
  })

  it('removes the repeatable job on pause/stop (R3.5/R3.6)', async () => {
    const queue = makeFakeQueue()
    await scheduleMissionOn(queue, { missionId: 'm1', workspaceId: 'ws1' })
    await scheduleMissionOn(queue, { missionId: 'm2', workspaceId: 'ws1' })

    const removed = await removeMissionOn(queue, 'm1')
    expect(removed).toBe(true)

    const jobs = await queue.getRepeatableJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0].id).toBe(loopJobId('m2'))
  })

  it('removing a mission with no scheduled job is a no-op returning false', async () => {
    const queue = makeFakeQueue()
    expect(await removeMissionOn(queue, 'missing')).toBe(false)
  })

  it('returns false when the queue enqueue throws', async () => {
    const queue = makeFakeQueue()
    queue.add = vi.fn().mockRejectedValue(new Error('redis down'))
    expect(await scheduleMissionOn(queue, { missionId: 'm1', workspaceId: 'ws1' })).toBe(false)
  })
})

describe('autopilot-loop queue — null-safe without Redis', () => {
  it('exposes a null queue and no-op schedule/remove when REDIS_URL is unset', async () => {
    delete process.env.REDIS_URL
    vi.resetModules()

    const mod = await import('./autopilotLoopQueue')

    expect(mod.autopilotLoopQueue).toBeNull()
    expect(mod.isAutopilotLoopQueueAvailable()).toBe(false)

    const scheduled = await mod.AutopilotLoopQueueManager.scheduleMission({
      missionId: 'm1',
      workspaceId: 'ws1',
    })
    expect(scheduled).toBe(false)

    const removed = await mod.AutopilotLoopQueueManager.removeMission('m1')
    expect(removed).toBe(false)
  })
})
