/**
 * TypeScript type definitions for Automation feature
 * Extracted from AutomationBuilder to improve modularity
 */

export interface AutomationBuilderProps {
  /** Current step in the workflow (1-5) */
  currentStep?: number
  /** Callback when step changes */
  onStepChange?: (step: number) => void
  /** Whether to show the automation list instead of builder */
  showList?: boolean
  /** Callback when toggling between builder and list */
  onToggleList?: (show: boolean) => void
}

export interface SocialAccount {
  id: string
  username: string
  platform: string
  followersCount: number
  profilePictureUrl: string
  workspaceId: string
}

export interface ContentPost {
  id: string
  externalId: string
  title: string
  type: 'post' | 'reel' | 'story'
  image: string
  mediaUrl: string
  thumbnailUrl: string
  permalink: string
  likes: number
  comments: number
  shares: number
  saves: number
  reach: number
  caption: string
  publishedAt: string
}

export interface AutomationFlowState {
  // Step 1: Setup
  selectedAccount: string
  contentType: string
  selectedPost: ContentPost | null
  
  // Step 2: Configuration
  automationType: 'comment_dm' | 'dm_only' | 'comment_only'
  keywords: string[]
  dmKeywords: string[]
  commentKeywords: string[]
  
  // Responses
  commentReplies: string[]
  dmMessage: string
  dmAutoReply: string
  publicReply: string
  
  // Advanced triggers
  matchMode: 'exact' | 'contains' | 'intent' | 'any'
  negativeKeywords: string[]
  aiIntents: string[]
  
  // DM buttons configuration
  dmButtons: DmButton[]
  
  // Follower gate configuration
  followerGateEnabled: boolean
  followerGateMessage: string
  followerGateVisitLabel: string
  followerGateConfirmLabel: string
  followerGateRetryMessage: string
  followerGateDelay: string
  
  // Step 4: Advanced settings
  maxRepliesPerDay: number
  cooldownPeriod: number
  aiPersonality: 'professional' | 'friendly' | 'casual' | 'enthusiastic' | 'witty'
  activeHours: { start: string; end: string }
  activeDays: boolean[]
  
  // Delays
  commentDelay: number
  commentDelayUnit: 'seconds' | 'minutes' | 'hours'
}

export interface DmButton {
  type: 'quick_reply' | 'web_url' | 'flow' | 'copy_code'
  text: string
  url: string
  payload: string
  followUpMessage?: string
}

export interface AutomationRule {
  id?: string
  name: string
  workspaceId: string
  type: 'comment_dm' | 'dm_only' | 'comment_only'
  matchMode: 'exact' | 'contains' | 'intent' | 'any'
  negativeKeywords: string[]
  aiIntents: string[]
  keywords: string[]
  targetMediaIds: string[]
  responses: any
  isActive: boolean
  createdAt?: string | Date
  updatedAt?: string | Date
}

export interface Step {
  id: number
  title: string
  description: string
}
