/**
 * WEBHOOK ROUTER
 * 
 * Routes incoming Instagram webhook events to appropriate handlers
 * - Dispatches by event type (comments, messages, media)
 * - Handles event deduplication
 * - Manages webhook verification
 */

import { Request, Response } from 'express';
import { IStorage } from '../../../storage';
import { CommentWebhookHandler } from './comment.webhook';
import { MessageWebhookHandler } from './message.webhook';
import { MediaWebhookHandler, MediaEventType } from './media.webhook';

// Comprehensive webhook event interfaces
interface InstagramWebhookValue {
  // Comment events
  from?: {
    id: string;
    username: string;
  };
  parent_id?: string;
  comment_id?: string;
  created_time?: number;
  text?: string;

  // Media/Post events
  media_id?: string;
  media_type?: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;

  // User/Profile events
  user_id?: string;
  username?: string;
  profile_picture_url?: string;
  followers_count?: number;
  following_count?: number;
  media_count?: number;

  // Engagement events
  like_count?: number;
  comments_count?: number;
  impressions?: number;
  reach?: number;
  saved?: number;
  video_views?: number;

  // Story events
  story_id?: string;
  story_type?: string;

  // DM events
  sender?: {
    id: string;
    username?: string;
  };
  recipient?: {
    id: string;
  };
  message?: {
    mid: string;
    text: string;
    timestamp: number;
  };
}

interface InstagramWebhookChange {
  field: string;
  value: InstagramWebhookValue;
}

interface InstagramWebhookEntry {
  id: string;
  time: number;
  changes?: InstagramWebhookChange[];
  messaging?: any[];
}

interface InstagramWebhookPayload {
  object: 'instagram';
  entry: InstagramWebhookEntry[];
}

export class WebhookRouter {
  private commentHandler: CommentWebhookHandler;
  private messageHandler: MessageWebhookHandler;
  private mediaHandler: MediaWebhookHandler;
  private processedEvents: Set<string> = new Set();

  constructor(private storage: IStorage) {
    this.commentHandler = new CommentWebhookHandler(storage);
    this.messageHandler = new MessageWebhookHandler(storage);
    this.mediaHandler = new MediaWebhookHandler(storage);
  }

  /**
   * Handle webhook verification (GET request)
   */
  async handleVerification(req: Request, res: Response): Promise<void> {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('[WEBHOOK ROUTER] Verification request:', { mode, token });

    const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WEBHOOK ROUTER] ✅ Webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      console.log('[WEBHOOK ROUTER] ❌ Webhook verification failed');
      console.log(`Expected token: ${verifyToken}, received: ${token}`);
      res.sendStatus(403);
    }
  }

  /**
   * Handle webhook events (POST request)
   */
  async handleWebhookEvent(req: Request, res: Response): Promise<void> {
    try {
      const payload: InstagramWebhookPayload = req.body;
      console.log(
        '[WEBHOOK ROUTER] 🎯 Received Instagram event:',
        JSON.stringify(payload, null, 2)
      );

      // Create unique event ID to prevent duplicate processing
      const eventId = this.generateEventId(payload);
      if (this.processedEvents.has(eventId)) {
        console.log('[WEBHOOK ROUTER] ⚠️ Duplicate event detected, skipping');
        res.sendStatus(200);
        return;
      }

      this.processedEvents.add(eventId);
      this.cleanupOldEvents();

      // Process all entries in the webhook
      for (const entry of payload.entry) {
        await this.processEntry(entry);
      }

      res.sendStatus(200);
    } catch (error) {
      console.error('[WEBHOOK ROUTER] ❌ Error processing event:', error);
      res.sendStatus(500);
    }
  }

  /**
   * Process individual webhook entry and route to handlers
   */
  private async processEntry(entry: InstagramWebhookEntry): Promise<void> {
    try {
      console.log(`[WEBHOOK ROUTER] 📊 Processing entry for Instagram account: ${entry.id}`);

      // Find the Instagram account and workspace
      const socialAccount = await this.findInstagramAccount(entry.id);
      if (!socialAccount) {
        console.log(`[WEBHOOK ROUTER] ⚠️ No Instagram account found for ID: ${entry.id}`);
        return;
      }

      console.log(
        `[WEBHOOK ROUTER] ✅ Found account: @${socialAccount.username} in workspace: ${socialAccount.workspaceId}`
      );

      // Process webhook changes (posts, comments, followers, engagement)
      if (entry.changes) {
        for (const change of entry.changes) {
          await this.routeChange(change, socialAccount);
        }
      }

      // Process messaging events (DMs)
      if (entry.messaging) {
        for (const message of entry.messaging) {
          await this.routeMessage(message, socialAccount);
        }
      }
    } catch (error) {
      console.error('[WEBHOOK ROUTER] ❌ Error processing entry:', error);
    }
  }

  /**
   * Route webhook change to appropriate handler
   */
  private async routeChange(
    change: InstagramWebhookChange,
    socialAccount: any
  ): Promise<void> {
    const { field, value } = change;

    console.log(`[WEBHOOK ROUTER] 🔄 Routing ${field} event to handler`);

    try {
      switch (field) {
        case 'comments':
          // Route to comment handler
          if (this.commentHandler.isValidEvent(value)) {
            await this.commentHandler.handle(value, socialAccount);
          }
          break;

        case 'feed':
        case 'media':
        case 'follows':
        case 'followers':
        case 'likes':
        case 'story_insights':
        case 'insights':
        case 'live_videos':
        case 'mentions':
          // Route to media handler
          if (this.mediaHandler.isValidEvent(value)) {
            await this.mediaHandler.handle(field as MediaEventType, value, socialAccount);
          }
          break;

        default:
          console.log(`[WEBHOOK ROUTER] 📝 Unhandled event type: ${field}`);
          // Route generic events to media handler
          if (this.mediaHandler.isValidEvent(value)) {
            await this.mediaHandler.handle(field as MediaEventType, value, socialAccount);
          }
      }
    } catch (error) {
      console.error(`[WEBHOOK ROUTER] ❌ Error routing ${field} event:`, error);
      // Log error but don't throw - continue processing other events
    }
  }

  /**
   * Route messaging event to message handler
   */
  private async routeMessage(message: any, socialAccount: any): Promise<void> {
    try {
      console.log('[WEBHOOK ROUTER] 💌 Routing message to handler');

      if (this.messageHandler.isValidEvent(message)) {
        await this.messageHandler.handle(message, socialAccount);
      } else {
        console.log('[WEBHOOK ROUTER] ⚠️ Invalid message event structure');
      }
    } catch (error) {
      console.error('[WEBHOOK ROUTER] ❌ Error routing message event:', error);
      // Log error but don't throw - continue processing other events
    }
  }

  /**
   * Find Instagram account by page/account ID
   */
  private async findInstagramAccount(pageId: string): Promise<any> {
    try {
      // Get all Instagram accounts across all workspaces
      const allAccounts = await this.storage.getAllSocialAccounts();

      // Find account matching the page ID
      const account = allAccounts.find(
        (acc: any) =>
          acc.platform === 'instagram' &&
          (acc.pageId === pageId || acc.accountId === pageId || acc.id === pageId)
      );

      if (account) {
        console.log(
          `[WEBHOOK ROUTER] ✅ Found account: @${account.username} in workspace: ${account.workspaceId}`
        );
        return account;
      }

      // If not found by exact ID, try to find any active Instagram account
      // This helps with webhook configuration issues
      const instagramAccounts = allAccounts.filter((acc: any) => acc.platform === 'instagram');
      if (instagramAccounts.length > 0) {
        console.log(
          `[WEBHOOK ROUTER] 🔄 Using fallback account: @${instagramAccounts[0].username}`
        );
        return instagramAccounts[0];
      }

      return null;
    } catch (error) {
      console.error('[WEBHOOK ROUTER] ❌ Error finding Instagram account:', error);
      return null;
    }
  }

  /**
   * Generate unique event ID for deduplication
   */
  private generateEventId(payload: InstagramWebhookPayload): string {
    const entryIds = payload.entry.map((e) => e.id).join(',');
    const timestamp = payload.entry[0]?.time || Date.now();
    return `${entryIds}_${timestamp}`;
  }

  /**
   * Clean up old processed events to prevent memory leaks
   */
  private cleanupOldEvents(): void {
    if (this.processedEvents.size > 1000) {
      const eventsArray = Array.from(this.processedEvents);
      const oldEvents = eventsArray.slice(0, 500);
      oldEvents.forEach((event) => this.processedEvents.delete(event));
      console.log('[WEBHOOK ROUTER] 🧹 Cleaned up old processed events');
    }
  }
}
