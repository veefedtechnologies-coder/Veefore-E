/**
 * Unit tests for the Mission setup form model + validation (Task 19.3).
 *
 * Covers the mission-model bounds (R1.2, R1.3), the future target-date rule
 * (R1.4), banned-topic parsing, and payload construction.
 */

import { describe, it, expect } from 'vitest'
import {
  MISSION_BOUNDS,
  buildCreateMissionPayload,
  defaultMissionFormValues,
  isMissionFormValid,
  parseBannedTopics,
  validateMissionForm,
  type MissionFormValues,
} from './missionForm'

const NOW = new Date('2025-01-15T12:00:00Z')

/** A fully valid set of values used as a baseline for targeted invalidations. */
const validValues: MissionFormValues = {
  ...defaultMissionFormValues,
  goalMetric: 'followers',
  targetValue: '10000',
  targetDate: '2025-06-01',
  niche: 'vegan meal prep',
  brandVoice: 'Warm, upbeat, practical.',
  localLanguage: '',
  operatingMode: 'copilot',
  contentSourcePreference: 'user-first',
  bannedTopics: 'politics, crypto',
  postingCount: '3',
  postingPer: 'week',
  creditBudget: '1000',
}

describe('validateMissionForm', () => {
  it('accepts a fully valid form', () => {
    const errors = validateMissionForm(validValues, NOW)
    expect(isMissionFormValid(errors)).toBe(true)
  })

  describe('goal target value (R1.2, R1.3)', () => {
    it('rejects an empty target value', () => {
      const errors = validateMissionForm({ ...validValues, targetValue: '' }, NOW)
      expect(errors.targetValue).toBeTruthy()
    })

    it('rejects a non-numeric target value', () => {
      const errors = validateMissionForm({ ...validValues, targetValue: 'abc' }, NOW)
      expect(errors.targetValue).toBeTruthy()
    })

    it('rejects a target value below the minimum', () => {
      const errors = validateMissionForm(
        { ...validValues, targetValue: String(MISSION_BOUNDS.targetValue.min - 1) },
        NOW,
      )
      expect(errors.targetValue).toBeTruthy()
    })

    it('rejects a target value above the maximum', () => {
      const errors = validateMissionForm(
        { ...validValues, targetValue: String(MISSION_BOUNDS.targetValue.max + 1) },
        NOW,
      )
      expect(errors.targetValue).toBeTruthy()
    })

    it('accepts the boundary values', () => {
      const min = validateMissionForm(
        { ...validValues, targetValue: String(MISSION_BOUNDS.targetValue.min) },
        NOW,
      )
      const max = validateMissionForm(
        { ...validValues, targetValue: String(MISSION_BOUNDS.targetValue.max) },
        NOW,
      )
      expect(min.targetValue).toBeUndefined()
      expect(max.targetValue).toBeUndefined()
    })
  })

  describe('target date (R1.4)', () => {
    it('accepts an empty (optional) target date', () => {
      const errors = validateMissionForm({ ...validValues, targetDate: '' }, NOW)
      expect(errors.targetDate).toBeUndefined()
    })

    it('rejects a past target date', () => {
      const errors = validateMissionForm({ ...validValues, targetDate: '2024-01-01' }, NOW)
      expect(errors.targetDate).toBeTruthy()
    })

    it('rejects an invalid date string', () => {
      const errors = validateMissionForm({ ...validValues, targetDate: 'not-a-date' }, NOW)
      expect(errors.targetDate).toBeTruthy()
    })

    it('accepts a future target date', () => {
      const errors = validateMissionForm({ ...validValues, targetDate: '2030-01-01' }, NOW)
      expect(errors.targetDate).toBeUndefined()
    })
  })

  describe('niche + brand voice length bounds (R1.1)', () => {
    it('rejects an empty niche', () => {
      const errors = validateMissionForm({ ...validValues, niche: '   ' }, NOW)
      expect(errors.niche).toBeTruthy()
    })

    it('rejects a niche over the max length', () => {
      const errors = validateMissionForm(
        { ...validValues, niche: 'x'.repeat(MISSION_BOUNDS.niche.max + 1) },
        NOW,
      )
      expect(errors.niche).toBeTruthy()
    })

    it('rejects an empty brand voice', () => {
      const errors = validateMissionForm({ ...validValues, brandVoice: '' }, NOW)
      expect(errors.brandVoice).toBeTruthy()
    })

    it('rejects a brand voice over the max length', () => {
      const errors = validateMissionForm(
        { ...validValues, brandVoice: 'x'.repeat(MISSION_BOUNDS.brandVoice.max + 1) },
        NOW,
      )
      expect(errors.brandVoice).toBeTruthy()
    })
  })

  describe('credit budget bound (R14.6)', () => {
    it('rejects a budget below the minimum', () => {
      const errors = validateMissionForm({ ...validValues, creditBudget: '0' }, NOW)
      expect(errors.creditBudget).toBeTruthy()
    })

    it('rejects a budget above the maximum', () => {
      const errors = validateMissionForm(
        { ...validValues, creditBudget: String(MISSION_BOUNDS.creditBudget.max + 1) },
        NOW,
      )
      expect(errors.creditBudget).toBeTruthy()
    })
  })

  it('reports multiple field errors at once', () => {
    const errors = validateMissionForm(
      { ...validValues, targetValue: '', niche: '', creditBudget: '999999999' },
      NOW,
    )
    expect(errors.targetValue).toBeTruthy()
    expect(errors.niche).toBeTruthy()
    expect(errors.creditBudget).toBeTruthy()
  })
})

describe('parseBannedTopics', () => {
  it('splits on commas and newlines, trims, and de-duplicates', () => {
    expect(parseBannedTopics('politics, crypto\n politics , NFTs')).toEqual([
      'politics',
      'crypto',
      'NFTs',
    ])
  })

  it('returns an empty array for blank input', () => {
    expect(parseBannedTopics('   ')).toEqual([])
  })
})

describe('buildCreateMissionPayload', () => {
  it('maps validated values into the API payload', () => {
    const payload = buildCreateMissionPayload(validValues, {
      workspaceId: 'ws1',
      accountId: 'acc1',
    })

    expect(payload).toMatchObject({
      workspaceId: 'ws1',
      accountId: 'acc1',
      platform: 'instagram',
      goal: { metric: 'followers', targetValue: 10000, targetDate: '2025-06-01' },
      niche: 'vegan meal prep',
      operatingMode: 'copilot',
      contentSourcePreference: 'user-first',
    })
    expect(payload.guardrails.bannedTopics).toEqual(['politics', 'crypto'])
    expect(payload.guardrails.creditBudget).toBe(1000)
    expect(payload.guardrails.postingFrequency).toEqual({
      count: 3,
      per: 'week',
      windowMs: 7 * 24 * 60 * 60 * 1000,
    })
  })

  it('omits an empty target date and leaves autopilot fully autonomous (no approval-gated actions)', () => {
    const payload = buildCreateMissionPayload(
      { ...validValues, targetDate: '', operatingMode: 'autopilot' },
      { workspaceId: 'ws1', accountId: 'acc1' },
    )
    expect(payload.goal.targetDate).toBeUndefined()
    // Autopilot is autonomous — nothing gated behind approval by default.
    expect(payload.guardrails.approvalRequiredActions).toEqual([])
  })
})
