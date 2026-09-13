/**
 * Focused tests for the FORCED video-editor turn robustness fix and the
 * chat-driven edit turn's project/source reuse + progress contract.
 *
 * Covers:
 *  - the pure deterministic fallback intent (`buildFallbackVideoIntent`) yields
 *    ≥1 executable operation for a clear edit instruction and returns null for a
 *    non-edit message (Problem 3a);
 *  - the Intent_Router uses that fallback on a forced turn when the LLM stage
 *    yields nothing usable (extraction empty / failing provider);
 *  - the chat-driven turn reuses an existing project + source on a follow-up and
 *    streams stage-derived progress with a final rendered result (Problem 2).
 *
 * Framework: vitest.
 */

import fs from 'fs';

import { describe, it, expect, vi } from 'vitest';

import {
  buildFallbackVideoIntent,
  detectTargetAspectRatio,
  computeRequiresDeterministicEditing,
} from '../server/features/video-editor/services/intent-extraction.logic';
import { IntentRouterService } from '../server/features/video-editor/services/intent-router.service';
import { runChatVideoEditTurn } from '../server/features/video-editor/services/chat-video-edit.service';

// ---------------------------------------------------------------------------
// buildFallbackVideoIntent (pure)
// ---------------------------------------------------------------------------

describe('buildFallbackVideoIntent', () => {
  it('yields ≥1 executable deterministic change for a clear reframe instruction', () => {
    const intent = buildFallbackVideoIntent('reframe this to 9:16 for reels');
    expect(intent).not.toBeNull();
    expect(intent!.requestedChanges.length).toBeGreaterThanOrEqual(1);
    expect(intent!.requiresDeterministicEditing).toBe(true);
    expect(intent!.targetAspectRatio).toBe('9:16');
  });

  it('splits a compound instruction into multiple recognised changes', () => {
    const intent = buildFallbackVideoIntent('trim the first 5 seconds and reframe to 9:16');
    expect(intent).not.toBeNull();
    expect(intent!.requestedChanges.length).toBeGreaterThanOrEqual(2);
    expect(computeRequiresDeterministicEditing(intent!.requestedChanges)).toBe(true);
  });

  it('returns null for a message with no recognisable edit clause', () => {
    expect(buildFallbackVideoIntent('what do you think of this video?')).toBeNull();
    expect(buildFallbackVideoIntent('')).toBeNull();
  });

  it('detects common aspect-ratio phrases', () => {
    expect(detectTargetAspectRatio('make it vertical')).toBe('9:16');
    expect(detectTargetAspectRatio('square please')).toBe('1:1');
    expect(detectTargetAspectRatio('widescreen 16:9')).toBe('16:9');
    expect(detectTargetAspectRatio('no ratio here')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// IntentRouterService forced-turn fallback
// ---------------------------------------------------------------------------

describe('IntentRouterService forced video-editor fallback', () => {
  it('falls back to a deterministic intent when the LLM extraction yields no candidates', async () => {
    // A model that returns junk → parseCandidates() yields [] → the pure core
    // would clarify. On a forced turn the deterministic fallback must rescue it.
    const aiService = { generateText: vi.fn().mockResolvedValue('not json at all') };
    const router = new IntentRouterService({ aiService });

    const result = await router.classify({
      message: 'trim the first 5 seconds and reframe to 9:16',
      hasVideo: true,
      forcedTool: 'video_editor',
    });

    expect(result.status).toBe('classified');
    if (result.status === 'classified') {
      expect(result.intent.requestedChanges.length).toBeGreaterThanOrEqual(1);
      expect(result.intent.requiresDeterministicEditing).toBe(true);
    }
  });

  it('falls back when the provider call FAILS on a forced turn (honest, no dead-end)', async () => {
    const aiService = {
      generateText: vi.fn().mockRejectedValue(new Error('provider not configured')),
    };
    const router = new IntentRouterService({ aiService });

    const result = await router.classify({
      message: 'reframe to 9:16',
      hasVideo: true,
      forcedTool: 'video_editor',
    });

    expect(result.status).toBe('classified');
  });

  it('still clarifies for a forced turn with no recognisable edit clause', async () => {
    const aiService = { generateText: vi.fn().mockResolvedValue('{"candidates":[]}') };
    const router = new IntentRouterService({ aiService });

    const result = await router.classify({
      message: 'hello there',
      hasVideo: true,
      forcedTool: 'video_editor',
    });

    expect(result.status).toBe('clarification');
  });
});

// ---------------------------------------------------------------------------
// runChatVideoEditTurn — reuse project+source, stream progress, render result
// ---------------------------------------------------------------------------

describe('runChatVideoEditTurn', () => {
  const source = {
    sourceId: 'src-1',
    storageKey: 'video-editor/p1/sources/x.mp4',
    fileName: 'src-1.mp4',
    durationMs: 30_000,
  };

  function baseDeps() {
    return {
      store: {
        findById: vi.fn().mockResolvedValue({
          projectId: 'p1',
          userId: 'u1',
          workspaceId: 'w1',
          name: 'x',
          activeVersionId: 'v0',
          retentionPolicyAllowsSourceDeletion: false,
          status: 'active' as const,
        }),
      } as any,
      getSourceForEdit: vi.fn().mockResolvedValue(source),
      intentRouter: {
        classify: vi.fn().mockResolvedValue({
          status: 'classified',
          usage: [],
          intent: {
            action: 'VIDEO_EDIT',
            inputAssets: [],
            targetPlatform: null,
            targetAspectRatio: '9:16',
            targetDurationMs: null,
            editingStyle: null,
            requestedChanges: ['reframe to 9:16'],
            protectedElements: [],
            brandRequirements: null,
            audioRequirements: null,
            captionRequirements: null,
            outputRequirements: null,
            qualityRequirements: null,
            confidence: 1,
            requiresGenerativeAI: false,
            requiresDeterministicEditing: true,
          },
        }),
      } as any,
      versionManager: {
        createVersion: vi.fn().mockResolvedValue({
          ok: true,
          version: { versionId: 'v1', parentVersionId: 'v0', timelineId: 't1' },
        }),
      } as any,
      planner: {
        plan: vi.fn().mockResolvedValue({
          plan: {
            projectGoal: 'reframe',
            target: {
              platform: null,
              aspectRatio: '9:16',
              maxDurationMs: null,
              recommendedDurationMs: null,
              exportProfile: '',
            },
            brand: null,
            operations: [
              {
                sequenceIndex: 0,
                type: 'deterministic',
                kind: 'aspect',
                range: { startMs: 0, endMs: 30_000 },
                preservationConstraints: [],
                status: 'executable',
                params: { source: 'reframe to 9:16' },
              },
              {
                sequenceIndex: 1,
                type: 'render',
                kind: 'render',
                range: { startMs: 0, endMs: 30_000 },
                preservationConstraints: [],
                status: 'executable',
                params: { source: 'final_render' },
              },
            ],
          },
          reasoning: { projectGoal: 'reframe', editingStyle: null, usedLLM: false },
          usage: [],
          warnings: [],
        }),
      } as any,
      deterministicEditor: {
        execute: vi.fn().mockResolvedValue({
          artifact: { artifactId: 'art-1' },
          storageKey: 'video-editor/p1/renders/out.mp4',
          command: {} as any,
        }),
      } as any,
    };
  }

  it('reuses the existing project + newest source and renders a deterministic reframe', async () => {
    const deps = baseDeps();
    const progress: string[] = [];

    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'reframe to 9:16',
        onProgress: (p) => progress.push(p.phase),
      },
      deps,
    );

    // Source resolved WITHOUT a new upload (reuse contract).
    expect(deps.getSourceForEdit).toHaveBeenCalledWith('p1', null);

    // A real deterministic aspect operation was executed with concrete params.
    expect(deps.deterministicEditor.execute).toHaveBeenCalledTimes(1);
    const call = deps.deterministicEditor.execute.mock.calls[0][0];
    expect(call.operation.kind).toBe('aspect');
    expect(call.operation.params.aspectRatio).toBe('9:16');
    expect(call.operation.params.width).toBe(1080);
    expect(call.operation.params.height).toBe(1920);
    expect(call.sourceStorageKey).toBe(source.storageKey);

    // Streamed stage-derived progress reached completion with a rendered result.
    expect(progress).toContain('planning');
    expect(progress).toContain('rendering');
    expect(progress).toContain('complete');
    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.artifactId).toBe('art-1');
      expect(result.versionId).toBe('v1');
    }
  });

  it('surfaces a clarification (plain message, no render) when intent is unclear', async () => {
    const deps = baseDeps();
    deps.intentRouter.classify = vi
      .fn()
      .mockResolvedValue({ status: 'clarification', reason: 'unclear', maxConfidence: 0, usage: [] });

    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'hmm' },
      deps,
    );

    expect(result.outcome).toBe('clarification');
    expect(deps.deterministicEditor.execute).not.toHaveBeenCalled();
  });

  it('reports needs_async (no fabricated result) for a generative-only plan', async () => {
    const deps = baseDeps();
    // Track 3 wiring: a Google key may be configured in the env, so the driver
    // would route this generative-only turn to the GENERATIVE service. Inject a
    // stub that degrades HONESTLY (needs_async) so the test asserts the honest
    // outcome without any real provider call (No-Mock, Req 23) — the driver must
    // surface the service's honest degrade, never fabricate a result.
    (deps as any).generativeVideo = {
      editVideo: vi.fn().mockResolvedValue({
        outcome: 'needs_async',
        kind: 'object_removal',
        message: 'This edit needs the background AI pipeline.',
      }),
      generateVideo: vi.fn(),
    };
    deps.planner.plan = vi.fn().mockResolvedValue({
      plan: {
        projectGoal: 'remove',
        target: { platform: null, aspectRatio: null, maxDurationMs: null, recommendedDurationMs: null, exportProfile: '' },
        brand: null,
        operations: [
          {
            sequenceIndex: 0,
            type: 'generative',
            kind: 'object_removal',
            range: { startMs: 0, endMs: 30_000 },
            preservationConstraints: [],
            status: 'executable',
            params: { source: 'remove the person' },
          },
        ],
      },
      reasoning: { projectGoal: 'remove', editingStyle: null, usedLLM: false },
      usage: [],
      warnings: [],
    });

    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'remove the person' },
      deps,
    );

    expect(result.outcome).toBe('needs_async');
    expect(deps.deterministicEditor.execute).not.toHaveBeenCalled();
    // The generative edit path was attempted, and its honest degrade was surfaced.
    expect((deps as any).generativeVideo.editVideo).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// runChatVideoEditTurn — multi-op chaining + best-effort (non-fatal) captions
// ---------------------------------------------------------------------------

describe('runChatVideoEditTurn — chained filter + captions', () => {
  const source = {
    sourceId: 'src-1',
    storageKey: 'video-editor/p1/sources/x.mp4',
    fileName: 'src-1.mp4',
    durationMs: 30_000,
  };

  /** An intent carrying a filter (colour grade) + caption request. */
  function intentClassify() {
    return {
      status: 'classified',
      usage: [],
      intent: {
        action: 'VIDEO_EDIT',
        inputAssets: [],
        targetPlatform: null,
        targetAspectRatio: '9:16',
        targetDurationMs: null,
        editingStyle: null,
        requestedChanges: ['apply a cinematic filter', 'add captions'],
        protectedElements: [],
        brandRequirements: null,
        audioRequirements: null,
        captionRequirements: null,
        outputRequirements: null,
        qualityRequirements: null,
        confidence: 1,
        requiresGenerativeAI: false,
        requiresDeterministicEditing: true,
      },
    };
  }

  /** A plan operation helper. */
  function op(
    sequenceIndex: number,
    type: string,
    kind: string,
    status = 'executable',
  ) {
    return {
      sequenceIndex,
      type,
      kind,
      range: { startMs: 0, endMs: 30_000 },
      preservationConstraints: [],
      status,
      params: {},
    };
  }

  /**
   * Base deps for a chained turn. `planOps` sets the planner operations, and the
   * deterministic editor returns DISTINCT artifact ids/keys per call so chaining
   * (op2 reads op1's output key) can be asserted.
   */
  function chainedDeps(
    planOps: any[],
    transcriberImpl: () => Promise<any[]>,
  ) {
    let execCall = 0;
    return {
      store: {
        findById: vi.fn().mockResolvedValue({
          projectId: 'p1',
          userId: 'u1',
          workspaceId: 'w1',
          name: 'x',
          activeVersionId: 'v0',
          targetPlatform: null,
          retentionPolicyAllowsSourceDeletion: false,
          status: 'active' as const,
        }),
      } as any,
      getSourceForEdit: vi.fn().mockResolvedValue(source),
      intentRouter: { classify: vi.fn().mockResolvedValue(intentClassify()) } as any,
      versionManager: {
        createVersion: vi.fn().mockResolvedValue({
          ok: true,
          version: { versionId: 'v1', parentVersionId: 'v0', timelineId: 't1' },
        }),
      } as any,
      planner: {
        plan: vi.fn().mockResolvedValue({
          plan: {
            projectGoal: 'grade+caption',
            target: {
              platform: null,
              aspectRatio: '9:16',
              maxDurationMs: null,
              recommendedDurationMs: null,
              exportProfile: '',
            },
            brand: null,
            operations: planOps,
          },
          reasoning: { projectGoal: 'grade+caption', editingStyle: null, usedLLM: false },
          usage: [],
          warnings: [],
        }),
      } as any,
      deterministicEditor: {
        execute: vi.fn().mockImplementation(async () => {
          execCall += 1;
          return {
            artifact: { artifactId: `art-${execCall}` },
            storageKey: `video-editor/p1/renders/out-${execCall}.mp4`,
            command: {} as any,
          };
        }),
      } as any,
      transcriber: { transcribeSource: vi.fn().mockImplementation(transcriberImpl) } as any,
      captionRenderer: { renderCaptions: vi.fn() } as any,
      storage: {} as any,
      artifactRepository: {
        createArtifact: vi.fn().mockResolvedValue({
          artifact: { artifactId: 'art-caption' },
          storageKey: 'video-editor/p1/renders/captioned.mp4',
          url: 'https://x/captioned.mp4',
        }),
      } as any,
    };
  }

  it('(a) filter + caption + render, 2 segments → rendered, BOTH ops executed, chained', async () => {
    // The caption path is exercised via renderAndPersistCaptions, which reads the
    // source bytes through the injected storage + renderer. Stub those so no
    // ffmpeg/network runs and we can assert the caption render happened.
    // The stub must write a non-empty file to the caption renderer's outputPath
    // so renderAndPersistCaptions' empty-output guard passes and it persists the
    // single artifact (mirrors the real ffmpeg burn-in writing an output file).
    const captionRenderer = {
      renderCaptions: vi.fn().mockImplementation(async (req: { outputPath: string }) => {
        await fs.promises.writeFile(req.outputPath, Buffer.from('rendered-captions'));
        return {};
      }),
    };
    const storage = {
      downloadFile: vi.fn().mockResolvedValue({ buffer: Buffer.from('bytes') }),
    };

    const deps = chainedDeps(
      [op(0, 'deterministic', 'filter'), op(1, 'deterministic', 'caption'), op(2, 'render', 'render')],
      async () => [
        { startMs: 0, endMs: 1000, text: 'hello' },
        { startMs: 1000, endMs: 2000, text: 'world' },
      ],
    );
    deps.captionRenderer = captionRenderer as any;
    deps.storage = storage as any;

    const progress: string[] = [];
    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'apply a cinematic filter and add captions',
        onProgress: (p) => progress.push(p.phase),
      },
      deps,
    );

    // The filter deterministic op ran once.
    expect(deps.deterministicEditor.execute).toHaveBeenCalledTimes(1);
    const filterCall = deps.deterministicEditor.execute.mock.calls[0][0];
    expect(filterCall.operation.kind).toBe('filter');
    // The filter read the ORIGINAL source.
    expect(filterCall.sourceStorageKey).toBe(source.storageKey);

    // The caption transcription read the CHAINED (filter output) key, not the
    // original — proving the caption sits on top of the graded intermediate.
    const txCall = deps.transcriber.transcribeSource.mock.calls[0][0];
    expect(txCall.storageKey).toBe('video-editor/p1/renders/out-1.mp4');

    // The caption burn-in ran (renderCaptions invoked) and produced the final art.
    expect(captionRenderer.renderCaptions).toHaveBeenCalledTimes(1);
    expect(deps.artifactRepository.createArtifact).toHaveBeenCalledTimes(1);

    // Progress streamed transcribing → complete.
    expect(progress).toContain('rendering');
    expect(progress).toContain('transcribing');
    expect(progress).toContain('complete');

    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.artifactId).toBe('art-caption');
      expect(result.kind).toBe('caption');
      expect(result.versionId).toBe('v1');
    }
  });

  it('(b) filter + caption, transcriber THROWS → rendered (filter applied), skip note, NOT error', async () => {
    const deps = chainedDeps(
      [op(0, 'deterministic', 'filter'), op(1, 'deterministic', 'caption')],
      async () => {
        throw new Error('whisper exploded');
      },
    );

    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'filter and captions' },
      deps,
    );

    // The filter still rendered its artifact.
    expect(deps.deterministicEditor.execute).toHaveBeenCalledTimes(1);
    // Captions were NOT burned in (best-effort skip on transcription failure).
    expect(deps.captionRenderer.renderCaptions).not.toHaveBeenCalled();

    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.artifactId).toBe('art-1');
      expect(result.kind).toBe('filter');
      expect(result.summary.toLowerCase()).toContain('captions were skipped');
    }
  });

  it('(c) caption-only: transcriber throws → error; returns [] → clarification', async () => {
    // Hard transcription failure on an all-caption turn → honest error.
    const throwDeps = chainedDeps([op(0, 'deterministic', 'caption')], async () => {
      throw new Error('whisper down');
    });
    const errResult = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'add captions' },
      throwDeps,
    );
    expect(errResult.outcome).toBe('error');
    expect(throwDeps.deterministicEditor.execute).not.toHaveBeenCalled();
    expect(throwDeps.captionRenderer.renderCaptions).not.toHaveBeenCalled();

    // No speech on an all-caption turn → honest clarification (never fabricated).
    const emptyDeps = chainedDeps([op(0, 'deterministic', 'caption')], async () => []);
    const clarifyResult = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'add captions' },
      emptyDeps,
    );
    expect(clarifyResult.outcome).toBe('clarification');
    expect(emptyDeps.captionRenderer.renderCaptions).not.toHaveBeenCalled();
  });

  it('(e) DEDUPES duplicate deterministic kinds: [filter,filter,aspect,aspect,caption] → 2 pixel ops (filter→aspect), chained, then captions', async () => {
    // The stubbed caption renderer must write a non-empty output file so
    // renderAndPersistCaptions' empty-output guard passes and it persists the art.
    const captionRenderer = {
      renderCaptions: vi.fn().mockImplementation(async (req: { outputPath: string }) => {
        await fs.promises.writeFile(req.outputPath, Buffer.from('rendered-captions'));
        return {};
      }),
    };
    const storage = {
      downloadFile: vi.fn().mockResolvedValue({ buffer: Buffer.from('bytes') }),
    };

    const deps = chainedDeps(
      [
        op(0, 'deterministic', 'filter'),
        op(1, 'deterministic', 'filter'),
        op(2, 'deterministic', 'aspect'),
        op(3, 'deterministic', 'aspect'),
        op(4, 'deterministic', 'caption'),
        op(5, 'render', 'render'),
      ],
      async () => [
        { startMs: 0, endMs: 1000, text: 'hello' },
        { startMs: 1000, endMs: 2000, text: 'world' },
      ],
    );
    deps.captionRenderer = captionRenderer as any;
    deps.storage = storage as any;

    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'apply a cinematic filter, reframe to 9:16 and add captions',
      },
      deps,
    );

    // Duplicate filter + duplicate aspect collapse to ONE each → exactly TWO
    // deterministic pixel executions (the duplicates never re-encoded the video).
    expect(deps.deterministicEditor.execute).toHaveBeenCalledTimes(2);

    const call1 = deps.deterministicEditor.execute.mock.calls[0][0];
    const call2 = deps.deterministicEditor.execute.mock.calls[1][0];

    // First occurrence of each kind is kept, in planner order: filter then aspect.
    expect(call1.operation.kind).toBe('filter');
    expect(call2.operation.kind).toBe('aspect');

    // Chained: the filter reads the ORIGINAL source; the aspect reads the
    // filter's output key (op2 runs on op1's render, not the original).
    expect(call1.sourceStorageKey).toBe(source.storageKey);
    expect(call2.sourceStorageKey).toBe('video-editor/p1/renders/out-1.mp4');

    // Captions then burned on top of the reframed intermediate (out-2), as the
    // single last step.
    const txCall = deps.transcriber.transcribeSource.mock.calls[0][0];
    expect(txCall.storageKey).toBe('video-editor/p1/renders/out-2.mp4');
    expect(captionRenderer.renderCaptions).toHaveBeenCalledTimes(1);

    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.artifactId).toBe('art-caption');
      expect(result.kind).toBe('caption');
    }
  });

  it('(d) filter only → rendered (unchanged single-op behaviour)', async () => {
    const deps = chainedDeps([op(0, 'deterministic', 'filter'), op(1, 'render', 'render')], async () => []);

    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'apply a cinematic look' },
      deps,
    );

    expect(deps.deterministicEditor.execute).toHaveBeenCalledTimes(1);
    expect(deps.transcriber.transcribeSource).not.toHaveBeenCalled();
    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.artifactId).toBe('art-1');
      expect(result.kind).toBe('filter');
    }
  });

  // -------------------------------------------------------------------------
  // The streamed plan checklist must reflect REAL execution.
  //
  // A tick in the chat card means "this step really ran and produced output".
  // The driver therefore flips a step's status to `done` at the moment its op
  // finishes — so the checklist advances live instead of sitting at
  // `executable` for the whole turn (which is what made it useless before).
  //
  // The driver emits ONE live array for the whole turn (the SSE relay serialises
  // it per event), so these tests snapshot each emit at delivery time — exactly
  // what the wire sees.
  // -------------------------------------------------------------------------

  /** Snapshot the streamed plan at delivery time (kind/label/status only). */
  function snapshotPlan(plan: any[] | undefined) {
    return (plan ?? []).map((s) => ({ kind: s.kind, label: s.label, status: s.status }));
  }

  it('(f) ticks each step AS its op finishes: an earlier step is done while a later one is still executable', async () => {
    const captionRenderer = {
      renderCaptions: vi.fn().mockImplementation(async (req: { outputPath: string }) => {
        await fs.promises.writeFile(req.outputPath, Buffer.from('rendered-captions'));
        return {};
      }),
    };
    const storage = {
      downloadFile: vi.fn().mockResolvedValue({ buffer: Buffer.from('bytes') }),
    };

    const deps = chainedDeps(
      [
        op(0, 'deterministic', 'filter'),
        op(1, 'deterministic', 'aspect'),
        op(2, 'deterministic', 'caption'),
      ],
      async () => [
        { startMs: 0, endMs: 1000, text: 'hello' },
        { startMs: 1000, endMs: 2000, text: 'world' },
      ],
    );
    deps.captionRenderer = captionRenderer as any;
    deps.storage = storage as any;

    const emits: Array<{ percent: number; plan: ReturnType<typeof snapshotPlan> }> = [];
    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'apply a cinematic filter, reframe to 9:16 and add captions',
        onProgress: (p) => emits.push({ percent: p.percent, plan: snapshotPlan(p.plan) }),
      },
      deps,
    );

    expect(result.outcome).toBe('rendered');

    const withPlan = emits.filter((e) => e.plan.length > 0);
    expect(withPlan.length).toBeGreaterThan(1);

    // Shape invariant: order and length of `plan` never change across emits.
    for (const e of withPlan) {
      expect(e.plan.map((s) => s.kind)).toEqual(['filter', 'aspect', 'caption']);
    }

    // The transition itself: at least one emit shows an earlier step retired
    // while a later one is still queued.
    const mid = withPlan.filter(
      (e) => e.plan[0].status === 'done' && e.plan[2].status === 'executable',
    );
    expect(mid.length).toBeGreaterThan(0);
    // ...and while the filter was done the aspect step had not been ticked yet.
    expect(mid.some((e) => e.plan[1].status === 'executable')).toBe(true);

    // The final emit has EVERY executed step done.
    const last = withPlan[withPlan.length - 1];
    expect(last.percent).toBe(100);
    expect(last.plan.map((s) => s.status)).toEqual(['done', 'done', 'done']);
  });

  it('(g) a generative op that DEGRADES leaves its step un-ticked (only the real render ticks)', async () => {
    // Generative runs inline only when a Google key is configured; the provider
    // itself is injected, so no paid call happens.
    vi.stubEnv('GEMINI_IMAGE_API_KEY', 'test-key-not-used');
    try {
      const deps: any = chainedDeps(
        [op(0, 'deterministic', 'filter'), op(1, 'generative', 'object_removal')],
        async () => [],
      );
      // The provider returns NO video → honest degrade, no artifact.
      deps.generativeVideo = {
        editVideo: vi.fn().mockResolvedValue({
          outcome: 'needs_async',
          kind: 'object_removal',
          message: 'The AI edit model did not return an edited video this time.',
        }),
        generateVideo: vi.fn(),
      };
      // Keep the localization pre-pass and the daily budget out of the way (no
      // network, no Redis): whole-clip fallback and an allowed budget.
      deps.editLocalizer = { localize: vi.fn().mockResolvedValue({ kind: 'whole-clip' }) };
      deps.generativeBudget = {
        tryConsume: vi
          .fn()
          .mockResolvedValue({ allowed: true, limit: 0, used: 0, resetsInMs: 0 }),
      };

      const emits: Array<ReturnType<typeof snapshotPlan>> = [];
      const result = await runChatVideoEditTurn(
        {
          projectId: 'p1',
          workspaceId: 'w1',
          userId: 'u1',
          message: 'apply a cinematic filter and remove the guy',
          onProgress: (p) => emits.push(snapshotPlan(p.plan)),
        },
        deps,
      );

      // The provider was really asked and really returned nothing usable.
      expect(deps.generativeVideo.editVideo).toHaveBeenCalledTimes(1);
      expect(result.outcome).toBe('rendered');

      const withPlan = emits.filter((p) => p.length > 0);
      for (const plan of withPlan) {
        expect(plan.map((s) => s.kind)).toEqual(['filter', 'object_removal']);
      }

      // The deterministic filter really rendered → ticked. The generative step
      // degraded → NOT ticked, in every emit including the last.
      const last = withPlan[withPlan.length - 1];
      expect(last[0].status).toBe('done');
      expect(last[1].status).toBe('executable');
      expect(withPlan.every((plan) => plan[1].status !== 'done')).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ---------------------------------------------------------------------------
// runChatVideoEditTurn — SEGMENT-SCOPED generative editing (trim → edit → splice)
// ---------------------------------------------------------------------------

describe('runChatVideoEditTurn — segment-scoped generative edit', () => {
  const source = {
    sourceId: 'src-1',
    storageKey: 'video-editor/p1/sources/x.mp4',
    fileName: 'src-1.mp4',
    durationMs: 30_000,
  };

  /** A generative plan (object_removal) — the driver routes it to editVideo. */
  function generativePlan() {
    return {
      plan: {
        projectGoal: 'remove',
        target: {
          platform: null,
          aspectRatio: null,
          maxDurationMs: null,
          recommendedDurationMs: null,
          exportProfile: '',
        },
        brand: null,
        operations: [
          {
            sequenceIndex: 0,
            type: 'generative',
            kind: 'object_removal',
            range: { startMs: 0, endMs: 30_000 },
            preservationConstraints: [],
            status: 'executable',
            params: { source: 'remove the guy' },
          },
        ],
      },
      reasoning: { projectGoal: 'remove', editingStyle: null, usedLLM: false },
      usage: [],
      warnings: [],
    };
  }

  function baseDeps() {
    let execCall = 0;
    return {
      store: {
        findById: vi.fn().mockResolvedValue({
          projectId: 'p1',
          userId: 'u1',
          workspaceId: 'w1',
          name: 'x',
          activeVersionId: 'v0',
          targetPlatform: null,
          retentionPolicyAllowsSourceDeletion: false,
          status: 'active' as const,
        }),
      } as any,
      getSourceForEdit: vi.fn().mockResolvedValue(source),
      intentRouter: {
        classify: vi.fn().mockResolvedValue({
          status: 'classified',
          usage: [],
          intent: {
            action: 'VIDEO_EDIT',
            inputAssets: [],
            targetPlatform: null,
            targetAspectRatio: null,
            targetDurationMs: null,
            editingStyle: null,
            requestedChanges: ['remove the guy'],
            protectedElements: [],
            brandRequirements: null,
            audioRequirements: null,
            captionRequirements: null,
            outputRequirements: null,
            qualityRequirements: null,
            confidence: 1,
            requiresGenerativeAI: true,
            requiresDeterministicEditing: false,
          },
        }),
      } as any,
      versionManager: {
        createVersion: vi.fn().mockResolvedValue({
          ok: true,
          version: { versionId: 'v1', parentVersionId: 'v0', timelineId: 't1' },
        }),
      } as any,
      planner: { plan: vi.fn().mockResolvedValue(generativePlan()) } as any,
      deterministicEditor: {
        // Distinct artifact per call so segment/head/tail are traceable.
        execute: vi.fn().mockImplementation(async () => {
          execCall += 1;
          return {
            artifact: { artifactId: `cut-${execCall}` },
            storageKey: `video-editor/p1/renders/cut-${execCall}.mp4`,
            command: {} as any,
          };
        }),
        executeAssembly: vi.fn().mockResolvedValue({
          artifact: { artifactId: 'spliced-1' },
          storageKey: 'video-editor/p1/renders/spliced-1.mp4',
          command: {} as any,
        }),
      } as any,
      generativeVideo: {
        editVideo: vi.fn().mockResolvedValue({
          outcome: 'rendered',
          artifactId: 'edited-seg-1',
          storageKey: 'video-editor/p1/generated/edited-seg-1.mp4',
          mimeType: 'video/mp4',
          provider: 'gemini-omni-flash',
          model: 'gemini-omni-flash',
        }),
        generateVideo: vi.fn(),
      } as any,
    };
  }

  it('cuts the segment, edits ONLY the segment, and splices it back (trim + editVideo + assembly)', async () => {
    const deps = baseDeps();

    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'remove the guy from 0:05 to 0:10' },
      deps,
    );

    // The segment was cut via the deterministic trim op with the PARSED range.
    const trimCalls = deps.deterministicEditor.execute.mock.calls
      .map((c: any[]) => c[0])
      .filter((req: any) => req.operation?.kind === 'trim');
    const segmentTrim = trimCalls.find(
      (req: any) => req.operation.params.startMs === 5_000 && req.operation.params.endMs === 10_000,
    );
    expect(segmentTrim).toBeTruthy();
    // The segment trim read the CURRENT (original) artifact.
    expect(segmentTrim.sourceStorageKey).toBe(source.storageKey);

    // Head (0..5000) and tail (10000..30000) trims were also produced for the splice.
    expect(trimCalls.some((r: any) => r.operation.params.startMs === 0 && r.operation.params.endMs === 5_000)).toBe(true);
    expect(trimCalls.some((r: any) => r.operation.params.startMs === 10_000 && r.operation.params.endMs === 30_000)).toBe(true);

    // Omni Flash edited ONLY the cut segment (not the whole clip).
    expect(deps.generativeVideo.editVideo).toHaveBeenCalledTimes(1);
    const editCall = deps.generativeVideo.editVideo.mock.calls[0][0];
    expect(editCall.sourceStorageKey).toBe('video-editor/p1/renders/cut-1.mp4');
    expect(editCall.sourceStorageKey).not.toBe(source.storageKey);

    // The edited segment was spliced back into the timeline via the assembly concat.
    expect(deps.deterministicEditor.executeAssembly).toHaveBeenCalledTimes(1);
    const asmCall = deps.deterministicEditor.executeAssembly.mock.calls[0][0];
    // Three ordered pieces: head, edited segment, tail.
    expect(asmCall.sources).toHaveLength(3);
    expect(asmCall.sources[1].storageKey).toBe('video-editor/p1/generated/edited-seg-1.mp4');

    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.artifactId).toBe('spliced-1');
      expect(result.summary).toContain('0:05\u20130:10');
    }
  });

  // Google meters the generative-video daily quota per API KEY, so the
  // workspace's own key MUST reach editVideo — otherwise every tenant shares the
  // single shared-key pool and one heavy workspace starves the whole app.
  it('forwards the workspace Google key to Omni on the segment-scoped path', async () => {
    const deps = baseDeps();

    await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'remove the guy from 0:05 to 0:10',
        apiKey: 'ws-own-google-key',
      },
      deps,
    );

    expect(deps.generativeVideo.editVideo).toHaveBeenCalledTimes(1);
    expect(deps.generativeVideo.editVideo.mock.calls[0][0].apiKey).toBe('ws-own-google-key');
  });

  it('forwards the workspace Google key to Omni on the whole-clip path', async () => {
    const deps = baseDeps();

    await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'restyle the whole video',
        apiKey: 'ws-own-google-key',
      },
      deps,
    );

    expect(deps.generativeVideo.editVideo).toHaveBeenCalledTimes(1);
    expect(deps.generativeVideo.editVideo.mock.calls[0][0].apiKey).toBe('ws-own-google-key');
  });

  // Backwards compatibility: workspaces without their own key must keep working
  // (the service falls back to the shared env key exactly as before).
  it('omits apiKey when the workspace has no key of its own (env-key fallback)', async () => {
    const deps = baseDeps();

    await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'restyle the whole video' },
      deps,
    );

    expect(deps.generativeVideo.editVideo).toHaveBeenCalledTimes(1);
    expect(deps.generativeVideo.editVideo.mock.calls[0][0].apiKey).toBeUndefined();
  });

  it('does NOT splice when the segment edit returns no video (honest degrade)', async () => {
    const deps = baseDeps();
    deps.generativeVideo.editVideo = vi.fn().mockResolvedValue({
      outcome: 'needs_async',
      kind: 'object_removal',
      message: 'The AI edit model did not return an edited video this time.',
    });

    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'remove the guy from 0:05 to 0:10' },
      deps,
    );

    // The segment was still cut and sent to the model...
    expect(deps.generativeVideo.editVideo).toHaveBeenCalledTimes(1);
    // ...but the honest degrade means NO splice (No-Mock, Req 23).
    expect(deps.deterministicEditor.executeAssembly).not.toHaveBeenCalled();
    expect(result.outcome).toBe('needs_async');
  });

  it('sends the WHOLE clip (no trim/assembly) for a genuinely global edit', async () => {
    const deps = baseDeps();

    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'restyle the whole video' },
      deps,
    );

    // Global edit → editVideo on the ORIGINAL whole clip, no segment cutting.
    expect(deps.generativeVideo.editVideo).toHaveBeenCalledTimes(1);
    const editCall = deps.generativeVideo.editVideo.mock.calls[0][0];
    expect(editCall.sourceStorageKey).toBe(source.storageKey);

    // No trim and no assembly happened for a whole-clip edit.
    expect(deps.deterministicEditor.execute).not.toHaveBeenCalled();
    expect(deps.deterministicEditor.executeAssembly).not.toHaveBeenCalled();

    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.artifactId).toBe('edited-seg-1');
    }
  });
});

// ---------------------------------------------------------------------------
// runChatVideoEditTurn — an op the driver CANNOT execute must be reported, not
// left spinning as the current step.
//
// THE DEFECT THIS PINS: `mapPlanOperation` has no `crop` case, so a planned crop
// fell through to `ok:false` and was silently dropped from execution. Because it
// was never passed to `markStepDone` it stayed at `status: 'executable'`, and the
// card's "first pending step is the current one" rule then picked it as the
// CURRENT step FOREVER — while execution had already moved on to the next
// operation, whose status line the overlay was showing. The overlay said one
// thing and the checklist another, and the crop never ticked because it never ran.
//
// The contract now: a dropped op is reported `unavailable` with the mapper's own
// reason, which lifts it out of the checklist into the honest footnote.
// ---------------------------------------------------------------------------

describe('runChatVideoEditTurn — unmappable ops are reported unavailable', () => {
  const source = {
    sourceId: 'src-1',
    storageKey: 'video-editor/p1/sources/x.mp4',
    fileName: 'src-1.mp4',
    durationMs: 30_000,
  };

  function planOp(sequenceIndex: number, type: string, kind: string) {
    return {
      sequenceIndex,
      type,
      kind,
      range: { startMs: 0, endMs: 30_000 },
      preservationConstraints: [],
      status: 'executable',
      params: {},
    };
  }

  /** The exact plan the reported UI showed: reframe → crop → trim → render. */
  function depsWithCrop() {
    let execCall = 0;
    return {
      store: {
        findById: vi.fn().mockResolvedValue({
          projectId: 'p1',
          userId: 'u1',
          workspaceId: 'w1',
          name: 'x',
          activeVersionId: 'v0',
          targetPlatform: null,
          retentionPolicyAllowsSourceDeletion: false,
          status: 'active' as const,
        }),
      } as any,
      getSourceForEdit: vi.fn().mockResolvedValue(source),
      intentRouter: {
        classify: vi.fn().mockResolvedValue({
          status: 'classified',
          usage: [],
          intent: {
            action: 'VIDEO_EDIT',
            inputAssets: [],
            targetPlatform: null,
            targetAspectRatio: '9:16',
            targetDurationMs: null,
            editingStyle: null,
            requestedChanges: ['reframe to 9:16', 'crop the frame', 'trim to 10 seconds'],
            protectedElements: [],
            brandRequirements: null,
            audioRequirements: null,
            captionRequirements: null,
            outputRequirements: null,
            qualityRequirements: null,
            confidence: 1,
            requiresGenerativeAI: false,
            requiresDeterministicEditing: true,
          },
        }),
      } as any,
      versionManager: {
        createVersion: vi.fn().mockResolvedValue({
          ok: true,
          version: { versionId: 'v1', parentVersionId: 'v0', timelineId: 't1' },
        }),
      } as any,
      planner: {
        plan: vi.fn().mockResolvedValue({
          plan: {
            projectGoal: 'reframe+crop+trim',
            target: {
              platform: null,
              aspectRatio: '9:16',
              maxDurationMs: null,
              recommendedDurationMs: null,
              exportProfile: '',
            },
            brand: null,
            operations: [
              planOp(0, 'deterministic', 'aspect'),
              planOp(1, 'deterministic', 'crop'),
              planOp(2, 'deterministic', 'trim'),
              planOp(3, 'render', 'render'),
            ],
          },
          reasoning: { projectGoal: 'reframe+crop+trim', editingStyle: null, usedLLM: false },
          usage: [],
          warnings: [],
        }),
      } as any,
      deterministicEditor: {
        execute: vi.fn().mockImplementation(async () => {
          execCall += 1;
          return {
            artifact: { artifactId: `art-${execCall}` },
            storageKey: `video-editor/p1/renders/out-${execCall}.mp4`,
            command: {} as any,
          };
        }),
      } as any,
    };
  }

  it('reports a crop it cannot map as `unavailable` with a non-empty limitation (never left `executable`)', async () => {
    const deps = depsWithCrop();
    const emits: Array<{
      plan: Array<{ kind: string; status: string; limitation?: string }>;
      activeStepIndex?: number;
    }> = [];

    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'reframe to 9:16, crop the frame and trim to 10 seconds',
        onProgress: (p) =>
          emits.push({
            plan: (p.plan ?? []).map((s) => ({
              kind: s.kind,
              status: s.status,
              limitation: s.limitation,
            })),
            activeStepIndex: p.activeStepIndex,
          }),
      },
      deps,
    );

    // Only the two MAPPABLE ops executed. Which ops run is unchanged by this fix.
    expect(result.outcome).toBe('rendered');
    expect(deps.deterministicEditor.execute).toHaveBeenCalledTimes(2);
    expect(deps.deterministicEditor.execute.mock.calls.map((c: any[]) => c[0].operation.kind)).toEqual(
      ['aspect', 'trim'],
    );

    const withPlan = emits.filter((e) => e.plan.length > 0);
    expect(withPlan.length).toBeGreaterThan(1);
    // Shape invariant: the plan array's order/length never changes across emits.
    for (const e of withPlan) {
      expect(e.plan.map((s) => s.kind)).toEqual(['aspect', 'crop', 'trim', 'render']);
    }

    const last = withPlan[withPlan.length - 1].plan;
    const crop = last[1];

    // THE ASSERTION: the crop is reported unavailable with a real reason, and is
    // NOT sitting at `executable` pretending to be the step in progress.
    expect(crop.status).toBe('unavailable');
    expect(crop.status).not.toBe('executable');
    expect((crop.limitation ?? '').trim().length).toBeGreaterThan(0);
    expect(crop.limitation).toContain('crop');

    // Executed steps still tick honestly; the crop is never ticked.
    expect(last[0].status).toBe('done');
    expect(last[2].status).toBe('done');
    expect(withPlan.every((e) => e.plan[1].status !== 'done')).toBe(true);

    // Once reported unavailable it never regresses back to executable.
    const firstUnavailable = withPlan.findIndex((e) => e.plan[1].status === 'unavailable');
    expect(firstUnavailable).toBeGreaterThanOrEqual(0);
    for (const e of withPlan.slice(firstUnavailable)) {
      expect(e.plan[1].status).toBe('unavailable');
    }
  });

  it('streams an activeStepIndex that always points into the SAME plan array', async () => {
    const deps = depsWithCrop();
    const emits: Array<{ planLength: number; activeStepIndex?: number; phase: string }> = [];

    await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'reframe to 9:16, crop the frame and trim to 10 seconds',
        onProgress: (p) =>
          emits.push({
            planLength: (p.plan ?? []).length,
            activeStepIndex: p.activeStepIndex,
            phase: p.phase,
          }),
      },
      deps,
    );

    const pinned = emits.filter((e) => typeof e.activeStepIndex === 'number');
    expect(pinned.length).toBeGreaterThan(0);
    for (const e of pinned) {
      expect(e.activeStepIndex! >= 0 && e.activeStepIndex! < e.planLength).toBe(true);
    }

    // The pointer moved onto the aspect op (index 0) and then the trim op
    // (index 2) — never onto the crop, which was never executed.
    const seen = Array.from(new Set(pinned.map((e) => e.activeStepIndex!)));
    expect(seen).toContain(0);
    expect(seen).toContain(2);
    expect(seen).not.toContain(1);

    // The terminal emit carries no active step: nothing is being worked on.
    const complete = emits.filter((e) => e.phase === 'complete');
    expect(complete.length).toBeGreaterThan(0);
    expect(complete.every((e) => e.activeStepIndex === undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runChatVideoEditTurn — highlight pass short-circuits BEFORE any analysis
// ---------------------------------------------------------------------------

/**
 * THE WASTE THIS PINS: on a 10.5-second clip whose resolved highlight target
 * equalled the whole clip, the highlight step extracted the full audio energy
 * envelope AND ran a complete speech transcription (~148 seconds in one recorded
 * trace) before `computeHighlightSegments` returned the honest whole-clip result
 * and the step was skipped anyway.
 *
 * The contract now: when the durations alone prove the pass cannot change
 * anything, NEITHER expensive collaborator is invoked, the skip travels through
 * the existing skip path (honest note in the summary), and the plan step is
 * reported `unavailable` instead of being left `executable` forever.
 */
describe('runChatVideoEditTurn — highlight viability pre-check', () => {
  /** A 10.5s source: the highlight target (30s default) covers the whole clip. */
  const shortSource = {
    sourceId: 'src-short',
    storageKey: 'video-editor/p1/sources/short.mp4',
    fileName: 'src-short.mp4',
    durationMs: 10_560,
  };

  function highlightOp(sequenceIndex: number, kind: string) {
    return {
      sequenceIndex,
      type: kind === 'render' ? 'render' : 'deterministic',
      kind,
      range: { startMs: 0, endMs: shortSource.durationMs },
      preservationConstraints: [],
      status: 'executable',
      params: {},
    };
  }

  function shortClipDeps(planOps: any[]) {
    let execCall = 0;
    return {
      store: {
        findById: vi.fn().mockResolvedValue({
          projectId: 'p1',
          userId: 'u1',
          workspaceId: 'w1',
          name: 'x',
          activeVersionId: 'v0',
          targetPlatform: null,
          retentionPolicyAllowsSourceDeletion: false,
          status: 'active' as const,
        }),
      } as any,
      getSourceForEdit: vi.fn().mockResolvedValue(shortSource),
      intentRouter: {
        classify: vi.fn().mockResolvedValue({
          status: 'classified',
          usage: [],
          intent: {
            action: 'VIDEO_EDIT',
            inputAssets: [],
            targetPlatform: null,
            targetAspectRatio: null,
            targetDurationMs: null,
            editingStyle: null,
            requestedChanges: ['apply a cinematic colour grade', 'keep only the highlights'],
            protectedElements: [],
            brandRequirements: null,
            audioRequirements: null,
            captionRequirements: null,
            outputRequirements: null,
            qualityRequirements: null,
            confidence: 1,
            requiresGenerativeAI: false,
            requiresDeterministicEditing: true,
          },
        }),
      } as any,
      versionManager: {
        createVersion: vi.fn().mockResolvedValue({
          ok: true,
          version: { versionId: 'v1', parentVersionId: 'v0', timelineId: 't1' },
        }),
      } as any,
      planner: {
        plan: vi.fn().mockResolvedValue({
          plan: {
            projectGoal: 'grade+highlight',
            target: {
              platform: null,
              aspectRatio: null,
              maxDurationMs: null,
              recommendedDurationMs: null,
              exportProfile: '',
            },
            brand: null,
            operations: planOps,
          },
          reasoning: { projectGoal: 'grade+highlight', editingStyle: null, usedLLM: false },
          usage: [],
          warnings: [],
        }),
      } as any,
      deterministicEditor: {
        execute: vi.fn().mockImplementation(async () => {
          execCall += 1;
          return {
            artifact: { artifactId: `art-${execCall}` },
            storageKey: `video-editor/p1/renders/out-${execCall}.mp4`,
            command: {} as any,
          };
        }),
      } as any,
      audioEnvelope: { extractEnvelope: vi.fn() } as any,
      transcriber: { transcribeSource: vi.fn() } as any,
    };
  }

  it('target duration covering the whole clip → NO envelope, NO transcription, honest skip', async () => {
    const deps = shortClipDeps([
      highlightOp(0, 'filter'),
      highlightOp(1, 'highlight'),
      highlightOp(2, 'render'),
    ]);

    const plans: any[] = [];
    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'apply a cinematic colour grade and keep only the highlights',
        onProgress: (p) => plans.push(p.plan),
      },
      deps,
    );

    // The two expensive collaborators were never touched.
    expect(deps.audioEnvelope.extractEnvelope).not.toHaveBeenCalled();
    expect(deps.transcriber.transcribeSource).not.toHaveBeenCalled();

    // The filter still rendered; the highlight render never ran.
    expect(deps.deterministicEditor.execute).toHaveBeenCalledTimes(1);
    expect(deps.deterministicEditor.execute.mock.calls[0][0].operation.kind).toBe('filter');

    // The turn succeeded with the existing honest skip note.
    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.summary).toContain('Highlight selection was skipped');
    }

    // The highlight step is reported UNAVAILABLE, never left as a pending step.
    const lastPlan = plans.filter(Boolean).pop() as any[];
    const highlightStep = lastPlan.find((s) => s.label === 'Pick the best moments');
    expect(highlightStep).toBeDefined();
    expect(highlightStep.status).toBe('unavailable');
    expect(String(highlightStep.limitation || '')).toContain('already short');
  });

  it('highlight as the ONLY op on a too-short clip → honest no_op, still no analysis', async () => {
    const deps = shortClipDeps([highlightOp(0, 'highlight'), highlightOp(1, 'render')]);

    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'keep only the highlights',
      },
      deps,
    );

    expect(deps.audioEnvelope.extractEnvelope).not.toHaveBeenCalled();
    expect(deps.transcriber.transcribeSource).not.toHaveBeenCalled();
    expect(deps.deterministicEditor.execute).not.toHaveBeenCalled();
    expect(result.outcome).toBe('no_op');
    if (result.outcome === 'no_op') {
      expect(result.message).toContain('already short enough');
    }
  });

  it('auto-cut gets the same cheap guard: a 1s clip never reaches the envelope pass', async () => {
    const deps = shortClipDeps([highlightOp(0, 'filter'), highlightOp(1, 'auto_cut')]);
    deps.getSourceForEdit = vi
      .fn()
      .mockResolvedValue({ ...shortSource, durationMs: 1_000 }) as any;

    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'apply a cinematic colour grade and cut to the beat',
      },
      deps,
    );

    expect(deps.audioEnvelope.extractEnvelope).not.toHaveBeenCalled();
    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.summary).toContain('Auto-cut was skipped');
    }
  });
});
