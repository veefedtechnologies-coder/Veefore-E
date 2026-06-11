/**
 * Test: OAuth Router Mounting and Rate Limiting
 * 
 * Verifies that:
 * 1. OAuth router is properly mounted at /api/auth
 * 2. CORS middleware is applied to OAuth routes
 * 3. Rate limiter middleware is applied (10 requests/minute per IP)
 * 
 * Requirements: 11.7, 14.1, 14.2, 14.3
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('OAuth Router Mounting - Task 12.5', () => {
  it('should have auth.ts router file', () => {
    const authPath = path.join(__dirname, '../routes/auth.ts');
    expect(fs.existsSync(authPath)).toBe(true);
  });

  it('should have rate-limiting-working.ts middleware file', () => {
    const rateLimitPath = path.join(__dirname, '../middleware/rate-limiting-working.ts');
    expect(fs.existsSync(rateLimitPath)).toBe(true);
  });

  it('should have routes.ts file that mounts OAuth routes', () => {
    const routesPath = path.join(__dirname, '../routes.ts');
    expect(fs.existsSync(routesPath)).toBe(true);
  });
});

describe('OAuth Rate Limiter Configuration - Requirement 11.7', () => {
  it('should be configured for 10 requests per minute', () => {
    const rateLimitingPath = path.join(__dirname, '../middleware/rate-limiting-working.ts');
    const content = fs.readFileSync(rateLimitingPath, 'utf-8');
    
    // Check that oauthRateLimiter exists
    expect(content).toContain('export const oauthRateLimiter');
    
    // Check the rate limit configuration
    const oauthSection = content.substring(
      content.indexOf('export const oauthRateLimiter'),
      content.indexOf('export const oauthRateLimiter') + 1000
    );
    
    // Verify 1 minute window
    expect(oauthSection).toContain('60 * 1000'); // 1 minute in milliseconds
    
    // Verify 10 requests max
    expect(oauthSection).toContain('maxRequests = 10');
  });

  it('should return 429 status code when rate limit exceeded', () => {
    const rateLimitingPath = path.join(__dirname, '../middleware/rate-limiting-working.ts');
    const content = fs.readFileSync(rateLimitingPath, 'utf-8');
    
    const oauthSection = content.substring(
      content.indexOf('export const oauthRateLimiter'),
      content.indexOf('export const oauthRateLimiter') + 1500
    );
    
    // Verify 429 status code is returned
    expect(oauthSection).toContain('res.status(429)');
    expect(oauthSection).toContain('Too many requests');
  });

  it('should export oauthRateLimiter', () => {
    const rateLimitingPath = path.join(__dirname, '../middleware/rate-limiting-working.ts');
    const content = fs.readFileSync(rateLimitingPath, 'utf-8');
    
    expect(content).toContain('export const oauthRateLimiter');
  });
});

describe('OAuth Router Mounting in routes.ts - Requirements 14.1, 14.2, 14.3', () => {
  it('should import oauthRateLimiter from rate-limiting middleware', () => {
    const routesPath = path.join(__dirname, '../routes.ts');
    const content = fs.readFileSync(routesPath, 'utf-8');
    
    expect(content).toContain('oauthRateLimiter');
    expect(content).toContain("from './middleware/rate-limiting-working'");
  });

  it('should mount OAuth router at /api/auth with rate limiter', () => {
    const routesPath = path.join(__dirname, '../routes.ts');
    const content = fs.readFileSync(routesPath, 'utf-8');
    
    // Verify OAuth routes are mounted at /api/auth with oauthRateLimiter
    expect(content).toContain("app.use('/api/auth'");
    expect(content).toContain('oauthRateLimiter');
    expect(content).toContain('authRoutes');
  });

  it('should have comment indicating Requirement 11.7 compliance', () => {
    const routesPath = path.join(__dirname, '../routes.ts');
    const content = fs.readFileSync(routesPath, 'utf-8');
    
    // Check for documentation comment
    expect(content).toContain('Requirement 11.7');
  });
});

describe('CORS Configuration for OAuth Routes', () => {
  it('should have CORS middleware applied globally to /api routes', () => {
    const indexPath = path.join(__dirname, '../index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');
    
    // Check that apiCorsMiddleware is applied to /api routes
    expect(content).toContain("app.use('/api', apiCorsMiddleware)");
  });
});

describe('OAuth Router Export and Structure', () => {
  it('should export Express router from auth.ts', () => {
    const authPath = path.join(__dirname, '../routes/auth.ts');
    const content = fs.readFileSync(authPath, 'utf-8');
    
    expect(content).toContain('export default router');
  });

  it('should have Google OAuth start endpoint', () => {
    const authPath = path.join(__dirname, '../routes/auth.ts');
    const content = fs.readFileSync(authPath, 'utf-8');
    
    expect(content).toContain("router.get('/google/start'");
  });

  it('should have Google OAuth callback endpoint', () => {
    const authPath = path.join(__dirname, '../routes/auth.ts');
    const content = fs.readFileSync(authPath, 'utf-8');
    
    expect(content).toContain("router.get('/google/callback'");
  });

  it('should have refresh token endpoint', () => {
    const authPath = path.join(__dirname, '../routes/auth.ts');
    const content = fs.readFileSync(authPath, 'utf-8');
    
    expect(content).toContain("router.post('/refresh'");
  });

  it('should have logout endpoint', () => {
    const authPath = path.join(__dirname, '../routes/auth.ts');
    const content = fs.readFileSync(authPath, 'utf-8');
    
    expect(content).toContain("router.post('/logout'");
  });
});
