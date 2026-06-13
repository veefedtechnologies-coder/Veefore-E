/**
 * Automation Feature Module
 * Central exports for automation components, types, and utilities
 */

// Components
export { AutomationBuilder } from './components/AutomationBuilder'

// Types
export type {
  AutomationBuilderProps,
  SocialAccount,
  ContentPost,
  AutomationFlowState,
  DmButton,
  AutomationRule,
  Step
} from './types/automation.types'

// Utilities
export {
  getCurrentKeywords,
  getCurrentResponses,
  getSteps,
  canProceedToNext,
  getInitialFlowState
} from './utils/automationHelpers'

export {
  transformSocialAccounts,
  transformPosts
} from './utils/dataTransformers'
