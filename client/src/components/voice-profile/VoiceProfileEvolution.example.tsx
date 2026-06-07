import VoiceProfileEvolution from './VoiceProfileEvolution'

/**
 * Example usage of VoiceProfileEvolution component
 * 
 * This component displays the evolution of a user's voice profile over time,
 * showing learning progress, milestones, and acceptance rate trends.
 */

// Example 1: Full view with evolution data
export function FullEvolutionExample() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <VoiceProfileEvolution workspaceId="workspace-123" />
    </div>
  )
}

// Example 2: Compact view for dashboard/sidebar
export function CompactEvolutionExample() {
  return (
    <div className="p-4 max-w-sm">
      <VoiceProfileEvolution 
        workspaceId="workspace-123" 
        compact={true}
      />
    </div>
  )
}

// Example 3: In a settings page with other profile components
export function SettingsPageExample() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold">Voice Profile Settings</h1>
      
      {/* Voice Profile Viewer */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Current Profile</h2>
        {/* VoiceProfileViewer component would go here */}
      </section>

      {/* Voice Profile Evolution */}
      <section>
        <VoiceProfileEvolution workspaceId="workspace-123" />
      </section>
    </div>
  )
}

// Example 4: In a dashboard with analytics
export function DashboardExample() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
      {/* Main content area */}
      <div className="lg:col-span-2 space-y-6">
        <VoiceProfileEvolution workspaceId="workspace-123" />
      </div>

      {/* Sidebar with compact views */}
      <div className="space-y-4">
        <VoiceProfileEvolution 
          workspaceId="workspace-123" 
          compact={true}
        />
        {/* Other compact widgets */}
      </div>
    </div>
  )
}

export default FullEvolutionExample
