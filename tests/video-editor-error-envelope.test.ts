/**
 * Unit tests for the shared Video Editor error-envelope + secret-redaction
 * helpers (task 21.1, Req 19.8, 21.6, 21.7, 23.4, 23.5).
 *
 * Framework: vitest.
 *
 * Covers:
 *  - `ok` / `fail` produce the `{ success, data | error }` envelope, and `fail`
 *    redacts secrets embedded in the message (Req 19.8);
 *  - `redactSecrets` scrubs bearer tokens, secret key=value pairs, provider key
 *    shapes, signed-URL signatures, and secret-keyed object fields, while
 *    leaving harmless values untouched (Req 19.8, 22.4);
 *  - `zodIssueMessage` names the failed constraint (Req 21.6);
 *  - `sendError` maps ZodError → 400, typed errors → their status/code, and any
 *    other error → a generic 500 with no secret leakage, logging full detail
 *    server-side only (Req 19.8, 21.7, 23.5);
 *  - `unavailable` surfaces an explicit unavailable state (Req 23.4).
 *
 * These are example/edge-case unit tests; the universal redaction invariant is
 * covered by the property test in task 21.2 (Property 48).
 */

import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import { z, ZodError } from 'zod';

import {
  ok,
  fail,
  unavailable,
  redactSecrets,
  zodIssueMessage,
  isTypedHttpError,
  sendError,
  REDACTED,
  type TypedHttpError,
} from '../server/features/video-editor/api/error-envelope';

// ── A minimal fake Express Response that captures status + JSON body ──────────

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

describe('error-envelope: ok / fail', () => {
  it('ok wraps data in a success envelope with the given status', () => {
    const c = makeRes();
    ok(c.res, { projectId: 'p1' }, 201);
    expect(c.statusCode).toBe(201);
    expect(c.body).toEqual({ success: true, data: { projectId: 'p1' } });
  });

  it('ok defaults to status 200', () => {
    const c = makeRes();
    ok(c.res, [1, 2, 3]);
    expect(c.statusCode).toBe(200);
    expect(c.body).toEqual({ success: true, data: [1, 2, 3] });
  });

  it('fail produces a failure envelope and redacts secrets in the message', () => {
    const c = makeRes();
    fail(c.res, 400, 'VALIDATION_ERROR', 'bad token=abcdef123456 supplied');
    expect(c.statusCode).toBe(400);
    expect(c.body).toEqual({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: `bad token=${REDACTED} supplied` },
    });
  });

  it('unavailable surfaces an explicit unavailable state (Req 23.4)', () => {
    const c = makeRes();
    unavailable(c.res, 'object removal is not yet supported for this provider');
    expect(c.statusCode).toBe(501);
    expect(c.body).toEqual({
      success: false,
      error: {
        code: 'CAPABILITY_UNAVAILABLE',
        message: 'object removal is not yet supported for this provider',
      },
    });
  });
});

describe('error-envelope: redactSecrets', () => {
  it('redacts a Bearer authorization value', () => {
    expect(redactSecrets('Authorization: Bearer abcDEF123456.gh-ij')).toBe(
      `Authorization: Bearer ${REDACTED}`,
    );
  });

  it('redacts secret key=value pairs (logfmt / query)', () => {
    expect(redactSecrets('api_key=dummy_stripe_key_supersecret&w=100')).toBe(`api_key=${REDACTED}&w=100`);
    expect(redactSecrets('password: hunter2')).toContain(REDACTED);
  });

  it('redacts provider key shapes appearing as bare tokens', () => {
    expect(redactSecrets('key sk-ABCDEFGH12345678 leaked')).toBe(`key ${REDACTED} leaked`);
    expect(redactSecrets('dummy_google_key')).toBe(REDACTED);
  });

  it('scrubs the signature from a signed URL but keeps the path', () => {
    const url =
      'https://storage.example.com/renders/out.mp4?X-Goog-Signature=deadbeefcafe&response-content-type=video/mp4';
    const out = redactSecrets(url);
    expect(out).toContain('https://storage.example.com/renders/out.mp4');
    expect(out).toContain(`X-Goog-Signature=${REDACTED}`);
    expect(out).not.toContain('deadbeefcafe');
  });

  it('redacts values of secret-keyed object fields recursively', () => {
    const input = {
      projectId: 'p1',
      accessToken: 'tok_abc123',
      nested: { apiKey: 'sk-XXXXXXXXXXXX', harmless: 42 },
      list: [{ token: 'zzz' }, { ok: true }],
    };
    const out = redactSecrets(input);
    expect(out).toEqual({
      projectId: 'p1',
      accessToken: REDACTED,
      nested: { apiKey: REDACTED, harmless: 42 },
      list: [{ token: REDACTED }, { ok: true }],
    });
  });

  it('leaves harmless values untouched', () => {
    expect(redactSecrets('resize to 1080x1920 at 30fps')).toBe('resize to 1080x1920 at 30fps');
    expect(redactSecrets({ width: 1080, name: 'my clip', url: 'https://cdn.example.com/a.mp4?w=5' }))
      .toEqual({ width: 1080, name: 'my clip', url: 'https://cdn.example.com/a.mp4?w=5' });
  });

  it('handles null, primitives, and circular references safely', () => {
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(123)).toBe(123);
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => redactSecrets(circular)).not.toThrow();
  });

  it('reduces an Error to its (redacted) message', () => {
    expect(redactSecrets(new Error('failed with token=abc123secret'))).toBe(
      `failed with token=${REDACTED}`,
    );
  });
});

describe('error-envelope: zodIssueMessage', () => {
  it('names the failed field and constraint', () => {
    const schema = z.object({ name: z.string().min(1, 'name is required') });
    const parsed = schema.safeParse({ name: '' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(zodIssueMessage(parsed.error)).toBe('name: name is required');
    }
  });

  it('falls back to a generic message when there is no issue', () => {
    expect(zodIssueMessage(new ZodError([]))).toBe('Invalid request');
  });
});

describe('error-envelope: isTypedHttpError', () => {
  it('recognizes an Error with a 4xx/5xx statusCode + code', () => {
    expect(isTypedHttpError(new FakeTypedError(422, 'BAD', 'x'))).toBe(true);
  });

  it('rejects plain errors and non-errors', () => {
    expect(isTypedHttpError(new Error('plain'))).toBe(false);
    expect(isTypedHttpError({ statusCode: 400, code: 'X' })).toBe(false);
    expect(isTypedHttpError(null)).toBe(false);
  });
});

describe('error-envelope: sendError', () => {
  const component = 'videoEditor.TestRouter';

  it('maps a ZodError to 400 VALIDATION_ERROR naming the constraint (Req 21.6)', () => {
    const c = makeRes();
    const schema = z.object({ name: z.string().min(1, 'name is required') });
    const parsed = schema.safeParse({ name: '' });
    const logger = { warn: vi.fn(), error: vi.fn() };
    if (!parsed.success) {
      sendError(c.res, parsed.error, { component, op: 'create', logger });
    }
    expect(c.statusCode).toBe(400);
    expect(c.body).toEqual({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'name: name is required' },
    });
    // A client-input error is not logged as a server fault.
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('maps a typed 4xx error to its status/code and logs at warn, not error', () => {
    const c = makeRes();
    const logger = { warn: vi.fn(), error: vi.fn() };
    sendError(c.res, new FakeTypedError(422, 'RENDER_INVALID', 'bad render'), {
      component,
      op: 'render',
      logger,
    });
    expect(c.statusCode).toBe(422);
    expect(c.body).toEqual({
      success: false,
      error: { code: 'RENDER_INVALID', message: 'bad render' },
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('maps an unexpected error to a generic 500 without leaking detail, logging full detail server-side (Req 19.8)', () => {
    const c = makeRes();
    const logger = { warn: vi.fn(), error: vi.fn() };
    const boom = new Error('connect ECONNREFUSED with api_key=sk-secretvalue123');
    sendError(c.res, boom, {
      component,
      op: 'create',
      context: { userId: 'u1', workspaceId: 'w1' },
      fallbackCode: 'VIDEO_PROJECT_ERROR',
      fallbackMessage: 'The video project request could not be completed',
      logger,
    });
    expect(c.statusCode).toBe(500);
    expect(c.body).toEqual({
      success: false,
      error: {
        code: 'VIDEO_PROJECT_ERROR',
        message: 'The video project request could not be completed',
      },
    });
    // Full error object is logged server-side (with the ids as context).
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [, loggedErr] = logger.error.mock.calls[0];
    expect(loggedErr).toBe(boom);
    // The user-facing body never contains the secret.
    expect(JSON.stringify(c.body)).not.toContain('sk-secretvalue123');
  });

  it('logs a typed 5xx error at error level', () => {
    const c = makeRes();
    const logger = { warn: vi.fn(), error: vi.fn() };
    sendError(c.res, new FakeTypedError(503, 'UPSTREAM_DOWN', 'provider down'), {
      component,
      logger,
    });
    expect(c.statusCode).toBe(503);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
