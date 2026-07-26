/**
 * Unit tests for per-post age-bucket insight due-selection
 * (smart-polling-system Req 4.1–4.6) in `filterMediaForInsights`.
 *
 * A post is "due" for an insights refresh when the time since its last fetch is
 * >= the age-bucket interval for its OWN age, scaled by ceiling. New posts
 * (never fetched) are always due. This replaces the old flat 72h window that
 * never refreshed posts older than 3 days.
 */

import { describe, it, expect } from 'vitest';
import { filterMediaForInsights } from '../SocialAccountService';
import { CeilingClassification } from '../UsageStore';
import { rateLimitConfig } from '../../config/rateLimitConfig';
import type { InstagramMediaItem } from '../instagramApi';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2025-06-01T00:00:00Z');

function media(id: string, ageMs: number): InstagramMediaItem {
  return {
    id,
    media_type: 'IMAGE',
    timestamp: new Date(NOW - ageMs).toISOString(),
  } as InstagramMediaItem;
}

describe('filterMediaForInsights — per-post age buckets (Req 4.1–4.6)', () => {
  it('backfill returns every item regardless of age/last-fetch', () => {
    const items = [media('a', 100 * DAY), media('b', 1 * HOUR)];
    const result = filterMediaForInsights(items, true, CeilingClassification.LOW, rateLimitConfig, new Map(), NOW);
    expect(result).toHaveLength(2);
  });

  it('a never-fetched post is always due (regardless of age)', () => {
    const items = [media('old', 48 * DAY), media('fresh', 1 * HOUR)];
    const result = filterMediaForInsights(
      items, false, CeilingClassification.HIGH, rateLimitConfig, new Map(), NOW // empty = never fetched
    );
    expect(result.map(m => m.id).sort()).toEqual(['fresh', 'old']);
  });

  it('a 48-day-old post (>30d bucket) is NOT due until ~weekly has elapsed (HIGH)', () => {
    // >30d bucket base = 7d, HIGH factor 1.0 → interval 7d.
    const item = media('old', 48 * DAY);
    // Fetched 2 days ago → not due yet.
    const recent = new Map([['old', NOW - 2 * DAY]]);
    expect(filterMediaForInsights([item], false, CeilingClassification.HIGH, rateLimitConfig, recent, NOW)).toHaveLength(0);
    // Fetched 8 days ago → due.
    const stale = new Map([['old', NOW - 8 * DAY]]);
    expect(filterMediaForInsights([item], false, CeilingClassification.HIGH, rateLimitConfig, stale, NOW)).toHaveLength(1);
  });

  it('a fresh post (0–48h bucket) is due hourly (HIGH) but not within the hour', () => {
    // 0–48h bucket base = 1h, HIGH factor 1.0 → interval 1h.
    const item = media('fresh', 3 * HOUR);
    const justFetched = new Map([['fresh', NOW - 30 * 60 * 1000]]); // 30m ago → not due
    expect(filterMediaForInsights([item], false, CeilingClassification.HIGH, rateLimitConfig, justFetched, NOW)).toHaveLength(0);
    const overdue = new Map([['fresh', NOW - 90 * 60 * 1000]]); // 90m ago → due
    expect(filterMediaForInsights([item], false, CeilingClassification.HIGH, rateLimitConfig, overdue, NOW)).toHaveLength(1);
  });

  it('LOW ceiling doubles the interval vs HIGH for the same post', () => {
    // 0–48h bucket base = 1h; HIGH→1h, LOW→2h.
    const item = media('fresh', 3 * HOUR);
    const fetched90mAgo = new Map([['fresh', NOW - 90 * 60 * 1000]]);
    // HIGH: 90m >= 1h → due.
    expect(filterMediaForInsights([item], false, CeilingClassification.HIGH, rateLimitConfig, fetched90mAgo, NOW)).toHaveLength(1);
    // LOW: 90m < 2h → not due.
    expect(filterMediaForInsights([item], false, CeilingClassification.LOW, rateLimitConfig, fetched90mAgo, NOW)).toHaveLength(0);
  });

  it('falls back to the legacy 72h window when age-bucket inputs are omitted', () => {
    const items = [media('old', 5 * DAY), media('fresh', 1 * HOUR)];
    // No ceiling/config/map → legacy behavior: only < 72h kept. Pass NOW so the
    // fixed test timestamps are evaluated against the same clock.
    const result = filterMediaForInsights(items, false, undefined, undefined, undefined, NOW);
    expect(result.map(m => m.id)).toEqual(['fresh']);
  });

  it('never fetches insights for posts older than 6 months (hard cutoff)', () => {
    // maxInsightsAgeMs default = 180d. A 200-day-old post is excluded even though
    // its >30d bucket would otherwise make it due, and even if never fetched.
    const tooOld = media('ancient', 200 * DAY);
    expect(
      filterMediaForInsights([tooOld], false, CeilingClassification.HIGH, rateLimitConfig, new Map(), NOW)
    ).toHaveLength(0);
    // A 170-day-old post is still within the window and (never-fetched) due.
    const withinWindow = media('old', 170 * DAY);
    expect(
      filterMediaForInsights([withinWindow], false, CeilingClassification.HIGH, rateLimitConfig, new Map(), NOW)
    ).toHaveLength(1);
  });
});

import { selectDueStoredPosts, type StoredPostForInsights } from '../SocialAccountService';

function stored(id: string, ageMs: number, lastFetchedMsAgo: number | null): StoredPostForInsights {
  return {
    mediaId: id,
    mediaType: 'IMAGE',
    timestamp: new Date(NOW - ageMs).toISOString(),
    publishedAt: NOW - ageMs,
    lastInsightsFetchedAt: lastFetchedMsAgo === null ? null : NOW - lastFetchedMsAgo,
  };
}

describe('selectDueStoredPosts — DB-driven older-post age buckets (Req 4.1–4.6)', () => {
  it('selects older posts of ANY age when their bucket interval has elapsed', () => {
    // 2-month + 6-month posts both fall in >30d bucket (7d base). LOW → 14d.
    const posts = [
      stored('twoMonth', 60 * DAY, 15 * DAY), // 15d since fetch >= 14d → due
      stored('sixMonth', 180 * DAY, 15 * DAY), // due
    ];
    const due = selectDueStoredPosts(posts, CeilingClassification.LOW, rateLimitConfig, NOW);
    expect(due.map(p => p.mediaId).sort()).toEqual(['sixMonth', 'twoMonth']);
  });

  it('does NOT select older posts whose interval has not elapsed', () => {
    // >30d bucket, LOW → 14d. Fetched 5 days ago → not due.
    const posts = [stored('twoMonth', 60 * DAY, 5 * DAY)];
    const due = selectDueStoredPosts(posts, CeilingClassification.LOW, rateLimitConfig, NOW);
    expect(due).toHaveLength(0);
  });

  it('never-fetched stored posts are always due', () => {
    const posts = [stored('neverFetched', 150 * DAY, null)];
    const due = selectDueStoredPosts(posts, CeilingClassification.HIGH, rateLimitConfig, NOW);
    expect(due.map(p => p.mediaId)).toEqual(['neverFetched']);
  });

  it('applies the correct bucket per post age (7-30d daily vs 30d+ weekly, HIGH)', () => {
    // 14d post → 7–30d bucket base 24h, HIGH → 1d.
    // 60d post → >30d bucket base 7d, HIGH → 7d.
    const posts = [
      stored('twoWeek', 14 * DAY, 2 * DAY),  // 2d >= 1d → due
      stored('twoMonth', 60 * DAY, 2 * DAY), // 2d < 7d → not due
    ];
    const due = selectDueStoredPosts(posts, CeilingClassification.HIGH, rateLimitConfig, NOW);
    expect(due.map(p => p.mediaId)).toEqual(['twoWeek']);
  });

  it('skips posts with an invalid publishedAt', () => {
    const bad: StoredPostForInsights = {
      mediaId: 'bad', mediaType: 'IMAGE', timestamp: 'nope', publishedAt: NaN, lastInsightsFetchedAt: null,
    };
    const due = selectDueStoredPosts([bad], CeilingClassification.LOW, rateLimitConfig, NOW);
    expect(due).toHaveLength(0);
  });

  it('never selects stored posts older than 6 months (hard cutoff)', () => {
    // 200-day-old post is past the 180d cutoff → excluded even if never fetched.
    const posts = [
      stored('ancient', 200 * DAY, null),
      stored('withinWindow', 170 * DAY, null),
    ];
    const due = selectDueStoredPosts(posts, CeilingClassification.HIGH, rateLimitConfig, NOW);
    expect(due.map(p => p.mediaId)).toEqual(['withinWindow']);
  });
});
