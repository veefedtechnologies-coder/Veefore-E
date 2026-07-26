/**
 * Tests for the autopilot-brief worker's job processor (pure, injected deps).
 *
 * Exercises the send-once + bounded-reminder behaviour without Redis, Mongo, or a
 * real notification transport: an in-memory brief store + a recording dispatcher.
 * Reinforces Property 12 at the worker layer — the persisted reminder counter can
 * never be pushed past 3, even by duplicate/retried reminder jobs (R7.5).
 *
 * Satisfies Requirements: 7.3, 7.4, 7.5 (Property 12)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createBriefJobProcessor,
  type BriefJobView,
  type BriefWorkerStore,
} from './autopilotBriefWorker'
import { MAX_REMINDERS } from '../queues/briefSchedule'
import type { AutopilotBriefJobData, BriefDeliveryTarget } from '../queues/autopilotBriefQueue'
import type { ContentBriefStatus } from '../db/models'

const TARGET: BriefDeliveryTarget = { userId: 'user-1', sessionContext: 'web', email: 'u@example.com' }

/** A mutable in-memory brief backing the store port. */
interface FakeBrief extends BriefJobView {
  status: ContentBriefStatus
  remindersSent: number
}

function makeStore(initial: FakeBrief | null) {
  const brief = initial ? { ...initial } : null
  const store: BriefWorkerStore = {
    async load(_briefId) {
      return brief ? { ...brief } : null
    },
    async markSent(_briefId) {
      if (brief && brief.status === 'pending') brief.status = 'sent'
    },
    async incrementReminderIfUndelivered(_briefId) {
      if (!brief) return null
      const undelivered = brief.status === 'pending' || brief.status === 'sent'
      if (!undelivered || brief.remindersSent >= MAX_REMINDERS) return null
      brief.remindersSent += 1
      return brief.remindersSent
    },
  }
  return { store, get: () => brief }
}

function makeDispatcher(undelivered = false) {
  const calls: any[] = []
  return {
    calls,
    dispatch: async (n: any) => {
      calls.push(n)
      return { delivered: undelivered ? [] : (['in-app'] as any), undelivered }
    },
  }
}

function job(kind: 'send' | 'reminder', overrides: Partial<AutopilotBriefJobData> = {}): AutopilotBriefJobData {
  return {
    kind,
    briefId: 'brief-1',
    missionId: 'mission-1',
    workspaceId: 'ws-1',
    slotId: 'slot-1',
    target: TARGET,
    ...overrides,
  }
}

const baseBrief: FakeBrief = {
  status: 'pending',
  remindersSent: 0,
  workspaceId: 'ws-1',
  slotId: 'slot-1',
  concept: 'Behind the scenes',
}

describe('autopilot-brief processor — send (R7.3/R7.4)', () => {
  let dispatcher: ReturnType<typeof makeDispatcher>
  beforeEach(() => {
    dispatcher = makeDispatcher()
  })

  it('delivers the brief and marks it sent', async () => {
    const { store, get } = makeStore({ ...baseBrief })
    const process = createBriefJobProcessor({ store, dispatcher })

    const result = await process(job('send'))

    expect(result).toEqual({ action: 'sent', delivered: true })
    expect(dispatcher.calls).toHaveLength(1)
    expect(dispatcher.calls[0]).toMatchObject({ userId: 'user-1', workspaceId: 'ws-1' })
    expect(get()?.status).toBe('sent')
  })

  it('is idempotent — a second send is skipped once already sent', async () => {
    const { store } = makeStore({ ...baseBrief, status: 'sent' })
    const process = createBriefJobProcessor({ store, dispatcher })

    const result = await process(job('send'))

    expect(result).toEqual({ action: 'skipped', reason: 'already-sent' })
    expect(dispatcher.calls).toHaveLength(0)
  })

  it('skips a missing brief without throwing', async () => {
    const { store } = makeStore(null)
    const process = createBriefJobProcessor({ store, dispatcher })

    expect(await process(job('send'))).toEqual({ action: 'skipped', reason: 'not-found' })
  })

  it('still transitions state when there is no notification target', async () => {
    const { store, get } = makeStore({ ...baseBrief })
    const process = createBriefJobProcessor({ store, dispatcher })

    const result = await process(job('send', { target: undefined }))

    expect(result).toEqual({ action: 'sent', delivered: false })
    expect(dispatcher.calls).toHaveLength(0)
    expect(get()?.status).toBe('sent')
  })
})

describe('autopilot-brief processor — reminders (R7.5 · Property 12)', () => {
  it('sends an escalating reminder and increments the counter', async () => {
    const { store, get } = makeStore({ ...baseBrief, status: 'sent' })
    const dispatcher = makeDispatcher()
    const process = createBriefJobProcessor({ store, dispatcher })

    const result = await process(job('reminder', { reminderIndex: 1, fraction: 0.5 }))

    expect(result).toEqual({ action: 'reminded', reminderCount: 1, delivered: true })
    expect(get()?.remindersSent).toBe(1)
    expect(dispatcher.calls[0].title).toContain('1/3')
  })

  it('never exceeds 3 reminders even if extra reminder jobs run', async () => {
    const { store, get } = makeStore({ ...baseBrief, status: 'sent' })
    const dispatcher = makeDispatcher()
    const process = createBriefJobProcessor({ store, dispatcher })

    const results = []
    for (let i = 0; i < 6; i++) {
      results.push(await process(job('reminder', { reminderIndex: i + 1 })))
    }

    const reminded = results.filter((r) => r.action === 'reminded')
    const skipped = results.filter((r) => r.action === 'skipped')
    expect(reminded).toHaveLength(MAX_REMINDERS)
    expect(skipped).toHaveLength(3)
    expect(get()?.remindersSent).toBe(MAX_REMINDERS)
    // Only 3 notifications ever dispatched (R7.5).
    expect(dispatcher.calls).toHaveLength(MAX_REMINDERS)
  })

  it('does not remind once the brief has been delivered', async () => {
    const { store, get } = makeStore({ ...baseBrief, status: 'delivered' })
    const dispatcher = makeDispatcher()
    const process = createBriefJobProcessor({ store, dispatcher })

    const result = await process(job('reminder'))

    expect(result).toEqual({ action: 'skipped', reason: 'capped-or-delivered' })
    expect(get()?.remindersSent).toBe(0)
    expect(dispatcher.calls).toHaveLength(0)
  })
})
