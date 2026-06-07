/**
 * Example usage of VoiceProfileSetup component
 * 
 * This file demonstrates how to integrate the VoiceProfileSetup component
 * into your application.
 */

import { useState } from 'react'
import { VoiceProfileSetup } from './index'
import { Dialog, DialogContent } from '@/components/ui/dialog'

export function VoiceProfileSetupExample() {
  const [isOpen, setIsOpen] = useState(false)
  const [profile, setProfile] = useState(null)

  // Example workspace ID - replace with actual workspace ID from context/state
  const workspaceId = 'example-workspace-id'

  const handleComplete = (voiceProfile: any) => {
    console.log('Voice profile created:', voiceProfile)
    setProfile(voiceProfile)
    setIsOpen(false)
    // You might want to:
    // - Show a success toast
    // - Navigate to another page
    // - Update global state
    // - Trigger a refetch of workspace data
  }

  const handleSkip = () => {
    console.log('User skipped voice profile setup')
    setIsOpen(false)
    // Handle skip action
  }

  return (
    <div>
      <button onClick={() => setIsOpen(true)}>
        Set Up Voice Profile
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <VoiceProfileSetup
            workspaceId={workspaceId}
            onComplete={handleComplete}
            onSkip={handleSkip}
          />
        </DialogContent>
      </Dialog>

      {profile && (
        <div>
          <h3>Profile Created!</h3>
          <pre>{JSON.stringify(profile, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

/**
 * Alternative: Standalone page usage (without dialog)
 */
export function VoiceProfileSetupPage() {
  const workspaceId = 'example-workspace-id'

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <VoiceProfileSetup
        workspaceId={workspaceId}
        onComplete={(profile) => {
          console.log('Profile created:', profile)
          // Navigate to next step or dashboard
          window.location.href = '/dashboard'
        }}
        onSkip={() => {
          // Navigate to dashboard without setting up profile
          window.location.href = '/dashboard'
        }}
      />
    </div>
  )
}

/**
 * INSTAGRAM CONNECTION FLOW:
 * 
 * The component automatically detects if the user has connected their Instagram account.
 * If connected, it offers two options via tabs:
 * 
 * 1. "Connect Instagram" tab:
 *    - Shows connection status
 *    - Allows importing captions directly from Instagram feed
 *    - Fetches recent posts automatically
 *    - More accurate voice analysis
 * 
 * 2. "Upload Manually" tab:
 *    - Traditional caption upload interface
 *    - Requires 5+ captions minimum
 *    - User pastes captions directly
 * 
 * API Requirements:
 * - GET /api/instagram/user-media/:accountId - Fetch user's recent posts
 * - POST /api/voice-profile/analyze - Analyze captions and create voice profile
 * 
 * The component handles:
 * - Instagram connection checking via useSocialAccounts hook
 * - OAuth redirect for Instagram connection
 * - Caption fetching and validation
 * - Error handling and fallback to manual upload
 */
