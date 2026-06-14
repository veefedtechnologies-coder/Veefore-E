/**
 * Type definitions for Instagram Preview and Automation components
 * @module automation/types/instagram
 */

/**
 * Instagram post content types
 */
export type PostType = 'post' | 'reel' | 'video' | 'carousel' | 'story';

/**
 * Automation workflow types
 */
export type AutomationType = 'comment_dm' | 'dm_only' | 'comment_only' | '';

/**
 * DM button action types
 */
export type DMButtonType = 'quick_reply' | 'web_url' | 'flow' | 'copy_code' | 'postback';

/**
 * Instagram post engagement metrics
 */
export interface EngagementMetrics {
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  views?: number;
}

/**
 * Instagram post data structure
 */
export interface PostData {
  /** Unique post identifier */
  id: string;
  
  /** Type of Instagram content */
  type?: PostType;
  
  /** URL to post image (for static posts) */
  image?: string;
  
  /** URL to media file (for videos/reels) */
  mediaUrl?: string;
  
  /** URL to thumbnail image */
  thumbnailUrl?: string;
  
  /** Post caption text */
  caption?: string;
  
  /** Direct likes count (legacy) */
  likes?: number;
  
  /** Direct comments count (legacy) */
  comments?: number;
  
  /** Engagement metrics object (preferred) */
  engagement?: EngagementMetrics;
  
  /** Post creation timestamp */
  createdAt?: Date | string;
  
  /** Post location data */
  location?: {
    name: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  
  /** Post hashtags */
  hashtags?: string[];
  
  /** Tagged users */
  mentions?: string[];
}

/**
 * Instagram account data
 */
export interface AccountData {
  /** Unique account identifier */
  id: string;
  
  /** Account username (e.g., @myaccount) */
  name: string;
  
  /** URL to profile avatar image */
  avatar?: string;
  
  /** Social media platform */
  platform?: string;
  
  /** Workspace this account belongs to */
  workspaceId?: string;
  
  /** Account follower count */
  followers?: number;
  
  /** Account following count */
  following?: number;
  
  /** Account bio/description */
  bio?: string;
  
  /** Account verification status */
  isVerified?: boolean;
  
  /** Account access token (for API calls) */
  accessToken?: string;
  
  /** Token expiration timestamp */
  tokenExpires?: Date | string;
}

/**
 * Direct message button configuration
 */
export interface DMButton {
  /** Button display text */
  text: string;
  
  /** Button action type */
  type: DMButtonType;
  
  /** URL for web_url type buttons */
  url?: string;
  
  /** Payload for postback/quick_reply buttons */
  payload?: string;
  
  /** Follow-up message configuration for interactive buttons */
  followUp?: {
    /** Message to send after button click */
    message: string;
    /** Nested buttons in follow-up message */
    buttons: DMButton[];
  };
}

/**
 * Automation trigger keyword configuration
 */
export interface TriggerKeyword {
  /** Keyword text to match */
  keyword: string;
  
  /** Whether matching is case-sensitive */
  caseSensitive?: boolean;
  
  /** Whether to match whole word only */
  wholeWord?: boolean;
  
  /** Regular expression pattern (advanced) */
  pattern?: string;
}

/**
 * Comment reply configuration
 */
export interface CommentReply {
  /** Reply message text */
  message: string;
  
  /** Keywords that trigger this reply */
  triggers?: string[];
  
  /** Whether to include user mention */
  includeMention?: boolean;
  
  /** Delay before sending reply (seconds) */
  delay?: number;
}

/**
 * Follower gate configuration
 */
export interface FollowerGateConfig {
  /** Whether follower gate is enabled */
  enabled: boolean;
  
  /** Message shown when user is not following */
  message: string;
  
  /** Label for "Visit Profile" button */
  visitLabel?: string;
  
  /** Label for "I'm Following" confirmation button */
  confirmLabel?: string;
  
  /** Message sent after confirmation */
  successMessage?: string;
  
  /** Whether to verify follower status */
  verifyFollowerStatus?: boolean;
}

/**
 * Automation configuration
 */
export interface AutomationConfig {
  /** Unique automation identifier */
  id: string;
  
  /** Automation name */
  name: string;
  
  /** Automation type */
  type: AutomationType;
  
  /** Whether automation is active */
  isActive: boolean;
  
  /** Account ID this automation applies to */
  accountId: string;
  
  /** Trigger keywords */
  keywords: string[];
  
  /** Comment reply messages */
  commentReplies?: string[];
  
  /** Direct message template */
  dmMessage?: string;
  
  /** DM buttons configuration */
  dmButtons?: DMButton[];
  
  /** Follower gate configuration */
  followerGate?: FollowerGateConfig;
  
  /** Automation creation timestamp */
  createdAt: Date | string;
  
  /** Last updated timestamp */
  updatedAt?: Date | string;
  
  /** Automation statistics */
  stats?: {
    triggered: number;
    dmsSent: number;
    commentsSent: number;
    errors: number;
  };
}

/**
 * Instagram Preview component props
 */
export interface InstagramPreviewProps {
  /** Selected post data to display */
  selectedPost?: PostData | null;
  
  /** Array of posts for finding updated data */
  postsData?: PostData[];
  
  /** Selected Instagram account ID */
  selectedAccount?: string;
  
  /** Array of available Instagram accounts */
  realAccounts?: AccountData[];
  
  /** Current automation type */
  automationType?: AutomationType;
  
  /** Current step in automation workflow */
  currentStep?: number;
  
  /** Trigger keywords for automation */
  currentKeywords?: string[];
  
  /** Comment reply messages */
  commentReplies?: string[];
  
  /** Direct message template */
  dmMessage?: string;
  
  /** DM buttons configuration */
  dmButtons?: DMButton[];
  
  /** Whether follower gate is enabled */
  followerGateEnabled?: boolean;
  
  /** Follower gate message */
  followerGateMessage?: string;
  
  /** Follower gate visit button label */
  followerGateVisitLabel?: string;
  
  /** Follower gate confirm button label */
  followerGateConfirmLabel?: string;
  
  /** Whether comment screen is visible */
  showCommentScreen?: boolean;
  
  /** Handler for comment screen toggle */
  onCommentScreenToggle?: (show: boolean) => void;
  
  /** Custom comment screen component */
  CommentScreenComponent?: React.ComponentType<any>;
  
  /** Props for comment screen component */
  commentScreenProps?: any;
}

/**
 * Comment screen component props
 */
export interface CommentScreenProps {
  /** Whether comment screen is visible */
  isVisible: boolean;
  
  /** Handler to close comment screen */
  onClose: () => void;
  
  /** Trigger keywords */
  triggerKeywords: string[];
  
  /** Automation type */
  automationType: AutomationType;
  
  /** Comment reply messages */
  commentReplies: string[];
  
  /** DM message template */
  dmMessage: string;
  
  /** Selected account ID */
  selectedAccount: string;
  
  /** Available accounts */
  realAccounts: AccountData[];
  
  /** Current keyword being typed */
  newKeyword: string;
  
  /** Comment input text */
  commentInputText: string;
  
  /** Handler to set comment input text */
  setCommentInputText: (text: string) => void;
  
  /** Function to get current keywords */
  getCurrentKeywords: () => string[];
  
  /** Handler to set selected keywords */
  setSelectedKeywords: (keywords: string[]) => void;
  
  /** Ref to track update source */
  updateSourceRef: React.MutableRefObject<'trigger' | 'comment' | null>;
  
  /** Current time for timestamp generation */
  currentTime: Date;
  
  /** All keywords */
  keywords: string[];
  
  /** Handler to set keywords */
  setKeywords: (keywords: string[]) => void;
  
  /** DM-specific keywords */
  dmKeywords: string[];
  
  /** Handler to set DM keywords */
  setDmKeywords: (keywords: string[]) => void;
  
  /** Comment-specific keywords */
  commentKeywords: string[];
  
  /** Handler to set comment keywords */
  setCommentKeywords: (keywords: string[]) => void;
}

/**
 * Template variable substitution map
 */
export interface TemplateVariables {
  username?: string;
  first_name?: string;
  last_name?: string;
  keyword?: string;
  link?: string;
  account_name?: string;
  [key: string]: string | undefined;
}

/**
 * Utility type guards
 */
export const isReelOrVideo = (post?: PostData | null): boolean => {
  return post?.type === 'reel' || post?.type === 'video';
};

export const isCarousel = (post?: PostData | null): boolean => {
  return post?.type === 'carousel';
};

export const hasEngagement = (post?: PostData | null): boolean => {
  return !!(post?.likes || post?.comments || post?.engagement);
};

/**
 * Template variable substitution utility
 */
export const substituteTemplateVariables = (
  template: string,
  variables: TemplateVariables
): string => {
  let result = template;
  
  Object.entries(variables).forEach(([key, value]) => {
    if (value !== undefined) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    }
  });
  
  return result;
};

/**
 * Format engagement numbers for display
 */
export const formatEngagementNumber = (num?: number): string => {
  if (!num || num === 0) return '0';
  
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  
  return num.toLocaleString();
};

/**
 * Get engagement count with fallback
 */
export const getEngagementCount = (
  post?: PostData | null,
  metric: 'likes' | 'comments' | 'shares' | 'saves' | 'views' = 'likes'
): number => {
  if (!post) return 0;
  
  // Try engagement object first
  if (post.engagement && post.engagement[metric] !== undefined) {
    return post.engagement[metric] || 0;
  }
  
  // Fallback to direct properties for likes and comments
  if (metric === 'likes' && post.likes !== undefined) {
    return post.likes;
  }
  
  if (metric === 'comments' && post.comments !== undefined) {
    return post.comments;
  }
  
  return 0;
};

export default {
  isReelOrVideo,
  isCarousel,
  hasEngagement,
  substituteTemplateVariables,
  formatEngagementNumber,
  getEngagementCount,
};
