/**
 * MEDIA WEBHOOK HANDLER
 * 
 * Handles Instagram media/post webhook events
 * - New posts (feed, stories, reels)
 * - Media updates
 * - Engagement metrics (likes, reach, impressions)
 * - Follower events
 * - Insights and analytics
 */

import { IStorage } from '../../../storage';

export interface MediaWebhookEvent {
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
}

export type MediaEventType =
  | 'media'
  | 'feed'
  | 'follows'
  | 'followers'
  | 'likes'
  | 'story_insights'
  | 'insights'
  | 'live_videos'
  | 'mentions';

export class MediaWebhookHandler {
  constructor(private storage: IStorage) {}

  /**
   * Handle media/post event
   */
  async handle(eventType: MediaEventType, event: MediaWebhookEvent, socialAccount: any): Promise<void> {
    try {
      console.log(`[MEDIA WEBHOOK] 📊 Processing ${eventType} event`);

      switch (eventType) {
        case 'media':
        case 'feed':
          await this.handleMediaEvent(event, socialAccount);
          break;

        case 'follows':
        case 'followers':
          await this.handleFollowerEvent(event, socialAccount);
          break;

        case 'likes':
          await this.handleLikeEvent(event, socialAccount);
          break;

        case 'story_insights':
        case 'insights':
          await this.handleInsightsEvent(event, socialAccount);
          break;

        case 'live_videos':
          await this.handleLiveVideoEvent(event, socialAccount);
          break;

        case 'mentions':
          await this.handleMentionEvent(event, socialAccount);
          break;

        default:
          console.log(`[MEDIA WEBHOOK] 📝 Unhandled event type: ${eventType}`);
          await this.handleGenericEvent(eventType, event, socialAccount);
      }

      console.log(`[MEDIA WEBHOOK] ✅ ${eventType} event processed successfully`);
    } catch (error) {
      console.error(`[MEDIA WEBHOOK] ❌ Error handling ${eventType} event:`, error);
      throw error;
    }
  }

  /**
   * Handle media/post events (new posts, updates)
   */
  private async handleMediaEvent(event: MediaWebhookEvent, socialAccount: any): Promise<void> {
    try {
      console.log('[MEDIA WEBHOOK] 📸 Processing media/post event');

      if (event.media_id) {
        console.log(`[MEDIA WEBHOOK] 📊 New post detected: ${event.media_id}`);

        // Store post data for analytics
        await this.storePostData(event, socialAccount);
      }
    } catch (error) {
      console.error('[MEDIA WEBHOOK] ❌ Error handling media event:', error);
    }
  }

  /**
   * Handle follower events (follows/unfollows)
   */
  private async handleFollowerEvent(event: MediaWebhookEvent, socialAccount: any): Promise<void> {
    try {
      console.log('[MEDIA WEBHOOK] 👥 Processing follower event');

      if (event.followers_count !== undefined) {
        console.log(`[MEDIA WEBHOOK] 📈 Follower count updated: ${event.followers_count}`);

        // Update account follower count
        await this.updateAccountFollowers(socialAccount, event.followers_count);
      }
    } catch (error) {
      console.error('[MEDIA WEBHOOK] ❌ Error handling follower event:', error);
    }
  }

  /**
   * Handle like events
   */
  private async handleLikeEvent(event: MediaWebhookEvent, socialAccount: any): Promise<void> {
    try {
      console.log('[MEDIA WEBHOOK] ❤️ Processing like event');

      // Store engagement data for analytics
      await this.storeEngagementData('like', event, socialAccount);
    } catch (error) {
      console.error('[MEDIA WEBHOOK] ❌ Error handling like event:', error);
    }
  }

  /**
   * Handle insights events (reach, impressions, analytics)
   */
  private async handleInsightsEvent(event: MediaWebhookEvent, socialAccount: any): Promise<void> {
    try {
      console.log('[MEDIA WEBHOOK] 📊 Processing insights event');

      const insights = {
        reach: event.reach,
        impressions: event.impressions,
        saved: event.saved,
        video_views: event.video_views,
        timestamp: new Date()
      };

      console.log('[MEDIA WEBHOOK] 📈 Insights data:', insights);

      // Store insights for analytics dashboard
      await this.storeInsightsData(insights, socialAccount);
    } catch (error) {
      console.error('[MEDIA WEBHOOK] ❌ Error handling insights event:', error);
    }
  }

  /**
   * Handle live video events
   */
  private async handleLiveVideoEvent(event: MediaWebhookEvent, socialAccount: any): Promise<void> {
    try {
      console.log('[MEDIA WEBHOOK] 🔴 Processing live video event');
      // Store live video data for analytics
      await this.storeLiveVideoData(event, socialAccount);
    } catch (error) {
      console.error('[MEDIA WEBHOOK] ❌ Error handling live video event:', error);
    }
  }

  /**
   * Handle mention events
   */
  private async handleMentionEvent(event: MediaWebhookEvent, socialAccount: any): Promise<void> {
    try {
      console.log('[MEDIA WEBHOOK] @️⃣ Processing mention event');
      // Store mention data and potentially trigger automation
      await this.storeMentionData(event, socialAccount);
    } catch (error) {
      console.error('[MEDIA WEBHOOK] ❌ Error handling mention event:', error);
    }
  }

  /**
   * Handle generic events not specifically categorized
   */
  private async handleGenericEvent(
    eventType: string,
    event: MediaWebhookEvent,
    socialAccount: any
  ): Promise<void> {
    try {
      console.log(`[MEDIA WEBHOOK] 🔍 Processing generic ${eventType} event`);

      // Store all unknown events for analysis
      await this.storeGenericEventData(eventType, event, socialAccount);
    } catch (error) {
      console.error(`[MEDIA WEBHOOK] ❌ Error handling ${eventType} event:`, error);
    }
  }

  /**
   * Store post data for analytics
   */
  private async storePostData(event: MediaWebhookEvent, socialAccount: any): Promise<void> {
    try {
      const postData = {
        workspaceId: socialAccount.workspaceId,
        accountId: socialAccount.id,
        mediaId: event.media_id,
        mediaType: event.media_type,
        caption: event.caption,
        permalink: event.permalink,
        timestamp: new Date(),
        processed: true
      };

      console.log('[MEDIA WEBHOOK] 💾 Storing post data for analytics');
      // Add to storage if needed for historical analysis
      // await this.storage.saveMediaEvent(postData);
    } catch (error) {
      console.error('[MEDIA WEBHOOK] ❌ Error storing post data:', error);
    }
  }

  /**
   * Store engagement data for analytics
   */
  private async storeEngagementData(
    type: string,
    event: MediaWebhookEvent,
    socialAccount: any
  ): Promise<void> {
    try {
      const engagementData = {
        workspaceId: socialAccount.workspaceId,
        accountId: socialAccount.id,
        type,
        value: event,
        timestamp: new Date(),
        processed: true
      };

      console.log(`[MEDIA WEBHOOK] 💾 Storing ${type} engagement data`);
      // Add to storage if needed for analytics
      // await this.storage.saveEngagementEvent(engagementData);
    } catch (error) {
      console.error('[MEDIA WEBHOOK] ❌ Error storing engagement data:', error);
    }
  }

  /**
   * Store insights data for analytics dashboard
   */
  private async storeInsightsData(insights: any, socialAccount: any): Promise<void> {
    try {
      const insightsData = {
        workspaceId: socialAccount.workspaceId,
        accountId: socialAccount.id,
        insights,
        timestamp: new Date(),
        processed: true
      };

      console.log('[MEDIA WEBHOOK] 💾 Storing insights data for dashboard');
      // Add to storage for analytics dashboard
      // await this.storage.saveInsightsEvent(insightsData);
    } catch (error) {
      console.error('[MEDIA WEBHOOK] ❌ Error storing insights data:', error);
    }
  }

  /**
   * Store live video data
   */
  private async storeLiveVideoData(event: MediaWebhookEvent, socialAccount: any): Promise<void> {
    try {
      console.log('[MEDIA WEBHOOK] 💾 Storing live video data');
      // Add implementation as needed
      // await this.storage.saveLiveVideoEvent(event, socialAccount);
    } catch (error) {
      console.error('[MEDIA WEBHOOK] ❌ Error storing live video data:', error);
    }
  }

  /**
   * Store mention data
   */
  private async storeMentionData(event: MediaWebhookEvent, socialAccount: any): Promise<void> {
    try {
      console.log('[MEDIA WEBHOOK] 💾 Storing mention data');
      // Add implementation as needed
      // await this.storage.saveMentionEvent(event, socialAccount);
    } catch (error) {
      console.error('[MEDIA WEBHOOK] ❌ Error storing mention data:', error);
    }
  }

  /**
   * Store generic event data
   */
  private async storeGenericEventData(
    eventType: string,
    event: MediaWebhookEvent,
    socialAccount: any
  ): Promise<void> {
    try {
      console.log(`[MEDIA WEBHOOK] 💾 Storing ${eventType} event data`);
      // Store for analysis of new event types
      // await this.storage.saveGenericEvent(eventType, event, socialAccount);
    } catch (error) {
      console.error(`[MEDIA WEBHOOK] ❌ Error storing ${eventType} data:`, error);
    }
  }

  /**
   * Update account follower count
   */
  private async updateAccountFollowers(socialAccount: any, followerCount: number): Promise<void> {
    try {
      console.log(`[MEDIA WEBHOOK] 📈 Updating follower count to: ${followerCount}`);

      // Update the social account record with new follower count
      const updatedAccount = {
        ...socialAccount,
        followers: followerCount,
        lastSync: new Date().toISOString()
      };

      // Update in storage
      await this.storage.updateSocialAccount(socialAccount.id, updatedAccount);
    } catch (error) {
      console.error('[MEDIA WEBHOOK] ❌ Error updating follower count:', error);
    }
  }

  /**
   * Validate media event structure
   */
  isValidEvent(event: any): event is MediaWebhookEvent {
    return event && typeof event === 'object';
  }
}
