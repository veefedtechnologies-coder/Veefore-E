/**
 * Automation Feature Module
 * Central exports for automation components, types, and utilities
 */

// Components
export { AutomationBuilder } from './components/AutomationBuilder'
export { AutomationList } from './components/AutomationList'
export { AutomationTable } from './components/AutomationTable'
export { CommentSimulator } from './components/CommentSimulator'
export { InstagramPreview } from './components/InstagramPreview'
export type { CommentSimulatorProps, Comment, CommentReply } from './components/CommentSimulator'
export type { AutomationListProps } from './components/AutomationList'
export type { AutomationTableProps } from './components/AutomationTable'

// Hooks
export { useInstagramSimulation } from './hooks/useInstagramSimulation'
export type { UseInstagramSimulationProps } from './hooks/useInstagramSimulation'

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
