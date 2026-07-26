/**
 * Unit tests for date-aware batch media-insight metric selection
 * (smart-polling-system Req 2.1–2.4, applied on the live poll cycle).
 *
 * `InstagramApiService.getBatchMetricsForMediaType` requests `views` for
 * current content (published on/after the 2024-07-02 cutover) and `impressions`
 * only for strictly-earlier legacy media. Media types that don't support the
 * reach-style metric (IMAGE / CAROUSEL_ALBUM) keep the minimal (reach, saved)
 * set regardless of date.
 */

import { describe, it, expect } from 'vitest';
import { InstagramApiService } from '../instagramApi';
import { VIEWS_CUTOVER_UTC } from '../insightMetricSelection';

const CURRENT_MS = VIEWS_CUTOVER_UTC + 365 * 24 * 3600 * 1000; // ~1y after cutover
const LEGACY_MS = VIEWS_CUTOVER_UTC - 365 * 24 * 3600 * 1000;  // ~1y before cutover

describe('InstagramApiService.getBatchMetricsForMediaType — date-aware reach metric (Req 2.1–2.4)', () => {
  it('VIDEO current content requests views, never impressions', () => {
    const metrics = InstagramApiService.getBatchMetricsForMediaType(
      'VIDEO',
      new Date(CURRENT_MS).toISOString()
    );
    expect(metrics).toContain('views');
    expect(metrics).not.toContain('impressions');
    // Bundled with the other supported video metrics.
    expect(metrics).toEqual(expect.arrayContaining(['reach', 'saved', 'shares', 'views']));
  });

  it('VIDEO legacy (pre-cutover) content requests impressions, not views', () => {
    const metrics = InstagramApiService.getBatchMetricsForMediaType(
      'VIDEO',
      new Date(LEGACY_MS).toISOString()
    );
    expect(metrics).toContain('impressions');
    expect(metrics).not.toContain('views');
  });

  it('the exact cutover instant is treated as current content (views)', () => {
    const metrics = InstagramApiService.getBatchMetricsForMediaType('VIDEO', VIEWS_CUTOVER_UTC);
    expect(metrics).toContain('views');
    expect(metrics).not.toContain('impressions');
  });

  it('missing/undefined publish date defaults to current content (views)', () => {
    const metrics = InstagramApiService.getBatchMetricsForMediaType('VIDEO');
    expect(metrics).toContain('views');
    expect(metrics).not.toContain('impressions');
  });

  it('IMAGE / CAROUSEL_ALBUM keep the minimal (reach, saved) set regardless of date', () => {
    for (const type of ['IMAGE', 'CAROUSEL_ALBUM']) {
      const current = InstagramApiService.getBatchMetricsForMediaType(type, new Date(CURRENT_MS).toISOString());
      const legacy = InstagramApiService.getBatchMetricsForMediaType(type, new Date(LEGACY_MS).toISOString());
      expect(current).toEqual(['reach', 'saved']);
      expect(legacy).toEqual(['reach', 'saved']);
      // No reach-style metric on images (avoids Code 400).
      expect(current).not.toContain('views');
      expect(current).not.toContain('impressions');
    }
  });

  it('unknown media type falls back to the minimal (reach, saved) set', () => {
    const metrics = InstagramApiService.getBatchMetricsForMediaType(undefined, new Date(CURRENT_MS).toISOString());
    expect(metrics).toEqual(['reach', 'saved']);
  });
});
