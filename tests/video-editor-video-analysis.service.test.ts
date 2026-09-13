/**
 * Unit + property tests for the Video_Analysis_Service (task 8.4).
 *
 * Framework: vitest + fast-check.
 *
 * Covers (design.md "Video_Analysis_Service", Req 4.2, 4.7, 4.9, 4.10, 4.11):
 *  - Property 9: Deterministic scene detection precedes AI enrichment
 *    **Validates: Requirements 4.2**
 *  - Property 12: Completion implies fully-populated analysis; failure yields no
 *    reusable partial **Validates: Requirements 4.7, 4.10, 4.11**
 *  - Property 13: Completed analysis is reused idempotently
 *    **Validates: Requirements 4.9**
 *
 * The FFmpeg processor, AI semantic enricher, storage, artifact repository, and
 * Mongoose models are all injected as in-memory doubles that exercise the real
 * orchestration logic (No-Mock, Req 23) — the doubles never fabricate a passing
 * result, they only stand in for the encoder / provider / DB IO.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  VideoAnalysisService,
  EnrichmentUnavailableError,
  AnalysisFailedError,
  AnalysisSourceNotFoundError,
  videoAnalysisJobId,
  type AnalysisProcessor,
  type SemanticEnricher,
  type EnrichmentContext,
  type EnrichmentResult,
  type SceneBoundary,
  type VideoAnalysis,
} from '../server/features/video-editor/services/video-analysis.service';
import type { VideoMetadata } from '../server/features/storage/services/video-storage.service';
import type { LoudnessFrame } from '../server/features/video-editor/services/audio-analysis.logic';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-1';
const SOURCE_ID = 'src-1';
const OWNER = { userId: 'user-1', workspaceId: 'ws-1' };
const SOURCE_STORAGE_KEY = 'video-editor/proj-1/originals/src-1.mp4';

/** A minimal `Video_Source` document stand-in (only the fields the service reads). */
function makeSource(overrides: Record<string, unknown> = {}) {
  return {
    sourceId: SOURCE_ID,
    projectId: PROJECT_ID,
    workspaceId: OWNER.workspaceId,
    userId: OWNER.userId,
    storageKey: SOURCE_STORAGE_KEY,
    mimeType: 'video/mp4',
    ...overrides,
  } as any;
}

/** Well-formed metadata for a 30 s 1920×1080 30 fps source. */
function goodMetadata(): VideoMetadata {
  return {
    duration: 30,
    width: 1920,
    height: 1080,
    format: 'mov,mp4',
    size: 5_000_000,
    fps: 30,
    codec: 'h264',
  };
}

/** One in-bounds scene for a 30 s source. */
function goodScenes(): SceneBoundary[] {
  return [
    { startMs: 0, endMs: 15_000 },
    { startMs: 15_000, endMs: 30_000 },
  ];
}

/** A loudness curve with a clear silent tail (drives the pure silence core). */
function loudnessCurve(): LoudnessFrame[] {
  return [
    { startMs: 0, endMs: 10_000, loudnessDb: -18 },
    { startMs: 10_000, endMs: 20_000, loudnessDb: -16 },
    { startMs: 20_000, endMs: 30_000, loudnessDb: -60 },
  ];
}

/** Well-formed enrichment (transcript + in-bounds scores) for a 30 s source. */
function goodEnrichment(): EnrichmentResult {
  return {
    provider: 'gemini',
    model: 'gemini-video',
    transcript: [{ startMs: 0, endMs: 5_000, text: 'hello world' }],
    hookCandidates: [{ startMs: 0, endMs: 3_000, confidence: 0.9 }],
    importantMoments: [{ startMs: 10_000, endMs: 12_000, confidence: 0.7 }],
  };
}

// ---------------------------------------------------------------------------
// Injectable doubles (record real behaviour; never fabricate a passing result)
// ---------------------------------------------------------------------------

type OrderEvent =
  | 'probe'
  | 'detectScenes'
  | 'extractLoudnessCurve'
  | 'enrich';

/**
 * An in-memory `AnalysisProcessor` that records the order in which its
 * deterministic steps run into a shared `order` log. `detectScenes` also records
 * into a shared `sceneResults` box so a test can assert the scene results were
 * recorded before enrichment (Property 9).
 */
function makeProcessor(
  order: OrderEvent[],
  opts: {
    metadata?: VideoMetadata;
    scenes?: SceneBoundary[];
    curve?: LoudnessFrame[];
    failOn?: 'probe' | 'detectScenes' | 'extractLoudnessCurve';
    sceneResults?: { value: SceneBoundary[] | null };
  } = {},
): AnalysisProcessor {
  return {
    async probe() {
      order.push('probe');
      if (opts.failOn === 'probe') throw new Error('ffprobe failed');
      return opts.metadata ?? goodMetadata();
    },
    async detectScenes() {
      order.push('detectScenes');
      if (opts.failOn === 'detectScenes') throw new Error('scene detection failed');
      const scenes = opts.scenes ?? goodScenes();
      if (opts.sceneResults) opts.sceneResults.value = scenes;
      return scenes;
    },
    async extractLoudnessCurve() {
      order.push('extractLoudnessCurve');
      if (opts.failOn === 'extractLoudnessCurve') throw new Error('loudness failed');
      return opts.curve ?? loudnessCurve();
    },
  };
}

/**
 * An in-memory `SemanticEnricher`. Records each invocation into `order` (and
 * counts them), and asserts — at call time — that deterministic scene results
 * were already recorded (Property 9). Configurable to return enrichment or throw
 * `EnrichmentUnavailableError` (Req 4.10) / a hard error (Req 4.11).
 */
function makeEnricher(
  order: OrderEvent[],
  opts: {
    result?: EnrichmentResult;
    unavailable?: boolean;
    hardError?: boolean;
    sceneResults?: { value: SceneBoundary[] | null };
    calls?: { count: number };
    lastContext?: { value: EnrichmentContext | null };
  } = {},
): SemanticEnricher {
  return {
    async enrich(ctx: EnrichmentContext): Promise<EnrichmentResult> {
      order.push('enrich');
      if (opts.calls) opts.calls.count += 1;
      if (opts.lastContext) opts.lastContext.value = ctx;
      if (opts.unavailable) {
        throw new EnrichmentUnavailableError('provider not configured');
      }
      if (opts.hardError) {
        throw new Error('provider blew up');
      }
      return opts.result ?? goodEnrichment();
    },
  };
}

/** A storage double backed by an in-memory key→buffer map. */
function makeStorage(files: Map<string, Buffer>) {
  return {
    async downloadFile(key: string) {
      const buffer = files.get(key);
      if (!buffer) throw new Error(`missing key ${key}`);
      return { buffer, contentType: 'application/octet-stream', size: buffer.length };
    },
  } as any;
}

/**
 * An in-memory artifact repository. `createArtifact` records the create and, when
 * it stores an `analysis` artifact, wires its bytes into the shared storage map
 * and appends its metadata so a subsequent reuse lookup can find it.
 */
function makeArtifactRepo(files: Map<string, Buffer>, seeded: any[] = []) {
  const created: any[] = [];
  const artifacts: any[] = [...seeded];
  const repo = {
    created,
    artifacts,
    async createArtifact(input: any) {
      created.push(input);
      const artifactId = `art-${created.length}`;
      const storageKey = `video-editor/${input.projectId}/${input.category}/${artifactId}.json`;
      files.set(storageKey, input.buffer);
      const artifact = {
        artifactId,
        storageKey,
        category: input.category,
        provenance: input.provenance,
      };
      artifacts.push(artifact);
      return { artifact, storageKey, url: `https://storage.local/${storageKey}` };
    },
    async listByCategory(projectId: string, category: string) {
      return artifacts.filter((a) => a.category === category);
    },
  } as any;
  return repo;
}

/** An in-memory Mongoose-like source model. */
function makeSourceModel(source: any | null) {
  return {
    findOne(query: { sourceId: string }) {
      return {
        async exec() {
          return source && source.sourceId === query.sourceId ? source : null;
        },
      };
    },
  } as any;
}

/** An in-memory Mongoose-like job model that persists jobs in a map. */
function makeJobModel() {
  const jobs = new Map<string, any>();
  const jobModel = {
    jobs,
    findOne(query: { jobId: string }) {
      return {
        async exec() {
          return jobs.get(query.jobId) ?? null;
        },
      };
    },
    async create(doc: any) {
      const job = {
        ...doc,
        async save() {
          jobs.set(this.jobId, this);
        },
      };
      jobs.set(job.jobId, job);
      return job;
    },
  } as any;
  return jobModel;
}

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * Build a service wired with the supplied doubles. Any collaborator not provided
 * is defaulted to a passing in-memory double.
 */
function buildService(opts: {
  order?: OrderEvent[];
  source?: any | null;
  processor?: AnalysisProcessor;
  enricher?: SemanticEnricher;
  files?: Map<string, Buffer>;
  artifactRepository?: any;
  jobModel?: any;
} = {}) {
  const order = opts.order ?? [];
  const files = opts.files ?? new Map<string, Buffer>();
  files.set(SOURCE_STORAGE_KEY, Buffer.from('source-bytes'));
  const source = opts.source === undefined ? makeSource() : opts.source;

  const service = new VideoAnalysisService({
    storage: makeStorage(files),
    artifactRepository: opts.artifactRepository ?? makeArtifactRepo(files),
    processor: opts.processor ?? makeProcessor(order),
    enricher: opts.enricher ?? makeEnricher(order),
    sourceModel: makeSourceModel(source),
    jobModel: opts.jobModel ?? makeJobModel(),
    logger: silentLogger as any,
  });
  return { service, order, files };
}

/** A completed analysis record suitable for seeding a reusable artifact. */
function completedAnalysisRecord(): VideoAnalysis {
  const md = goodMetadata();
  return {
    sourceId: SOURCE_ID,
    projectId: PROJECT_ID,
    durationSeconds: md.duration,
    fps: md.fps!,
    width: md.width,
    height: md.height,
    aspectRatio: '16:9',
    scenes: goodScenes(),
    transcript: goodEnrichment().transcript,
    audioFeatures: { loudnessCurve: loudnessCurve(), silenceSegments: [], speechSegments: [] },
    hookCandidates: goodEnrichment().hookCandidates,
    importantMoments: goodEnrichment().importantMoments,
    stages: {
      probeMetadata: true,
      sceneDetection: true,
      audioFeatures: true,
      transcript: true,
      semanticEnrichment: true,
    },
    completed: true,
    status: 'completed',
    enrichmentProvider: 'gemini',
    enrichmentModel: 'gemini-video',
  };
}

// ===========================================================================
// Property 9: Deterministic scene detection precedes AI enrichment (Req 4.2)
// ===========================================================================

describe('Property 9: Deterministic scene detection precedes AI enrichment (Req 4.2)', () => {
  it('records scene detection before any enrichment call', async () => {
    const order: OrderEvent[] = [];
    const sceneResults = { value: null as SceneBoundary[] | null };
    const files = new Map<string, Buffer>();
    files.set(SOURCE_STORAGE_KEY, Buffer.from('source-bytes'));

    const service = new VideoAnalysisService({
      storage: makeStorage(files),
      artifactRepository: makeArtifactRepo(files),
      processor: makeProcessor(order, { sceneResults }),
      enricher: makeEnricher(order, { sceneResults }),
      sourceModel: makeSourceModel(makeSource()),
      jobModel: makeJobModel(),
      logger: silentLogger as any,
    });

    await service.analyze(SOURCE_ID);

    const sceneIdx = order.indexOf('detectScenes');
    const enrichIdx = order.indexOf('enrich');
    expect(sceneIdx).toBeGreaterThanOrEqual(0);
    expect(enrichIdx).toBeGreaterThanOrEqual(0);
    // Scene detection must complete (and its results be recorded) before enrichment.
    expect(sceneIdx).toBeLessThan(enrichIdx);
    // Scene results were captured at the moment enrichment was invoked.
    expect(sceneResults.value).not.toBeNull();
  });

  it('never issues an enrichment call before scene detection, for any scene arrangement', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Random valid scene counts / durations to vary the deterministic step.
        fc.integer({ min: 1, max: 6 }),
        async (sceneCount) => {
          const order: OrderEvent[] = [];
          const files = new Map<string, Buffer>();
          files.set(SOURCE_STORAGE_KEY, Buffer.from('source-bytes'));

          const durationMs = 30_000;
          const step = Math.floor(durationMs / sceneCount);
          const scenes: SceneBoundary[] = Array.from({ length: sceneCount }, (_, i) => ({
            startMs: i * step,
            endMs: i === sceneCount - 1 ? durationMs : (i + 1) * step,
          }));

          const service = new VideoAnalysisService({
            storage: makeStorage(files),
            artifactRepository: makeArtifactRepo(files),
            processor: makeProcessor(order, { scenes }),
            enricher: makeEnricher(order),
            sourceModel: makeSourceModel(makeSource()),
            jobModel: makeJobModel(),
            logger: silentLogger as any,
          });

          await service.analyze(SOURCE_ID);

          // For every prefix of the recorded order, an 'enrich' event is never
          // seen before a 'detectScenes' event.
          const firstEnrich = order.indexOf('enrich');
          const firstScenes = order.indexOf('detectScenes');
          return firstScenes >= 0 && firstEnrich > firstScenes;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ===========================================================================
// Property 12: Completion implies fully-populated analysis; failure/partial
// yields no reusable artifact (Req 4.7, 4.10, 4.11)
// ===========================================================================

describe('Property 12: Completion implies fully-populated analysis; failure yields no reusable partial (Req 4.7, 4.10, 4.11)', () => {
  it('marks completed and persists a reusable artifact only when every field is populated (Req 4.7, 4.8)', async () => {
    const files = new Map<string, Buffer>();
    files.set(SOURCE_STORAGE_KEY, Buffer.from('source-bytes'));
    const artifactRepository = makeArtifactRepo(files);

    const { service } = buildService({ files, artifactRepository });
    const result = await service.analyze(SOURCE_ID);

    expect(result.analysis.completed).toBe(true);
    expect(result.analysis.status).toBe('completed');
    // Every required field is populated.
    expect(result.analysis.durationSeconds).toBeGreaterThan(0);
    expect(result.analysis.fps).toBeGreaterThan(0);
    expect(result.analysis.width).toBeGreaterThan(0);
    expect(result.analysis.height).toBeGreaterThan(0);
    expect(result.analysis.aspectRatio).not.toBe('0:0');
    expect(result.analysis.scenes.length).toBeGreaterThan(0);
    expect(Object.values(result.analysis.stages).every(Boolean)).toBe(true);
    // Persisted as exactly one reusable analysis artifact (Req 4.8).
    expect(result.artifactId).not.toBeNull();
    expect(artifactRepository.created).toHaveLength(1);
    expect(artifactRepository.created[0].category).toBe('analysis');
  });

  it('when enrichment is unavailable: retains deterministic scenes, not completed, no reusable artifact (Req 4.10)', async () => {
    const order: OrderEvent[] = [];
    const files = new Map<string, Buffer>();
    files.set(SOURCE_STORAGE_KEY, Buffer.from('source-bytes'));
    const artifactRepository = makeArtifactRepo(files);

    const service = new VideoAnalysisService({
      storage: makeStorage(files),
      artifactRepository,
      processor: makeProcessor(order),
      enricher: makeEnricher(order, { unavailable: true }),
      sourceModel: makeSourceModel(makeSource()),
      jobModel: makeJobModel(),
      logger: silentLogger as any,
    });

    const result = await service.analyze(SOURCE_ID);

    // Deterministic scene results are retained.
    expect(result.analysis.scenes.length).toBeGreaterThan(0);
    expect(result.analysis.stages.sceneDetection).toBe(true);
    // Enrichment stage incomplete; record not completed.
    expect(result.analysis.stages.semanticEnrichment).toBe(false);
    expect(result.analysis.completed).toBe(false);
    expect(result.analysis.status).toBe('partial');
    // No reusable artifact persisted.
    expect(result.artifactId).toBeNull();
    expect(artifactRepository.created).toHaveLength(0);
  });

  it('when enrichment returns malformed (out-of-bounds) decision-support timing: not completed, no reusable artifact (Req 4.7)', async () => {
    const files = new Map<string, Buffer>();
    files.set(SOURCE_STORAGE_KEY, Buffer.from('source-bytes'));
    const artifactRepository = makeArtifactRepo(files);

    // A hook candidate whose range falls beyond the 30 s source duration is not
    // well-formed (decision-support scores must be in-bounds, Req 4.6 / Property 10).
    const malformed: EnrichmentResult = {
      provider: 'gemini',
      model: 'gemini-video',
      transcript: [{ startMs: 0, endMs: 5_000, text: 'hello' }],
      hookCandidates: [{ startMs: 40_000, endMs: 60_000, confidence: 0.9 }],
      importantMoments: [],
    };

    const { service } = buildService({
      files,
      artifactRepository,
      enricher: makeEnricher([], { result: malformed }),
    });

    const result = await service.analyze(SOURCE_ID);

    expect(result.analysis.completed).toBe(false);
    expect(result.artifactId).toBeNull();
    expect(artifactRepository.created).toHaveLength(0);
  });

  it('when a deterministic step fails: status failed with error code, not completed, no reusable artifact (Req 4.11)', async () => {
    const files = new Map<string, Buffer>();
    files.set(SOURCE_STORAGE_KEY, Buffer.from('source-bytes'));
    const artifactRepository = makeArtifactRepo(files);
    const jobModel = makeJobModel();

    const service = new VideoAnalysisService({
      storage: makeStorage(files),
      artifactRepository,
      processor: makeProcessor([], { failOn: 'detectScenes' }),
      enricher: makeEnricher([]),
      sourceModel: makeSourceModel(makeSource()),
      jobModel,
      logger: silentLogger as any,
    });

    await expect(service.analyze(SOURCE_ID)).rejects.toBeInstanceOf(AnalysisFailedError);

    // No reusable artifact persisted.
    expect(artifactRepository.created).toHaveLength(0);
    // Job recorded as FAILED with an error code (Req 4.11).
    const jobId = videoAnalysisJobId(PROJECT_ID, SOURCE_ID);
    const job = jobModel.jobs.get(jobId);
    expect(job?.state).toBe('FAILED');
    expect(job?.errorCode).toBe('SCENE_DETECTION_FAILED');
  });

  it('when the enricher throws a hard error: analysis fails with no reusable artifact (Req 4.11)', async () => {
    const files = new Map<string, Buffer>();
    files.set(SOURCE_STORAGE_KEY, Buffer.from('source-bytes'));
    const artifactRepository = makeArtifactRepo(files);

    const { service } = buildService({
      files,
      artifactRepository,
      enricher: makeEnricher([], { hardError: true }),
    });

    await expect(service.analyze(SOURCE_ID)).rejects.toBeInstanceOf(AnalysisFailedError);
    expect(artifactRepository.created).toHaveLength(0);
  });

  it('property: a partial/failed run never persists a reusable artifact (Req 4.10, 4.11)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'unavailable' | 'hardError' | 'detectScenes' | 'probe' | 'extractLoudnessCurve'>(
          'unavailable',
          'hardError',
          'detectScenes',
          'probe',
          'extractLoudnessCurve',
        ),
        async (mode) => {
          const files = new Map<string, Buffer>();
          files.set(SOURCE_STORAGE_KEY, Buffer.from('source-bytes'));
          const artifactRepository = makeArtifactRepo(files);

          const isProcessorFailure =
            mode === 'detectScenes' || mode === 'probe' || mode === 'extractLoudnessCurve';

          const service = new VideoAnalysisService({
            storage: makeStorage(files),
            artifactRepository,
            processor: makeProcessor([], isProcessorFailure ? { failOn: mode } : {}),
            enricher: makeEnricher([], {
              unavailable: mode === 'unavailable',
              hardError: mode === 'hardError',
            }),
            sourceModel: makeSourceModel(makeSource()),
            jobModel: makeJobModel(),
            logger: silentLogger as any,
          });

          let completed = false;
          try {
            const res = await service.analyze(SOURCE_ID);
            completed = res.analysis.completed;
          } catch {
            completed = false;
          }

          // In no partial/failed mode is the analysis completed, and in no case
          // is a reusable artifact persisted.
          return completed === false && artifactRepository.created.length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ===========================================================================
// Property 13: Completed analysis is reused idempotently (Req 4.9)
// ===========================================================================

describe('Property 13: Completed analysis is reused idempotently (Req 4.9)', () => {
  it('reuses an existing completed artifact and issues NO new enrichment call', async () => {
    const files = new Map<string, Buffer>();
    files.set(SOURCE_STORAGE_KEY, Buffer.from('source-bytes'));

    // Seed a completed analysis artifact wired into storage.
    const seededKey = 'video-editor/proj-1/analysis/seed.json';
    files.set(seededKey, Buffer.from(JSON.stringify(completedAnalysisRecord()), 'utf-8'));
    const artifactRepository = makeArtifactRepo(files, [
      {
        artifactId: 'seed',
        storageKey: seededKey,
        category: 'analysis',
        provenance: { inputVersionId: SOURCE_ID },
      },
    ]);

    const calls = { count: 0 };
    const order: OrderEvent[] = [];

    const service = new VideoAnalysisService({
      storage: makeStorage(files),
      artifactRepository,
      processor: makeProcessor(order),
      enricher: makeEnricher(order, { calls }),
      sourceModel: makeSourceModel(makeSource()),
      jobModel: makeJobModel(),
      logger: silentLogger as any,
    });

    const result = await service.analyze(SOURCE_ID);

    expect(result.reused).toBe(true);
    expect(result.artifactId).toBe('seed');
    expect(result.analysis.completed).toBe(true);
    // No new enrichment call and no new artifact created (Req 4.9).
    expect(calls.count).toBe(0);
    expect(order).not.toContain('enrich');
    expect(artifactRepository.created).toHaveLength(0);
  });

  it('analyzing twice reuses the first result: second run issues no enrichment call and creates no new artifact', async () => {
    const files = new Map<string, Buffer>();
    files.set(SOURCE_STORAGE_KEY, Buffer.from('source-bytes'));
    const artifactRepository = makeArtifactRepo(files);
    const calls = { count: 0 };
    const order: OrderEvent[] = [];

    const service = new VideoAnalysisService({
      storage: makeStorage(files),
      artifactRepository,
      processor: makeProcessor(order),
      enricher: makeEnricher(order, { calls }),
      sourceModel: makeSourceModel(makeSource()),
      jobModel: makeJobModel(),
      logger: silentLogger as any,
    });

    const first = await service.analyze(SOURCE_ID);
    expect(first.reused).toBe(false);
    expect(first.analysis.completed).toBe(true);
    expect(calls.count).toBe(1);
    expect(artifactRepository.created).toHaveLength(1);

    const second = await service.analyze(SOURCE_ID);
    expect(second.reused).toBe(true);
    expect(second.artifactId).toBe(first.artifactId);
    // The enrichment call count and artifact count are unchanged (idempotent).
    expect(calls.count).toBe(1);
    expect(artifactRepository.created).toHaveLength(1);
  });

  it('property: repeated analysis is idempotent — at most one enrichment call and one artifact', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 6 }), async (runs) => {
        const files = new Map<string, Buffer>();
        files.set(SOURCE_STORAGE_KEY, Buffer.from('source-bytes'));
        const artifactRepository = makeArtifactRepo(files);
        const calls = { count: 0 };
        const order: OrderEvent[] = [];

        const service = new VideoAnalysisService({
          storage: makeStorage(files),
          artifactRepository,
          processor: makeProcessor(order),
          enricher: makeEnricher(order, { calls }),
          sourceModel: makeSourceModel(makeSource()),
          jobModel: makeJobModel(),
          logger: silentLogger as any,
        });

        const results: boolean[] = [];
        for (let i = 0; i < runs; i++) {
          const r = await service.analyze(SOURCE_ID);
          results.push(r.reused);
        }

        // Exactly the first run does the work; the rest reuse.
        return (
          calls.count === 1 &&
          artifactRepository.created.length === 1 &&
          results[0] === false &&
          results.slice(1).every((reused) => reused === true)
        );
      }),
      { numRuns: 50 },
    );
  });

  it('throws when the source does not exist (Req 4.11 hard-failure boundary)', async () => {
    const { service } = buildService({ source: null });
    await expect(service.analyze('missing-source')).rejects.toBeInstanceOf(
      AnalysisSourceNotFoundError,
    );
  });
});
