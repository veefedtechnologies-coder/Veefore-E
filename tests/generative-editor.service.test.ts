/**
 * Unit tests for the Generative_Editor orchestration service
 * (`server/features/video-editor/services/generative-editor.service.ts`).
 *
 * Task 17.6 — verifies the extract → segment → meter → QC-validate → insert
 * pipeline and its failure-preservation guarantees (Req 9.11–9.14):
 *   - Req 9.11, 9.12: validated segments are stored + inserted in place of their
 *     original range, duration-aligned.
 *   - Req 9.13: extraction failure aborts and preserves the timeline.
 *   - Req 9.14: a QC-failed segment is never inserted and the timeline is preserved.
 *   - Req 9.6: an over-capability region that cannot be split reroutes with no call.
 *   - Req 9.9, 9.10: an unguaranteed Protected_Element warns and never invokes a provider.
 *   - Req 17.9: insufficient credits block the provider call with no timeline change.
 *
 * All heavy collaborators (FFmpeg extraction, probing, storage, timeline,
 * provider, ledger) are injected as doubles so the orchestration is exercised
 * without real binaries, Redis, MongoDB, or network access.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  GenerativeEditorService,
  type GenerativeEditRequest,
  type SegmentOutputProber,
  type SegmentExtractor,
  type TimelineSegmentGateway,
} from '../server/features/video-editor/services/generative-editor.service';
import { VideoGenerativeMeteringService } from '../server/features/video-editor/services/generative-metering.service';
import type { CreditSettlement } from '../server/features/subscription/services/AICreditMeteringService';
import type {
  VideoAIProvider,
  VideoEditRequest,
  VideoEditResult,
} from '../server/features/video-editor/services/providers/video-ai-provider';
import type { VideoModelCapabilities } from '../server/features/video-editor/services/provider-capability-registry.logic';
import type {
  OutputProbe,
  QualityMetrics,
} from '../server/features/video-editor/services/quality-controller.logic';

// ---------------------------------------------------------------------------
// Doubles
// ---------------------------------------------------------------------------

function makeCapabilities(overrides: Partial<VideoModelCapabilities> = {}): VideoModelCapabilities {
  return {
    provider: 'gemini',
    model: 'omni-1',
    outputModalities: ['video'],
    outputResolutions: ['1080x1920'],
    outputSeconds: { min: 1, max: 60 },
    editableInputSeconds: { min: 1, max: 30 },
    costPerOutputSecondInr: 2,
    guaranteesPreservation: ['face', 'voice'],
    ...(overrides as VideoModelCapabilities),
  } as VideoModelCapabilities;
}

function makeProvider(
  caps: VideoModelCapabilities,
  edit: (req: VideoEditRequest, signal?: AbortSignal) => Promise<VideoEditResult>,
): VideoAIProvider & { editCalls: number; lastEdit?: VideoEditRequest } {
  const provider = {
    provider: caps.provider,
    model: caps.model,
    editCalls: 0,
    lastEdit: undefined as VideoEditRequest | undefined,
    getCapabilities: () => caps,
    estimateCost: async () => ({
      provider: caps.provider,
      model: caps.model,
      outputSeconds: 1,
      costInr: caps.costPerOutputSecondInr,
      currency: 'INR' as const,
    }),
    async edit(req: VideoEditRequest, signal?: AbortSignal) {
      provider.editCalls += 1;
      provider.lastEdit = req;
      return edit(req, signal);
    },
    generate: async () => {
      throw new Error('not used');
    },
    getIntegrationStatus: () => ({
      provider: caps.provider,
      model: caps.model,
      integrated: true,
      integratedOperations: ['edit'] as const,
      lastSuccessAt: Date.now(),
      lastError: null,
    }),
    isIntegrated: () => true,
  };
  return provider as unknown as VideoAIProvider & { editCalls: number; lastEdit?: VideoEditRequest };
}

function makeLedger(balance: number) {
  return {
    runMeteredCalls: 0,
    async ensureCreditAccount() {
      return balance;
    },
    async runMetered<T>(
      _feature: string,
      _usageFeature: string,
      _ctx: unknown,
      operation: (signal?: AbortSignal) => Promise<T>,
      _additionalProviderCostInr = 0,
      signal?: AbortSignal,
    ): Promise<{ result: T; settlement: CreditSettlement }> {
      this.runMeteredCalls += 1;
      const result = await operation(signal);
      return { result, settlement: { charged: 3, remaining: balance - 3 } };
    },
  };
}

function makeArtifactRepo() {
  return {
    created: [] as unknown[],
    async createArtifact(input: unknown) {
      const artifactId = `artifact-${(this.created.length + 1)}`;
      this.created.push(input);
      return {
        artifact: { artifactId } as never,
        storageKey: `key/${artifactId}.mp4`,
        url: `https://storage/${artifactId}.mp4`,
      };
    },
  };
}

function makeTimelineGateway(): TimelineSegmentGateway & { inserts: unknown[] } {
  const gateway = {
    inserts: [] as unknown[],
    async insertValidatedSegment(input: unknown) {
      gateway.inserts.push(input);
      return { ok: true as const };
    },
  };
  return gateway;
}

/** A prober that reports a clean, duration-aligned segment (passes QC). */
const passingProber: SegmentOutputProber = async ({ output }) => {
  const durationMs = Math.round(output.outputSeconds * 1000);
  const probe: OutputProbe = {
    exists: true,
    sizeBytes: 1024,
    hasVideoStream: true,
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    audioStreamCount: 1,
    width: 1080,
    height: 1920,
    fps: 30,
    durationMs,
  };
  const metrics: QualityMetrics = {
    longestBlackRunMs: 0,
    longestFrozenRunMs: 0,
    audioExpected: true,
    audioPresent: true,
    audioSilentFraction: 0,
    maxArtifactAreaFraction: 0,
    measuredDurationMs: durationMs,
  };
  return { probe, metrics };
};

/** An extractor returning small fake bytes for any range. */
const okExtractor: SegmentExtractor = async ({ range }) => ({
  buffer: Buffer.from('segment-bytes'),
  mimeType: 'video/mp4',
  durationMs: range.endMs - range.startMs,
});

/** A provider edit that returns a duration-aligned inline output for its input range. */
function alignedEdit(req: VideoEditRequest): Promise<VideoEditResult> {
  const startMs = req.affectedRangeMs?.startMs ?? 0;
  const endMs = req.affectedRangeMs?.endMs ?? 1000;
  return Promise.resolve({
    provider: 'gemini',
    model: 'omni-1',
    output: {
      videoBase64: Buffer.from('output-bytes').toString('base64'),
      mimeType: 'video/mp4',
      outputSeconds: (endMs - startMs) / 1000,
    },
  });
}

function baseRequest(overrides: Partial<GenerativeEditRequest> = {}): GenerativeEditRequest {
  return {
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    userId: 'user-1',
    jobId: 'job-1',
    inputVersionId: 'ver-0',
    versionId: 'ver-1',
    source: { storageKey: 'src/key.mp4', fileName: 'source.mp4', durationMs: 60_000 },
    affectedRegion: { startMs: 0, endMs: 5_000 },
    segmentation: {
      caps: { editableInputSeconds: { min: 1, max: 30 } },
      sceneBoundariesMs: [],
    },
    prompt: {
      userRequest: 'remove the background object',
      requiredProtectedElements: ['face'],
      operationType: 'object_removal',
    },
    provider: makeProvider(makeCapabilities(), alignedEdit),
    metering: { idempotencyKey: 've-job-1', confirm: async () => true },
    outputResolution: '1080x1920',
    ...overrides,
  };
}

function makeService(deps: {
  balance?: number;
  extractor?: SegmentExtractor;
  prober?: SegmentOutputProber;
  gateway?: TimelineSegmentGateway;
}) {
  const ledger = makeLedger(deps.balance ?? 1_000_000);
  const metering = new VideoGenerativeMeteringService({ ledger });
  const artifactRepository = makeArtifactRepo();
  const timelineGateway = deps.gateway ?? makeTimelineGateway();
  const jobModel = { updateOne: () => ({ exec: async () => ({}) }) } as never;
  const svc = new GenerativeEditorService({
    metering,
    artifactRepository: artifactRepository as never,
    timelineGateway,
    jobModel,
    segmentExtractor: deps.extractor ?? okExtractor,
    outputProber: deps.prober ?? passingProber,
  });
  return { svc, ledger, artifactRepository, timelineGateway };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GenerativeEditorService — orchestration (task 17.6)', () => {
  it('validates + stores + inserts every segment, duration-aligned (Req 9.11, 9.12)', async () => {
    const gateway = makeTimelineGateway();
    const { svc, artifactRepository } = makeService({ gateway });
    const request = baseRequest();

    const result = await svc.runGenerativeEdit(request);

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.timelineChanged).toBe(true);
      expect(result.segments.length).toBeGreaterThan(0);
      // Duration-aligned: output duration equals the replaced range duration.
      for (const seg of result.segments) {
        expect(seg.outputDurationMs).toBe(seg.range.endMs - seg.range.startMs);
      }
    }
    // A real artifact was stored per validated segment, and each was inserted.
    expect(artifactRepository.created.length).toBe(gateway.inserts.length);
    expect(gateway.inserts.length).toBeGreaterThan(0);
  });

  it('the provider receives the compiled instruction with preservation constraints, never the raw prompt (Req 9.7, 9.8)', async () => {
    const { svc } = makeService({});
    const request = baseRequest();
    await svc.runGenerativeEdit(request);

    const provider = request.provider as unknown as { lastEdit?: VideoEditRequest };
    expect(provider.lastEdit).toBeDefined();
    expect(provider.lastEdit!.instruction).not.toBe(request.prompt.userRequest);
    expect(provider.lastEdit!.preservationConstraints?.length).toBeGreaterThan(0);
  });

  it('aborts and preserves the timeline when extraction fails (Req 9.13)', async () => {
    const gateway = makeTimelineGateway();
    const failingExtractor: SegmentExtractor = async () => {
      throw new Error('ffmpeg extraction crashed');
    };
    const { svc, artifactRepository } = makeService({ extractor: failingExtractor, gateway });

    const result = await svc.runGenerativeEdit(baseRequest());

    expect(result.status).toBe('extraction_failed');
    // No artifact stored, no timeline mutation (Req 9.13).
    expect(artifactRepository.created.length).toBe(0);
    expect(gateway.inserts.length).toBe(0);
  });

  it('never inserts a QC-failed segment and preserves the timeline (Req 9.14)', async () => {
    const gateway = makeTimelineGateway();
    const blackFrameProber: SegmentOutputProber = async ({ output }) => {
      const durationMs = Math.round(output.outputSeconds * 1000);
      const base = await passingProber({ output, bytes: null, workDir: '' });
      return {
        probe: base.probe,
        metrics: { ...base.metrics, longestBlackRunMs: 999_999, measuredDurationMs: durationMs },
      };
    };
    const { svc } = makeService({ prober: blackFrameProber, gateway });

    const result = await svc.runGenerativeEdit(baseRequest());

    expect(result.status).toBe('quality_failed');
    // No insertion happened — timeline preserved (Req 9.14).
    expect(gateway.inserts.length).toBe(0);
  });

  it('reroutes with no provider call when the region exceeds capability and cannot be split (Req 9.6)', async () => {
    const gateway = makeTimelineGateway();
    const { svc } = makeService({ gateway });
    // 40 s region, 30 s cap, no scene boundaries → cannot split.
    const request = baseRequest({
      affectedRegion: { startMs: 0, endMs: 40_000 },
      segmentation: { caps: { editableInputSeconds: { min: 1, max: 30 } }, sceneBoundariesMs: [] },
    });
    const provider = request.provider as unknown as { editCalls: number };

    const result = await svc.runGenerativeEdit(request);

    expect(result.status).toBe('reroute_required');
    expect(provider.editCalls).toBe(0);
    expect(gateway.inserts.length).toBe(0);
  });

  it('warns and never invokes the provider when a required protected element is unguaranteed (Req 9.9, 9.10)', async () => {
    const gateway = makeTimelineGateway();
    const { svc } = makeService({ gateway });
    // Provider guarantees only face/voice; require 'logo' → unguaranteed, no reroute.
    const request = baseRequest({
      prompt: {
        userRequest: 'stylize the clip',
        requiredProtectedElements: ['logo'],
        operationType: 'style_transfer',
      },
    });
    const provider = request.provider as unknown as { editCalls: number };

    const result = await svc.runGenerativeEdit(request);

    expect(result.status).toBe('protected_element_warning');
    if (result.status === 'protected_element_warning') {
      expect(result.unguaranteedElements).toContain('logo');
    }
    expect(provider.editCalls).toBe(0);
    expect(gateway.inserts.length).toBe(0);
  });

  it('blocks on insufficient credits with no timeline change (Req 17.9)', async () => {
    const gateway = makeTimelineGateway();
    const { svc } = makeService({ balance: 0, gateway });
    const request = baseRequest();
    const provider = request.provider as unknown as { editCalls: number };

    const result = await svc.runGenerativeEdit(request);

    expect(result.status).toBe('blocked');
    expect(provider.editCalls).toBe(0);
    expect(gateway.inserts.length).toBe(0);
  });

  it('cancels with no timeline change when confirmation is declined (Req 17.8)', async () => {
    const gateway = makeTimelineGateway();
    const { svc } = makeService({ gateway });
    const request = baseRequest({ metering: { idempotencyKey: 've-job-1', confirm: async () => false } });
    const provider = request.provider as unknown as { editCalls: number };

    const result = await svc.runGenerativeEdit(request);

    expect(result.status).toBe('cancelled');
    expect(provider.editCalls).toBe(0);
    expect(gateway.inserts.length).toBe(0);
  });
});
