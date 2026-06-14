/**
 * Constants and initial state for automation flow
 * Extracted from useAutomationFlow.ts for better organization
 * 
 * Note: getInitialFlowState is re-exported from automationHelpers.ts
 * to maintain consistency across the codebase.
 * 
 * Requirements: 2.2
 */

import type { AutomationFlowState } from '../types/automation.types';

// Re-export getInitialFlowState from automationHelpers for consistency
export { getInitialFlowState } from '../utils/automationHelpers';

/**
 * Default advanced settings
 */
export const DEFAULT_ADVANCED_SETTINGS = {
  maxRepliesPerDay: 100,
  cooldownPeriod: 24,
  aiPersonality: 'friendly' as const,
  activeHours: { start: '09:00', end: '17:00' },
  activeDays: [true, true, true, true, true, false, false],
  commentDelay: 5,
  commentDelayUnit: 'seconds' as const,
};

/**
 * Default follower gate settings
 */
export const DEFAULT_FOLLOWER_GATE_SETTINGS = {
  followerGateEnabled: false,
  followerGateMessage: '',
  followerGateVisitLabel: 'Visit Profile',
  followerGateConfirmLabel: "I'm Following!",
  followerGateRetryMessage: 'Please follow us first to continue!',
  followerGateDelay: '2',
};

/**
 * Automation type labels
 */
export const AUTOMATION_TYPE_LABELS = {
  comment_dm: 'Comment to DM',
  dm_only: 'DM Only',
  comment_only: 'Comment Only',
} as const;

/**
 * Match mode labels
 */
export const MATCH_MODE_LABELS = {
  exact: 'Exact Match',
  contains: 'Contains',
  intent: 'AI Intent',
  any: 'Any Comment',
} as const;

/**
 * AI personality options
 */
export const AI_PERSONALITY_OPTIONS = [
  'professional',
  'friendly',
  'casual',
  'enthusiastic',
  'witty',
] as const;

/**
 * Time unit options
 */
export const TIME_UNIT_OPTIONS = [
  'seconds',
  'minutes',
  'hours',
] as const;
