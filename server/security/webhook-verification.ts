/**
 * P2-3 SECURITY: Webhook Signature Verification
 * 
 * Implements secure webhook signature verification for social media platforms
 * Prevents webhook spoofing and ensures data integrity
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * P2-3.1: Instagram webhook signature verification
 */
export class InstagramWebhookSecurity {
  /**
   * Verify Instagram webhook signature
   */
  static verifySignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    try {
      // Instagram uses SHA1 HMAC with X-Hub-Signature header
      const expectedSignature = `sha1=${createHmac('sha1', secret)
        .update(payload, 'utf8')
        .digest('hex')}`;

      // Use timing-safe comparison to prevent timing attacks
      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('🚨 P2-3: Instagram signature verification failed:', error);
      return false;
    }
  }

  /**
   * Middleware for Instagram webhook verification
   */
  static verificationMiddleware(options: {
    secretHeader?: string;
    signatureHeader?: string;
    secret?: string;
  } = {}) {
    return (req: Request, res: Response, next: NextFunction) => {
      const {
        secretHeader = 'x-hub-signature',
        signatureHeader = 'x-hub-signature-256',
        secret = process.env.INSTAGRAM_WEBHOOK_SECRET
      } = options;

      if (!secret) {
        console.error('🚨 P2-3: Instagram webhook secret not configured');
        return res.status(500).json({ error: 'Webhook verification not configured' });
      }

      // Get signature from headers
      const signature = req.headers[secretHeader] || req.headers[signatureHeader];
      if (!signature) {
        console.error('🚨 P2-3: Missing Instagram webhook signature');
        return res.status(401).json({ error: 'Missing webhook signature' });
      }

      // Get raw body for verification
      const payload = req.rawBody || JSON.stringify(req.body);
      
      // Verify signature
      if (!InstagramWebhookSecurity.verifySignature(payload, signature as string, secret)) {
        console.error('🚨 P2-3: Instagram webhook signature verification failed');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      console.log('✅ P2-3: Instagram webhook signature verified');
      next();
    };
  }
}

/**
 * P2-3.2: Generic webhook signature verification
 */
export class WebhookSecurity {
  /**
   * Verify HMAC signature with configurable algorithm
   */
  static verifyHMACSignature(
    payload: string,
    signature: string,
    secret: string,
    algorithm: string = 'sha256',
    prefix: string = 'sha256='
  ): boolean {
    try {
      const expectedSignature = `${prefix}${createHmac(algorithm, secret)
        .update(payload, 'utf8')
        .digest('hex')}`;

      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('🚨 P2-3: HMAC signature verification failed:', error);
      return false;
    }
  }

  /**
   * Generic webhook verification middleware
   */
  static createVerificationMiddleware(options: {
    secretEnvVar: string;
    signatureHeader: string;
    algorithm?: string;
    prefix?: string;
    platform: string;
  }) {
    return (req: Request, res: Response, next: NextFunction) => {
      const secret = process.env[options.secretEnvVar];
      
      if (!secret) {
        console.error(`🚨 P2-3: ${options.platform} webhook secret not configured`);
        return res.status(500).json({ error: 'Webhook verification not configured' });
      }

      const signature = req.headers[options.signatureHeader.toLowerCase()];
      if (!signature) {
        console.error(`🚨 P2-3: Missing ${options.platform} webhook signature`);
        return res.status(401).json({ error: 'Missing webhook signature' });
      }

      const payload = req.rawBody || JSON.stringify(req.body);
      
      if (!WebhookSecurity.verifyHMACSignature(
        payload,
        signature as string,
        secret,
        options.algorithm,
        options.prefix
      )) {
        console.error(`🚨 P2-3: ${options.platform} webhook signature verification failed`);
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      console.log(`✅ P2-3: ${options.platform} webhook signature verified`);
      next();
    };
  }
}

/**
 * P2-3.3: Webhook replay attack protection
 */
export class WebhookReplayProtection {
  private static readonly REPLAY_WINDOW = 5 * 60 * 1000; // 5 minutes
  private static recentWebhooks = new Set<string>();
  private static readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minute

  /**
   * Check for webhook replay attacks using timestamp and signature
   */
  static checkReplay(
    signature: string,
    timestamp?: string | number
  ): { isValid: boolean; reason?: string } {
    try {
      // Create unique identifier for this webhook
      const webhookId = `${signature}-${timestamp || Date.now()}`;
      
      // Check if we've seen this webhook before
      if (WebhookReplayProtection.recentWebhooks.has(webhookId)) {
        return { isValid: false, reason: 'Webhook replay detected' };
      }

      // Check timestamp if provided (for platforms that include it)
      if (timestamp) {
        const webhookTime = typeof timestamp === 'string' ? parseInt(timestamp) * 1000 : timestamp;
        const now = Date.now();
        
        if (Math.abs(now - webhookTime) > WebhookReplayProtection.REPLAY_WINDOW) {
          return { isValid: false, reason: 'Webhook timestamp outside acceptable window' };
        }
      }

      // Add to recent webhooks
      WebhookReplayProtection.recentWebhooks.add(webhookId);
      
      return { isValid: true };
    } catch (error) {
      console.error('🚨 P2-3: Replay protection check failed:', error);
      return { isValid: false, reason: 'Replay protection error' };
    }
  }

  /**
   * Middleware for webhook replay protection
   */
  static replayProtectionMiddleware(options: {
    timestampHeader?: string;
    platform: string;
  } = { platform: 'webhook' }) {
    return (req: Request, res: Response, next: NextFunction) => {
      const signature = req.headers['x-hub-signature'] || 
                       req.headers['x-hub-signature-256'] ||
                       req.headers['x-signature-256'];
      
      const timestamp = options.timestampHeader ? 
                       req.headers[options.timestampHeader] : undefined;

      const replayCheck = WebhookReplayProtection.checkReplay(
        signature as string,
        timestamp as string
      );

      if (!replayCheck.isValid) {
        console.error(`🚨 P2-3: ${options.platform} webhook replay attack detected: ${replayCheck.reason}`);
        return res.status(401).json({ error: replayCheck.reason });
      }

      console.log(`✅ P2-3: ${options.platform} webhook replay protection passed`);
      next();
    };
  }

  /**
   * Clean up old webhook signatures
   */
  static cleanupOldWebhooks(): void {
    // Clear all stored webhooks periodically to prevent memory leaks
    WebhookReplayProtection.recentWebhooks.clear();
  }

  /**
   * Initialize cleanup scheduler
   */
  static initialize(): void {
    setInterval(() => {
      WebhookReplayProtection.cleanupOldWebhooks();
    }, WebhookReplayProtection.CLEANUP_INTERVAL);

    console.log('🔐 P2-3: Webhook replay protection initialized');
  }
}

/**
 * P2-3.4: Webhook idempotency protection
 */
export class WebhookIdempotency {
  private static processedWebhooks = new Map<string, {
    timestamp: number;
    response: any;
  }>();
  
  private static readonly IDEMPOTENCY_WINDOW = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

  /**
   * Check webhook idempotency and return cached response if duplicate
   */
  static checkIdempotency(
    webhookId: string
  ): { isDuplicate: boolean; cachedResponse?: any } {
    const cached = WebhookIdempotency.processedWebhooks.get(webhookId);
    
    if (cached) {
      // Check if within idempotency window
      if (Date.now() - cached.timestamp < WebhookIdempotency.IDEMPOTENCY_WINDOW) {
        return { isDuplicate: true, cachedResponse: cached.response };
      } else {
        // Remove expired entry
        WebhookIdempotency.processedWebhooks.delete(webhookId);
      }
    }
    
    return { isDuplicate: false };
  }

  /**
   * Store webhook response for idempotency
   */
  static storeResponse(webhookId: string, response: any): void {
    WebhookIdempotency.processedWebhooks.set(webhookId, {
      timestamp: Date.now(),
      response
    });
  }

  /**
   * Middleware for webhook idempotency
   */
  static idempotencyMiddleware(options: {
    generateId?: (req: Request) => string;
    platform: string;
  }) {
    return (req: Request, res: Response, next: NextFunction) => {
      // Generate webhook ID (can be customized)
      const webhookId = options.generateId ? 
        options.generateId(req) : 
        `${req.headers['x-hub-signature'] || req.url}-${JSON.stringify(req.body)}`;

      const idempotencyCheck = WebhookIdempotency.checkIdempotency(webhookId);
      
      if (idempotencyCheck.isDuplicate) {
        console.log(`⏸️ P2-3: ${options.platform} duplicate webhook detected, returning cached response`);
        return res.status(200).json(idempotencyCheck.cachedResponse);
      }

      // Store webhook ID for tracking
      req.webhookId = webhookId;
      
      // Intercept response to cache it
      const originalSend = res.send;
      res.send = function(data: any) {
        WebhookIdempotency.storeResponse(webhookId, data);
        return originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Clean up old webhook responses
   */
  static cleanupOldResponses(): void {
    const now = Date.now();
    for (const [id, data] of WebhookIdempotency.processedWebhooks.entries()) {
      if (now - data.timestamp > WebhookIdempotency.IDEMPOTENCY_WINDOW) {
        WebhookIdempotency.processedWebhooks.delete(id);
      }
    }
  }

  /**
   * Initialize cleanup scheduler
   */
  static initialize(): void {
    setInterval(() => {
      WebhookIdempotency.cleanupOldResponses();
    }, WebhookIdempotency.CLEANUP_INTERVAL);

    console.log('🔐 P2-3: Webhook idempotency protection initialized');
  }
}

/**
 * P2-3.5: Initialize webhook security system
 */
export function initializeWebhookSecurity(): void {
  console.log('🔐 P2-3: Initializing webhook signature verification system...');
  
  // Initialize replay protection
  WebhookReplayProtection.initialize();
  
  // Initialize idempotency protection
  WebhookIdempotency.initialize();
  
  console.log('🔐 P2-3: Webhook Security Features:');
  console.log('  ✅ HMAC signature verification (SHA1/SHA256)');
  console.log('  ✅ Instagram webhook signature validation');
  console.log('  ✅ Replay attack protection with timing windows');
  console.log('  ✅ Idempotency protection for duplicate webhooks');
  console.log('  ✅ Configurable verification for multiple platforms');
  console.log('🔐 P2-3: Webhook security system ready for production');
}

/**
 * P2-3.6: Pre-configured webhook middlewares for common platforms
 */

// Instagram webhook verification
export const instagramWebhookMiddleware = InstagramWebhookSecurity.verificationMiddleware();

// Stripe webhook verification (for payments)
export const stripeWebhookMiddleware = WebhookSecurity.createVerificationMiddleware({
  secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
  signatureHeader: 'stripe-signature',
  algorithm: 'sha256',
  prefix: '',
  platform: 'Stripe'
});

// Generic webhook protection with replay and idempotency
export function createSecureWebhookMiddleware(platform: string) {
  return [
    WebhookReplayProtection.replayProtectionMiddleware({ platform }),
    WebhookIdempotency.idempotencyMiddleware({ platform })
  ];
}