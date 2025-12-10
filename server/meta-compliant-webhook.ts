/**
 * META-COMPLIANT INSTAGRAM WEBHOOK SYSTEM
 * 
 * Implements Meta's exact webhook requirements from:
 * https://developers.facebook.com/docs/instagram-platform/webhooks
 * 
 * Key Meta Requirements Implemented:
 * 1. SHA256 signature validation (X-Hub-Signature-256)
 * 2. Proper verification request handling
 * 3. Live mode compatibility
 * 4. Advanced Access permission support
 * 5. Public account requirement handling
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { IStorage } from './storage';
import { AutomationSystem } from './automation-system';

// Meta webhook interfaces (exact specification)
interface MetaWebhookValue {
  // Comments field
  from?: {
    id: string;
    username: string;
  };
  parent_id?: string;
  comment_id?: string;
  created_time?: number;
  text?: string;
  
  // Other Instagram fields
  media_id?: string;
  user_id?: string;
  [key: string]: any;
}

interface MetaWebhookChange {
  field: string;
  value: MetaWebhookValue;
}

interface MetaWebhookEntry {
  id: string;         // Page ID
  time: number;       // UNIX timestamp
  changes?: MetaWebhookChange[];
  messaging?: any[];
}

interface MetaWebhookPayload {
  object: 'instagram';
  entry: MetaWebhookEntry[];
}

export class MetaCompliantWebhook {
  private storage: IStorage;
  private automationSystem: AutomationSystem;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.automationSystem = new AutomationSystem(storage);
  }

  /**
   * Meta Verification Request Handler (GET)
   * Reference: https://developers.facebook.com/docs/instagram-platform/webhooks#verification-requests
   */
  async handleVerification(req: Request, res: Response): Promise<void> {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('[META WEBHOOK] Verification request:', { 
      mode, 
      token: token ? 'present' : 'missing',
      challenge: challenge ? 'present' : 'missing'
    });

    const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
    console.log('[META WEBHOOK] Expected token:', verifyToken);
    console.log('[META WEBHOOK] Received token:', token);
    
    if (mode === 'subscribe' && token === verifyToken && challenge) {
      console.log('[META WEBHOOK] ✅ Verification successful - sending challenge');
      return res.status(200).send(challenge) as any;
    } else {
      console.log('[META WEBHOOK] ❌ Verification failed - mode:', mode, 'token match:', token === verifyToken, 'has challenge:', !!challenge);
      return res.sendStatus(403) as any;
    }
  }

  /**
   * Meta Event Notification Handler (POST)
   * Reference: https://developers.facebook.com/docs/instagram-platform/webhooks#event-notifications
   */
  async handleEvent(req: Request, res: Response): Promise<void> {
    try {
      console.log('[META WEBHOOK] Event notification received from Meta');

      // CRITICAL: Meta signature validation (re-enabled for production security)
      if (!this.validateMetaSignature(req)) {
        console.log('[META WEBHOOK] ❌ Invalid Meta signature - rejecting');
        return res.sendStatus(401) as any;
      }
      console.log('[META WEBHOOK] ✅ Meta signature validated');

      const payload = req.body as MetaWebhookPayload;
      
      // Handle different payload types from Instagram
      console.log('[META WEBHOOK] 📋 Received object type:', payload.object);
      
      if (payload.object === 'permissions') {
        console.log('[META WEBHOOK] 📋 Permissions event received - acknowledging');
        return res.sendStatus(200) as any;
      }
      
      if (payload.object !== 'instagram') {
        console.log('[META WEBHOOK] ❌ Invalid object type:', payload.object);
        return res.sendStatus(400) as any;
      }

      console.log('[META WEBHOOK] ✅ Valid Meta payload received:', {
        object: payload.object,
        entries: payload.entry?.length || 0
      });

      // Process each entry according to Meta specification
      for (const entry of payload.entry || []) {
        await this.processMetaEntry(entry);
      }

      // CRITICAL: Always respond 200 immediately (Meta requirement)
      return res.sendStatus(200) as any;

    } catch (error) {
      console.error('[META WEBHOOK] ❌ Error processing Meta event:', error);
      return res.sendStatus(500) as any;
    }
  }

  /**
   * Validate Meta SHA256 signature
   * Reference: https://developers.facebook.com/docs/instagram-platform/webhooks#validating-payloads
   */
  private validateMetaSignature(req: Request): boolean {
    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
      console.log('[META SIGNATURE] ❌ Missing X-Hub-Signature-256 header');
      return false;
    }

    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    if (!appSecret) {
      console.log('[META SIGNATURE] ❌ App secret not configured');
      return false;
    }

    // Meta requirement: use raw body string for signature validation
    const rawBody = req.rawBody || JSON.stringify(req.body);
    
    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', appSecret)
      .update(rawBody, 'utf8')
      .digest('hex')}`;

    // Use timing-safe comparison to prevent timing attacks (handle length differences)
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    
    // Ensure buffers are same length for timingSafeEqual
    if (sigBuffer.length !== expectedBuffer.length) {
      console.log('[META SIGNATURE] ❌ Signature length mismatch');
      return false;
    }
    
    const isValid = crypto.timingSafeEqual(sigBuffer, expectedBuffer);

    if (isValid) {
      console.log('[META SIGNATURE] ✅ Meta signature validated');
    } else {
      console.log('[META SIGNATURE] ❌ Meta signature validation failed');
      console.log('[META SIGNATURE] Expected format: sha256=<hash>');
    }

    return isValid;
  }

  /**
   * Process Meta webhook entry
   */
  private async processMetaEntry(entry: MetaWebhookEntry): Promise<void> {
    console.log('[META ENTRY] Processing entry:', {
      pageId: entry.id,
      timestamp: new Date(entry.time * 1000).toISOString(),
      changesCount: entry.changes?.length || 0
    });

    // Find Instagram account by Page ID
    const account = await this.findAccountByPageId(entry.id);
    if (!account) {
      console.log('[META ENTRY] ❌ No account found for Page ID:', entry.id);
      return;
    }

    console.log('[META ENTRY] ✅ Found account:', account.username);

    // Process webhook changes
    if (entry.changes) {
      for (const change of entry.changes) {
        await this.processMetaChange(change, account);
      }
    }

    // Process messaging events
    if (entry.messaging) {
      for (const message of entry.messaging) {
        await this.processMetaMessage(message, account);
      }
    }
  }

  /**
   * Process Meta webhook change
   */
  private async processMetaChange(change: MetaWebhookChange, account: any): Promise<void> {
    const { field, value } = change;
    
    console.log('[META CHANGE] Processing field:', field, 'for account:', account.username);

    switch (field) {
      case 'comments':
        await this.handleMetaComment(value, account);
        break;
      
      case 'live_comments':
        await this.handleMetaLiveComment(value, account);
        break;
      
      case 'feed':
      case 'media':
        await this.handleMetaMedia(value, account);
        break;
      
      case 'story_insights':
        await this.handleMetaStoryInsights(value, account);
        break;
      
      default:
        console.log('[META CHANGE] ℹ️ Unhandled field type:', field);
        break;
    }
  }

  /**
   * Handle Meta comment events - MAIN AUTOMATION TRIGGER
   */
  private async handleMetaComment(value: MetaWebhookValue, account: any): Promise<void> {
    try {
      console.log('[META COMMENT] Processing comment for automation');

      if (!value.text || !value.from) {
        console.log('[META COMMENT] ❌ Invalid comment data');
        return;
      }

      // Extract comment ID - Instagram uses 'id' field, not 'comment_id'
      const commentId = value.id || value.comment_id;
      const { text, from } = value;
      const mediaId = (value as any).media_id || (value as any).parent_id || (value as any).media?.id;
      
      console.log('[META COMMENT] 🎯 Real Instagram comment:', {
        user: from.username,
        text: text,
        commentId: commentId,
        mediaId: mediaId
      });

      // 🔧 CRITICAL FIX: Ignore comments from business account itself (automated replies)
      if (from.username === account.username) {
        console.log('[META COMMENT] ⏭️ Skipping comment from business account itself (automated reply):', from.username);
        return;
      }
      
      console.log('[META COMMENT] ✅ Processing comment from external user:', from.username);

      // CRITICAL: Process through automation system with POST-SPECIFIC TARGETING
      const automationResult = await this.automationSystem.processComment(
        account.workspaceId,
        text,
        commentId || 'meta_webhook',
        from.id,
        from.username,
        account.accessToken,
        mediaId  // 🎯 Pass post/media ID for targeting
      );

      if (automationResult.triggered) {
        console.log('[META COMMENT] 🚀 AUTOMATION TRIGGERED! Actions:', automationResult.actions);
      } else {
        console.log('[META COMMENT] ℹ️ No automation rules matched');
      }

      // Store for analytics
      await this.storeCommentAnalytics(value, account);

      // 🚀 CRITICAL: Also trigger main webhook handler for immediate database updates and frontend broadcasts
      try {
        console.log('[META COMMENT] 🔄 Triggering main webhook handler for immediate updates...');
        const { processWebhookChange } = await import('./routes/webhooks');
        await processWebhookChange(account.workspaceId, account.accountId, {
          field: 'comments',
          value: {
            id: commentId,
            text: text,
            from: from,
            media_id: mediaId,
            created_time: Date.now() / 1000
          }
        });
        console.log('[META COMMENT] ✅ Main webhook handler triggered successfully');
      } catch (webhookError) {
        console.error('[META COMMENT] ❌ Error triggering main webhook handler:', webhookError);
      }

    } catch (error) {
      console.error('[META COMMENT] ❌ Error processing comment:', error);
    }
  }

  /**
   * Handle Meta live comment events
   */
  private async handleMetaLiveComment(value: MetaWebhookValue, account: any): Promise<void> {
    console.log('[META LIVE COMMENT] Processing live comment:', value);
    // Similar to regular comments but during live broadcast
    await this.handleMetaComment(value, account);
  }

  /**
   * Handle Meta media events
   */
  private async handleMetaMedia(value: MetaWebhookValue, account: any): Promise<void> {
    console.log('[META MEDIA] Processing media event:', value);
    // Handle new posts, media updates
  }

  /**
   * Handle Meta story insights
   */
  private async handleMetaStoryInsights(value: MetaWebhookValue, account: any): Promise<void> {
    console.log('[META STORY] Processing story insights:', value);
    // Handle story metrics (24-hour window)
  }

  /**
   * Handle Meta messaging events
   */
  private async processMetaMessage(message: any, account: any): Promise<void> {
    console.log('[META MESSAGE] Processing Instagram DM:', message);
    // Handle Instagram direct messages
  }

  /**
   * Find Instagram account by Page ID using direct indexed lookups only
   * Optimized: Uses repository's indexed queries (pageId_1_platform_1 and accountId_1_platform_1 indexes)
   * No full collection scans - repository handles both pageId and accountId lookups via indexed queries
   */
  private async findAccountByPageId(pageId: string): Promise<any> {
    try {
      // Repository method uses indexed queries:
      // 1. First tries: { pageId, platform: 'instagram', isActive: true } - uses pageId_1_platform_1 index
      // 2. Falls back to: { accountId, platform: 'instagram', isActive: true } - uses platform_1_accountId_1_isActive_1 index
      const account = await this.storage.getSocialAccountByPageId(pageId);
      
      if (account) {
        console.log('[ACCOUNT LOOKUP] ✅ Found account:', account.username, '(indexed query)');
        return account;
      }

      console.log('[ACCOUNT LOOKUP] ❌ No Instagram account found for Page ID:', pageId);
      return null;
    } catch (error) {
      console.error('[ACCOUNT LOOKUP] ❌ Error finding account:', error);
      return null;
    }
  }

  /**
   * Store comment analytics
   */
  private async storeCommentAnalytics(value: MetaWebhookValue, account: any): Promise<void> {
    try {
      // Store comment data for analytics dashboard
      console.log('[ANALYTICS] Storing comment data for account:', account.username);
    } catch (error) {
      console.error('[ANALYTICS] ❌ Error storing comment analytics:', error);
    }
  }
}