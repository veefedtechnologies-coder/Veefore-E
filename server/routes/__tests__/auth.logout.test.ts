import { describe, it, test, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
/**
 * Unit tests for POST /api/auth/logout endpoint
 * 
 * Validates Requirements 7.1, 7.2, 7.3, 7.4:
 * - Endpoint exposed at /api/auth/logout
 * - Clears auth_token cookie
 * - Clears session cookie
 * - Returns success response
 */

import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import authRouter from '../auth';

describe('POST /api/auth/logout', () => {
  let app: Express;

  beforeEach(() => {
    // Create a minimal Express app for testing
    app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/auth', authRouter);
  });

  it('should clear auth_token cookie - Requirement 7.2', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .expect(200);

    // Check that Set-Cookie header is present to clear auth_token
    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
    
    // Find the auth_token cookie
    const authTokenCookie = Array.isArray(cookies) 
      ? cookies.find((c: string) => c.startsWith('auth_token='))
      : cookies;
    
    expect(authTokenCookie).toBeDefined();
    
    // Verify Max-Age=0 or Expires in past (cookie clearing)
    expect(authTokenCookie).toMatch(/Max-Age=0|Expires=/);
  });

  it('should clear the durable __session cookie - Requirement 7.3', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .expect(200);

    // Check that Set-Cookie header is present to clear session
    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();

    // The durable, server-verifiable Firebase session cookie is named
    // `__session` — NOT `session`. This assertion previously looked for
    // `session=`, which never existed, so it passed vacuously/failed for the
    // wrong reason while the cookie that actually keeps a user signed in went
    // unchecked. If `__session` is not cleared, the SSR bootstrap keeps
    // resolving a valid session after logout.
    const cookieList = Array.isArray(cookies) ? cookies : [cookies as string];
    const sessionCookies = cookieList.filter((c: string) => c.startsWith('__session='));

    expect(sessionCookies.length).toBeGreaterThan(0);

    // Every emitted variant must actually expire the cookie.
    for (const cookie of sessionCookies) {
      expect(cookie).toMatch(/Max-Age=0|Expires=/);
    }
  });

  it('should return success response - Requirement 7.4', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toEqual({
      success: true,
      message: 'Logged out successfully',
    });
  });

  it('should expose endpoint at /api/auth/logout - Requirement 7.1', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .expect(200);

    // If we get a 200 response, the endpoint exists and is accessible
    expect(response.status).toBe(200);
  });

  it('should clear both cookies with correct security attributes', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .expect(200);

    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(Array.isArray(cookies)).toBe(true);
    expect((cookies as string[]).length).toBeGreaterThanOrEqual(2);

    // Verify both cookies have security attributes
    const cookieStrings = cookies as string[];
    
    cookieStrings.forEach((cookie) => {
      // All cookies should have HttpOnly
      expect(cookie).toMatch(/HttpOnly/);

      // SameSite=Lax is REQUIRED, not a weakening. Google OAuth returns to the
      // app via a top-level cross-site GET redirect, and 'Strict' would make the
      // browser withhold the auth cookie on that navigation, breaking sign-in.
      // 'Lax' still blocks the cross-site POST/PUT/PATCH/DELETE vectors CSRF
      // relies on. This assertion previously demanded 'Strict', which no writer
      // in the codebase has ever emitted.
      expect(cookie).toMatch(/SameSite=Lax/i);

      // All cookies should have Path=/
      expect(cookie).toMatch(/Path=\//);
    });
  });

  it('should succeed even when called multiple times (idempotent)', async () => {
    // First logout
    await request(app)
      .post('/api/auth/logout')
      .expect(200);

    // Second logout should also succeed
    const response = await request(app)
      .post('/api/auth/logout')
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      message: 'Logged out successfully',
    });
  });

  it('should succeed even without existing cookies', async () => {
    // Logout without any cookies should still succeed
    const response = await request(app)
      .post('/api/auth/logout')
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
