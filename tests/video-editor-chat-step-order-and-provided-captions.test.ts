/**
 * Driver-level tests for two confirmed VeeGPT video-editor fixes, exercised with
 * INJECTED fakes only (no OpenAI / Google / ffmpeg / network — No-Mock, Req 23):
 *
 *  ISSUE 1 — step counter "starts at step 2". The planner may emit `caption`
 *  before `filter`, but execution runs pixel/timeline ops FIRST and captions
 *  LAST. `planSummary` (which drives both the checklist AND the "Step N of M"
 *  overlay) is now built in EXECUTION order, so `activeStepIndex` increments
 *  monotonically 1→N (filter before caption).
 *
 *  ISSUE 2 — captions only cover 1-2s. When the user SUPPLIES the caption text
 *  (a quoted phrase), the driver burns that text across the WHOLE clip and
 *  SKIPS Whisper entirely, instead of transcribing sparse speech into one short
 *  cue.
 *
 * Framework: vitest.
 */

import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';

import { runChatVideoEditTurn } from '../server/features/video-editor/services/chat-video-edit.service';

const source = {
  sourceId: 'src-1',
  storageKey: 'video-editor/p1/sources/x.mp4',
  fileName: 'src-1.mp4',
  durationMs: 10_500,
};

function op(sequenceIndex: number, type: string, kind: string, status = 'executable') {
  return {
    sequenceIndex,
    type,
    kind,
    range: { startMs: 0, endMs: source.durationMs },
    preservationConstraints: [],
    status,
    params: {},
  };
}

function intentClassify(requestedChanges: string[]) {
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
      requestedChanges,
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

function baseDeps(planOps: any[], requestedChanges: string[]) {
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
        status: 'active' as const,
      }),
    } as any,
    getSourceForEdit: vi.fn().mockResolvedValue(source),
    intentRouter: { classify: vi.fn().mockResolvedValue(intentClassify(requestedChanges)) } as any,
    versionManager: {
      createVersion: vi.fn().mockResolvedValue({
        ok: true,
        version: { versionId: 'v1', parentVersionId: 'v0', timelineId: 't1' },
      }),
    } as any,
    planner: {
      plan: vi.fn().mockResolvedValue({
        plan: {
          projectGoal: 'edit',
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
        reasoning: { projectGoal: 'edit', editingStyle: null, usedLLM: false },
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
    storage: {
      downloadFile: vi.fn().mockResolvedValue({ buffer: Buffer.from('bytes'), contentType: 'video/mp4' }),
    } as any,
    artifactRepository: {
      createArtifact: vi.fn().mockResolvedValue({
        artifact: { artifactId: 'art-caption' },
        storageKey: 'video-editor/p1/renders/captioned.mp4',
        url: 'https://x/captioned.mp4',
      }),
    } as any,
  };
}

/** A caption renderer that writes a non-empty output file (mirrors ffmpeg burn-in). */
function fakeCaptionRenderer() {
  return {
    renderCaptions: vi.fn().mockImplementation(async (req: { outputPath: string }) => {
      await fs.promises.writeFile(req.outputPath, Buffer.from('burned'));
      return {};
    }),
  };
}

describe('ISSUE 1 — planSummary + activeStepIndex follow EXECUTION order (monotonic counter)', () => {
  it('reorders a caption-first plan so filter comes before caption and the counter increments 1→N', async () => {
    // The planner emits caption at sequenceIndex 0 and filter at 1 (the exact
    // shape that made the counter jump 2→1). Execution runs filter first, caption
    // last, so the streamed plan must list filter before caption.
    const deps = baseDeps(
      [op(0, 'deterministic', 'caption'), op(1, 'deterministic', 'filter'), op(2, 'render', 'render')],
      ['apply a cinematic filter', 'add captions'],
    );
    deps.captionRenderer = fakeCaptionRenderer() as any;
    (deps as any).transcriber = {
      transcribeSource: vi.fn().mockResolvedValue([
        { startMs: 0, endMs: 1000, text: 'hello' },
        { startMs: 1000, endMs: 2000, text: 'world' },
      ]),
    };

    const emits: Array<{ phase: string; plan?: any[]; activeStepIndex?: number }> = [];
    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'apply a cinematic filter and add captions',
        onProgress: (p) => emits.push({ phase: p.phase, plan: p.plan, activeStepIndex: p.activeStepIndex }),
      },
      deps,
    );

    expect(result.outcome).toBe('rendered');

    // The planned checklist (first emit carrying a plan) lists filter BEFORE caption.
    const planned = emits.find((e) => Array.isArray(e.plan))!.plan!;
    const filterIdx = planned.findIndex((s) => s.kind === 'filter');
    const captionIdx = planned.findIndex((s) => s.kind === 'caption');
    expect(filterIdx).toBeGreaterThanOrEqual(0);
    expect(captionIdx).toBeGreaterThanOrEqual(0);
    expect(filterIdx).toBeLessThan(captionIdx);

    // activeStepIndex is monotonically non-decreasing across the whole turn.
    const active = emits
      .map((e) => e.activeStepIndex)
      .filter((v): v is number => typeof v === 'number');
    expect(active.length).toBeGreaterThan(0);
    for (let i = 1; i < active.length; i += 1) {
      expect(active[i]).toBeGreaterThanOrEqual(active[i - 1]);
    }

    // The filter was worked on (active === filterIdx) strictly BEFORE the caption
    // (active === captionIdx) — the concrete "starts at step 2" regression check.
    const firstFilterEmit = emits.findIndex((e) => e.activeStepIndex === filterIdx);
    const firstCaptionEmit = emits.findIndex((e) => e.activeStepIndex === captionIdx);
    expect(firstFilterEmit).toBeGreaterThanOrEqual(0);
    expect(firstCaptionEmit).toBeGreaterThan(firstFilterEmit);

    // Every step the planner emitted is still present in the checklist (nothing
    // dropped): caption, filter, and the render step.
    expect(planned.some((s) => s.kind === 'render')).toBe(true);
    expect(planned.length).toBe(3);
  });
});

describe('ISSUE 2 — provided caption text burns across the whole clip WITHOUT transcription', () => {
  it('uses the quoted phrase, skips Whisper, and covers [0, durationMs]', async () => {
    const deps = baseDeps(
      [op(0, 'deterministic', 'caption'), op(1, 'render', 'render')],
      ['add captions'],
    );
    const captionRenderer = fakeCaptionRenderer();
    deps.captionRenderer = captionRenderer as any;
    // A transcriber that WOULD return a single sparse cue (the bug). It must NOT
    // be called on the provided-text path.
    const transcriber = {
      transcribeSource: vi.fn().mockResolvedValue([{ startMs: 0, endMs: 1500, text: 'hi' }]),
    };
    (deps as any).transcriber = transcriber;

    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'add animated captions using Option A text "Build the future you want."',
      },
      deps,
    );

    // Whisper was NOT called — the user supplied the words.
    expect(transcriber.transcribeSource).not.toHaveBeenCalled();

    // Captions were burned from provided segments spanning the WHOLE clip.
    expect(captionRenderer.renderCaptions).toHaveBeenCalledTimes(1);
    const segs = captionRenderer.renderCaptions.mock.calls[0][0].segments;
    expect(Array.isArray(segs)).toBe(true);
    expect(segs.length).toBeGreaterThanOrEqual(1);
    expect(segs[0].startMs).toBe(0);
    expect(segs[segs.length - 1].endMs).toBe(source.durationMs);
    // Contiguous, strictly forward.
    for (let i = 0; i < segs.length; i += 1) {
      expect(segs[i].endMs).toBeGreaterThan(segs[i].startMs);
      if (i > 0) expect(segs[i].startMs).toBe(segs[i - 1].endMs);
    }
    // The provided words made it onto the cues.
    expect(segs.map((s: any) => s.text).join(' ')).toContain('Build the future you want');

    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.kind).toBe('caption');
      expect(result.artifactId).toBe('art-caption');
    }
  });

  it('falls back to transcription (unchanged) when NO caption text is provided', async () => {
    const deps = baseDeps(
      [op(0, 'deterministic', 'caption'), op(1, 'render', 'render')],
      ['add captions'],
    );
    const captionRenderer = fakeCaptionRenderer();
    deps.captionRenderer = captionRenderer as any;
    const transcriber = {
      transcribeSource: vi.fn().mockResolvedValue([
        { startMs: 0, endMs: 1500, text: 'hello there' },
        { startMs: 1500, endMs: 3000, text: 'nice to meet you' },
      ]),
    };
    (deps as any).transcriber = transcriber;

    const result = await runChatVideoEditTurn(
      { projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'add captions to this' },
      deps,
    );

    // No provided text → the existing transcription path runs.
    expect(transcriber.transcribeSource).toHaveBeenCalledTimes(1);
    expect(captionRenderer.renderCaptions).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('rendered');
  });
});
