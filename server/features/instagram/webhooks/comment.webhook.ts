/**
 * COMMENT WEBHOOK HANDLER
 * 
 * Handles Instagram comment webhook events
 * - New comments on posts
 * - Comment replies
 * - Comment automation triggers
 */

import { IStorage } from '../../../storage';
import { AutomationSystem } from '../../../automation-system';

export interface CommentWebhookEvent {
  from: {
    id: string;
    username: string;
  };
  parent_id?: string;
  comment_id?: string;
  created_time?: number;
  text: string;
  media_id?: string;
}

export class CommentWebhookHandler {
  private automationSystem: AutomationSystem;

  constructor(private storage: IStorage) {
    this.automationSystem = new AutomationSystem(storage);
  }

  /**
   * Handle comment event - integrates with automation system
   */
  async handle(event: CommentWebhookEvent, socialAccount: any): Promise<void> {
    try {
      console.log('[COMMENT WEBHOOK] 💬 Processing comment event for automation');

      // Validate required fields
      if (!event.text || !event.from) {
        console.log('[COMMENT WEBHOOK] ⚠️ Invalid comment data, skipping');
        return;
      }

      const { text, from, comment_id, parent_id, media_id } = event;

      console.log(`[COMMENT WEBHOOK] 🎯 New comment from @${from.username}: "${text}"`);
      if (media_id || parent_id) {
        console.log('[COMMENT WEBHOOK] 📱 Post/Media ID:', media_id || parent_id);
      }

      // 🔧 CRITICAL FIX: Ignore comments from business account itself (automated replies)
      if (from.username === socialAccount.username) {
        console.log(
          `[COMMENT WEBHOOK] ⏭️ Skipping comment from business account itself (automated reply): @${from.username}`
        );
        return;
      }

      console.log(`[COMMENT WEBHOOK] ✅ Processing comment from external user: @${from.username}`);

      // Process through automation system for Comment→DM automation with POST-SPECIFIC TARGETING
      const automationResult = await this.automationSystem.processComment(
        socialAccount.workspaceId,
        text,
        comment_id || 'unknown',
        from.id,
        from.username,
        socialAccount.accessToken,
        media_id || parent_id // 🎯 Pass post/media ID for targeting
      );

      if (automationResult.triggered) {
        console.log('[COMMENT WEBHOOK] 🚀 Automation triggered successfully!', automationResult.actions);
      } else {
        console.log('[COMMENT WEBHOOK] ℹ️ No automation rules matched this comment');
      }

      // Store comment data for analytics
      await this.storeCommentData(event, socialAccount);

      console.log('[COMMENT WEBHOOK] ✅ Comment event processed successfully');
    } catch (error) {
      console.error('[COMMENT WEBHOOK] ❌ Error handling comment event:', error);
      throw error;
    }
  }

  /**
   * Store comment data for analytics
   */
  private async storeCommentData(event: CommentWebhookEvent, socialAccount: any): Promise<void> {
    try {
      const commentData = {
        workspaceId: socialAccount.workspaceId,
        accountId: socialAccount.id,
        commentId: event.comment_id,
        postId: event.parent_id || event.media_id,
        from: event.from,
        text: event.text,
        timestamp: new Date(event.created_time ? event.created_time * 1000 : Date.now()),
        processed: true
      };

      console.log('[COMMENT WEBHOOK] 💾 Storing comment data for analytics');
      // Add to storage if needed for historical analysis
      // await this.storage.saveCommentEvent(commentData);
    } catch (error) {
      console.error('[COMMENT WEBHOOK] ❌ Error storing comment data:', error);
    }
  }

  /**
   * Validate comment event structure
   */
  isValidEvent(event: any): event is CommentWebhookEvent {
    return (
      event &&
      typeof event === 'object' &&
      event.from &&
      typeof event.from.id === 'string' &&
      typeof event.from.username === 'string' &&
      typeof event.text === 'string'
    );
  }
}
