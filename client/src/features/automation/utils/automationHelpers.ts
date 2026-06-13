/**
 * Helper functions for automation flow logic
 * Extracted from AutomationBuilder to improve modularity
 */

import { AutomationFlowState, Step } from '../types/automation.types'

/**
 * Get the current keywords based on automation type
 */
export const getCurrentKeywords = (flowState: AutomationFlowState): string[] => {
  switch (flowState.automationType) {
    case 'comment_dm':
      return flowState.keywords
    case 'dm_only':
      return flowState.dmKeywords
    case 'comment_only':
      return flowState.commentKeywords
    default:
      return flowState.keywords
  }
}

/**
 * Build the responses object for automation rule creation
 */
export const getCurrentResponses = (flowState: AutomationFlowState) => {
  const validButtons = flowState.dmButtons.filter(b => b.text.trim())
  
  const ruleData: any = {}
  
  switch (flowState.automationType) {
    case 'comment_dm':
      ruleData.responses = flowState.commentReplies.filter(reply => reply.trim().length > 0)
      ruleData.dmResponses = flowState.dmMessage ? [flowState.dmMessage] : []
      ruleData.dmButtons = validButtons
      break
    case 'dm_only':
      ruleData.responses = []
      ruleData.dmResponses = flowState.dmAutoReply ? [flowState.dmAutoReply] : []
      ruleData.dmButtons = validButtons
      break
    case 'comment_only':
      ruleData.responses = [flowState.publicReply].filter(Boolean)
      ruleData.dmResponses = []
      ruleData.dmButtons = []
      break
  }
  
  if (flowState.followerGateEnabled) {
    ruleData.followerGate = {
      enabled: true,
      lockedMessage: flowState.followerGateMessage,
      visitProfileLabel: flowState.followerGateVisitLabel,
      confirmLabel: flowState.followerGateConfirmLabel,
      retryMessage: flowState.followerGateRetryMessage,
      delay: flowState.followerGateDelay,
      maxRetries: 3
    }
  }
  
  return ruleData
}

/**
 * Get the workflow steps based on automation type
 */
export const getSteps = (automationType: 'comment_dm' | 'dm_only' | 'comment_only'): Step[] => {
  const baseSteps: Step[] = [
    { id: 1, title: 'Select Setup', description: 'Account, content & post' },
    { id: 2, title: 'Automation Config', description: 'Choose & configure automation' }
  ]
  
  if (automationType === 'comment_dm') {
    return [
      ...baseSteps,
      { id: 3, title: 'DM Configuration', description: 'Setup private message' },
      { id: 4, title: 'Advanced Settings', description: 'Fine-tune timing' },
      { id: 5, title: 'Review & Activate', description: 'Review and activate' }
    ]
  }
  
  return [
    ...baseSteps,
    { id: 3, title: 'Advanced Settings', description: 'Fine-tune timing' },
    { id: 4, title: 'Review & Activate', description: 'Review and activate' }
  ]
}

/**
 * Check if user can proceed to next step
 */
export const canProceedToNext = (currentStep: number, flowState: AutomationFlowState): boolean => {
  switch (currentStep) {
    case 1:
      return !!flowState.selectedAccount && !!flowState.contentType && flowState.selectedPost !== null
    case 2:
      if (flowState.automationType === 'comment_dm') {
        return !!flowState.automationType && 
               getCurrentKeywords(flowState).length > 0 && 
               flowState.commentReplies.some(reply => reply.trim().length > 0)
      }
      return !!flowState.automationType && getCurrentKeywords(flowState).length > 0
    case 3:
      if (flowState.automationType === 'comment_dm') {
        return flowState.dmMessage.trim().length > 0
      }
      return true
    case 4:
      return true
    case 5:
      return true
    default:
      return false
  }
}

/**
 * Get initial flow state with default values
 */
export const getInitialFlowState = (): AutomationFlowState => ({
  // Step 1
  selectedAccount: '',
  contentType: '',
  selectedPost: null,
  
  // Step 2
  automationType: 'comment_dm',
  keywords: [],
  dmKeywords: [],
  commentKeywords: [],
  
  // Responses
  commentReplies: ['Message sent!', 'Found it? 😊', 'Sent just now! ⏰'],
  dmMessage: '',
  dmAutoReply: '',
  publicReply: '',
  
  // Advanced triggers
  matchMode: 'contains',
  negativeKeywords: [],
  aiIntents: [],
  
  // DM buttons
  dmButtons: [{ type: 'web_url', text: 'See products', url: '', payload: '', followUpMessage: '' }],
  
  // Follower gate
  followerGateEnabled: false,
  followerGateMessage: "Please follow the page first to unlock the link 🔓",
  followerGateVisitLabel: "Visit Profile",
  followerGateConfirmLabel: "I'm Following ✅",
  followerGateRetryMessage: "Looks like you still haven't followed the page yet 👀 Follow first to unlock the content 🚀",
  followerGateDelay: "instant",
  
  // Step 4
  maxRepliesPerDay: 10,
  cooldownPeriod: 30,
  aiPersonality: 'friendly',
  activeHours: { start: '09:00', end: '17:00' },
  activeDays: [true, true, true, true, true, false, false],
  
  // Delays
  commentDelay: 15,
  commentDelayUnit: 'minutes'
})
