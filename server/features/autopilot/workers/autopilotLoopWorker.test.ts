/**
 * Tests for the autopilot-loop worker processor + lazy worker init.
 *
 * Verifies:
 *   • each tick invokes `AutoPilotOrchestrator.runIteration(missionId)` and, when
 *     the iteration actually ran, stamps `lastIterationAt` (R3.2);
 *   • a skipped iteration (locked / not-runnable) leaves the timestamp untouched;
 *   • a `markIteration` write failure never fails the tick;
 *   • the lazy worker is null-safe without Redis.
 *
 * Satisfies Requirements: 3.2
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  createLoopJobProcessor,
  getAutopilotLoopWorker,
  type LoopOrchestrator,
} from './autopilotLoopWorker'
import type { IterationResult } from '../services/AutoPilotOrchestrator'

const originalRedisUrl = process.env.REDIS_URL

afterEach(() => {
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = originalRedisUrl
})

function iteration(overrides: Partial<IterationResult> = {}): IterationResult {
  return {
    stagesRun: ['SENSE', 'THINK', 'PLAN', 'MEASURE', 'LEARN'],
    actionsExecuted: 0,
    approvalsRaised: 0,
    escalations: 0,
    completed: true,
    ...overrides,
  }
}

function makeOrchestrator(result: IterationResult) {
  const runIteration = vi.fn<Parameters<LoopOrchestrator['runIteration']>, Promise<IterationResult>>(
    async () => result,
  )
  return { orchestrator: { runIteration } as LoopOrchestrator, runIteration }
}

describe('autopilot-loop worker processor', () => {
  it('runs one iteration for the mission and stamps lastIterationAt (R3.2)', async () => {
    const { orchestrator, runIteration } = makeOrchestrator(iteration())
    const markIteration = vi.fn().mockResolvedValue(null)
    const now = () => 1_700_000_000_000

    const process = createLoopJobProcessor({
      orchestrator,
      missionStore: { markIteration },
      now,
    })

    const result = await process({ missionId: 'm1', workspaceId: 'ws1' })

    expect(runIteration).toHaveBeenCalledWith('m1', now())
    expect(markIteration).toHaveBeenCalledWith('m1', new Date(now()))
    expect(result.marked).toBe(true)
    expect(result.iteration.completed).toBe(true)
  })

  it('does not stamp lastIterationAt when the iteration was skipped', async () => {
    const { orchestrator } = makeOrchestrator(iteration({ stagesRun: [], completed: false, skipped: 'locked' }))
    const markIteration = vi.fn().mockResolvedValue(null)

    const process = createLoopJobProcessor({ orchestrator, missionStore: { markIteration } })
    const result = await process({ missionId: 'm1', workspaceId: 'ws1' })

    expect(markIteration).not.toHaveBeenCalled()
    expect(result.marked).toBe(false)
  })

  it('never fails the tick when stamping lastIterationAt throws', async () => {
    const { orchestrator } = makeOrchestrator(iteration())
    const markIteration = vi.fn().mockRejectedValue(new Error('mongo down'))

    const process = createLoopJobProcessor({ orchestrator, missionStore: { markIteration } })
    const result = await process({ missionId: 'm1', workspaceId: 'ws1' })

    expect(result.marked).toBe(false)
    expect(result.iteration.completed).toBe(true)
  })
})

describe('autopilot-loop worker — null-safe without Redis', () => {
  it('returns null from getAutopilotLoopWorker when REDIS_URL is unset', () => {
    delete process.env.REDIS_URL
    // The worker reads REDIS_URL at call time, so it degrades to null without a
    // Redis connection (mirrors the sibling autopilot workers).
    expect(getAutopilotLoopWorker()).toBeNull()
  })
})
