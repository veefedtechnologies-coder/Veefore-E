/**
 * Unit tests for ContentMatcher — vision-aware, deterministic slot↔media match.
 */

import { describe, it, expect } from 'vitest'
import { pickForSlot, scoreMatch } from './ContentMatcher'

function item(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'x',
    mediaType: 'image' as const,
    available: true,
    mediaUrl: 'https://cdn/x.png',
    createdAt: new Date('2020-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('scoreMatch', () => {
  it('scores token overlap between theme and description', () => {
    expect(scoreMatch('sunset beach vibes', 'a calm beach at sunset')).toBeGreaterThan(0)
    expect(scoreMatch('gym workout', 'a plate of pasta')).toBe(0)
  })
})

describe('pickForSlot', () => {
  it('picks the best vision match, not the first item (R5.1)', () => {
    const pool = [
      item({ _id: 'pasta', visionAnalysis: { description: 'a plate of pasta on a table' } }),
      item({ _id: 'beach', visionAnalysis: { description: 'a sunny beach with waves at sunset' } }),
    ]
    const picked = pickForSlot('sunset beach day', 'photo', pool)
    expect(picked?._id).toBe('beach')
  })

  it('falls back to the oldest eligible item when no descriptions (R5.2)', () => {
    const pool = [
      item({ _id: 'new', createdAt: new Date('2022-01-01') }),
      item({ _id: 'old', createdAt: new Date('2019-01-01') }),
    ]
    const picked = pickForSlot('anything', 'photo', pool)
    expect(picked?._id).toBe('old')
  })

  it('filters by accepted media type for the format', () => {
    const pool = [
      item({ _id: 'img', mediaType: 'image' }),
      item({ _id: 'vid', mediaType: 'video' }),
    ]
    expect(pickForSlot('x', 'reel', pool)?._id).toBe('vid')
    expect(pickForSlot('x', 'photo', pool)?._id).toBe('img')
  })

  it('excludes already-claimed ids (R5.3)', () => {
    const pool = [item({ _id: 'a' }), item({ _id: 'b' })]
    const claimed = new Set(['a'])
    expect(pickForSlot('x', 'photo', pool, { claimedIds: claimed })?._id).toBe('b')
  })

  it('excludes unavailable / url-less items and returns null when none fit', () => {
    const pool = [
      item({ _id: 'gone', available: false }),
      item({ _id: 'nourl', mediaUrl: '' }),
      item({ _id: 'wrong', mediaType: 'video' }),
    ]
    expect(pickForSlot('x', 'photo', pool)).toBeNull()
  })
})
