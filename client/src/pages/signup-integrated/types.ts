/**
 * SignUpIntegrated — shared types for the signup + onboarding flow.
 */

export type SignupStep =
  | 'form'
  | 'verification'
  | 'creating'
  | 'onboarding-profile'
  | 'onboarding-goals'
  | 'onboarding-platforms'
  | 'onboarding-plan'
  | 'onboarding-connect-meta'      // Step 5: Connect Meta account
  | 'onboarding-brand-selection'   // Step 6: Choose brand (shown only when N > 1 pages)

// User exists redirect modal state
export interface UserExistsModal {
  show: boolean
  email: string
}
