import crypto from 'crypto';
import { ListeningAnalysisCacheModel } from '../../models/SocialListening/ListeningAnalysisCache';
import { AIAnalysisResult } from './ai-extraction.service';
import { slog } from '../../utils/social-listening-debug-logger';

/**
 * Persistent, content-addressed cache for Social Listening AI analysis.
 *
 * Both analysis paths (synchronous batched + OpenAI Batch API) call
 * `getMany()` first and only send cache MISSES to the LLM, then `setMany()` the
 * fresh results. Because the key is a hash of the normalized text + platform,
 * the same post analyzed by a background refresh and a user-triggered sync only
 * costs one LLM call total.
 */

// How long a cached analysis stays valid. Sentiment/topics for a given piece of
// text don't change, so a generous TTL maximizes reuse while the TTL index
// still garbage-collects old rows.
const DEFAULT_TTL_MS = Number(process.env.SOCIAL_LISTENING_CACHE_TTL_MS || 14 * 24 * 60 * 60 * 1000); // 14 days

export function hashContent(content: string): string {
  const normalized = (content || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
  return crypto.createHash('sha1').update(normalized).digest('hex');
}

export class AnalysisCacheService {
  /**
   * Look up cached results for a list of items.
   *
   * @returns a Map from the item's index → cached AIAnalysisResult (only for
   *   hits). Callers analyze the misses and merge the results back by index.
   */
  static async getMany(
    items: Array<{ content: string; platform: string }>
  ): Promise<Map<number, AIAnalysisResult>> {
    const hits = new Map<number, AIAnalysisResult>();
    if (items.length === 0) return hits;

    // Build the set of unique (hash, platform) keys to query.
    const keyByIndex = items.map((it) => ({
      hash: hashContent(it.content || ''),
      platform: it.platform,
    }));
    const uniqueHashes = Array.from(new Set(keyByIndex.map((k) => k.hash)));

    try {
      const rows = await ListeningAnalysisCacheModel.find({
        contentHash: { $in: uniqueHashes },
      }).lean();

      const byKey = new Map<string, any>();
      for (const r of rows) byKey.set(`${r.contentHash}::${r.platform}`, r.result);

      for (let i = 0; i < items.length; i++) {
        const k = keyByIndex[i];
        const cached = byKey.get(`${k.hash}::${k.platform}`);
        if (cached) hits.set(i, cached as AIAnalysisResult);
      }

      // Bump hit counters + refresh TTL for the entries we reused (best-effort).
      if (hits.size > 0) {
        const reusedHashes = Array.from(
          new Set(Array.from(hits.keys()).map((i) => keyByIndex[i].hash))
        );
        ListeningAnalysisCacheModel.updateMany(
          { contentHash: { $in: reusedHashes } },
          { $inc: { hits: 1 }, $set: { expiresAt: new Date(Date.now() + DEFAULT_TTL_MS) } }
        ).catch(() => {});
      }
      slog('cache.lookup', { requested: items.length, hits: hits.size, misses: items.length - hits.size });
    } catch (e) {
      console.warn('[AnalysisCache] getMany failed (continuing without cache):', (e as Error).message);
      slog('cache.lookup-error', { error: (e as Error).message });
    }

    return hits;
  }

  /** Persist freshly-computed results so future syncs reuse them. */
  static async setMany(
    entries: Array<{ content: string; platform: string; result: AIAnalysisResult }>
  ): Promise<void> {
    if (entries.length === 0) return;

    // De-dupe by (hash, platform) so one bulk op per unique key.
    const seen = new Set<string>();
    const ops: any[] = [];
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS);

    for (const e of entries) {
      if (!e.result) continue;
      const hash = hashContent(e.content || '');
      const key = `${hash}::${e.platform}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ops.push({
        updateOne: {
          filter: { contentHash: hash, platform: e.platform },
          update: {
            $set: { result: e.result, expiresAt },
            $setOnInsert: { contentHash: hash, platform: e.platform, hits: 0 },
          },
          upsert: true,
        },
      });
    }

    if (ops.length === 0) return;
    try {
      await ListeningAnalysisCacheModel.bulkWrite(ops, { ordered: false });
      slog('cache.write', { entries: ops.length });
    } catch (e) {
      console.warn('[AnalysisCache] setMany failed (non-fatal):', (e as Error).message);
      slog('cache.write-error', { error: (e as Error).message });
    }
  }
}
