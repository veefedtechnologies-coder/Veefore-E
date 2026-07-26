import { getOpenAIClient, isOpenAIAvailable } from '../../openai-client';
import { toFile } from 'openai';
import { AIExtractionService, AIAnalysisResult } from './ai-extraction.service';

/**
 * Batched AI analysis using the OpenAI Batch API (the `/v1/batches` endpoint).
 *
 * WHY: OpenAI bills Batch API requests at a 50% discount vs. synchronous calls.
 * Social Listening analyzes dozens of posts per sync, so routing that work
 * through the Batch API cuts the AI cost of a sync roughly in half while still
 * using the exact same prompt + JSON schema as the live path.
 *
 * HOW: We pack one analysis request per post into a JSONL file, upload it,
 * create a batch (24h completion window), then poll until it finishes and map
 * the results back by custom_id. If the Batch API is unavailable or doesn't
 * finish inside our wait budget, the caller falls back to the synchronous
 * batched analyzer so a sync never stalls.
 */

const SYSTEM_PROMPT =
  'You are an expert social media strategist and audience researcher. Analyze the social post and respond ONLY with strict JSON.';

function buildUserPrompt(content: string, platform: string): string {
  const text = (content || '').trim().substring(0, 1500);
  return `Analyze this real post from ${platform}. Respond ONLY with JSON in this exact shape:
{
  "sentimentScore": number from -1 to 1 (-1 = very negative, 0 = neutral, 1 = very positive),
  "emotions": ["up to 3 dominant emotions"],
  "hooks": ["up to 2 reusable scroll-stopping hook lines, or empty array"],
  "painPoints": ["up to 3 concrete audience problems/frustrations, or empty array"],
  "topics": ["up to 3 specific themes in Title Case, no generic words like 'Strategy'"],
  "hashtags": ["up to 4 relevant hashtags WITHOUT the # symbol"]
}
Rules:
- sentimentScore must reflect the genuine tone; do not default to 0 unless truly neutral.
- Hooks/pain points must be specific and real; use empty arrays if none.

CONTENT:
${text || '(no text)'}`;
}

export interface BatchAnalyzeOptions {
  /** Max time (ms) to wait for the batch to complete before giving up. */
  maxWaitMs?: number;
  /** Poll interval (ms). */
  pollIntervalMs?: number;
  /** Model to run the batch against (must be a Batch-API-supported model). */
  model?: string;
  /** Called with 0..1 progress as the batch advances, for the sync status UI. */
  onProgress?: (fraction: number, info: { completed: number; total: number }) => void | Promise<void>;
  /** Called with the provider batch id as soon as it's created, so the caller
   *  can persist it and cancel the batch later (e.g. user clicked Sync). */
  onBatchCreated?: (batchId: string) => void | Promise<void>;
  /** Polled each tick; return true to abort + cancel the batch early. */
  shouldCancel?: () => boolean | Promise<boolean>;
  /** Use the persistent analysis cache to skip already-analyzed content. */
  useCache?: boolean;
}

export class BatchExtractionService {
  /** Whether the true OpenAI Batch API can be used in this environment. */
  static isAvailable(): boolean {
    return isOpenAIAvailable();
  }

  /** Cancel a running batch by id (best-effort; safe to call on a finished one). */
  static async cancel(batchId: string): Promise<void> {
    if (!batchId || !this.isAvailable()) return;
    try {
      await getOpenAIClient().batches.cancel(batchId);
      console.log(`[BatchExtraction] Cancelled batch ${batchId} (cost saver).`);
    } catch (e) {
      console.warn(`[BatchExtraction] Cancel batch ${batchId} failed:`, (e as Error).message);
    }
  }

  /**
   * Analyze many posts via the OpenAI Batch API at the 50% discounted rate.
   *
   * Returns results aligned by index. Throws if the Batch API can't be used or
   * doesn't finish in time so the caller can fall back to synchronous batching.
   */
  static async analyzeBatch(
    items: Array<{ content: string; platform: string }>,
    options: BatchAnalyzeOptions = {}
  ): Promise<AIAnalysisResult[]> {
    if (!this.isAvailable()) {
      throw new Error('OpenAI Batch API not available (OPENAI_API_KEY missing).');
    }
    if (items.length === 0) return [];

    const {
      maxWaitMs = 4 * 60_000,
      pollIntervalMs = 5_000,
      model = 'gpt-4o-mini',
      onProgress,
      onBatchCreated,
      shouldCancel,
      useCache = true,
    } = options;

    const client = getOpenAIClient();

    // 0. Consult the persistent cache first. Only genuine misses are sent to the
    //    Batch API — the same cross-sync cost saver the synchronous path uses.
    const finalResults: AIAnalysisResult[] = new Array(items.length);
    let missItems = items;
    let missToOriginal = items.map((_, i) => i);
    if (useCache) {
      try {
        const { AnalysisCacheService } = await import('./analysis-cache.service');
        const hits = await AnalysisCacheService.getMany(items);
        if (hits.size > 0) {
          missItems = [];
          missToOriginal = [];
          for (let i = 0; i < items.length; i++) {
            const cached = hits.get(i);
            if (cached) {
              finalResults[i] = cached;
            } else {
              missItems.push(items[i]);
              missToOriginal.push(i);
            }
          }
          console.log(`[BatchExtraction] Cache HIT for ${hits.size}/${items.length} posts; batching only ${missItems.length}.`);
        }
      } catch (e) {
        console.warn('[BatchExtraction] Cache lookup failed (continuing):', (e as Error).message);
      }
    }

    // Everything was cached — no batch needed at all.
    if (missItems.length === 0) {
      for (let i = 0; i < items.length; i++) {
        if (!finalResults[i]) finalResults[i] = AIExtractionService.getFallbackPublic(items[i].content);
      }
      return finalResults;
    }

    // 1. Build a JSONL payload — one chat-completion request per MISS post.
    const lines = missItems.map((it, i) =>
      JSON.stringify({
        custom_id: `post-${i}`,
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(it.content, it.platform) },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.4,
        },
      })
    );
    const jsonl = lines.join('\n');

    // 2. Upload the JSONL file for batch processing.
    const file = await client.files.create({
      file: await toFile(Buffer.from(jsonl, 'utf-8'), 'social-listening-batch.jsonl'),
      purpose: 'batch',
    });

    // 3. Create the batch (24h window → eligible for the 50% discount).
    let batch = await client.batches.create({
      input_file_id: file.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
      metadata: { feature: 'social_listening.extract' },
    });

    if (onBatchCreated) await onBatchCreated(batch.id);
    console.log(`[BatchExtraction] Created batch ${batch.id} for ${missItems.length} posts (50% discount).`);

    // 4. Poll until the batch finishes, our wait budget expires, or the caller
    //    asks to cancel (e.g. the user clicked "Sync Live Data").
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      if (shouldCancel && (await shouldCancel())) {
        try { await client.batches.cancel(batch.id); } catch { /* ignore */ }
        throw new Error(`Batch ${batch.id} cancelled on request.`);
      }
      if (batch.status === 'completed') break;
      if (batch.status === 'failed' || batch.status === 'expired' || batch.status === 'cancelled') {
        throw new Error(`Batch ${batch.id} ended with status ${batch.status}`);
      }
      const counts = (batch as any).request_counts || {};
      const completed = counts.completed || 0;
      const total = counts.total || missItems.length;
      if (onProgress) await onProgress(total > 0 ? completed / total : 0, { completed, total });

      await new Promise((r) => setTimeout(r, pollIntervalMs));
      batch = await client.batches.retrieve(batch.id);
    }

    if (batch.status !== 'completed') {
      // Don't leave it running; best-effort cancel so we don't pay for a result
      // we're about to recompute synchronously.
      try { await client.batches.cancel(batch.id); } catch { /* ignore */ }
      throw new Error(`Batch ${batch.id} did not complete within ${Math.round(maxWaitMs / 1000)}s (status ${batch.status}).`);
    }

    if (!batch.output_file_id) {
      throw new Error(`Batch ${batch.id} completed without an output file.`);
    }

    // 5. Download + parse the JSONL results, mapping back by custom_id to the
    //    MISS position, then onto the original index.
    const outputText = await (await client.files.content(batch.output_file_id)).text();

    for (const raw of outputText.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      try {
        const parsed = JSON.parse(line);
        const missIdx = Number(String(parsed.custom_id || '').replace('post-', ''));
        if (!Number.isFinite(missIdx)) continue;
        const body = parsed.response?.body;
        const contentStr = body?.choices?.[0]?.message?.content;
        if (contentStr) {
          const obj = typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
          finalResults[missToOriginal[missIdx]] = AIExtractionService.normalizeResultPublic(obj);
        }
      } catch (e) {
        console.warn('[BatchExtraction] Failed to parse a result line:', (e as Error).message);
      }
    }

    // Fill any gaps (a request that errored) with the heuristic fallback so the
    // output array is always complete and index-aligned.
    for (let i = 0; i < items.length; i++) {
      if (!finalResults[i]) finalResults[i] = AIExtractionService.getFallbackPublic(items[i].content);
    }

    // 6. Persist the freshly-analyzed misses to the cache for future reuse.
    if (useCache) {
      try {
        const { AnalysisCacheService } = await import('./analysis-cache.service');
        const toCache = missToOriginal
          .map((origIdx) => ({
            content: items[origIdx].content,
            platform: items[origIdx].platform,
            result: finalResults[origIdx],
          }))
          .filter((e) => e.result);
        await AnalysisCacheService.setMany(toCache);
      } catch (e) {
        console.warn('[BatchExtraction] Cache write failed (non-fatal):', (e as Error).message);
      }
    }

    console.log(`[BatchExtraction] Batch ${batch.id} completed; mapped ${finalResults.length} results.`);
    return finalResults;
  }
}
