import { VoiceProfileViewer } from './index'
import { ApiClient } from '@/lib/api'

/**
 * Example 1: Full Voice Profile View
 * Use this in a dedicated settings page or profile management page
 */
export function FullVoiceProfileExample() {
  const workspaceId = 'workspace-123' // Get from your auth/workspace context

  const handleRecalibrate = () => {
    console.log('Voice profile recalibrated successfully')
    // Show success toast notification
    // Optionally refresh other components that depend on the voice profile
  }

  const handleEdit = () => {
    console.log('Navigate to edit samples page')
    // Navigate to a page where users can add/edit their sample captions
    // Or open a modal with VoiceProfileSetup component
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <VoiceProfileViewer
        workspaceId={workspaceId}
        onRecalibrate={handleRecalibrate}
        onEdit={handleEdit}
      />
    </div>
  )
}

/**
 * Example 2: Compact View for Dashboard Sidebar
 * Use this in sidebars or as a widget on the dashboard
 */
export function CompactVoiceProfileExample() {
  const workspaceId = 'workspace-123'

  return (
    <div className="space-y-4">
      {/* Other dashboard widgets */}
      <VoiceProfileViewer
        workspaceId={workspaceId}
        compact={true}
        onEdit={() => {
          // Navigate to full voice profile page
          window.location.href = '/settings/voice-profile'
        }}
      />
      {/* More dashboard widgets */}
    </div>
  )
}

/**
 * Example 3: In Settings Page with Tabs
 * Use this as part of a tabbed settings interface
 */
export function SettingsWithVoiceProfileExample() {
  const [activeTab, setActiveTab] = useState('voice-profile')
  const workspaceId = 'workspace-123'

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      
      {/* Tabs Navigation */}
      <div className="flex space-x-4 border-b mb-6">
        <button
          onClick={() => setActiveTab('voice-profile')}
          className={`px-4 py-2 ${activeTab === 'voice-profile' ? 'border-b-2 border-purple-600 font-semibold' : ''}`}
        >
          Voice Profile
        </button>
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 ${activeTab === 'general' ? 'border-b-2 border-purple-600 font-semibold' : ''}`}
        >
          General
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`px-4 py-2 ${activeTab === 'integrations' ? 'border-b-2 border-purple-600 font-semibold' : ''}`}
        >
          Integrations
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'voice-profile' && (
        <VoiceProfileViewer
          workspaceId={workspaceId}
          onRecalibrate={() => {
            console.log('Profile recalibrated')
            // Show toast notification
          }}
          onEdit={() => {
            // Open edit modal or navigate to edit page
          }}
        />
      )}
      {activeTab === 'general' && <div>General Settings Content</div>}
      {activeTab === 'integrations' && <div>Integrations Content</div>}
    </div>
  )
}

/**
 * Example 4: With Modal/Dialog
 * Use this to show voice profile in a modal when user clicks a button
 */
export function VoiceProfileModalExample() {
  const [isOpen, setIsOpen] = useState(false)
  const workspaceId = 'workspace-123'

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
      >
        View Voice Profile
      </button>

      {/* Assuming you have a Dialog component */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-6xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Voice Profile</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-600 hover:text-gray-900"
              >
                ✕
              </button>
            </div>
            <VoiceProfileViewer
              workspaceId={workspaceId}
              onRecalibrate={() => {
                console.log('Recalibrated')
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Example 5: With React Router Navigation
 * Use this in a React Router setup
 */
export function VoiceProfilePageExample() {
  const navigate = useNavigate() // From react-router-dom
  const { workspaceId } = useParams() // From react-router-dom

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-8 px-4">
        {/* Breadcrumbs */}
        <nav className="mb-6">
          <button
            onClick={() => navigate('/settings')}
            className="text-purple-600 hover:text-purple-700"
          >
            ← Back to Settings
          </button>
        </nav>

        <VoiceProfileViewer
          workspaceId={workspaceId!}
          onRecalibrate={() => {
            // Show success notification
            toast.success('Voice profile updated successfully!')
          }}
          onEdit={() => {
            // Navigate to edit page
            navigate(`/settings/voice-profile/edit`)
          }}
        />
      </div>
    </div>
  )
}

/**
 * Example 6: Conditional Rendering Based on Profile State
 * Show setup wizard if no profile exists, otherwise show viewer
 */
export function ConditionalVoiceProfileExample() {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null)
  const workspaceId = 'workspace-123'

  useEffect(() => {
    // Check if user has a voice profile
    ApiClient.get(`/api/voice-profile/${workspaceId}`)
      .then(data => {
        setHasProfile(data.success && data.voiceProfile)
      })
      .catch(() => setHasProfile(false))
  }, [workspaceId])

  if (hasProfile === null) {
    return <div>Loading...</div>
  }

  if (!hasProfile) {
    // Show setup wizard if no profile exists
    return (
      <VoiceProfileSetup
        workspaceId={workspaceId}
        onComplete={() => {
          setHasProfile(true)
        }}
      />
    )
  }

  // Show viewer if profile exists
  return (
    <VoiceProfileViewer
      workspaceId={workspaceId}
      onRecalibrate={() => {
        console.log('Profile updated')
      }}
      onEdit={() => {
        // Reset to setup mode to add more samples
        setHasProfile(false)
      }}
    />
  )
}

// Don't forget to import useState, useEffect, useNavigate, useParams as needed
import { useState, useEffect } from 'react'
// import { useNavigate, useParams } from 'react-router-dom'
// import { VoiceProfileSetup } from './index'
// import { toast } from 'your-toast-library'
