import { AIServiceManager } from '../AIServiceManager';

/**
 * Result of analyzing a single piece of social content.
 *
 * `sentimentScore` is normalized to a single -1..1 scale across the whole
 * social-listening pipeline:
 *   -1 = very negative, 0 = neutral, +1 = very positive
 * The text `sentiment` label is always derived from the score so the two can
 * never disagree (which was a source of the "always Neutral" bug).
 */
export interface AIAnalysisResult {
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number; // -1..1
  emotions: string[];
  hooks: string[];
  painPoints: string[];
  topics: string[];
  hashtags: string[];
}

/** Thresholds for turning a -1..1 score into a label. Shared everywhere. */
export const SENTIMENT_POSITIVE_THRESHOLD = 0.2;
export const SENTIMENT_NEGATIVE_THRESHOLD = -0.2;

export function labelFromScore(score: number): 'positive' | 'negative' | 'neutral' {
  if (score >= SENTIMENT_POSITIVE_THRESHOLD) return 'positive';
  if (score <= SENTIMENT_NEGATIVE_THRESHOLD) return 'negative';
  return 'neutral';
}

/** Normalize free-form topic strings so near-duplicates cluster together. */
export function normalizeTopic(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Title-case a normalized topic for display. */
export function prettyTopic(normalized: string): string {
  return normalized
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export class AIExtractionService {
  /**
   * Analyze one piece of content using the user's configured AI model.
   *
   * @param content   The text to analyze.
   * @param platform  Origin platform (for prompt context).
   * @param preferences  The user's AI configuration (model, creativity, persona,
   *   language, content safety, API keys). Passed straight to AIServiceManager
   *   so Social Listening honors the same Settings as the rest of the app.
   */
  static async analyzeContent(
    content: string,
    platform: string,
    preferences: any = {}
  ): Promise<AIAnalysisResult | null> {
    const trimmed = (content || '').trim();
    if (!trimmed) return this.getFallbackAnalysis(content);

    const ai = AIServiceManager.getInstance();
    const configured = await ai.isConfigured();
    if (!configured) {
      console.warn('[AIExtraction] No AI provider configured, using fallback analysis.');
      return this.getFallbackAnalysis(content);
    }

    const prompt = `You are an expert social media strategist and audience researcher analyzing real content from ${platform}.
Extract actionable intelligence a creator can use to grow. Respond ONLY with JSON in this exact shape:
{
  "sentimentScore": number from -1 to 1 (-1 = very negative, 0 = neutral, 1 = very positive),
  "emotions": ["up to 3 dominant emotions, e.g. excitement, frustration, curiosity"],
  "hooks": ["up to 2 scroll-stopping hook lines a creator could reuse, derived from what resonates here"],
  "painPoints": ["up to 3 concrete problems, frustrations or unmet needs the audience expresses"],
  "topics": ["up to 3 specific themes/keywords in Title Case, no generic words like 'Strategy' or 'Growth'"]
}
Rules:
- sentimentScore must reflect the genuine tone of THIS content; do not default to 0 unless it is truly neutral.
- Hooks must be specific and compelling. If the content offers no real hook, return an empty array.
- Pain points must reflect actual audience struggles, not assumptions. If none, return an empty array.
- Topics should be specific so they can be clustered meaningfully.

CONTENT:
${trimmed.substring(0, 2000)}`;

    try {
      const { withAIFeature } = await import('../aiUsageTracker');
      const raw = await withAIFeature('social_listening.extract', undefined, () => ai.generateJSON(prompt, preferences));
      return this.normalizeResult(raw);
    } catch (error) {
      console.error('[AIExtractionService] AI analysis failed, using fallback:', (error as Error).message);
      return this.getFallbackAnalysis(content);
    }
  }

  /**
   * Analyze MANY posts in a single AI call to stay within provider rate limits.
   *
   * Free-tier models (e.g. Google AI Studio) cap requests per minute (~10/min),
   * so analyzing 30 posts with 30 separate calls gets throttled with 429s.
   * Batching sends e.g. 8 posts per request, cutting 30 calls down to ~4.
   *
   * Returns results aligned by index to the input array. Any item that can't be
   * analyzed falls back to the heuristic analyzer so the pipeline never stalls.
   */
  static async analyzeBatch(
    items: Array<{ content: string; platform: string }>,
    preferences: any = {},
    batchSize: number = 10,
    options: { useCache?: boolean; concurrency?: number; onProgress?: (fraction: number, info: { done: number; total: number }) => void | Promise<void> } = {}
  ): Promise<AIAnalysisResult[]> {
    const { useCache = true, concurrency = 4, onProgress } = options;
    const results: AIAnalysisResult[] = new Array(items.length);
    const ai = AIServiceManager.getInstance();
    const configured = await ai.isConfigured();

    if (!configured) {
      console.warn('[AIExtraction] No AI provider configured, using fallback for all items.');
      return items.map((it) => this.getFallbackAnalysis(it.content));
    }

    // De-duplicate identical/near-identical content BEFORE sending to the LLM.
    // Many posts (re-posts, cross-posts, the same headline echoed across news
    // outlets) share text; analyzing each copy wastes tokens. We analyze each
    // unique text once and fan the result back out to every duplicate index.
    const keyOf = (s: string) =>
      (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 240);
    const uniqueItems: Array<{ content: string; platform: string }> = [];
    const uniqueIndexByKey = new Map<string, number>();
    const indexToUnique: number[] = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
      const k = keyOf(items[i].content || '');
      if (k && uniqueIndexByKey.has(k)) {
        indexToUnique[i] = uniqueIndexByKey.get(k)!;
      } else {
        const uIdx = uniqueItems.length;
        uniqueItems.push(items[i]);
        if (k) uniqueIndexByKey.set(k, uIdx);
        indexToUnique[i] = uIdx;
      }
    }

    const uniqueResults: AIAnalysisResult[] = new Array(uniqueItems.length);
    const savedCalls = items.length - uniqueItems.length;
    if (savedCalls > 0) {
      console.log(`[AIExtraction] De-duped ${savedCalls} repeated posts before AI analysis (cost saver).`);
    }

    // Consult the persistent analysis cache: any unique item whose content was
    // analyzed before (by a prior sync or the background batch refresh) is
    // served from cache and never re-sent to the LLM. Only genuine misses get
    // analyzed below. This is the main cross-sync cost saver.
    const cacheHitIdx = new Set<number>();
    if (useCache) {
      try {
        const { AnalysisCacheService } = await import('./analysis-cache.service');
        const hits = await AnalysisCacheService.getMany(uniqueItems);
        for (const [idx, res] of hits) {
          uniqueResults[idx] = res;
          cacheHitIdx.add(idx);
        }
        if (hits.size > 0) {
          console.log(`[AIExtraction] Cache HIT for ${hits.size}/${uniqueItems.length} unique posts (no LLM cost).`);
        }
      } catch (e) {
        console.warn('[AIExtraction] Cache lookup failed (continuing):', (e as Error).message);
      }
    }

    // Build the list of MISS items that actually need an LLM call, preserving a
    // map back to their position in uniqueResults.
    const missItems: Array<{ content: string; platform: string }> = [];
    const missToUnique: number[] = [];
    for (let i = 0; i < uniqueItems.length; i++) {
      if (!cacheHitIdx.has(i)) {
        missItems.push(uniqueItems[i]);
        missToUnique.push(i);
      }
    }

    // Split misses into batch slices (each slice = one LLM call).
    const slices: Array<{ start: number; slice: Array<{ content: string; platform: string }> }> = [];
    for (let start = 0; start < missItems.length; start += batchSize) {
      slices.push({ start, slice: missItems.slice(start, start + batchSize) });
    }

    const analyzeSlice = async ({ start, slice }: { start: number; slice: Array<{ content: string; platform: string }> }) => {
      const docs = slice
        .map((it, i) => {
          const text = (it.content || '').trim().substring(0, 1200);
          return `### POST ${i} (platform: ${it.platform})\n${text || '(no text)'}`;
        })
        .join('\n\n');

      const prompt = `You are an expert social media strategist analyzing real social posts.
Analyze EACH numbered post below independently. Respond ONLY with JSON in this exact shape:
{
  "results": [
    {
      "index": number (matches the POST number),
      "sentimentScore": number from -1 to 1 (-1 = very negative, 0 = neutral, 1 = very positive),
      "emotions": ["up to 3 dominant emotions"],
      "hooks": ["up to 2 reusable scroll-stopping hook lines, or empty array"],
      "painPoints": ["up to 3 concrete audience problems/frustrations, or empty array"],
      "topics": ["up to 3 specific themes in Title Case, no generic words like 'Strategy'"],
      "hashtags": ["up to 4 relevant hashtags WITHOUT the # symbol, e.g. 'TravelTips'"]
    }
  ]
}
Rules:
- Return exactly one result object per post, with the matching "index".
- sentimentScore must reflect the genuine tone of THAT post; do not default to 0 unless truly neutral.
- Hooks/pain points must be specific and real; use empty arrays if none.
- Hashtags should be specific and usable for content in this space.

POSTS:
${docs}`;

      try {
        const { withAIFeature } = await import('../aiUsageTracker');
        // Per-batch timeout so one stuck/slow provider call can't freeze the
        // whole sync — if it exceeds the budget we fall back to the heuristic
        // analyzer for this slice and keep the pipeline moving.
        const PER_BATCH_TIMEOUT_MS = Number(process.env.SOCIAL_LISTENING_BATCH_TIMEOUT_MS || 60_000);
        const raw = await Promise.race([
          withAIFeature('social_listening.extract', undefined, () => ai.generateJSON(prompt, preferences)),
          new Promise((_, reject) => setTimeout(() => reject(new Error('batch-timeout')), PER_BATCH_TIMEOUT_MS)),
        ]);
        const arr: any[] = Array.isArray((raw as any)?.results) ? (raw as any).results : [];
        const byIndex = new Map<number, any>();
        for (const r of arr) {
          if (r && typeof r.index === 'number') byIndex.set(r.index, r);
        }
        for (let i = 0; i < slice.length; i++) {
          const r = byIndex.get(i);
          uniqueResults[missToUnique[start + i]] = r
            ? this.normalizeResult(r)
            : this.getFallbackAnalysis(slice[i].content);
        }
      } catch (error) {
        console.error(
          `[AIExtraction] Batch ${start}-${start + slice.length} failed, using fallback:`,
          (error as Error).message
        );
        for (let i = 0; i < slice.length; i++) {
          uniqueResults[missToUnique[start + i]] = this.getFallbackAnalysis(slice[i].content);
        }
      }
    };

    // Run the batches with bounded concurrency (a few in flight at once) so a
    // large sample finishes in a fraction of the time vs. strictly sequential,
    // while staying gentle enough to avoid hammering free-tier rate limits. We
    // report progress after EACH batch so the UI's "analyzing" bar advances in
    // real time (35%→90%) instead of freezing until the very end.
    let nextSlice = 0;
    let doneSlices = 0;
    const total = slices.length;
    const worker = async () => {
      while (true) {
        const idx = nextSlice++;
        if (idx >= slices.length) break;
        await analyzeSlice(slices[idx]);
        doneSlices++;
        if (onProgress) {
          try { await onProgress(doneSlices / total, { done: doneSlices, total }); } catch { /* ignore */ }
        }
      }
    };
    if (total > 0) {
      const pool = Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, () => worker());
      await Promise.all(pool);
    }

    // Write freshly-analyzed MISS results back to the cache so subsequent syncs
    // (and the background batch refresh) reuse them for free. Only cache real
    // model results, not the heuristic fallback used when the AI is unavailable.
    if (useCache && missItems.length > 0) {
      try {
        const { AnalysisCacheService } = await import('./analysis-cache.service');
        const toCache = missToUnique
          .map((uIdx, mIdx) => ({
            content: missItems[mIdx].content,
            platform: missItems[mIdx].platform,
            result: uniqueResults[uIdx],
          }))
          .filter((e) => e.result);
        await AnalysisCacheService.setMany(toCache);
      } catch (e) {
        console.warn('[AIExtraction] Cache write failed (non-fatal):', (e as Error).message);
      }
    }

    // Fan unique results back out to every original index.
    for (let i = 0; i < items.length; i++) {
      results[i] = uniqueResults[indexToUnique[i]];
    }

    return results;
  }

  /** Public wrapper so the Batch API service can reuse the same normalization. */
  static normalizeResultPublic(raw: any): AIAnalysisResult {
    return this.normalizeResult(raw);
  }

  /** Public wrapper so the Batch API service can reuse the heuristic fallback. */
  static getFallbackPublic(content: string): AIAnalysisResult {
    return this.getFallbackAnalysis(content);
  }

  /**
   * Coerce a raw AI JSON object into a safe, normalized AIAnalysisResult.
   * Accepts either a -1..1 score or a legacy 0..100 score and rescales.
   */
  private static normalizeResult(raw: any): AIAnalysisResult {
    let score = Number(raw?.sentimentScore);
    if (!Number.isFinite(score)) score = 0;
    // Back-compat: if a model returns 0..100, rescale to -1..1.
    if (score > 1 || score < -1) {
      score = Math.max(-1, Math.min(1, (score - 50) / 50));
    }
    score = Math.max(-1, Math.min(1, score));

    const toStringArray = (v: any, max: number): string[] =>
      Array.isArray(v)
        ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, max)
        : [];

    return {
      sentiment: labelFromScore(score),
      sentimentScore: score,
      emotions: toStringArray(raw?.emotions, 3),
      hooks: toStringArray(raw?.hooks, 2),
      painPoints: toStringArray(raw?.painPoints, 3),
      topics: toStringArray(raw?.topics, 3),
      hashtags: toStringArray(raw?.hashtags, 4).map((h) => h.replace(/^#/, '')),
    };
  }

  /**
   * Heuristic fallback when no AI provider is available or a call fails.
   * Produces a -1..1 score so it's consistent with the AI path.
   */
  private static getFallbackAnalysis(content: string): AIAnalysisResult {
    const text = (content || '').toLowerCase();

    const positiveWords = ['great', 'awesome', 'love', 'best', 'amazing', 'excellent', 'helpful', 'win', 'success', 'incredible'];
    const negativeWords = ['bad', 'terrible', 'hate', 'worst', 'issue', 'problem', 'fail', 'broken', 'struggle', 'frustrat', 'scam', 'awful'];

    const posHits = positiveWords.filter(w => text.includes(w)).length;
    const negHits = negativeWords.filter(w => text.includes(w)).length;

    let score = 0;
    if (posHits || negHits) {
      score = (posHits - negHits) / (posHits + negHits);
    }
    score = Math.max(-1, Math.min(1, score));

    const stop = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'with', 'this', 'that', 'from', 'they', 'have', 'your', 'what', 'when', 'will', 'about', 'into']);
    const freq: Record<string, number> = {};
    for (const w of text.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
      if (w.length >= 4 && !stop.has(w)) freq[w] = (freq[w] || 0) + 1;
    }
    const topics = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

    const sentiment = labelFromScore(score);
    return {
      sentiment,
      sentimentScore: score,
      emotions: sentiment === 'negative' ? ['frustration'] : sentiment === 'positive' ? ['excitement'] : ['curiosity'],
      hooks: [],
      painPoints: [],
      topics: topics.length ? topics : ['General'],
      hashtags: topics.slice(0, 3).map((t) => t.replace(/\s+/g, '')),
    };
  }
}
