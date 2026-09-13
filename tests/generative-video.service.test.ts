/**
 * Unit tests for the GENERATIVE video service (Track 3, Google: Veo + Gemini
 * Omni Flash). The `@google/genai` client is fully MOCKED via the injectable
 * client factory — NO real network calls are made.
 *
 * No-Mock discipline (Req 23) is the core contract under test: a real artifact
 * is persisted ONLY when Google actually returns video bytes; every no-video /
 * safety-filtered / timeout path degrades honestly and creates NO artifact.
 *
 * Framework: vitest.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  GenerativeVideoService,
  localizerModelId,
  formatProviderRetryAfter,
  type GenerativeVideoClient,
} from '../server/features/video-editor/services/generative-video.service';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const B64_VIDEO = Buffer.from('fake-video-bytes').toString('base64');

/** A storage stub that returns source bytes for editVideo's download step. */
function fakeStorage() {
  return {
    downloadFile: vi
      .fn()
      .mockResolvedValue({ buffer: Buffer.from('source-bytes'), contentType: 'video/mp4' }),
  } as any;
}

/** An artifact repository stub that records the persisted provenance. */
function fakeArtifactRepo() {
  return {
    createArtifact: vi.fn().mockResolvedValue({
      artifact: { artifactId: 'gen-art-1' },
      storageKey: 'video-editor/p1/generated/gen-art-1.mp4',
      url: 'https://cdn/gen-art-1.mp4',
    }),
  };
}

/** Common identity fields for both methods. */
const IDS = {
  projectId: 'p1',
  workspaceId: 'w1',
  userId: 'u1',
  jobId: 'job-1',
  inputVersionId: 'v1',
  apiKey: 'test-key', // bypasses the env-config gate deterministically
};

/** Build a mock client with per-test overrides for the parts we exercise. */
function makeClient(overrides: {
  generateContent?: any;
  generateVideos?: any;
  getVideosOperation?: any;
  upload?: any;
  get?: any;
  download?: any;
}): GenerativeVideoClient {
  return {
    models: {
      generateContent: overrides.generateContent ?? vi.fn(),
      generateVideos: overrides.generateVideos ?? vi.fn(),
    },
    operations: {
      getVideosOperation: overrides.getVideosOperation ?? vi.fn(),
    },
    files: {
      upload:
        overrides.upload ??
        vi.fn().mockResolvedValue({ name: 'files/abc', uri: 'https://files/abc', state: 'ACTIVE' }),
      get: overrides.get ?? vi.fn().mockResolvedValue({ state: 'ACTIVE', uri: 'https://files/abc' }),
      download: overrides.download ?? vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as GenerativeVideoClient;
}

/**
 * Build a fake Interactions API transport (no real network). Given an ordered
 * list of JSON bodies, each call returns the next one as an ok Response; extra
 * calls repeat the last. Set `ok:false` + `status` to simulate a provider error.
 */
function fakeInteractionsFetch(
  responses: Array<{ ok?: boolean; status?: number; json: any }>,
): typeof fetch {
  let i = 0;
  return (async (_url: any, _init?: any) => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return {
      ok: r.ok !== false,
      status: r.status ?? 200,
      text: async () => JSON.stringify(r.json),
      arrayBuffer: async () =>
        Buffer.from(typeof r.json === 'string' ? r.json : 'edited-video-bytes'),
    } as any;
  }) as unknown as typeof fetch;
}

/** A completed interaction carrying an inline base64 video block. */
function completedWithInlineVideo(data: string) {
  return {
    id: 'v1_test',
    status: 'completed',
    steps: [
      { type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data }] },
    ],
  };
}

/** A completed interaction carrying only a text block (no video → honest degrade). */
function completedWithTextOnly(text: string) {
  return {
    id: 'v1_test',
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
  };
}

/** Fast, deterministic service factory: instant sleep, tiny wait budget. */
function makeService(
  client: GenerativeVideoClient,
  artifactRepository: any,
  interactionsFetch?: typeof fetch,
) {
  return new GenerativeVideoService({
    clientFactory: () => client,
    storage: fakeStorage(),
    artifactRepository,
    sleep: () => Promise.resolve(),
    maxWaitMs: 200,
    pollIntervalMs: 5,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    // Default: a fetch that always 400s, so any test that doesn't opt into a
    // real interactions response degrades honestly WITHOUT touching the network.
    interactionsFetch:
      interactionsFetch ??
      fakeInteractionsFetch([{ ok: false, status: 400, json: { error: { message: 'no transport configured' } } }]),
  });
}

// ---------------------------------------------------------------------------
// editVideo (Gemini Omni Flash)
// ---------------------------------------------------------------------------

describe('GenerativeVideoService.editVideo', () => {
  it('returns rendered when the model returns an inlineData video part (persists ONE omni artifact)', async () => {
    const client = makeClient({});
    const repo = fakeArtifactRepo();
    // The edit runs through the Interactions API: one create call returns a
    // completed interaction with an inline video block.
    const svc = makeService(
      client,
      repo,
      fakeInteractionsFetch([{ json: completedWithInlineVideo(B64_VIDEO) }]),
    );

    const result = await svc.editVideo({
      ...IDS,
      sourceStorageKey: 'video-editor/p1/renders/in.mp4',
      sourceFileName: 'in.mp4',
      instruction: 'remove the person in the background, keep everything else',
      kind: 'object_removal',
    });

    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.artifactId).toBe('gen-art-1');
      expect(result.provider).toBe('gemini-omni-flash');
    }
    // Exactly ONE artifact persisted, with gemini-omni provenance.
    expect(repo.createArtifact).toHaveBeenCalledTimes(1);
    const persisted = repo.createArtifact.mock.calls[0][0];
    expect(persisted.category).toBe('generated');
    expect(persisted.provenance.provider).toBe('gemini-omni-flash');
    expect(persisted.provenance.jobId).toBe('job-1');
    expect(persisted.provenance.prompt).toContain('remove the person');
  });

  it('degrades honestly (no artifact) when the response has only text parts (No-Mock)', async () => {
    const client = makeClient({});
    const repo = fakeArtifactRepo();
    // Interactions API completes but returns only text (no video) → honest degrade.
    const svc = makeService(
      client,
      repo,
      fakeInteractionsFetch([{ json: completedWithTextOnly('I cannot edit this video directly.') }]),
    );

    const result = await svc.editVideo({
      ...IDS,
      sourceStorageKey: 'video-editor/p1/renders/in.mp4',
      sourceFileName: 'in.mp4',
      instruction: 'remove the logo',
      kind: 'object_removal',
    });

    expect(result.outcome).not.toBe('rendered');
    expect(['needs_async', 'error', 'clarification']).toContain(result.outcome);
    // No fabricated artifact.
    expect(repo.createArtifact).not.toHaveBeenCalled();
  });

  // A 429 daily-quota refusal must read as a TEMPORARY limit (with the reset
  // window), NOT as "model unavailable on this account" — that wording sent us
  // chasing a non-existent allowlist problem while the real cause was the
  // per-model per-day request cap.
  it('maps a 429 daily-quota refusal to a temporary limit message with the reset window', async () => {
    const client = makeClient({});
    const repo = fakeArtifactRepo();
    const svc = makeService(
      client,
      repo,
      fakeInteractionsFetch([
        {
          ok: false,
          status: 429,
          json: {
            error: {
              code: 'too_many_requests',
              message:
                'You exceeded your current quota. * Quota exceeded for metric: '
                + 'generativelanguage.googleapis.com/generate_requests_per_model_per_day, '
                + 'limit: 20, model: gemini-omni-flash Please retry in 17h24m15.314736557s.',
            },
          },
        },
      ]),
    );

    const result = await svc.editVideo({
      ...IDS,
      sourceStorageKey: 'video-editor/p1/renders/in.mp4',
      sourceFileName: 'in.mp4',
      instruction: 'make it anime style',
      kind: 'background_replace',
    });

    expect(result.outcome).toBe('needs_async');
    if (result.outcome === 'needs_async') {
      expect(result.message).toMatch(/usage limit/i);
      expect(result.message).toMatch(/17 hours/);
      // Must NOT claim the model is unavailable for the account.
      expect(result.message).not.toMatch(/available on this account/i);
    }
    expect(repo.createArtifact).not.toHaveBeenCalled();
  });

  it('maps a depleted prepaid balance to a billing message (not a model problem)', async () => {
    const client = makeClient({});
    const repo = fakeArtifactRepo();
    const svc = makeService(
      client,
      repo,
      fakeInteractionsFetch([
        {
          ok: false,
          status: 429,
          json: {
            error: {
              code: 'too_many_requests',
              message:
                'Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.',
            },
          },
        },
      ]),
    );

    const result = await svc.editVideo({
      ...IDS,
      sourceStorageKey: 'video-editor/p1/renders/in.mp4',
      sourceFileName: 'in.mp4',
      instruction: 'make it anime style',
      kind: 'background_replace',
    });

    expect(result.outcome).toBe('needs_async');
    if (result.outcome === 'needs_async') {
      expect(result.message).toMatch(/no remaining credit/i);
    }
    expect(repo.createArtifact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// formatProviderRetryAfter (quota reset window parsing)
// ---------------------------------------------------------------------------

describe('formatProviderRetryAfter', () => {
  it('rounds an hours+minutes window to whole hours', () => {
    expect(formatProviderRetryAfter('Please retry in 17h24m15.31s.')).toBe('17 hours');
    // ≥30 remaining minutes rounds up.
    expect(formatProviderRetryAfter('Please retry in 2h45m0s.')).toBe('3 hours');
    expect(formatProviderRetryAfter('Please retry in 1h0m0s.')).toBe('1 hour');
  });

  it('handles minute- and second-scale windows', () => {
    expect(formatProviderRetryAfter('Please retry in 5m10s.')).toBe('5 minutes');
    expect(formatProviderRetryAfter('Please retry in 30.5s.')).toBe('31 seconds');
  });

  it('returns empty string when no window is present', () => {
    expect(formatProviderRetryAfter('You exceeded your current quota.')).toBe('');
    expect(formatProviderRetryAfter('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// generateVideo (Veo)
// ---------------------------------------------------------------------------

describe('GenerativeVideoService.generateVideo', () => {
  it('polls the operation (not done → done) and returns rendered with inline video bytes', async () => {
    const startOp = { done: false, name: 'operations/xyz' };
    const doneOp = {
      done: true,
      response: {
        generatedVideos: [{ video: { videoBytes: B64_VIDEO, mimeType: 'video/mp4' } }],
      },
    };
    const getVideosOperation = vi.fn().mockResolvedValueOnce(doneOp);
    const client = makeClient({
      generateVideos: vi.fn().mockResolvedValue(startOp),
      getVideosOperation,
    });
    const repo = fakeArtifactRepo();
    const svc = makeService(client, repo);

    const result = await svc.generateVideo({
      ...IDS,
      prompt: 'a calm ocean at sunrise, cinematic',
      aspectRatio: '9:16',
      kind: 'generate',
    });

    // The operation was polled at least once before completion.
    expect(getVideosOperation).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('rendered');
    if (result.outcome === 'rendered') {
      expect(result.provider).toBe('veo');
      expect(result.artifactId).toBe('gen-art-1');
    }
    expect(repo.createArtifact).toHaveBeenCalledTimes(1);
    expect(repo.createArtifact.mock.calls[0][0].provenance.provider).toBe('veo');
  });

  it('degrades honestly when raiMediaFilteredCount > 0 (safety filter, no artifact)', async () => {
    const filteredOp = {
      done: true,
      response: { raiMediaFilteredCount: 1, raiMediaFilteredReasons: ['unsafe content'] },
    };
    const client = makeClient({
      generateVideos: vi.fn().mockResolvedValue(filteredOp),
    });
    const repo = fakeArtifactRepo();
    const svc = makeService(client, repo);

    const result = await svc.generateVideo({
      ...IDS,
      prompt: 'something blocked',
      kind: 'generate',
    });

    expect(result.outcome).not.toBe('rendered');
    expect(['clarification', 'needs_async', 'error']).toContain(result.outcome);
    expect(repo.createArtifact).not.toHaveBeenCalled();
  });

  it('times out honestly when the operation never completes within maxWait (needs_async, no artifact)', async () => {
    const neverDone = { done: false, name: 'operations/slow' };
    const client = makeClient({
      generateVideos: vi.fn().mockResolvedValue(neverDone),
      // Always returns a not-done op, so the loop only exits via the wait budget.
      getVideosOperation: vi.fn().mockResolvedValue(neverDone),
    });
    const repo = fakeArtifactRepo();
    // A real (tiny) sleep so wall-clock advances toward the small maxWait budget.
    const svc = new GenerativeVideoService({
      clientFactory: () => client,
      storage: fakeStorage(),
      artifactRepository: repo,
      sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
      maxWaitMs: 25,
      pollIntervalMs: 5,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });

    const result = await svc.generateVideo({
      ...IDS,
      prompt: 'a very slow render',
      kind: 'generate',
    });

    expect(['needs_async', 'error']).toContain(result.outcome);
    if (result.outcome === 'needs_async') {
      expect(result.message.toLowerCase()).toContain('longer');
    }
    // Never fabricate an artifact on timeout.
    expect(repo.createArtifact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// localizerModelId (cheap localizer model resolver, env-overridable)
// ---------------------------------------------------------------------------

describe('localizerModelId', () => {
  const ENV_KEY = 'GEMINI_LOCALIZER_MODEL';
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = saved;
    }
  });

  it('returns the gemini-2.5-flash default when the env var is unset', () => {
    delete process.env[ENV_KEY];
    expect(localizerModelId()).toBe('gemini-2.5-flash');
  });

  it('returns the gemini-2.5-flash default when the env var is an empty string', () => {
    process.env[ENV_KEY] = '';
    expect(localizerModelId()).toBe('gemini-2.5-flash');
  });

  it('returns the configured value verbatim when the env var is set to a non-empty value', () => {
    process.env[ENV_KEY] = 'gemini-custom-vision-model';
    expect(localizerModelId()).toBe('gemini-custom-vision-model');
  });
});
