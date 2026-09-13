/**
 * Wiring tests for the GENERATIVE-EDIT LOCALIZATION pre-pass in the
 * edit-type-generative GLOBAL branch of `runChatVideoEditTurn`.
 *
 * Feature: generative-edit-localization (Task 7.2).
 *
 * These tests drive a full chat edit turn with injected fakes (no network, no
 * ffmpeg) and assert the wiring around the new `editLocalizer` dep:
 *
 *  - When `editLocalizer.localize` returns `{ kind: 'windows', windows }` for a
 *    global (no-explicit-range) edit-type generative op, the SEGMENT-SCOPED path
 *    runs per window: `deterministicEditor.execute({ kind: 'trim' })` per window,
 *    `generativeVideo.editVideo` per window, and `executeAssembly` (splice) once
 *    (Req 1.1, 1.5, 7.1, 7.3).
 *  - When `localize` returns `{ kind: 'whole-clip' }`, the CURRENT whole-clip
 *    behavior is unchanged: a single `editVideo` on the whole clip, and NO
 *    trim/assembly from the localized path (Req 1.1).
 *  - When the message carries an EXPLICIT range (`parseEditRange` → segment), the
 *    localizer is BYPASSED entirely — `localize` is NEVER called (Req 1.2).
 *  - Deterministic (Req 1.4) and generate-type (Req 1.3) ops never localize; the
 *    localizer only exists in the edit-type-generative branch and only runs when
 *    the localizer fake is exercised — the whole-clip / explicit-range cases here
 *    guard those trigger conditions.
 *
 * Framework: vitest.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { runChatVideoEditTurn } from '../server/features/video-editor/services/chat-video-edit.service';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

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

/**
 * Base deps for an edit-type generative turn. Mirrors the segment-scoped fixture
 * in `video-editor-chat-fallback.test.ts`: distinct trim artifacts per call, a
 * rendered `editVideo`, and an `executeAssembly` splice. `editLocalizer` is
 * injected per-test.
 */
function baseDeps() {
  let execCall = 0;
  let editCall = 0;
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
      // Distinct artifact per call so window/head/gap/tail trims are traceable.
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
      // Distinct edited artifact per call so per-window edits are traceable.
      editVideo: vi.fn().mockImplementation(async () => {
        editCall += 1;
        return {
          outcome: 'rendered',
          artifactId: `edited-seg-${editCall}`,
          storageKey: `video-editor/p1/generated/edited-seg-${editCall}.mp4`,
          mimeType: 'video/mp4',
          provider: 'gemini-omni-flash',
          model: 'gemini-omni-flash',
        };
      }),
      generateVideo: vi.fn(),
    } as any,
  };
}

/** Collect the `{ kind: 'trim' }` execute calls with their parsed ranges. */
function trimCalls(deps: ReturnType<typeof baseDeps>) {
  return deps.deterministicEditor.execute.mock.calls
    .map((c: any[]) => c[0])
    .filter((req: any) => req.operation?.kind === 'trim');
}

// ---------------------------------------------------------------------------
// Env gate: the generative branch requires a configured Google key
// (`isGenerativeVideoConfigured()` reads env). Set one deterministically so the
// driver routes into the generative edit path regardless of the ambient env.
// ---------------------------------------------------------------------------

let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-google-key';
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedKey;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runChatVideoEditTurn — generative edit localization wiring (global branch)', () => {
  it('localizer returns windows → trim + editVideo per window, then splice (executeAssembly)', async () => {
    const deps = baseDeps();
    const windows = [
      { startMs: 5_000, endMs: 10_000 },
      { startMs: 15_000, endMs: 20_000 },
    ];
    const editLocalizer = {
      localize: vi.fn().mockResolvedValue({ kind: 'windows', windows }),
    };

    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        // No explicit time range → global branch → localizer runs.
        message: 'remove the person in the background',
      },
      { ...deps, editLocalizer } as any,
    );

    // The localizer ran exactly once for this global edit-type generative turn.
    expect(editLocalizer.localize).toHaveBeenCalledTimes(1);
    const locArg = editLocalizer.localize.mock.calls[0][0];
    expect(locArg.sourceStorageKey).toBe(source.storageKey);
    expect(locArg.sourceDurationMs).toBe(30_000);

    // A trim was cut for EACH window (segment-scoped path).
    const trims = trimCalls(deps);
    expect(
      trims.some((r: any) => r.operation.params.startMs === 5_000 && r.operation.params.endMs === 10_000),
    ).toBe(true);
    expect(
      trims.some((r: any) => r.operation.params.startMs === 15_000 && r.operation.params.endMs === 20_000),
    ).toBe(true);

    // Omni edited EACH window (one editVideo per window) on the CUT segments,
    // never on the whole clip.
    expect(deps.generativeVideo.editVideo).toHaveBeenCalledTimes(2);
    for (const call of deps.generativeVideo.editVideo.mock.calls) {
      expect(call[0].sourceStorageKey).not.toBe(source.storageKey);
    }

    // All edited windows were spliced back into a single timeline.
    expect(deps.deterministicEditor.executeAssembly).toHaveBeenCalledTimes(1);

    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.artifactId).toBe('spliced-1');
    }
  });

  it('localizer returns whole-clip → single whole-clip editVideo, NO trim/assembly', async () => {
    const deps = baseDeps();
    const editLocalizer = {
      localize: vi.fn().mockResolvedValue({ kind: 'whole-clip' }),
    };

    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        message: 'remove the person in the background',
      },
      { ...deps, editLocalizer } as any,
    );

    // The localizer ran, and honestly signalled the whole-clip fallback.
    expect(editLocalizer.localize).toHaveBeenCalledTimes(1);

    // Whole-clip fallback = the CURRENT behavior: a single editVideo on the
    // ORIGINAL whole clip, with NO trims and NO assembly from the localized path.
    expect(deps.generativeVideo.editVideo).toHaveBeenCalledTimes(1);
    expect(deps.generativeVideo.editVideo.mock.calls[0][0].sourceStorageKey).toBe(source.storageKey);
    expect(deps.deterministicEditor.execute).not.toHaveBeenCalled();
    expect(deps.deterministicEditor.executeAssembly).not.toHaveBeenCalled();

    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.artifactId).toBe('edited-seg-1');
    }
  });

  it('explicit range in the message → localizer BYPASSED entirely (never called)', async () => {
    const deps = baseDeps();
    const editLocalizer = {
      localize: vi.fn().mockResolvedValue({ kind: 'whole-clip' }),
    };

    const result = await runChatVideoEditTurn(
      {
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        // Explicit range → parseEditRange → mode: 'segment' → localizer bypassed.
        message: 'remove the guy from 0:05 to 0:10',
      },
      { ...deps, editLocalizer } as any,
    );

    // The explicit user range always wins: the localizer NEVER runs (Req 1.2).
    expect(editLocalizer.localize).not.toHaveBeenCalled();

    // The existing explicit-segment path still ran: the segment was cut, edited,
    // and spliced back.
    const trims = trimCalls(deps);
    expect(
      trims.some((r: any) => r.operation.params.startMs === 5_000 && r.operation.params.endMs === 10_000),
    ).toBe(true);
    expect(deps.generativeVideo.editVideo).toHaveBeenCalledTimes(1);
    expect(deps.deterministicEditor.executeAssembly).toHaveBeenCalledTimes(1);

    expect(result.outcome).toBe('rendered');
  });
});
