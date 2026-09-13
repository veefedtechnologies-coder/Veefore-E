/**
 * Property tests for the Video Editor security-hardening + no-mock integrity
 * guarantees (task 21.2).
 *
 * Framework: vitest + fast-check + supertest.
 *
 * Implements the three named correctness properties from design.md that back
 * the error-envelope / secret-redaction helpers (task 21.1,
 * `server/features/video-editor/api/error-envelope.ts`) and the Video_Project
 * router's input-validation / no-mock integrity behaviour:
 *
 *  - **Property 48: Secrets never appear in user-facing errors or logs** — for
 *    ANY error returned to a caller, the user-facing output contains no provider
 *    API keys, secrets, authentication tokens, or signed/private media URL
 *    signatures. Full detail is logged server-side only (never echoed to the
 *    client). **Validates: Requirements 19.8, 22.4**
 *
 *  - **Property 51: Invalid endpoint input is rejected without mutating state**
 *    — for ANY request to an input-accepting endpoint that omits a required
 *    field or supplies a value failing validation, the request is rejected with
 *    a 400 that names the failed constraint, and no `Video_Editor` record is
 *    created or mutated. **Validates: Requirements 21.6**
 *
 *  - **Property 52: A failed backend operation preserves pre-operation state and
 *    never fabricates success** — for ANY backend operation that fails, the
 *    caller receives a failure state (never a success envelope), the
 *    pre-operation state of affected data is preserved, and capabilities that
 *    cannot be implemented surface an explicit unavailable state rather than a
 *    fake success. **Validates: Requirements 23.4, 23.5**
 *
 * The auth + workspace middleware are stubbed so identity is header-driven
 * (server-derived identity, Req 19.5); the project store is an injected
 * in-memory implementation that records every mutation, so the tests can assert
 * that rejected/failed requests mutate nothing. No DB, no Redis, no mocks of the
 * unit under test.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import type { Response } from 'express';
import express, { type Express, type Request, type NextFunction } from 'express';
import request from 'supertest';

// Stub auth: set req.user.id from a test header (server-derived identity, Req 19.5).
vi.mock('../server/middleware/require-auth', () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const userId = req.header('x-test-user');
    if (userId) (req as Request & { user?: unknown }).user = { id: userId };
    next();
  },
}));

// Stub workspace access: set req.workspaceId from a test header.
vi.mock('../server/middleware/workspace-validation', () => ({
  validateWorkspaceAccess:
    () => (req: Request, _res: Response, next: NextFunction) => {
      const workspaceId = req.header('x-test-workspace');
      if (workspaceId) (req as Request & { workspaceId?: unknown }).workspaceId = workspaceId;
      next();
    },
}));

import {
  ok,
  fail,
  unavailable,
  sendError,
  redactSecrets,
  REDACTED,
  type TypedHttpError,
} from '../server/features/video-editor/api/error-envelope';
import {
  createVideoEditorProjectRouter,
  type CreateProjectInput,
  type UpdateProjectPatch,
  type VideoEditorRouterDeps,
  type VideoProjectRecord,
  type VideoProjectStore,
} from '../server/features/video-editor/api/project.routes';

// ---------------------------------------------------------------------------
// Fake Express Response capturing status + JSON body (for helper-level tests).
// ---------------------------------------------------------------------------

interface CapturedResponse {
  res: Response;
  statusCode: number;
  body: unknown;
}

function makeRes(): CapturedResponse {
  const captured: CapturedResponse = { res: undefined as never, statusCode: 200, body: undefined };
  const res = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;
  captured.res = res;
  return captured;
}

/** A typed HTTP error following the Video Editor convention (statusCode + code). */
class FakeTypedError extends Error implements TypedHttpError {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FakeTypedError';
  }
}

// ---------------------------------------------------------------------------
// Secret generators — every carrier embeds a distinctive secret VALUE and the
// text/URL/object form a redactor MUST scrub. Secret values are long random
// tokens so a collision with harmless text is effectively impossible.
// ---------------------------------------------------------------------------

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT = '0123456789';
const ALNUM = (LOWER + UPPER + DIGIT).split('');
const UPPER_DIGIT = (UPPER + DIGIT).split('');
const TOKEN_CHARS = [...ALNUM, '.', '_', '-'];

function alnum(min: number, max: number) {
  return fc.array(fc.constantFrom(...ALNUM), { minLength: min, maxLength: max }).map((c) => c.join(''));
}

interface SecretCarrier {
  /** The raw secret value that must NOT survive redaction. */
  secret: string;
  /** A free-text message that embeds the secret in a redactable form. */
  text: string;
}

// (1) Well-known provider key shapes surfaced as bare tokens.
const providerKeyArb: fc.Arbitrary<SecretCarrier> = fc
  .oneof(
    alnum(8, 30).map((t) => `sk-${t}`),
    fc
      .array(fc.constantFrom(...[...ALNUM, '_', '-']), { minLength: 12, maxLength: 30 })
      .map((c) => `AIza${c.join('')}`),
    fc.array(fc.constantFrom(...UPPER_DIGIT), { minLength: 14, maxLength: 30 }).map((c) => `AKIA${c.join('')}`),
    alnum(20, 30).map((t) => `ghp_${t}`),
    fc
      .array(fc.constantFrom(...[...ALNUM, '-']), { minLength: 10, maxLength: 30 })
      .map((c) => `xoxb-${c.join('')}`),
  )
  .map((secret) => ({ secret, text: `provider rejected the request using key ${secret} at boot` }));

// (2) `secretKey=value` / `secretKey: value` pairs (logfmt / query text).
const SECRET_KEY_NAMES = [
  'api_key',
  'apiKey',
  'apikey',
  'access_key',
  'secret',
  'client_secret',
  'refresh_token',
  'access_token',
  'password',
  'authorization',
  'token',
  'signature',
];
const kvArb: fc.Arbitrary<SecretCarrier> = fc
  .record({
    key: fc.constantFrom(...SECRET_KEY_NAMES),
    sep: fc.constantFrom('=', ':', ': ', ' = '),
    value: alnum(16, 40),
  })
  .map(({ key, sep, value }) => ({
    secret: value,
    text: `connection failed: ${key}${sep}${value} while dialing upstream`,
  }));

// (3) Authorization schemes carrying an inline credential.
const bearerArb: fc.Arbitrary<SecretCarrier> = fc
  .record({
    scheme: fc.constantFrom('Bearer', 'Basic', 'token'),
    tok: fc.array(fc.constantFrom(...TOKEN_CHARS), { minLength: 16, maxLength: 40 }).map((c) => c.join('')),
  })
  .map(({ scheme, tok }) => ({ secret: tok, text: `auth header ${scheme} ${tok} was rejected` }));

// (4) Signed / credentialed media URLs.
const signedUrlArb: fc.Arbitrary<SecretCarrier> = fc
  .record({
    host: fc.constantFrom('storage.googleapis.com', 's3.amazonaws.com', 'cdn.example.com'),
    path: fc.array(fc.constantFrom(...LOWER.split('')), { minLength: 3, maxLength: 10 }).map((c) => c.join('')),
    param: fc.constantFrom('X-Goog-Signature', 'X-Amz-Signature', 'signature', 'sig', 'token', 'access_token'),
    sig: alnum(20, 50),
  })
  .map(({ host, path, param, sig }) => ({
    secret: sig,
    text: `could not fetch https://${host}/${path}/out.mp4?${param}=${sig}&w=100 (403)`,
  }));

const secretCarrierArb: fc.Arbitrary<SecretCarrier> = fc.oneof(
  providerKeyArb,
  kvArb,
  bearerArb,
  signedUrlArb,
);

// ---------------------------------------------------------------------------
// Property 48: Secrets never appear in user-facing errors or logs
// Validates: Requirements 19.8, 22.4
// ---------------------------------------------------------------------------

describe('Property 48: secrets never appear in user-facing errors or logs (Req 19.8, 22.4)', () => {
  it('redactSecrets scrubs every secret carrier from free text', () => {
    fc.assert(
      fc.property(secretCarrierArb, ({ text, secret }) => {
        const out = redactSecrets(text);
        // The secret value is gone and a redaction marker is present.
        expect(out).not.toContain(secret);
        expect(out).toContain(REDACTED);
      }),
      { numRuns: 200 },
    );
  });

  it('redactSecrets scrubs secret-keyed object fields and secrets nested in string fields', () => {
    // Any value under a secret-looking key is replaced wholesale, regardless of
    // the value's contents; secrets embedded in ordinary string fields are still
    // scrubbed from the text.
    fc.assert(
      fc.property(
        fc.constantFrom(...SECRET_KEY_NAMES),
        alnum(16, 40),
        secretCarrierArb,
        (secretKey, secretVal, carrier) => {
          const input: Record<string, unknown> = {
            projectId: 'vp-1',
            width: 1080,
            [secretKey]: secretVal,
            detail: carrier.text,
            nested: { [secretKey]: secretVal, harmless: 'resize to 1080x1920' },
          };
          const out = redactSecrets(input) as Record<string, unknown>;
          const serialized = JSON.stringify(out);
          // No secret value survives anywhere in the redacted structure.
          expect(serialized).not.toContain(secretVal);
          expect(serialized).not.toContain(carrier.secret);
          // Harmless, non-secret fields are preserved.
          expect(out.projectId).toBe('vp-1');
          expect(out.width).toBe(1080);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('fail() never surfaces a secret embedded in the message', () => {
    fc.assert(
      fc.property(
        secretCarrierArb,
        fc.integer({ min: 400, max: 599 }),
        fc.constantFrom('VALIDATION_ERROR', 'RENDER_INVALID', 'MEDIA_REJECTED'),
        (carrier, status, code) => {
          const c = makeRes();
          fail(c.res, status, code, carrier.text);
          const body = c.body as { success: boolean; error: { code: string; message: string } };
          expect(body.success).toBe(false);
          expect(body.error.code).toBe(code);
          expect(JSON.stringify(body)).not.toContain(carrier.secret);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('sendError() maps a typed error to its status/code without leaking the secret in its message', () => {
    fc.assert(
      fc.property(
        secretCarrierArb,
        fc.integer({ min: 400, max: 599 }),
        (carrier, status) => {
          const c = makeRes();
          const logger = { warn: vi.fn(), error: vi.fn() };
          sendError(c.res, new FakeTypedError(status, 'UPSTREAM_ERROR', carrier.text), {
            component: 'videoEditor.Test',
            op: 'edits',
            logger,
          });
          expect(c.statusCode).toBe(status);
          const body = c.body as { success: boolean; error: { code: string; message: string } };
          expect(body.success).toBe(false);
          // The user-facing message never contains the secret.
          expect(JSON.stringify(body)).not.toContain(carrier.secret);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('sendError() reduces an unexpected error to a fixed safe 500 while logging full detail server-side only', () => {
    fc.assert(
      fc.property(secretCarrierArb, (carrier) => {
        const c = makeRes();
        const logger = { warn: vi.fn(), error: vi.fn() };
        const raw = new Error(`connect failed: ${carrier.text}`);
        sendError(c.res, raw, {
          component: 'videoEditor.Test',
          op: 'create',
          context: { userId: 'u1', workspaceId: 'w1' },
          fallbackCode: 'VIDEO_PROJECT_ERROR',
          fallbackMessage: 'The video project request could not be completed',
          logger,
        });
        expect(c.statusCode).toBe(500);
        const body = c.body as { success: boolean; error: { code: string; message: string } };
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VIDEO_PROJECT_ERROR');
        expect(body.error.message).toBe('The video project request could not be completed');
        // The user-facing body carries no secret.
        expect(JSON.stringify(body)).not.toContain(carrier.secret);
        // Full detail is logged server-side (the raw Error object), never echoed
        // to the client. This is the intended single sink for the untruncated
        // error — the client body above proves nothing leaked to the caller.
        expect(logger.error).toHaveBeenCalledTimes(1);
        const [, loggedErr] = logger.error.mock.calls[0];
        expect(loggedErr).toBe(raw);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Recording store + router harness (shared by Properties 51 and 52).
// ---------------------------------------------------------------------------

interface MutationLog {
  creates: CreateProjectInput[];
  updates: Array<{ projectId: string; patch: UpdateProjectPatch }>;
  softDeletes: string[];
}

interface RecordingStore extends VideoProjectStore {
  readonly log: MutationLog;
  snapshot(): Record<string, VideoProjectRecord>;
}

function makeRecordingStore(seed: VideoProjectRecord[] = []): RecordingStore {
  const records = new Map<string, VideoProjectRecord>();
  for (const r of seed) records.set(r.projectId, { ...r });
  const log: MutationLog = { creates: [], updates: [], softDeletes: [] };

  return {
    log,
    snapshot() {
      const out: Record<string, VideoProjectRecord> = {};
      for (const [id, r] of records) out[id] = { ...r };
      return out;
    },
    async create(input) {
      log.creates.push(input);
      const now = new Date();
      const record: VideoProjectRecord = {
        projectId: input.projectId,
        userId: input.userId,
        workspaceId: input.workspaceId,
        name: input.name,
        targetPlatform: input.targetPlatform,
        retentionPolicyAllowsSourceDeletion: false,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      records.set(record.projectId, record);
      return { ...record };
    },
    async findById(projectId) {
      const r = records.get(projectId);
      return r ? { ...r } : null;
    },
    async listByOwner(workspaceId, userId) {
      return [...records.values()]
        .filter((r) => r.status === 'active' && r.workspaceId === workspaceId && r.userId === userId)
        .map((r) => ({ ...r }));
    },
    async update(projectId, patch) {
      log.updates.push({ projectId, patch });
      const r = records.get(projectId);
      if (!r || r.status === 'deleted') return null;
      if (patch.name !== undefined) r.name = patch.name;
      if (patch.targetPlatform !== undefined) r.targetPlatform = patch.targetPlatform;
      if (patch.activeVersionId !== undefined) r.activeVersionId = patch.activeVersionId;
      r.updatedAt = new Date();
      return { ...r };
    },
    async softDelete(projectId) {
      log.softDeletes.push(projectId);
      const r = records.get(projectId);
      if (!r || r.status === 'deleted') return null;
      r.status = 'deleted';
      r.updatedAt = new Date();
      return { ...r };
    },
  };
}

/**
 * A store whose reads work but whose MUTATING methods fail before touching
 * state — models a backend operation that fails (provider/render/db error). The
 * internal records are never modified on the failing path, so a snapshot taken
 * before a request equals the snapshot taken after (Property 52).
 */
function makeFailingStore(seed: VideoProjectRecord[], fail: () => never): RecordingStore {
  const base = makeRecordingStore(seed);
  return {
    ...base,
    log: base.log,
    snapshot: base.snapshot,
    findById: base.findById,
    listByOwner: base.listByOwner,
    async create() {
      fail();
    },
    async update() {
      fail();
    },
    async softDelete() {
      fail();
    },
  };
}

let idCounter = 0;
function makeApp(store: VideoProjectStore, overrides: Partial<VideoEditorRouterDeps> = {}): Express {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/video-editor',
    createVideoEditorProjectRouter({
      store,
      generateProjectId: () => `vp-test-${idCounter++}`,
      ...overrides,
    }),
  );
  return app;
}

function project(overrides: Partial<VideoProjectRecord> = {}): VideoProjectRecord {
  const now = new Date();
  return {
    projectId: 'proj-1',
    userId: 'owner-user',
    workspaceId: 'owner-ws',
    name: 'Owned project',
    retentionPolicyAllowsSourceDeletion: false,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const VALID_PLATFORM = 'tiktok';

// ---------------------------------------------------------------------------
// Property 51: Invalid endpoint input is rejected without mutating state
// Validates: Requirements 21.6
// ---------------------------------------------------------------------------

describe('Property 51: invalid endpoint input is rejected without mutating state (Req 21.6)', () => {
  const invalidCreateBody = fc.oneof(
    fc.constant<Record<string, unknown>>({}), // missing name
    fc.record({ name: fc.constant('') }), // empty name
    fc.record({ name: fc.constant('   ') }), // whitespace-only name
    fc.record({ name: fc.string({ minLength: 201, maxLength: 260 }).map((s) => `x${s}`) }), // too long
    fc.record({ name: fc.integer() }), // wrong type
    fc.record({
      name: fc.constant('ok'),
      targetPlatform: fc.string({ minLength: 1, maxLength: 12 }).map((s) => `bogus-${s}`),
    }), // unknown platform
  );

  it('POST /projects rejects invalid bodies with 400 naming the constraint and creates nothing', async () => {
    await fc.assert(
      fc.asyncProperty(invalidCreateBody, async (body) => {
        const store = makeRecordingStore();
        const app = makeApp(store);
        const before = store.snapshot();

        const res = await request(app)
          .post('/api/video-editor/projects')
          .set('x-test-user', 'u-1')
          .set('x-test-workspace', 'ws-1')
          .send(body as Record<string, unknown>);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(typeof res.body.error.message).toBe('string');
        expect(res.body.error.message.length).toBeGreaterThan(0);
        // No record created, no success fabricated (Req 21.6).
        expect(res.body.data).toBeUndefined();
        expect(store.log.creates).toHaveLength(0);
        expect(store.snapshot()).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });

  const invalidPatchBody = fc.oneof(
    fc.constant<Record<string, unknown>>({}), // empty patch — no updatable field
    fc.record({ name: fc.constant('') }), // empty name
    fc.record({ name: fc.constant('   ') }), // whitespace-only name
    fc.record({ name: fc.string({ minLength: 201, maxLength: 260 }).map((s) => `x${s}`) }), // too long
    fc.record({ targetPlatform: fc.string({ minLength: 1, maxLength: 12 }).map((s) => `bogus-${s}`) }), // unknown platform
    fc.record({ activeVersionId: fc.constant('') }), // empty activeVersionId
  );

  it('PATCH /projects/:id rejects invalid bodies with 400 and mutates nothing, even for an owned project', async () => {
    await fc.assert(
      fc.asyncProperty(invalidPatchBody, async (body) => {
        const owned = project({ name: 'original', targetPlatform: VALID_PLATFORM });
        const store = makeRecordingStore([owned]);
        const app = makeApp(store);
        const before = store.snapshot();

        const res = await request(app)
          .patch(`/api/video-editor/projects/${owned.projectId}`)
          .set('x-test-user', owned.userId)
          .set('x-test-workspace', owned.workspaceId)
          .send(body as Record<string, unknown>);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.message.length).toBeGreaterThan(0);
        // Nothing mutated (Req 21.6).
        expect(store.log.updates).toHaveLength(0);
        expect(store.snapshot()).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 52: A failed backend operation preserves pre-operation state and
// never fabricates success
// Validates: Requirements 23.4, 23.5
// ---------------------------------------------------------------------------

describe('Property 52: a failed backend operation preserves state and never fabricates success (Req 23.4, 23.5)', () => {
  // Model the failure with either a generic error (→ generic 500) or a typed
  // error carrying its own status/code (→ that status). Some carry a secret in
  // the message so we also re-assert no leakage on the failure path.
  const failureArb = fc.oneof(
    secretCarrierArb.map((c) => ({ kind: 'generic' as const, carrier: c })),
    fc
      .record({ status: fc.integer({ min: 500, max: 599 }), carrier: secretCarrierArb })
      .map(({ status, carrier }) => ({ kind: 'typed' as const, status, carrier })),
  );

  it('POST /projects that fails at persistence returns a failure envelope and creates nothing', async () => {
    await fc.assert(
      fc.asyncProperty(failureArb, async (f) => {
        const store = makeFailingStore([], () => {
          if (f.kind === 'typed') throw new FakeTypedError(f.status, 'PERSISTENCE_FAILED', f.carrier.text);
          throw new Error(`db write failed: ${f.carrier.text}`);
        });
        const app = makeApp(store);
        const before = store.snapshot();

        const res = await request(app)
          .post('/api/video-editor/projects')
          .set('x-test-user', 'u-1')
          .set('x-test-workspace', 'ws-1')
          .send({ name: 'My clip', targetPlatform: VALID_PLATFORM });

        // Failure state, never a fabricated success (Req 23.5).
        expect(res.status).toBeGreaterThanOrEqual(500);
        expect(res.body.success).toBe(false);
        expect(res.body.data).toBeUndefined();
        expect(res.body.error.code.length).toBeGreaterThan(0);
        // No secret leaks even on the failure path (Req 19.8).
        expect(JSON.stringify(res.body)).not.toContain(f.carrier.secret);
        // Pre-operation state preserved — nothing was persisted.
        expect(store.snapshot()).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });

  it('PATCH/DELETE on an owned project that fails preserves the pre-operation record', async () => {
    await fc.assert(
      fc.asyncProperty(failureArb, fc.constantFrom('patch', 'delete'), async (f, verb) => {
        const owned = project({ name: 'original', targetPlatform: VALID_PLATFORM });
        const store = makeFailingStore([owned], () => {
          if (f.kind === 'typed') throw new FakeTypedError(f.status, 'PERSISTENCE_FAILED', f.carrier.text);
          throw new Error(`db write failed: ${f.carrier.text}`);
        });
        const app = makeApp(store);
        const before = store.snapshot();

        const base = `/api/video-editor/projects/${owned.projectId}`;
        const req =
          verb === 'patch'
            ? request(app).patch(base).send({ name: 'renamed' })
            : request(app).delete(base);
        const res = await req
          .set('x-test-user', owned.userId)
          .set('x-test-workspace', owned.workspaceId);

        // Failure state, no success fabricated (Req 23.5).
        expect(res.status).toBeGreaterThanOrEqual(500);
        expect(res.body.success).toBe(false);
        expect(res.body.data).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toContain(f.carrier.secret);
        // The affected record is byte-for-byte unchanged (immutable recovery anchor).
        expect(store.snapshot()).toEqual(before);
        expect(store.snapshot()[owned.projectId].status).toBe('active');
        expect(store.snapshot()[owned.projectId].name).toBe('original');
      }),
      { numRuns: 100 },
    );
  });

  it('unavailable() surfaces an explicit unavailable state rather than a fake success (Req 23.4)', () => {
    fc.assert(
      fc.property(secretCarrierArb, (carrier) => {
        const c = makeRes();
        unavailable(c.res, `capability not yet implemented: ${carrier.text}`);
        expect(c.statusCode).toBe(501);
        const body = c.body as { success: boolean; error: { code: string; message: string } };
        // Explicitly NOT a success — an unimplemented capability is never faked.
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('CAPABILITY_UNAVAILABLE');
        // Even the unavailable reason is redacted (Req 19.8).
        expect(JSON.stringify(body)).not.toContain(carrier.secret);
      }),
      { numRuns: 100 },
    );
  });

  it('example: ok() is the only success path, reached only when the operation actually executes', async () => {
    // Positive control: with a working store a valid create succeeds; with a
    // failing store the same request never yields success. Together these show
    // success is reported iff the operation executed (No-Mock, Req 23.5).
    const good = makeRecordingStore();
    const goodApp = makeApp(good);
    const okRes = await request(goodApp)
      .post('/api/video-editor/projects')
      .set('x-test-user', 'u-1')
      .set('x-test-workspace', 'ws-1')
      .send({ name: 'My clip', targetPlatform: VALID_PLATFORM });
    expect(okRes.status).toBe(201);
    expect(okRes.body.success).toBe(true);
    expect(good.log.creates).toHaveLength(1);

    // Sanity-check the helper directly: ok() always sets success:true.
    const c = makeRes();
    ok(c.res, { projectId: 'vp-x' }, 201);
    expect((c.body as { success: boolean }).success).toBe(true);
  });
});
