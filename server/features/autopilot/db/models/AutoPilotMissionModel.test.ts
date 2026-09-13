/**
 * Unit tests for AutoPilotMissionModel schema validation.
 *
 * These exercise the Mongoose schema validators directly via `validateSync()`,
 * which runs min/max, enum, minlength/maxlength and required validators without
 * needing a database connection. They pin the bounds required by the spec:
 *   - goal.targetValue range 1..100,000,000            (Requirement 1.2)
 *   - niche length 1..100 chars                        (Requirement 1.1)
 *   - brandVoice length 1..2000 chars                  (Requirement 1.1)
 *   - guardrails.creditBudget range 1..1,000,000       (Requirement 14.6)
 *   - status / operatingMode / metric / source enums   (Requirement 1.3, 1.7)
 */

import { describe, it, expect } from 'vitest'
import {
  AutoPilotMissionModel,
  SUPPORTED_EXECUTION_PLATFORM,
  isInstagramPlatform,
} from './AutoPilotMissionModel'

/** A fully-valid mission document; individual tests override single fields. */
function validMission(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: 'ws_1',
    accountId: 'acct_1',
    platform: 'instagram',
    goal: {
      metric: 'followers',
      targetValue: 10_000,
      startValue: 0,
    },
    niche: 'fitness coaching',
    brandVoice: 'energetic and encouraging',
    operatingMode: 'copilot',
    contentSourcePreference: 'user-first',
    guardrails: {
      bannedTopics: [],
      postingFrequency: { count: 3, per: 'week', windowMs: 7 * 24 * 60 * 60 * 1000 },
      creditBudget: 5_000,
      approvalRequiredActions: [],
    },
    status: 'draft',
    ...overrides,
  }
}

/** Returns the set of error paths reported by validateSync(), or [] if valid. */
function errorPaths(doc: Record<string, unknown>): string[] {
  const err = new AutoPilotMissionModel(doc).validateSync()
  return err ? Object.keys(err.errors) : []
}

describe('AutoPilotMissionModel — baseline', () => {
  it('accepts a fully-valid mission', () => {
    expect(errorPaths(validMission())).toEqual([])
  })
})

describe('AutoPilotMissionModel — platform representability + Instagram-only execution (R18.6/R18.7)', () => {
  it('accepts a non-Instagram platform in the model (R18.6: representable for future extension)', () => {
    // The model must allow representing another platform even though v1 only
    // *executes* Instagram (the execution guard lives in the controller/loop).
    expect(errorPaths(validMission({ platform: 'facebook' }))).toEqual([])
  })

  it('defaults platform to instagram when omitted', () => {
    const doc = new AutoPilotMissionModel(validMission({ platform: undefined }))
    expect(doc.platform).toBe(SUPPORTED_EXECUTION_PLATFORM)
  })

  it('isInstagramPlatform recognises Instagram (case/whitespace-insensitive) and rejects other platforms', () => {
    expect(isInstagramPlatform('instagram')).toBe(true)
    expect(isInstagramPlatform('Instagram')).toBe(true)
    expect(isInstagramPlatform('  instagram  ')).toBe(true)
    // Missing/empty defaults to the supported platform (model default is instagram).
    expect(isInstagramPlatform(undefined)).toBe(true)
    expect(isInstagramPlatform('')).toBe(true)
    // Non-Instagram platforms are not autonomously executable in v1 (R18.7).
    expect(isInstagramPlatform('facebook')).toBe(false)
    expect(isInstagramPlatform('tiktok')).toBe(false)
    expect(isInstagramPlatform('youtube')).toBe(false)
  })
})

describe('AutoPilotMissionModel — goal.targetValue range (R1.2: 1..100,000,000)', () => {
  it('accepts the lower bound (1)', () => {
    expect(errorPaths(validMission({ goal: { metric: 'followers', targetValue: 1, startValue: 0 } }))).toEqual([])
  })

  it('accepts the upper bound (100,000,000)', () => {
    expect(
      errorPaths(validMission({ goal: { metric: 'followers', targetValue: 100_000_000, startValue: 0 } })),
    ).toEqual([])
  })

  it('rejects below the lower bound (0)', () => {
    expect(errorPaths(validMission({ goal: { metric: 'followers', targetValue: 0, startValue: 0 } }))).toContain(
      'goal.targetValue',
    )
  })

  it('rejects above the upper bound (100,000,001)', () => {
    expect(
      errorPaths(validMission({ goal: { metric: 'followers', targetValue: 100_000_001, startValue: 0 } })),
    ).toContain('goal.targetValue')
  })

  it('rejects a missing target value', () => {
    expect(errorPaths(validMission({ goal: { metric: 'followers', startValue: 0 } }))).toContain('goal.targetValue')
  })
})

describe('AutoPilotMissionModel — niche length (R1.1: 1..100 chars)', () => {
  it('accepts a single character', () => {
    expect(errorPaths(validMission({ niche: 'a' }))).toEqual([])
  })

  it('accepts exactly 100 characters', () => {
    expect(errorPaths(validMission({ niche: 'a'.repeat(100) }))).toEqual([])
  })

  it('rejects an empty niche', () => {
    expect(errorPaths(validMission({ niche: '' }))).toContain('niche')
  })

  it('rejects a niche longer than 100 characters', () => {
    expect(errorPaths(validMission({ niche: 'a'.repeat(101) }))).toContain('niche')
  })
})

describe('AutoPilotMissionModel — brandVoice length (R1.1: 1..2000 chars)', () => {
  it('accepts a single character', () => {
    expect(errorPaths(validMission({ brandVoice: 'x' }))).toEqual([])
  })

  it('accepts exactly 2000 characters', () => {
    expect(errorPaths(validMission({ brandVoice: 'x'.repeat(2000) }))).toEqual([])
  })

  it('rejects an empty brand voice', () => {
    expect(errorPaths(validMission({ brandVoice: '' }))).toContain('brandVoice')
  })

  it('rejects a brand voice longer than 2000 characters', () => {
    expect(errorPaths(validMission({ brandVoice: 'x'.repeat(2001) }))).toContain('brandVoice')
  })
})

describe('AutoPilotMissionModel — guardrails.creditBudget range (R14.6: 1..1,000,000)', () => {
  function withBudget(creditBudget: number) {
    return validMission({
      guardrails: {
        bannedTopics: [],
        postingFrequency: { count: 3, per: 'week', windowMs: 7 * 24 * 60 * 60 * 1000 },
        creditBudget,
        approvalRequiredActions: [],
      },
    })
  }

  it('accepts the lower bound (1)', () => {
    expect(errorPaths(withBudget(1))).toEqual([])
  })

  it('accepts the upper bound (1,000,000)', () => {
    expect(errorPaths(withBudget(1_000_000))).toEqual([])
  })

  it('rejects below the lower bound (0)', () => {
    expect(errorPaths(withBudget(0))).toContain('guardrails.creditBudget')
  })

  it('rejects above the upper bound (1,000,001)', () => {
    expect(errorPaths(withBudget(1_000_001))).toContain('guardrails.creditBudget')
  })
})

describe('AutoPilotMissionModel — status enum', () => {
  it.each(['draft', 'active', 'paused', 'completed', 'failed'])('accepts status %s', (status) => {
    expect(errorPaths(validMission({ status }))).toEqual([])
  })

  it('rejects an unknown status', () => {
    expect(errorPaths(validMission({ status: 'archived' }))).toContain('status')
  })
})

describe('AutoPilotMissionModel — other enums', () => {
  it.each(['followers', 'engagement', 'reach'])('accepts goal metric %s', (metric) => {
    expect(errorPaths(validMission({ goal: { metric, targetValue: 100, startValue: 0 } }))).toEqual([])
  })

  it('rejects an unknown goal metric', () => {
    expect(errorPaths(validMission({ goal: { metric: 'likes', targetValue: 100, startValue: 0 } }))).toContain(
      'goal.metric',
    )
  })

  it.each(['copilot', 'autopilot'])('accepts operating mode %s', (operatingMode) => {
    expect(errorPaths(validMission({ operatingMode }))).toEqual([])
  })

  it('rejects an unknown operating mode', () => {
    expect(errorPaths(validMission({ operatingMode: 'manual' }))).toContain('operatingMode')
  })

  it.each(['user-first', 'ai-first'])('accepts content source preference %s', (contentSourcePreference) => {
    expect(errorPaths(validMission({ contentSourcePreference }))).toEqual([])
  })

  it('rejects an unknown content source preference', () => {
    expect(errorPaths(validMission({ contentSourcePreference: 'random' }))).toContain('contentSourcePreference')
  })
})
