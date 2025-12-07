import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { Button } from '@/components/ui/button'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { 
  Building2, 
  ChevronDown, 
  Plus, 
  Settings, 
  Crown,
  Check,
  Users,
  Sparkles
} from 'lucide-react'

// Workspace switching without loading screen - instant transition
const AdvancedWorkspaceTransition = ({ workspace }: { workspace: Workspace }) => {
  // No loading screen - return null for instant workspace switching
  return null
}

// Helper function to get theme gradients
const getThemeGradient = (theme: string) => {
  switch (theme) {
    case 'space': return 'from-purple-500 to-indigo-600'
    case 'ocean': return 'from-blue-500 to-cyan-600'
    case 'forest': return 'from-green-500 to-emerald-600'
    case 'sunset': return 'from-orange-500 to-red-600'
    default: return 'from-gray-500 to-gray-600'
  }
}

// Helper function for personality icons
const getPersonalityIcon = (personality: string) => {
  switch (personality) {
    case 'creative': return '🎨'
    case 'casual': return '😊'
    case 'technical': return '⚙️'
    case 'friendly': return '🤝'
    default: return '💼'
  }
}


interface Workspace {
  id: string
  name: string
  description?: string
  theme: string
  aiPersonality: string
  isDefault: boolean
  maxTeamMembers: number
  credits: number
  createdAt: string
}

interface WorkspaceSwitcherProps {
  onNavigateToWorkspaces?: () => void
}

// ✅ HELPER: Sanitize workspace ID from localStorage (filter out 'undefined', 'null', '')
const getSanitizedWorkspaceId = (): string | null => {
  const stored = localStorage.getItem('currentWorkspaceId');
  if (!stored || stored === 'undefined' || stored === 'null' || stored === '') {
    return null;
  }
  return stored;
};

export default function WorkspaceSwitcher({ onNavigateToWorkspaces }: WorkspaceSwitcherProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  // ✅ FIX: Sanitize initial state to prevent 'undefined' string from propagating
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    getSanitizedWorkspaceId()
  )
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [targetWorkspace, setTargetWorkspace] = useState<Workspace | null>(null)

  // Fetch user's workspaces
  const { data: workspacesResponse, isLoading } = useQuery({
    queryKey: ['/api/workspaces'],
    queryFn: () => apiRequest('/api/workspaces'),
    staleTime: 5 * 60 * 1000 // 5 minutes
  })
  
  // Extract workspaces from nested API response { success: true, data: [...] }
  const workspaces = workspacesResponse?.data || workspacesResponse || []

  // Ensure workspaces is always an array (defensive programming)
  const safeWorkspaces = Array.isArray(workspaces) ? workspaces : []

  // Get current workspace
  const currentWorkspace = safeWorkspaces.find((ws: Workspace) => 
    currentWorkspaceId ? ws.id === currentWorkspaceId : ws.isDefault
  ) || safeWorkspaces.find((ws: Workspace) => ws.isDefault) || safeWorkspaces[0]

  // Advanced workspace switching with beautiful animation
  const handleWorkspaceSwitch = async (workspaceId: string) => {
    // ✅ GUARD: Prevent storing invalid values
    if (!workspaceId || workspaceId === 'undefined' || workspaceId === 'null') {
      console.warn('[WorkspaceSwitcher] ❌ Attempted to switch to invalid workspace ID:', workspaceId);
      return;
    }
    
    const workspace = safeWorkspaces.find((ws: Workspace) => ws.id === workspaceId)
    if (!workspace) return
    
    // Start beautiful transition
    setTargetWorkspace(workspace)
    setIsTransitioning(true)
    
    // Update workspace immediately
    setCurrentWorkspaceId(workspaceId)
    localStorage.setItem('currentWorkspaceId', workspaceId)
    
    // Dispatch custom event to notify useCurrentWorkspace hook
    window.dispatchEvent(new Event('workspace-changed'))
    
    // Invalidate queries that depend on workspace with animation timing
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/content'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] })
    ])
    
    // Show beautiful animation for at least 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // End transition
    setIsTransitioning(false)
    setTargetWorkspace(null)
    
    toast({
      title: "🚀 Workspace Ready!",
      description: `Welcome to ${workspace.name} workspace`
    })
  }


  if (isLoading) {
    return (
      <div className="flex items-center space-x-2 px-3 py-2 bg-gray-100 rounded-lg animate-pulse">
        <div className="w-8 h-8 bg-gray-300 rounded-lg"></div>
        <div className="w-24 h-4 bg-gray-300 rounded"></div>
      </div>
    )
  }

  if (!currentWorkspace) {
    return (
      <Button
        variant="outline"
        onClick={onNavigateToWorkspaces}
        className="flex items-center space-x-2"
      >
        <Plus className="w-4 h-4" />
        <span>Create Workspace</span>
      </Button>
    )
  }

  return (
    <>
      {/* Beautiful Advanced Workspace Transition */}
      {isTransitioning && targetWorkspace && (
        <AdvancedWorkspaceTransition workspace={targetWorkspace} />
      )}
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center space-x-3 h-auto p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">
          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getThemeGradient(currentWorkspace.theme)} flex items-center justify-center text-white shadow-sm`}>
            <Building2 className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-2">
            <div className="text-left">
              <div className="flex items-center space-x-1">
                <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{currentWorkspace.name}</span>
                {currentWorkspace.isDefault && (
                  <Crown className="w-3 h-3 text-yellow-500" />
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-1">
                <span>{getPersonalityIcon(currentWorkspace.aiPersonality)}</span>
                <span>{currentWorkspace.credits} credits</span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent className="w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl" align="end" forceMount>
        <DropdownMenuLabel className="font-normal p-4">
          <div className="flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Switch Workspace</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={onNavigateToWorkspaces}
                className="text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {safeWorkspaces.length} workspace{safeWorkspaces.length !== 1 ? 's' : ''} available
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <div className="space-y-1">
          {safeWorkspaces.map((workspace: Workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              onClick={() => handleWorkspaceSwitch(workspace.id)}
              className="flex items-center space-x-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
            >
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getThemeGradient(workspace.theme)} flex items-center justify-center text-white shadow-sm flex-shrink-0`}>
                <Building2 className="w-5 h-5" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{workspace.name}</span>
                  {workspace.isDefault && (
                    <Crown className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                  )}
                  {workspace.id === currentWorkspace.id && (
                    <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  )}
                </div>
                
                <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center space-x-1">
                    <span>{getPersonalityIcon(workspace.aiPersonality)}</span>
                    <span className="capitalize">{workspace.aiPersonality}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Sparkles className="w-3 h-3" />
                    <span>{workspace.credits}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Users className="w-3 h-3" />
                    <span>{workspace.maxTeamMembers}</span>
                  </div>
                </div>
                
                {workspace.description && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">{workspace.description}</p>
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </div>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          onClick={onNavigateToWorkspaces}
          className="flex items-center space-x-2 p-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium">Create New Workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  )
}

// Hook to get current workspace ID (reactive to localStorage changes)
// ✅ PRODUCTION FIX: Auto-validates workspace ID on mount and corrects invalid IDs
export function useCurrentWorkspace() {
  // ✅ FIX: Sanitize initial state to prevent 'undefined' string from propagating
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    getSanitizedWorkspaceId()
  )
  const [isValidating, setIsValidating] = useState(false)
  const queryClient = useQueryClient()
  
  // Fetch user's workspaces
  const { data: workspacesResponse, isLoading: workspacesLoading } = useQuery({
    queryKey: ['/api/workspaces'],
    queryFn: () => apiRequest('/api/workspaces'),
    staleTime: 5 * 60 * 1000 // 5 minutes
  })
  
  // Extract workspaces from nested API response { success: true, data: [...] }
  const workspaces = workspacesResponse?.data || workspacesResponse || []

  // ✅ PRODUCTION FIX: Validate workspace ID on mount and when workspaces change
  useEffect(() => {
    if (workspacesLoading || workspaces.length === 0 || isValidating) return;

    const validateWorkspace = async () => {
      setIsValidating(true);
      
      const storedWorkspaceId = localStorage.getItem('currentWorkspaceId');
      
      // ✅ GUARD: Check for invalid string values first
      if (storedWorkspaceId === 'undefined' || storedWorkspaceId === 'null' || storedWorkspaceId === '') {
        console.warn('[useCurrentWorkspace] 🧹 Removing invalid localStorage value:', storedWorkspaceId);
        localStorage.removeItem('currentWorkspaceId');
      }
      
      // Check if stored workspace ID exists in user's workspaces
      const safeWorkspaces = Array.isArray(workspaces) ? workspaces as Workspace[] : [];
      const isValidString = storedWorkspaceId && storedWorkspaceId !== 'undefined' && storedWorkspaceId !== 'null' && storedWorkspaceId !== '';
      const isValid = isValidString && safeWorkspaces.some((ws: Workspace) => ws.id === storedWorkspaceId);
      
      if (!isValid) {
        // INVALID WORKSPACE ID - Auto-correct
        console.warn('[useCurrentWorkspace] ❌ Invalid workspace ID detected:', storedWorkspaceId);
        console.log('[useCurrentWorkspace] 🔧 Auto-correcting to valid workspace...');
        
        const defaultWorkspace = safeWorkspaces.find((ws: Workspace) => ws.isDefault) || safeWorkspaces[0];
        
        // Guard check: If no workspaces available, we cannot auto-correct
        if (!defaultWorkspace) {
          console.log('[useCurrentWorkspace] ⚠️ No workspaces available, cannot auto-correct');
          setIsValidating(false);
          return;
        }
        
        const correctedWorkspaceId = defaultWorkspace.id;
        
        console.log('[useCurrentWorkspace] ✅ Auto-corrected to workspace:', {
          id: correctedWorkspaceId,
          name: defaultWorkspace.name
        });
        
        // Update localStorage and state
        localStorage.setItem('currentWorkspaceId', correctedWorkspaceId);
        setCurrentWorkspaceId(correctedWorkspaceId);
        
        // ✅ CRITICAL: Invalidate all React Query caches that depend on workspace ID
        // This forces React Query to refetch with the CORRECT workspace ID
        console.log('[useCurrentWorkspace] 🔄 Invalidating all workspace-dependent queries...');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/analytics/historical'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/content'] }),
          // Refetch immediately to get data for correct workspace
          queryClient.refetchQueries({ queryKey: ['/api/social-accounts'], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['/api/dashboard/analytics'], type: 'active' })
        ]);
        console.log('[useCurrentWorkspace] ✅ All queries invalidated and refetched with correct workspace ID');
        
        // Dispatch events to notify other components
        window.dispatchEvent(new Event('workspace-changed'));
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'currentWorkspaceId',
          newValue: correctedWorkspaceId,
          oldValue: storedWorkspaceId,
          storageArea: localStorage
        }));
      } else {
        console.log('[useCurrentWorkspace] ✅ Workspace ID is valid:', storedWorkspaceId);
      }
      
      setIsValidating(false);
    };

    validateWorkspace();
  }, [workspaces, workspacesLoading, isValidating, queryClient]);

  // Auto-create a default workspace in production if none exists
  useEffect(() => {
    if (workspacesLoading) return;
    const safe = Array.isArray(workspaces) ? workspaces as Workspace[] : [];
    if (safe.length === 0) {
      const autoCreate = (import.meta as any).env?.VITE_AUTO_CREATE_WORKSPACE === 'true' && !(import.meta as any).env?.PROD;
      if (!autoCreate) return;
      (async () => {
        try {
          const created = await apiRequest('/api/workspaces', {
            method: 'POST',
            body: JSON.stringify({ name: 'My Workspace' })
          });
          // ✅ GUARD: Only set if we got a valid ID back
          if (created && created.id && created.id !== 'undefined') {
            localStorage.setItem('currentWorkspaceId', created.id);
            setCurrentWorkspaceId(created.id);
          } else {
            console.warn('[useCurrentWorkspace] ⚠️ Workspace creation returned invalid ID:', created?.id);
          }
          window.dispatchEvent(new Event('workspace-changed'));
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] }),
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
          ]);
        } catch {}
      })();
    }
  }, [workspaces, workspacesLoading, queryClient]);
  
  // Listen for localStorage changes to keep hook reactive
  useEffect(() => {
    const handleStorageChange = () => {
      // ✅ FIX: Always sanitize when reading from localStorage
      setCurrentWorkspaceId(getSanitizedWorkspaceId())
    }
    
    // Listen for storage events (when localStorage changes in other tabs)
    window.addEventListener('storage', handleStorageChange)
    
    // Custom event for same-tab localStorage changes
    window.addEventListener('workspace-changed', handleStorageChange)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('workspace-changed', handleStorageChange)
    }
  }, [])

  const currentWorkspace = useMemo(() => {
    const safeWorkspaces = Array.isArray(workspaces) ? workspaces as Workspace[] : [];
    return safeWorkspaces.find((ws: Workspace) => 
      currentWorkspaceId ? ws.id === currentWorkspaceId : ws.isDefault
    ) || safeWorkspaces.find((ws: Workspace) => ws.isDefault) || safeWorkspaces[0]
  }, [workspaces, currentWorkspaceId])

  return {
    currentWorkspace,
    currentWorkspaceId: currentWorkspace?.id || null,
    workspaces,
    isValidating
  }
}
