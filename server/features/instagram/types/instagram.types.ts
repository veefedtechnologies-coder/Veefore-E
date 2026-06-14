/**
 * Instagram Feature Type Definitions
 * Central location for all Instagram-related types
 */

/**
 * Access Token Data Structure
 */
export interface AccessToken {
  token: string;
  userId: string;
  expiresAt: Date;
  tokenType: 'short_lived' | 'long_lived';
  scopes?: string[];
}

/**
 * Instagram User Profile
 */
export interface InstagramUser {
  id: string;
  username: string;
  account_type: 'PERSONAL' | 'BUSINESS' | 'CREATOR';
  media_count: number;
  followers_count: number;
  name?: string;
  biography?: string;
  profile_picture_url?: string;
  website?: string;
}

/**
 * Instagram Media Types
 */
export type InstagramMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS' | 'STORIES';

/**
 * Instagram Media
 */
export interface InstagramMedia {
  id: string;
  media_type: InstagramMediaType;
  media_url: string;
  permalink: string;
  timestamp: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  views?: number;
  impressions?: number;
  reach?: number;
  engagement?: number;
  saved?: number;
  shares?: number;
}

/**
 * Instagram Media Insights
 */
export interface InstagramMediaInsights {
  impressions?: number;
  reach?: number;
  engagement?: number;
  saved?: number;
  shares?: number;
  video_views?: number;
  likes?: number;
  comments?: number;
}

/**
 * Instagram Account Insights
 */
export interface InstagramAccountInsights {
  impressions: number;
  reach: number;
  profile_views: number;
  website_clicks: number;
  follower_count: number;
  email_contacts?: number;
  phone_call_clicks?: number;
  text_message_clicks?: number;
  get_directions_clicks?: number;
}

/**
 * Instagram API Response Types
 */
export interface InstagramApiResponse<T = any> {
  data: T;
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/**
 * Instagram Publishing Options
 */
export interface InstagramPublishOptions {
  accountId?: string;
  mentions?: string[];
  collaborators?: string[];
  location?: {
    id: string;
    name: string;
  };
  product_tags?: Array<{
    product_id: string;
    x: number;
    y: number;
  }>;
}

/**
 * Instagram Publishing Result
 */
export interface InstagramPublishResult {
  id: string;
  permalink?: string;
  processing?: boolean;
  error?: string;
}

/**
 * Instagram Webhook Event Types
 */
export type InstagramWebhookField = 'messages' | 'messaging_postbacks' | 'messaging_optins' | 'message_reactions' | 
  'comments' | 'live_comments' | 'story_insights' | 'mentions';

/**
 * Instagram Webhook Event
 */
export interface InstagramWebhookEvent {
  field: InstagramWebhookField;
  value: {
    id: string;
    time: number;
    [key: string]: any;
  };
}

/**
 * Instagram Comment
 */
export interface InstagramComment {
  id: string;
  text: string;
  timestamp: string;
  username: string;
  from: {
    id: string;
    username: string;
  };
  media?: {
    id: string;
    media_product_type?: string;
  };
  parent_id?: string;
  replies?: {
    data: InstagramComment[];
  };
}

/**
 * Instagram Direct Message
 */
export interface InstagramMessage {
  id: string;
  from: {
    id: string;
    username: string;
  };
  to: {
    data: Array<{
      id: string;
      username: string;
    }>;
  };
  message: string;
  timestamp: string;
  attachments?: Array<{
    type: 'image' | 'video' | 'audio' | 'file';
    payload: {
      url: string;
    };
  }>;
}

/**
 * Instagram Automation Configuration
 */
export interface InstagramAutomationConfig {
  userId: string;
  enabled: boolean;
  autoReply: {
    enabled: boolean;
    messages: Array<{
      trigger: string;
      response: string;
    }>;
  };
  autoComment: {
    enabled: boolean;
    keywords: string[];
    response: string;
  };
  dmAutomation: {
    enabled: boolean;
    welcomeMessage?: string;
    keywords: Array<{
      trigger: string;
      response: string;
    }>;
  };
}

/**
 * Instagram Token Refresh Response
 */
export interface InstagramTokenRefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Instagram OAuth Response
 */
export interface InstagramOAuthResponse {
  access_token: string;
  user_id?: string;
  permissions?: string[];
  expires_in?: number;
}

/**
 * Instagram Media Container (for publishing)
 */
export interface InstagramMediaContainer {
  id: string;
  status?: 'IN_PROGRESS' | 'PUBLISHED' | 'EXPIRED' | 'ERROR';
  status_code?: 'FINISHED' | 'IN_PROGRESS' | 'EXPIRED' | 'ERROR';
}

/**
 * Instagram Insights Period
 */
export type InstagramInsightsPeriod = 'day' | 'week' | 'days_28' | 'lifetime';

/**
 * Instagram Insights Metric
 */
export type InstagramInsightsMetric = 
  | 'impressions'
  | 'reach'
  | 'profile_views'
  | 'website_clicks'
  | 'follower_count'
  | 'email_contacts'
  | 'phone_call_clicks'
  | 'text_message_clicks'
  | 'get_directions_clicks'
  | 'engagement'
  | 'saved'
  | 'shares'
  | 'video_views';
