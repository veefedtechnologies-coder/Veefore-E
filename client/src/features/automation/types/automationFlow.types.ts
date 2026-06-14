/**
 * Type definitions for automation flow hook
 * Extracted from useAutomationFlow.ts for better organization
 * 
 * Requirements: 2.2
 */

import type { 
  AutomationFlowState, 
  DmButton 
} from './automation.types';

/**
 * Trigger update payload for updateTrigger method
 */
export interface TriggerUpdate {
  selectedAccount?: string;
  contentType?: string;
  selectedPost?: any | null;
  automationType?: 'comment_dm' | 'dm_only' | 'comment_only';
  matchMode?: 'exact' | 'contains' | 'intent' | 'any';
  keywords?: string[];
  dmKeywords?: string[];
  commentKeywords?: string[];
  negativeKeywords?: string[];
  aiIntents?: string[];
}

/**
 * Action update payload for addAction method
 */
export interface ActionUpdate {
  commentReplies?: string[];
  dmMessage?: string;
  dmAutoReply?: string;
  publicReply?: string;
  dmButtons?: DmButton[];
  followerGateEnabled?: boolean;
  followerGateMessage?: string;
  followerGateVisitLabel?: string;
  followerGateConfirmLabel?: string;
  followerGateRetryMessage?: string;
  followerGateDelay?: string;
}

/**
 * Advanced settings update payload
 */
export interface AdvancedSettingsUpdate {
  maxRepliesPerDay?: number;
  cooldownPeriod?: number;
  aiPersonality?: 'professional' | 'friendly' | 'casual' | 'enthusiastic' | 'witty';
  activeHours?: { start: string; end: string };
  activeDays?: boolean[];
  commentDelay?: number;
  commentDelayUnit?: 'seconds' | 'minutes' | 'hours';
}

/**
 * Validation error structure
 */
export interface ValidationError {
  field: string;
  message: string;
  step?: number;
}

/**
 * Validation warning structure
 */
export interface ValidationWarning {
  field: string;
  message: string;
  step?: number;
}

/**
 * Validation result structure
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Hook return interface
 */
export interface UseAutomationFlowReturn {
  // State
  flow: AutomationFlowState;
  currentStep: number;
  isValid: boolean;
  isSaving: boolean;
  
  // Methods
  updateTrigger: (updates: TriggerUpdate) => void;
  addAction: (updates: ActionUpdate) => void;
  updateAdvancedSettings: (updates: AdvancedSettingsUpdate) => void;
  updateFlow: (updates: Partial<AutomationFlowState>) => void;
  validateFlow: () => ValidationResult;
  saveAutomation: (workspaceId: string) => Promise<void>;
  resetFlow: () => void;
  setCurrentStep: (step: number) => void;
  canProceed: (step: number) => boolean;
  
  // Helpers
  addKeyword: (keyword: string) => void;
  removeKeyword: (keyword: string) => void;
  addCommentReply: (reply: string) => void;
  removeCommentReply: (index: number) => void;
  addDmButton: (button: DmButton) => void;
  updateDmButton: (index: number, button: Partial<DmButton>) => void;
  removeDmButton: (index: number) => void;
  
  // Cache management
  loadFromCache: (userId: string) => void;
  saveToCache: (userId: string) => void;
  clearCache: (userId?: string) => void;
}

/**
 * Action types for reducer
 */
export type AutomationFlowAction =
  | { type: 'UPDATE_TRIGGER'; payload: TriggerUpdate }
  | { type: 'ADD_ACTION'; payload: ActionUpdate }
  | { type: 'UPDATE_ADVANCED_SETTINGS'; payload: AdvancedSettingsUpdate }
  | { type: 'UPDATE_FLOW'; payload: Partial<AutomationFlowState> }
  | { type: 'SET_STEP'; payload: number }
  | { type: 'SET_VALID'; payload: boolean }
  | { type: 'RESET_FLOW' }
  | { type: 'ADD_KEYWORD'; payload: string }
  | { type: 'REMOVE_KEYWORD'; payload: string }
  | { type: 'ADD_COMMENT_REPLY'; payload: string }
  | { type: 'REMOVE_COMMENT_REPLY'; payload: number }
  | { type: 'ADD_DM_BUTTON'; payload: DmButton }
  | { type: 'UPDATE_DM_BUTTON'; payload: { index: number; updates: Partial<DmButton> } }
  | { type: 'REMOVE_DM_BUTTON'; payload: number }
  | { type: 'LOAD_FROM_CACHE'; payload: Partial<AutomationFlowState> };
