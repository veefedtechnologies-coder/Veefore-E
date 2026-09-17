import { describe, it, expect } from 'vitest';

import { buildAuthEventRecord, clientIpOf } from '../auth-audit';

/**
 * Requirement 10 — authentication audit logging.
 *
 * The critical property is 10.3: the log must NEVER contain credentials, session
 * cookie values, or tokens. These tests assert that directly, because a leak here
 * would turn the audit trail itself into a credential store.
 */

describe('buildAuthEventRecord', () => {
  it('records the required fields', () => {
    const rec = buildAuthEventRecord({
      type: 'login',
      userId: 'u1',
      clientIp: '203.0.113.9',
      path: '/api/auth/signin',
    });

    expect(rec.type).toBe('login');
    expect(rec.userId).toBe('u1');
    expect(rec.clientIp).toBe('203.0.113.9');
    expect(rec.path).toBe('/api/auth/signin');
    expect(rec.createdAt).toBeInstanceOf(Date);
  });

  it('normalises a missing userId to null rather than omitting it', () => {
    const rec = buildAuthEventRecord({ type: 'login_failed' });
    expect(rec.userId).toBeNull();
    expect(rec.clientIp).toBeNull();
  });

  it('stamps the time server-side so a caller cannot backdate an entry', () => {
    const before = Date.now();
    const rec = buildAuthEventRecord({ type: 'logout', detail: { createdAt: '1999-01-01' } });
    expect((rec.createdAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  describe('credential redaction (Requirement 10.3)', () => {
    it.each([
      'token',
      'idToken',
      'accessToken',
      'refreshToken',
      'customToken',
      'session',
      '__session',
      'auth_token',
      'cookie',
      'password',
      'secret',
      'authorization',
      'csrfToken',
      'apiKey',
    ])('redacts a "%s" field', (key) => {
      const rec = buildAuthEventRecord({
        type: 'auth_failure',
        detail: { [key]: 'super-secret-value' },
      });
      const detail = rec.detail as Record<string, unknown>;
      expect(detail[key]).toBe('[redacted]');
      expect(JSON.stringify(rec)).not.toContain('super-secret-value');
    });

    it('redacts case-insensitively and on partial matches', () => {
      const rec = buildAuthEventRecord({
        type: 'auth_failure',
        detail: { USER_PASSWORD: 'p', bearerTOKEN: 't' },
      });
      const detail = rec.detail as Record<string, unknown>;
      expect(detail.USER_PASSWORD).toBe('[redacted]');
      expect(detail.bearerTOKEN).toBe('[redacted]');
    });

    it('keeps benign scalar context intact', () => {
      const rec = buildAuthEventRecord({
        type: 'rate_limit',
        detail: { retryAfter: 60, blocked: true, note: 'threshold exceeded' },
      });
      expect(rec.detail).toEqual({ retryAfter: 60, blocked: true, note: 'threshold exceeded' });
    });

    it('reduces nested objects to a shape marker so secrets cannot hide inside', () => {
      const rec = buildAuthEventRecord({
        type: 'auth_failure',
        detail: { payload: { nestedToken: 'leak-me' }, list: [1, 2, 3] },
      });
      const detail = rec.detail as Record<string, unknown>;
      expect(detail.payload).toBe('[object]');
      expect(detail.list).toBe('[array:3]');
      expect(JSON.stringify(rec)).not.toContain('leak-me');
    });

    it('truncates a long string so a body cannot be smuggled in', () => {
      const rec = buildAuthEventRecord({
        type: 'auth_failure',
        detail: { note: 'x'.repeat(5000) },
      });
      expect((rec.detail as any).note.length).toBeLessThan(250);
    });

    it('leaves detail undefined when none is supplied', () => {
      expect(buildAuthEventRecord({ type: 'logout' }).detail).toBeUndefined();
    });
  });
});

describe('clientIpOf', () => {
  it('prefers the left-most x-forwarded-for entry (real client behind the proxy)', () => {
    const ip = clientIpOf({
      headers: { 'x-forwarded-for': '203.0.113.9, 70.41.3.18, 150.172.238.178' },
      ip: '10.0.0.1',
    });
    expect(ip).toBe('203.0.113.9');
  });

  it('falls back to req.ip when there is no forwarding header', () => {
    expect(clientIpOf({ headers: {}, ip: '10.0.0.5' })).toBe('10.0.0.5');
  });

  it('falls back to the socket address', () => {
    expect(clientIpOf({ headers: {}, socket: { remoteAddress: '10.0.0.7' } })).toBe('10.0.0.7');
  });

  it('returns null rather than throwing on a malformed request', () => {
    expect(clientIpOf(undefined)).toBeNull();
    expect(clientIpOf({})).toBeNull();
  });
});
