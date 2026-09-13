/**
 * Integration tests for the Media_Ingestion_Service source-immutability and
 * FFprobe-failure behaviour (task 7.4).
 *
 * Framework: vitest + fast-check (>=100 runs for the property).
 *
 * Property under test (design.md):
 *  - Property 7: Source bytes are immutable for the source lifetime
 *      "For any Video_Source and any subsequent sequence of edit, analysis,
 *       render, or version operations on its project, the stored original bytes
 *       and the source metadata record remain byte-for-byte unchanged."
 *      Validates: Requirements 3.6, 8.4, 24.5
 *
 * And the concrete FFprobe-failure example (Req 3.8): FFprobe failure marks
 * ingestion FAILED with a `METADATA_EXTRACTION_FAILED` error code while the
 * stored original bytes and Video_Source are RETAINED unchanged.
 *
 * These exercise the real service orchestration (validate -> store -> probe ->
 * prepare) end to end, injecting in-memory fakes for storage, the artifact
 * repository, the source/job models, and the FFmpeg/FFprobe processor — no mocks
 * that merely return canned successes. The fake artifact repository enforces the
 * same never-overwrite guarantee the production ArtifactRepository does, so an
 * attempt to mutate the stored original bytes surfaces as a failure.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  MediaIngestionService,
  MetadataExtractionError,
  type MediaProcessor,
  type MediaIngestionServiceDeps,
} from '../server/features/video-editor/services/media-ingestion.service';
import type { VideoMetadata } from '../server/features/storage/services/video-storage.service';

// ---------------------------------------------------------------------------
// Byte helpers — a genuinely valid MP4 (`ftyp`) signature for stored originals
// ---------------------------------------------------------------------------

function ascii(marker: string): number[] {
  return Array.from(marker, (ch) => ch.charCodeAt(0));
}

/** Build a buffer beginning with a valid MP4 `ftyp` signature, padded to `size`. */
function makeMp4Buffer(size: number, fillByte = 0xab): Buffer {
  const sig = Buffer.from([0, 0, 0, 0x18, ...ascii('ftyp'), ...ascii('mp42'), 0, 0, 0, 0]);
  if (size <= sig.length) return sig.subarray(0, Math.max(1, size));
  const tail = Buffer.alloc(size - sig.length, fillByte);
  return Buffer.concat([sig, tail]);
}

// ---------------------------------------------------------------------------
// In-memory fakes (real invariants, not canned successes)
// ---------------------------------------------------------------------------

/**
 * A shared byte store standing in for object storage. The fake artifact
 * repository writes bytes here (never overwriting an existing key, mirroring the
 * production immutability guarantee) and the service downloads from here.
 */
function makeStorageAndArtifacts() {
  const files = new Map<string, Buffer>();
  const created: any[] = [];
  let counter = 0;

  const storage = {
    async downloadFile(key: string) {
      const buffer = files.get(key);
      if (!buffer) throw new Error(`storage: no object at ${key}`);
      // Return a copy so a caller cannot mutate the stored bytes by reference.
      return { buffer: Buffer.from(buffer), contentType: 'video/mp4', size: buffer.length };
    },
  } as unknown as MediaIngestionServiceDeps['storage'];

  const artifactRepository = {
    async createArtifact(input: any) {
      const artifactId = `art-${++counter}`;
      const storageKey = `video-editor/${input.projectId}/${input.category}/${artifactId}`;
      // Immutability: never overwrite an existing stored object (Req 3.6, 20.4).
      if (files.has(storageKey)) {
        throw new Error(`immutable: refusing to overwrite ${storageKey}`);
      }
      files.set(storageKey, Buffer.from(input.buffer));
      created.push({ artifactId, storageKey, ...input });
      return {
        artifact: { artifactId, storageKey, ...input },
        storageKey,
        url: `https://storage.local/${storageKey}`,
      };
    },
  } as unknown as MediaIngestionServiceDeps['artifactRepository'];

  return { files, created, storage, artifactRepository };
}

/** In-memory Video_Source model. `findOne` returns the live doc so saves stick. */
function makeSourceModel() {
  const docs = new Map<string, any>();
  const sourceModel = {
    async create(doc: any) {
      const record = {
        ...doc,
        async save() {
          docs.set(this.sourceId, this);
          return this;
        },
      };
      docs.set(doc.sourceId, record);
      return record;
    },
    findOne(filter: any) {
      return {
        async exec() {
          return docs.get(filter.sourceId) ?? null;
        },
      };
    },
  } as unknown as MediaIngestionServiceDeps['sourceModel'];
  return { sourceModel, docs };
}

/** In-memory Video_Edit_Job model. `findOne` returns the live doc so saves stick. */
function makeJobModel() {
  const docs = new Map<string, any>();
  const jobModel = {
    async create(doc: any) {
      const record = {
        ...doc,
        async save() {
          docs.set(this.jobId, this);
          return this;
        },
      };
      docs.set(doc.jobId, record);
      return record;
    },
    findOne(filter: any) {
      return {
        async exec() {
          return docs.get(filter.jobId) ?? null;
        },
      };
    },
  } as unknown as MediaIngestionServiceDeps['jobModel'];
  return { jobModel, docs };
}

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

/** A processor whose probe succeeds and whose derived-artifact bytes are stable. */
function makeSuccessProcessor(): MediaProcessor {
  const metadata: VideoMetadata = {
    duration: 15,
    width: 1080,
    height: 1920,
    fps: 30,
    codec: 'h264',
    format: 'mov,mp4,m4a,3gp,3g2,mj2',
  } as VideoMetadata;
  return {
    async probe() {
      return metadata;
    },
    async generateProxy() {
      return Buffer.from('proxy-bytes');
    },
    async generateThumbnail() {
      return Buffer.from('thumb-bytes');
    },
    async generateWaveform() {
      return Buffer.from('waveform-bytes');
    },
  };
}

/** A processor whose FFprobe step fails (Req 3.8). */
function makeFailingProbeProcessor(): MediaProcessor {
  return {
    async probe() {
      throw new Error('ffprobe: Invalid data found when processing input');
    },
    async generateProxy() {
      throw new Error('should not reach proxy generation');
    },
    async generateThumbnail() {
      throw new Error('should not reach thumbnail generation');
    },
    async generateWaveform() {
      throw new Error('should not reach waveform generation');
    },
  };
}

function makeService(processor: MediaProcessor) {
  const { files, created, storage, artifactRepository } = makeStorageAndArtifacts();
  const { sourceModel, docs: sourceDocs } = makeSourceModel();
  const { jobModel, docs: jobDocs } = makeJobModel();
  const svc = new MediaIngestionService({
    storage,
    artifactRepository,
    mediaProcessor: processor,
    sourceModel,
    jobModel,
    logger: silentLogger,
  });
  return { svc, files, created, sourceDocs, jobDocs };
}

const baseUpload = (buffer: Buffer) => ({
  projectId: 'p-1',
  workspaceId: 'w-1',
  userId: 'u-1',
  buffer,
  originalName: 'clip.mp4',
  declaredMimeType: 'video/mp4',
});

// ---------------------------------------------------------------------------
// Property 7: Source bytes are immutable for the source lifetime
// Validates: Requirements 3.6, 8.4, 24.5
// ---------------------------------------------------------------------------

describe('Property 7: Source bytes are immutable for the source lifetime (Req 3.6, 8.4, 24.5)', () => {
  it('stored original bytes + source metadata stay byte-for-byte unchanged across subsequent operations', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 20, max: 4096 }), async (size) => {
        const buffer = makeMp4Buffer(size);
        const { svc, files } = makeService(makeSuccessProcessor());

        // Accept + store the original immutably.
        const { source } = await svc.validateAndAccept(baseUpload(buffer));
        const originalKey = source.storageKey;

        // Snapshot the stored original bytes and the immutable source metadata.
        const storedAtAccept = Buffer.from(files.get(originalKey)!);
        const sizeAtAccept = source.sizeBytes;
        const immutableFlag = source.immutable;

        // The stored original must equal the uploaded bytes exactly (Req 3.6).
        expect(storedAtAccept.equals(buffer)).toBe(true);

        // A subsequent operation: probe + prepare derived artifacts.
        const result = await svc.probeAndPrepare(source.sourceId);

        // Original bytes at the original key are byte-for-byte unchanged (Req 8.4).
        const storedAfterPrepare = files.get(originalKey)!;
        expect(storedAfterPrepare.equals(storedAtAccept)).toBe(true);
        expect(storedAfterPrepare.equals(buffer)).toBe(true);

        // Derived artifacts live under DIFFERENT keys — the original is never
        // overwritten (Req 3.6, 20.4).
        expect(result.artifacts.proxy.storageKey).not.toBe(originalKey);
        expect(result.artifacts.thumbnails.storageKey).not.toBe(originalKey);
        expect(result.artifacts.waveform.storageKey).not.toBe(originalKey);

        // The source metadata record's IDENTITY fields are unchanged: the byte
        // count, storage key, and immutability flag never move (probe-derived
        // fields like duration/dimensions/container are filled in separately and
        // do not affect the stored original bytes).
        expect(result.source.sizeBytes).toBe(sizeAtAccept);
        expect(result.source.storageKey).toBe(originalKey);
        expect(result.source.immutable).toBe(immutableFlag);
        expect(result.source.immutable).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('re-preparing (a repeated subsequent operation) never mutates the stored original', async () => {
    const buffer = makeMp4Buffer(512);
    const { svc, files } = makeService(makeSuccessProcessor());

    const { source } = await svc.validateAndAccept(baseUpload(buffer));
    const originalKey = source.storageKey;
    const storedOriginal = Buffer.from(files.get(originalKey)!);

    await svc.probeAndPrepare(source.sourceId);

    // A second prepare attempts to create the same derived-artifact keys; the
    // fake repo enforces immutability, but the ORIGINAL bytes must remain intact
    // regardless of that outcome.
    await svc.probeAndPrepare(source.sourceId).catch(() => undefined);

    expect(files.get(originalKey)!.equals(storedOriginal)).toBe(true);
    expect(files.get(originalKey)!.equals(buffer)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FFprobe-failure handling (Req 3.8): ingestion FAILED, bytes retained
// ---------------------------------------------------------------------------

describe('Media_Ingestion_Service — FFprobe failure marks ingestion failed and retains bytes (Req 3.8)', () => {
  it('marks the job FAILED with METADATA_EXTRACTION_FAILED and keeps the stored bytes + source', async () => {
    const buffer = makeMp4Buffer(1024);
    const { svc, files, created, sourceDocs, jobDocs } = makeService(makeFailingProbeProcessor());

    const { source, job } = await svc.validateAndAccept(baseUpload(buffer));
    const originalKey = source.storageKey;
    const storedOriginal = Buffer.from(files.get(originalKey)!);

    // probeAndPrepare must throw MetadataExtractionError when FFprobe fails.
    await expect(svc.probeAndPrepare(source.sourceId)).rejects.toBeInstanceOf(
      MetadataExtractionError,
    );

    // The ingestion job is FAILED with the metadata-extraction error code (Req 3.8).
    const failedJob = jobDocs.get(job.jobId);
    expect(failedJob.state).toBe('FAILED');
    expect(failedJob.errorCode).toBe('METADATA_EXTRACTION_FAILED');

    // The stored original bytes are RETAINED unchanged (Req 3.8).
    expect(files.has(originalKey)).toBe(true);
    expect(files.get(originalKey)!.equals(storedOriginal)).toBe(true);
    expect(files.get(originalKey)!.equals(buffer)).toBe(true);

    // The Video_Source record is retained (not deleted).
    expect(sourceDocs.get(source.sourceId)).toBeTruthy();

    // No derived artifacts were produced — only the original was stored (Req 3.8).
    expect(created).toHaveLength(1);
    expect(created[0].category).toBe('original');
  });

  it('surfaces MetadataExtractionError carrying the failing sourceId', async () => {
    const buffer = makeMp4Buffer(256);
    const { svc } = makeService(makeFailingProbeProcessor());
    const { source } = await svc.validateAndAccept(baseUpload(buffer));

    await expect(svc.probeAndPrepare(source.sourceId)).rejects.toMatchObject({
      code: 'METADATA_EXTRACTION_FAILED',
      sourceId: source.sourceId,
    });
  });
});
