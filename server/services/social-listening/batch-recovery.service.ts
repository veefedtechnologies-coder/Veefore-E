import { ListeningBatchJobModel } from '../../models/SocialListening/ListeningBatchJob';
import { SyncStatusService } from './sync-status.service';
import { slog, slogError } from '../../utils/social-listening-debug-logger';

/**
 * Batch Recovery Service for Social Listening.
 *
 * OpenAI's Batch API can take up to 24 hours. Instead of holding a polling
 * loop in memory (fragile across restarts), we:
 *   1. Store each submitted batch's id + analysisInputs in MongoDB immediately.
 *   2. Run this recovery job every 30 minutes to check all pending batches.
 *   3. When a batch is complete, download results and finish the pipeline
 *      (trend computation + MongoDB write) right here.
 *
 * This means the data update happens automatically within 30 minutes of the
 * batch completing — no matter how long OpenAI takes, no matter if the
 * server restarted in between.
 */

const RECOVERY_INTERVAL_MS = 30 * 60 * 1000; // check every 30 minutes
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export class BatchRecoveryService {
  static start(): void {
    if (timer) return;
    console.log('[SocialListening:BatchRecovery] Started — polls every 30 min for completed OpenAI batches.');
    // First check 2 minutes after boot (handles restart-while-batch-pending)
    setTimeout(() => void this.tick(), 2 * 60_000);
    timer = setInterval(() => void this.tick(), RECOVERY_INTERVAL_MS);
  }

  static stop(): void {
    if (timer) { clearInterval(timer); timer = null; }
  }

  static async tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      // Find all pending batch jobs (could be from previous server sessions too)
      const pending = await ListeningBatchJobModel.find({ status: 'pending' })
        .sort({ submittedAt: 1 })
        .limit(20)
        .lean();

      if (pending.length === 0) return;

      console.log(`[SocialListening:BatchRecovery] Checking ${pending.length} pending batch(es)…`);
      slog('batch-recovery.tick', { count: pending.length });

      const { getOpenAIClient, isOpenAIAvailable } = await import('../../openai-client');
      if (!isOpenAIAvailable()) {
        console.warn('[SocialListening:BatchRecovery] OpenAI unavailable — skipping recovery tick.');
        return;
      }
      const openai = getOpenAIClient();

      for (const job of pending) {
        try {
          const batch = await openai.batches.retrieve(job.batchId);

          if (batch.status === 'completed' && batch.output_file_id) {
            await this.finalizeBatch(job, batch);
          } else if (batch.status === 'failed' || batch.status === 'expired' || batch.status === 'cancelled') {
            console.warn(`[SocialListening:BatchRecovery] Batch ${job.batchId} ended with status=${batch.status}. Falling back to sync analysis.`);
            slog('batch-recovery.batch-failed', { batchId: job.batchId, status: batch.status, workspaceId: job.workspaceId });
            await this.fallbackToSync(job);
          } else {
            // still in_progress / validating / finalizing — check again next tick
            slog('batch-recovery.still-pending', { batchId: job.batchId, status: batch.status, workspaceId: job.workspaceId });
          }
        } catch (err) {
          console.error(`[SocialListening:BatchRecovery] Error checking batch ${job.batchId}:`, (err as Error).message);
          slogError('batch-recovery.check-error', err, { batchId: job.batchId, workspaceId: job.workspaceId });
        }
      }
    } catch (e) {
      console.error('[SocialListening:BatchRecovery] tick error:', (e as Error).message);
      slogError('batch-recovery.tick-error', e);
    } finally {
      running = false;
    }
  }

  private static async finalizeBatch(job: any, batch: any): Promise<void> {
    const { workspaceId, niche, runId, batchId, analysisInputs, postSnapshots } = job;
    console.log(`[SocialListening:BatchRecovery] Batch ${batchId} completed! Finalizing ${analysisInputs.length} analyses for workspace ${workspaceId}`);
    slog('batch-recovery.finalize-start', { batchId, workspaceId, niche, inputs: analysisInputs.length });

    try {
      // Download + parse results
      const { getOpenAIClient } = await import('../../openai-client');
      const openai = getOpenAIClient();
      const outputText = await (await openai.files.content(batch.output_file_id)).text();

      const { AIExtractionService } = await import('./ai-extraction.service');
      const finalResults: any[] = new Array(analysisInputs.length);
      for (const raw of outputText.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          const idx = Number(String(parsed.custom_id || '').replace('post-', ''));
          if (!Number.isFinite(idx)) continue;
          const contentStr = parsed.response?.body?.choices?.[0]?.message?.content;
          if (contentStr) {
            const obj = typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
            finalResults[idx] = AIExtractionService.normalizeResultPublic(obj);
          }
        } catch { /* skip malformed line */ }
      }
      // Fill gaps with fallback
      for (let i = 0; i < analysisInputs.length; i++) {
        if (!finalResults[i]) {
          finalResults[i] = AIExtractionService.getFallbackPublic(analysisInputs[i].content);
        }
      }

      // Cache the freshly-analyzed results
      try {
        const { AnalysisCacheService } = await import('./analysis-cache.service');
        const toCache = analysisInputs.map((input: any, i: number) => ({
          content: input.content,
          platform: input.platform,
          result: finalResults[i],
        })).filter((e: any) => e.result);
        await AnalysisCacheService.setMany(toCache);
      } catch { /* non-fatal */ }

      // Record the finalized batch usage in AIUsageEvent.
      // OpenAI Batch API doesn't return per-item token counts in the output file,
      // so we estimate based on input/output lengths (same heuristic as sync path).
      try {
        const { AIUsageEvent, estimateTokens } = await import('../../services/aiUsageTracker');
        let totalPrompt = 0;
        let totalCompletion = 0;
        for (let i = 0; i < analysisInputs.length; i++) {
          totalPrompt += estimateTokens(analysisInputs[i].content?.slice(0, 1500) || '');
          totalCompletion += estimateTokens(JSON.stringify(finalResults[i] || {}));
        }
        void AIUsageEvent.create({
          feature: 'social_listening.batch_finalized',
          provider: 'openai',
          model: 'gpt-4o-mini',
          promptTokens: totalPrompt,
          completionTokens: totalCompletion,
          totalTokens: totalPrompt + totalCompletion,
          cachedTokens: 0,
          estimated: true,   // Batch API doesn't expose per-item token counts
          callType: 'batch-finalized' as any,
          workspaceId,
          createdAt: new Date(),
        }).catch(() => {});
      } catch { /* non-fatal */ }

      // Merge AI results back onto the post snapshots
      const allPosts = (postSnapshots || []).map((post: any, i: number) => {
        const aiResult = finalResults[i];
        if (aiResult) {
          post.aiMetadata = {
            sentiment: aiResult.sentiment,
            sentimentScore: aiResult.sentimentScore,
            topics: aiResult.topics,
            emotions: aiResult.emotions,
            hooks: aiResult.hooks,
            painPoints: aiResult.painPoints,
            hashtags: aiResult.hashtags,
            analyzedAt: new Date(),
          };
          post.painPoints = aiResult.painPoints;
        }
        return post;
      });

      // Persist posts + compute trends (same pipeline as the interactive path)
      await this.persistAndComputeTrends(workspaceId, niche, allPosts);

      // Mark job as completed
      await ListeningBatchJobModel.updateOne(
        { batchId },
        { $set: { status: 'completed', completedAt: new Date() } }
      );

      slog('batch-recovery.finalize-done', { batchId, workspaceId, niche, posts: allPosts.length });
      console.log(`[SocialListening:BatchRecovery] ✅ Workspace ${workspaceId} updated from batch ${batchId}`);
    } catch (err) {
      console.error(`[SocialListening:BatchRecovery] Finalize failed for batch ${batchId}:`, (err as Error).message);
      slogError('batch-recovery.finalize-error', err, { batchId, workspaceId });
      await this.fallbackToSync(job);
    }
  }

  private static async fallbackToSync(job: any): Promise<void> {
    const { workspaceId, niche, runId } = job;
    // Mark the OpenAI batch job as failed
    await ListeningBatchJobModel.updateOne(
      { batchId: job.batchId },
      { $set: { status: 'failed', completedAt: new Date(), error: 'Batch failed/expired — re-queuing as background sync' } }
    ).catch(() => {});

    // Check if the workspace was already superseded by an interactive sync
    if (!(await SyncStatusService.isCurrentRun(workspaceId, runId))) {
      slog('batch-recovery.fallback-skip-superseded', { workspaceId, runId });
      return;
    }

    // Re-queue as a fresh background sync (synchronous path this time — no batch)
    try {
      const { runLiveSync } = await import('../../routes/social-listening');
      const newRunId = await SyncStatusService.begin(workspaceId, niche, 'background');
      console.log(`[SocialListening:BatchRecovery] Re-running sync (sync path) for ${workspaceId} after batch failure`);
      runLiveSync(workspaceId, niche, { mode: 'background', runId: newRunId }).catch((err) => {
        if ((err as Error)?.message === 'SUPERSEDED') return;
        SyncStatusService.fail(workspaceId, (err as Error)?.message || 'Fallback sync failed').catch(() => {});
      });
    } catch (err) {
      await SyncStatusService.fail(workspaceId, 'Batch failed and fallback could not start').catch(() => {});
    }
  }

  private static async persistAndComputeTrends(workspaceId: string, niche: string, allPosts: any[]): Promise<void> {
    // Reuse the same persistence logic as runLiveSync — imported here to avoid duplication.
    // We trigger it by calling a stripped-down version of the computing phase.
    const {
      ListeningPostModel,
      ListeningHookModel,
      ListeningTrendModel,
      ListeningAggregationModel,
      ListeningCommentModel,
    } = await import('../../models/SocialListening').catch(async () => ({
      ListeningPostModel: (await import('../../models/SocialListening/ListeningPost')).ListeningPostModel,
      ListeningTrendModel: (await import('../../models/SocialListening/ListeningTrend')).ListeningTrendModel,
      ListeningHookModel: (await import('../../models/SocialListening/ListeningHook')).ListeningHookModel,
      ListeningAggregationModel: null,
      ListeningCommentModel: null,
    }));

    await ListeningPostModel.deleteMany({ workspaceId });
    await ListeningHookModel.deleteMany({ workspaceId });
    await ListeningTrendModel.deleteMany({ workspaceId });
    if (ListeningAggregationModel) await (ListeningAggregationModel as any).deleteMany({ workspaceId });

    // Save posts
    const rawEngagement = (p: any) =>
      (p.metrics?.likes || 0) + (p.metrics?.comments || 0) * 2 + Math.round((p.metrics?.views || 0) * 0.001);
    const sortedEng = [...allPosts].map(rawEngagement).sort((a: number, b: number) => a - b);
    const engRank = (val: number) => {
      if (sortedEng.length <= 1) return 0.5;
      let below = 0;
      for (const e of sortedEng) { if (e < val) below++; else break; }
      return below / (sortedEng.length - 1);
    };

    const postDocs: any[] = [];
    const hookDocs: any[] = [];
    for (const post of allPosts) {
      post.publishedAt = post.publishedAt || new Date();
      const likes = post.metrics?.likes || 0;
      const comments = post.metrics?.comments || 0;
      const views = post.metrics?.views || 0;
      const eng = likes + comments * 2 + Math.round(views * 0.001);
      const rel = post.relevanceScore || 0;
      const engR = engRank(eng);
      const qualityScore = Math.round((rel * 0.4 + engR * 0.4 + (post.aiMetadata?.sentimentScore ? Math.abs(post.aiMetadata.sentimentScore) * 0.2 : 0)) * 100);

      const { ListeningSourceModel } = await import('../../models/SocialListening/ListeningSource');
      let src = await ListeningSourceModel.findOneAndUpdate(
        { workspaceId, platform: post.platform, type: 'keyword', value: niche },
        { $set: { workspaceId, platform: post.platform, type: 'keyword', value: niche, status: 'active', lastCrawledAt: new Date() } },
        { upsert: true, new: true }
      );

      postDocs.push({
        sourceId: src._id.toString(),
        workspaceId,
        platform: post.platform,
        externalId: post.externalId || post.id || `${post.platform}-${Date.now()}-${Math.random()}`,
        url: post.url || '',
        content: post.content || post.title || '',
        title: post.title,
        author: post.author || { username: 'unknown' },
        metrics: { likes, comments, shares: post.metrics?.shares || 0, views, engagementRate: 0 },
        publishedAt: post.publishedAt,
        aiMetadata: post.aiMetadata,
      });

      if (post.aiMetadata?.hooks?.length) {
        for (const hook of post.aiMetadata.hooks) {
          hookDocs.push({ workspaceId, sourcePostId: src._id.toString(), platform: post.platform, type: 'hook', content: hook, score: qualityScore, topics: post.aiMetadata.topics || [] });
        }
      }
      if (post.aiMetadata?.painPoints?.length) {
        for (const pp of post.aiMetadata.painPoints) {
          hookDocs.push({ workspaceId, sourcePostId: src._id.toString(), platform: post.platform, type: 'pain_point', content: pp, score: qualityScore, topics: post.aiMetadata.topics || [] });
        }
      }
    }

    if (postDocs.length > 0) {
      await ListeningPostModel.insertMany(postDocs, { ordered: false }).catch(() => {});
    }
    if (hookDocs.length > 0) {
      await ListeningHookModel.insertMany(hookDocs, { ordered: false }).catch(() => {});
    }

    // Compute trends
    const { TrendEngineService } = await import('./trend-engine.service').catch(() => ({ TrendEngineService: null }));
    let trendsCount = 0;
    if (TrendEngineService) {
      try {
        trendsCount = await (TrendEngineService as any).computeTrends(workspaceId, niche);
      } catch { /* non-fatal */ }
    }

    await SyncStatusService.complete(workspaceId, trendsCount);
  }
}

/**
 * Submit an OpenAI batch job and persist the job record to MongoDB so the
 * recovery service can collect results later — even after a server restart.
 *
 * Returns the batchId on success, null if the Batch API is unavailable.
 */
export async function submitAndPersistBatch(
  workspaceId: string,
  niche: string,
  runId: string,
  analysisInputs: Array<{ content: string; platform: string }>,
  postSnapshots: any[]
): Promise<string | null> {
  const { BatchExtractionService } = await import('./batch-extraction.service');
  if (!BatchExtractionService.isAvailable() || analysisInputs.length < 20) return null;

  try {
    const { getOpenAIClient } = await import('../../openai-client');
    const { toFile } = await import('openai');

    const SYSTEM_PROMPT = 'You are an expert social media strategist and audience researcher. Analyze the social post and respond ONLY with strict JSON.';
    const lines = analysisInputs.map((it, i) => JSON.stringify({
      custom_id: `post-${i}`,
      method: 'POST',
      url: '/v1/chat/completions',
      body: {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Analyze this real post from ${it.platform}. Respond ONLY with JSON:\n{"sentimentScore":number -1 to 1,"emotions":["up to 3"],"hooks":["up to 2"],"painPoints":["up to 3"],"topics":["up to 3 Title Case"],"hashtags":["up to 4 no #"]}\n\nCONTENT:\n${(it.content || '').trim().substring(0, 1500)}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
      },
    }));

    const openai = getOpenAIClient();
    const file = await openai.files.create({
      file: await toFile(Buffer.from(lines.join('\n'), 'utf-8'), 'sl-batch.jsonl'),
      purpose: 'batch',
    });
    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
      metadata: { feature: 'social_listening.bg_refresh', workspaceId, niche },
    });

    // Persist the job so recovery service can collect it
    await ListeningBatchJobModel.create({
      workspaceId,
      niche,
      runId,
      batchId: batch.id,
      status: 'pending',
      analysisInputs,
      postSnapshots,
      submittedAt: new Date(),
    });

    // Also store in SyncStatus so user-triggered interactive sync can cancel it
    await SyncStatusService.setBatchId(workspaceId, batch.id);

    // Record the batch submission in AIUsageEvent so it shows on the usage dashboard.
    // We don't have real token counts yet (batch not processed) — we record the
    // submission as 0 tokens with a note, and record actual tokens when finalized.
    try {
      const { AIUsageEvent } = await import('../../services/aiUsageTracker');
      void AIUsageEvent.create({
        feature: 'social_listening.batch_submitted',
        provider: 'openai',
        model: 'gpt-4o-mini',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cachedTokens: 0,
        estimated: true,
        callType: 'batch-submitted' as any,
        workspaceId,
        createdAt: new Date(),
      }).catch(() => {});
    } catch { /* non-fatal */ }

    console.log(`[SocialListening:BatchRecovery] Submitted batch ${batch.id} (${analysisInputs.length} posts) for workspace ${workspaceId} — recovery job will finalize it.`);
    slog('batch-recovery.submitted', { batchId: batch.id, workspaceId, niche, inputs: analysisInputs.length });

    return batch.id;
  } catch (err) {
    console.warn(`[SocialListening:BatchRecovery] Batch submit failed, will use sync path:`, (err as Error).message);
    slogError('batch-recovery.submit-error', err, { workspaceId, niche });
    return null;
  }
}
