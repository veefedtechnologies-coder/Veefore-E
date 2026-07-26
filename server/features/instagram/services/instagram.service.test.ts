/**
 * Unit tests for InstagramService
 * 
 * Tests core functionality of the unified Instagram service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstagramService, IInstagramService } from './instagram.service';

describe('InstagramService', () => {
  let service: IInstagramService;

  beforeEach(() => {
    service = new InstagramService();
  });

  describe('Authentication', () => {
    it('should generate valid OAuth URL', () => {
      const redirectUri = 'https://example.com/callback';
      const state = 'test-state';
      
      const authUrl = service.generateAuthUrl(redirectUri, state);
      
      expect(authUrl).toContain('https://api.instagram.com/oauth/authorize');
      expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
      expect(authUrl).toContain(`state=${state}`);
      expect(authUrl).toContain('client_id=');
    });

    it('should generate OAuth URL with Phase 1 review scope when configured', () => {
      process.env.META_PHASE_1_REVIEW_MODE = 'true';
      
      const authUrl = service.generateAuthUrl('https://example.com/callback');
      
      expect(authUrl).toContain('instagram_business_basic');
      expect(authUrl).toContain('instagram_business_content_publish');
      expect(authUrl).not.toContain('instagram_business_manage_messages');
      
      delete process.env.META_PHASE_1_REVIEW_MODE;
    });

    it('should generate OAuth URL with full scope when not in Phase 1 review', () => {
      process.env.META_PHASE_1_REVIEW_MODE = 'false';
      
      const authUrl = service.generateAuthUrl('https://example.com/callback');
      
      expect(authUrl).toContain('instagram_business_basic');
      expect(authUrl).toContain('instagram_business_manage_messages');
      expect(authUrl).toContain('instagram_business_manage_comments');
      
      delete process.env.META_PHASE_1_REVIEW_MODE;
    });
  });

  describe('Webhook Signature Verification', () => {
    it('should verify valid webhook signature', () => {
      process.env.INSTAGRAM_APP_SECRET = 'test-secret';
      
      const body = JSON.stringify({ test: 'data' });
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', 'test-secret')
        .update(body)
        .digest('hex');
      
      const isValid = service.verifyWebhookSignature(`sha256=${expectedSignature}`, body);
      
      expect(isValid).toBe(true);
      
      delete process.env.INSTAGRAM_APP_SECRET;
    });

    it('should reject invalid webhook signature', () => {
      process.env.INSTAGRAM_APP_SECRET = 'test-secret';
      
      const body = JSON.stringify({ test: 'data' });
      const invalidSignature = 'sha256=invalid';
      
      const isValid = service.verifyWebhookSignature(invalidSignature, body);
      
      expect(isValid).toBe(false);
      
      delete process.env.INSTAGRAM_APP_SECRET;
    });

    it('should return false when app secret is not configured', () => {
      delete process.env.INSTAGRAM_APP_SECRET;
      
      const isValid = service.verifyWebhookSignature('sha256=test', '{}');
      
      expect(isValid).toBe(false);
    });
  });

  describe('URL Cleaning', () => {
    it('should handle regular HTTP URLs', () => {
      const service = new InstagramService();
      const url = 'https://example.com/image.jpg';
      
      // Access private method through any cast for testing
      const cleanUrl = (service as any).cleanMediaUrl(url);
      
      expect(cleanUrl).toBe(url);
    });

    it('should clean blob URLs', () => {
      const service = new InstagramService();
      const blobUrl = 'blob:https://example.com/abc-123';
      
      const cleanUrl = (service as any).cleanMediaUrl(blobUrl);
      
      // Should convert to proper URL format
      expect(cleanUrl).not.toContain('blob:');
    });
  });

  describe('Media Type Routing', () => {
    it('should route photo publishing correctly', async () => {
      const service = new InstagramService();
      const publishPhotoSpy = vi.spyOn(service as any, 'publishPhoto');
      publishPhotoSpy.mockResolvedValue({ id: 'test-id' });

      await service.publishMedia('test-token', 'photo', 'https://example.com/image.jpg', {
        caption: 'Test caption'
      });

      expect(publishPhotoSpy).toHaveBeenCalledWith(
        'test-token',
        'https://example.com/image.jpg',
        'Test caption',
        undefined,
        undefined,
        undefined
      );
    });

    it('should route reel publishing correctly', async () => {
      const service = new InstagramService();
      const publishReelSpy = vi.spyOn(service as any, 'publishReel');
      publishReelSpy.mockResolvedValue({ id: 'test-id', processing: true });

      await service.publishMedia('test-token', 'reel', 'https://example.com/video.mp4', {
        caption: 'Test reel'
      });

      expect(publishReelSpy).toHaveBeenCalled();
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limiting between requests', async () => {
      const service = new InstagramService();
      const startTime = Date.now();
      
      // Make two requests in quick succession
      await (service as any).enforceRateLimit('test-token');
      await (service as any).enforceRateLimit('test-token');
      
      const elapsedTime = Date.now() - startTime;
      
      // Should have delayed at least 1000ms (RATE_LIMIT_DELAY)
      expect(elapsedTime).toBeGreaterThanOrEqual(900); // Allow small margin
    });
  });

  describe('getUserProfile error classification', () => {
    // A Facebook-node token (EAAP...) so the service queries the {accountId} node.
    const fbToken = 'EAAPxxxxxxxxxxxxxxxxxx';
    const acctId = '17841474747481653';

    const makeMetaError = (code: number, subcode?: number) => ({
      response: { data: { error: { message: 'Meta says no', code, error_subcode: subcode } } },
    });

    it('flags code 100 / subcode 33 (IG unlinked / no permission) as access-revoked', async () => {
      const svc = new InstagramService();
      // Both the primary and fallback field attempts fail with the same error.
      vi.spyOn(svc as any, 'makeApiRequest').mockRejectedValue(makeMetaError(100, 33));

      await expect(svc.getUserProfile(fbToken, acctId)).rejects.toMatchObject({
        isAccountAccessRevoked: true,
        metaCode: 100,
        metaSubcode: 33,
      });
    });

    it('flags code 190 (invalid/expired token) as access-revoked', async () => {
      const svc = new InstagramService();
      vi.spyOn(svc as any, 'makeApiRequest').mockRejectedValue(makeMetaError(190));

      await expect(svc.getUserProfile(fbToken, acctId)).rejects.toMatchObject({
        isAccountAccessRevoked: true,
        metaCode: 190,
      });
    });

    it('does NOT flag a generic transient 500 as access-revoked', async () => {
      const svc = new InstagramService();
      vi.spyOn(svc as any, 'makeApiRequest').mockRejectedValue(makeMetaError(2)); // code 2 = transient

      await expect(svc.getUserProfile(fbToken, acctId)).rejects.toMatchObject({
        isAccountAccessRevoked: false,
      });
    });
  });
});

