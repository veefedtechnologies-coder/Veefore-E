/**
 * @vitest-environment happy-dom
 */

/**
 * Unit tests for TierStatusIndicator pure helper functions.
 *
 * Tests formatOperationName(), formatMinutesEstimate(), getDeferredOperationMessage(),
 * and getCriticalTierMessage() without React rendering context.
 *
 * Validates:
 * - Tier indicator updates produce correct messages (Requirement 8.5, 8.6, 8.7)
 * - Error/deferred messages never contain raw error codes (Requirement 8.5, 8.8)
 * - Onboarding-adjacent low-ceiling messaging is plain language (Requirement 9.1, 9.4)
 */

import { describe, it, expect, vi } from 'vitest'

// Mock dependencies that access browser APIs at module load time
vi.mock('@/lib/queryClient', () => ({
  queryClient: { getQueryData: vi.fn(), setQueryData: vi.fn() },
}))
vi.mock('@/components/WorkspaceSwitcher', () => ({
  useCurrentWorkspace: () => ({ currentWorkspace: { id: 'test' } }),
}))
vi.mock('@/hooks/useTierStatusListener', () => ({
  useTierStatusListener: () => ({
    getAccountStatus: () => null,
    accountStatuses: new Map(),
    isConnected: true,
    lastTierChange: null,
    lastSyncComplete: null,
    lastDeferredOperation: null,
  }),
  TIER_STATUS_EVENTS: {
    TIER_CHANGE: 'tier-status:tier-change',
    SYNC_COMPLETE: 'tier-status:sync-complete',
    DEFERRED_OPERATION: 'tier-status:deferred-operation',
  },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  })),
}))

import {
  formatOperationName,
  formatMinutesEstimate,
  getDeferredOperationMessage,
  getCriticalTierMessage,
} from '../TierStatusIndicator'

describe('formatOperationName', () => {
  it('maps ANALYTICS_REFRESH to "Analytics"', () => {
    expect(formatOperationName('ANALYTICS_REFRESH')).toBe('Analytics')
  })

  it('maps BACKFILL to "Historical data sync"', () => {
    expect(formatOperationName('BACKFILL')).toBe('Historical data sync')
  })

  it('maps POLLING to "Data refresh"', () => {
    expect(formatOperationName('POLLING')).toBe('Data refresh')
  })

  it('maps AUTOMATION_REPLY to "Automated replies"', () => {
    expect(formatOperationName('AUTOMATION_REPLY')).toBe('Automated replies')
  })

  it('maps SCHEDULED_POST to "Scheduled post"', () => {
    expect(formatOperationName('SCHEDULED_POST')).toBe('Scheduled post')
  })

  it('maps USER_INITIATED to "Your request"', () => {
    expect(formatOperationName('USER_INITIATED')).toBe('Your request')
  })

  it('maps ACTIVE_VIEW to "Live view refresh"', () => {
    expect(formatOperationName('ACTIVE_VIEW')).toBe('Live view refresh')
  })

  it('defaults to "Data refresh" for unknown operation names', () => {
    expect(formatOperationName('UNKNOWN_OP')).toBe('Data refresh')
    expect(formatOperationName('')).toBe('Data refresh')
  })

  it('never exposes raw technical identifiers to the user', () => {
    const operations = [
      'ANALYTICS_REFRESH',
      'BACKFILL',
      'POLLING',
      'AUTOMATION_REPLY',
      'SCHEDULED_POST',
      'USER_INITIATED',
      'ACTIVE_VIEW',
    ]

    for (const op of operations) {
      const result = formatOperationName(op)
      // Should not contain underscores or ALL_CAPS patterns
      expect(result).not.toMatch(/_/)
      expect(result).not.toMatch(/^[A-Z]{2,}/)
    }
  })
})

describe('formatMinutesEstimate', () => {
  it('returns "a few moments" for zero or negative minutes', () => {
    expect(formatMinutesEstimate(0)).toBe('a few moments')
    expect(formatMinutesEstimate(-5)).toBe('a few moments')
  })

  it('returns "1 minute" for values under 2 minutes', () => {
    expect(formatMinutesEstimate(1)).toBe('1 minute')
    expect(formatMinutesEstimate(1.5)).toBe('1 minute')
  })

  it('returns "N minutes" for values between 2 and 59', () => {
    expect(formatMinutesEstimate(5)).toBe('5 minutes')
    expect(formatMinutesEstimate(20)).toBe('20 minutes')
    expect(formatMinutesEstimate(45)).toBe('45 minutes')
  })

  it('returns "an hour" for approximately 60 minutes', () => {
    expect(formatMinutesEstimate(60)).toBe('an hour')
  })

  it('returns "N hours" for values above 60 minutes', () => {
    expect(formatMinutesEstimate(120)).toBe('2 hours')
    expect(formatMinutesEstimate(180)).toBe('3 hours')
  })

  it('rounds to the nearest hour for large values', () => {
    expect(formatMinutesEstimate(90)).toBe('2 hours') // 90/60 = 1.5 → rounds to 2
    expect(formatMinutesEstimate(150)).toBe('3 hours') // 150/60 = 2.5 → rounds to 3
  })

  it('uses plain language without technical terms', () => {
    const values = [0, 1, 5, 30, 60, 120, 240]
    for (const val of values) {
      const result = formatMinutesEstimate(val)
      expect(result).not.toMatch(/ms|millisecond|sec/)
      expect(result).not.toMatch(/\d{5,}/) // No large raw numbers
    }
  })
})

describe('getDeferredOperationMessage', () => {
  it('returns null when operation is null', () => {
    expect(getDeferredOperationMessage('test_account', null, 20)).toBeNull()
  })

  it('returns null when estimatedMinutes is null', () => {
    expect(getDeferredOperationMessage('test_account', 'ANALYTICS_REFRESH', null)).toBeNull()
  })

  it('returns null when estimatedMinutes is 0 or negative', () => {
    expect(getDeferredOperationMessage('test_account', 'ANALYTICS_REFRESH', 0)).toBeNull()
    expect(getDeferredOperationMessage('test_account', 'ANALYTICS_REFRESH', -1)).toBeNull()
  })

  it('generates a plain-language message with account name and time estimate', () => {
    const result = getDeferredOperationMessage('My Brand', 'ANALYTICS_REFRESH', 20)
    expect(result).toBe('Analytics for My Brand will refresh again in about 20 minutes')
  })

  it('uses formatted operation name, not raw identifier', () => {
    const result = getDeferredOperationMessage('Store', 'BACKFILL', 45)
    expect(result).toContain('Historical data sync')
    expect(result).not.toContain('BACKFILL')
  })

  it('formats large minute values as hours', () => {
    const result = getDeferredOperationMessage('Acme', 'POLLING', 120)
    expect(result).toContain('2 hours')
  })

  it('never contains raw error codes, HTTP status codes, or Meta error strings', () => {
    const operations = ['ANALYTICS_REFRESH', 'BACKFILL', 'POLLING', 'AUTOMATION_REPLY']
    for (const op of operations) {
      const result = getDeferredOperationMessage('TestAccount', op, 30)!
      // No numeric error codes like 80002 or 429
      expect(result).not.toMatch(/80002/)
      expect(result).not.toMatch(/429/)
      expect(result).not.toMatch(/HTTP/)
      expect(result).not.toMatch(/error/i)
      expect(result).not.toMatch(/rate.limit/i)
    }
  })
})

describe('getCriticalTierMessage', () => {
  it('provides a message with estimated wait time when minutes > 0', () => {
    const result = getCriticalTierMessage('My Brand', 30)
    expect(result).toContain('My Brand')
    expect(result).toContain('30 minutes')
    expect(result).toContain('temporarily paused')
  })

  it('provides a shorter message when estimatedMinutes is 0', () => {
    const result = getCriticalTierMessage('My Brand', 0)
    expect(result).toContain('My Brand')
    expect(result).toContain('resume shortly')
    expect(result).not.toContain('minutes')
  })

  it('uses hours format for large estimates', () => {
    const result = getCriticalTierMessage('AccountX', 120)
    expect(result).toContain('2 hours')
  })

  it('never contains raw error codes or technical jargon', () => {
    const minutes = [0, 5, 30, 60, 120]
    for (const m of minutes) {
      const result = getCriticalTierMessage('TestAccount', m)
      expect(result).not.toMatch(/80002/)
      expect(result).not.toMatch(/429/)
      expect(result).not.toMatch(/HTTP/)
      expect(result).not.toMatch(/BUC/)
      expect(result).not.toMatch(/rate.limit/i)
      expect(result).not.toMatch(/API/i)
      expect(result).not.toMatch(/throttl/i)
    }
  })

  it('uses non-technical language appropriate for end users', () => {
    const result = getCriticalTierMessage('My Account', 15)
    // Should mention protection/pausing, not rate limiting
    expect(result).toMatch(/paused|protect/)
    expect(result).toMatch(/resume/)
  })
})
