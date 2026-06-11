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

  it('should clear session cookie - Requirement 7.3', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .expect(200);

    // Check that Set-Cookie header is present to clear session
    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
    
    // Find the session cookie
    const sessionCookie = Array.isArray(cookies) 
      ? cookies.find((c: string) => c.startsWith('session='))
      : cookies;
    
    expect(sessionCookie).toBeDefined();
    
    // Verify Max-Age=0 or Expires in past (cookie clearing)
    expect(sessionCookie).toMatch(/Max-Age=0|Expires=/);
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
      
      // All cookies should have SameSite=Strict
      expect(cookie).toMatch(/SameSite=Strict/i);
      
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
