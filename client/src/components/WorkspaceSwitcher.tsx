import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { setActiveWorkspaceCookie } from '@/lib/bootstrap'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
  Sparkles,
  Lock,
} from 'lucide-react'
import { useUser } from '@/hooks/useUser'
import { auth } from '@/lib/firebase'
import { BrandSelectionModal } from '@/features/social-accounts/components/BrandSelectionModal'
import useSubscription from '@/hooks/useSubscription'

// Workspace switching without loading screen - instant transition
const AdvancedWorkspaceTransition = ({ workspace: _workspace }: { workspace: Workspace }) => {
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
  _id?: string  // MongoDB returns _id, we normalize to id
  name: string
  description?: string
  theme: string
  aiPersonality: string
  isDefault: boolean
  maxTeamMembers: number
  credits: number
  createdAt: string
}

// ✅ CRITICAL FIX: Normalize workspace data to ensure 'id' field exists (MongoDB returns _id)
const normalizeWorkspace = (ws: any): Workspace => ({
  ...ws,
  id: ws.id || ws._id,  // Use id if exists, fallback to _id
});

const normalizeWorkspaces = (workspaces: any[]): Workspace[] => {
  if (!Array.isArray(workspaces)) return [];
  return workspaces.map(normalizeWorkspace);
};

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
  const { userData } = useUser()

  // Plan/limit data comes from the server's entitlement system (single source
  // of truth in server/config/plan-config.ts) instead of a hardcoded table
  // here, which previously used different plan names ("Starter"/"Growth"/
  // "Agency") than the real plan IDs ("creator"/"pro"/"business") and always
  // fell back to a limit of 1 for any real plan.
  const { plan: subscriptionPlan, limits, aiCredits, isLoading: subscriptionLoading } = useSubscription()
  const userPlan: string = subscriptionPlan || (userData as any)?.plan || 'free'
  const creditBalance = aiCredits?.remaining
  const creditLabel = creditBalance == null
    ? (subscriptionLoading ? 'Loading credits…' : 'Credits unavailable')
    : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Math.max(0, creditBalance))} credits`
  // maxWorkspaces of -1 means unlimited (Infinity) per plan-config.ts convention
  const planLimit = limits?.maxWorkspaces === -1 ? null : (limits?.maxWorkspaces ?? 1)
  // ✅ FIX: Sanitize initial state to prevent 'undefined' string from propagating
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    getSanitizedWorkspaceId()
  )
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [targetWorkspace, setTargetWorkspace] = useState<Workspace | null>(null)
  const [showBrandPickerForNewWs, setShowBrandPickerForNewWs] = useState(false)

  /** Check if inactive brands exist; if so show the brand picker, else navigate to workspace settings */
  const handleCreateWorkspace = async () => {
    try {
      const token = await auth.currentUser?.getIdToken(false).catch(() => '')
      const hdrs: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch('/api/authorized-brands', { headers: hdrs, credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        const inactive = ((data?.data ?? data ?? []) as any[]).filter((b: any) => b.status === 'INACTIVE')
        if (inactive.length > 0) {
          setShowBrandPickerForNewWs(true)
          return
        }
      }
    } catch { /* ignore */ }
    // No inactive brands — navigate to workspaces settings for manual creation
    onNavigateToWorkspaces?.()
  }

  // Fetch user's workspaces
  const { data: workspacesResponse, isLoading } = useQuery({
    queryKey: ['/api/workspaces'],
    queryFn: () => apiRequest('/api/workspaces'),
    staleTime: 5 * 60 * 1000 // 5 minutes
  })

  // Extract workspaces from nested API response { success: true, data: [...] }
  // ✅ CRITICAL FIX: Normalize workspace data to ensure 'id' field exists (MongoDB returns _id)
  const rawWorkspaces = workspacesResponse?.data || workspacesResponse || []
  const workspaces = normalizeWorkspaces(rawWorkspaces)

  // Ensure workspaces is always an array (defensive programming)
  const safeWorkspaces = workspaces

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
    setActiveWorkspaceCookie(workspaceId)

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
      <div className="flex items-center space-x-2 px-3 py-2 rounded-lg">
        <Skeleton variant="rectangle" className="w-8 h-8 rounded-lg" />
        <Skeleton variant="pill" className="w-24 h-4 rounded" />
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
                  <span>{creditLabel}</span>
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

          {planLimit !== null && safeWorkspaces.length >= planLimit ? (
            /* At plan limit — show upgrade prompt instead of navigate */
            <DropdownMenuItem
              onClick={() => {
                toast({
                  title: `${userPlan} plan limit reached`,
                  description: `Your ${userPlan} plan allows ${planLimit} workspace${planLimit === 1 ? '' : 's'}. Upgrade to create more.`,
                  variant: 'default',
                  action: (
                    <a
                      href="/settings?tab=billing"
                      className="inline-flex items-center justify-center rounded-md text-xs font-medium bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700"
                    >
                      Upgrade
                    </a>
                  ),
                })
              }}
              className="flex items-center space-x-2 p-3 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">Create New Workspace</div>
                <div className="text-xs text-amber-500">{safeWorkspaces.length}/{planLimit} used — upgrade to add more</div>
              </div>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={handleCreateWorkspace}
              className="flex items-center space-x-2 p-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="font-medium">Create New Workspace</span>
            </DropdownMenuItem>
          )}

        </DropdownMenuContent>
      </DropdownMenu>

      {/* Brand picker modal — shown when creating a new workspace with inactive brands available */}
      <BrandSelectionModal
        open={showBrandPickerForNewWs}
        onOpenChange={setShowBrandPickerForNewWs}
        workspaceId=""
        createNewWorkspace={true}
        title="Choose a brand for your new workspace"
        description="Select a brand to create a new workspace for. Each workspace manages one brand."
        onSuccess={(_newWsId) => {
          setShowBrandPickerForNewWs(false)
          // Workspace changed — hard reload to pick up new workspace context
          window.location.href = '/'
        }}
      />
    </>
  )
}

// ✅ PURE FUNCTION: Get valid workspace ID synchronously (no side effects in render)
const getValidWorkspaceId = (workspaces: Workspace[], storedId: string | null): string | null => {
  if (workspaces.length === 0) return null;

  // Check if stored ID is valid and exists in workspaces
  const isValidId = storedId &&
    storedId !== 'undefined' &&
    storedId !== 'null' &&
    storedId !== '' &&
    workspaces.some(ws => ws.id === storedId);

  if (isValidId) return storedId;

  // Return default or first workspace ID
  const fallback = workspaces.find(ws => ws.isDefault) || workspaces[0];
  return fallback?.id || null;
};

// Hook to get current workspace ID (reactive to localStorage changes)
// ✅ PRODUCTION FIX: Auto-validates workspace ID on mount and corrects invalid IDs
export function useCurrentWorkspace() {
  // ✅ FIX: Sanitize initial state to prevent 'undefined' string from propagating
  const [storedWorkspaceId, setStoredWorkspaceId] = useState<string | null>(
    getSanitizedWorkspaceId()
  )
  const [isValidating, setIsValidating] = useState(false)
  const [hasValidated, setHasValidated] = useState(false)
  const queryClient = useQueryClient()

  // Fetch user's workspaces
  const { data: workspacesResponse, isLoading: workspacesLoading } = useQuery({
    queryKey: ['/api/workspaces'],
    queryFn: () => apiRequest('/api/workspaces'),
    staleTime: 5 * 60 * 1000 // 5 minutes
  })

  // Extract workspaces from nested API response { success: true, data: [...] }
  // ✅ CRITICAL FIX: Normalize workspace data to ensure 'id' field exists (MongoDB returns _id)
  const rawWorkspaces = workspacesResponse?.data || workspacesResponse || []
  const workspaces = useMemo(() => normalizeWorkspaces(rawWorkspaces), [rawWorkspaces])

  // ✅ CRITICAL: Compute valid workspace ID synchronously (pure function, no side effects)
  // This ensures currentWorkspace is ALWAYS consistent with normalized workspaces
  const validWorkspaceId = useMemo(() => {
    return getValidWorkspaceId(workspaces, storedWorkspaceId);
  }, [workspaces, storedWorkspaceId]);

  // ✅ CRITICAL: Compute currentWorkspace from validWorkspaceId (guaranteed to match)
  const currentWorkspace = useMemo(() => {
    if (!validWorkspaceId || workspaces.length === 0) return undefined;
    return workspaces.find((ws: Workspace) => ws.id === validWorkspaceId);
  }, [workspaces, validWorkspaceId]);

  // ✅ SYNC localStorage when valid ID differs from stored ID (side effect)
  useEffect(() => {
    if (workspacesLoading || workspaces.length === 0 || isValidating || hasValidated) return;

    const syncLocalStorage = async () => {
      setIsValidating(true);

      const currentStored = localStorage.getItem('currentWorkspaceId');

      // ✅ GUARD: Check for invalid string values first
      if (currentStored === 'undefined' || currentStored === 'null' || currentStored === '') {
        console.warn('[useCurrentWorkspace] 🧹 Removing invalid localStorage value:', currentStored);
        localStorage.removeItem('currentWorkspaceId');
      }

      // Check if localStorage needs correction
      const needsCorrection = validWorkspaceId && validWorkspaceId !== currentStored;

      if (needsCorrection) {
        console.warn('[useCurrentWorkspace] ❌ Invalid workspace ID in localStorage:', currentStored);
        console.log('[useCurrentWorkspace] 🔧 Correcting to:', validWorkspaceId);

        // Update localStorage
        localStorage.setItem('currentWorkspaceId', validWorkspaceId);
        setActiveWorkspaceCookie(validWorkspaceId);
        setStoredWorkspaceId(validWorkspaceId);

        // ✅ CRITICAL: Invalidate all React Query caches that depend on workspace ID
        console.log('[useCurrentWorkspace] 🔄 Invalidating workspace-dependent queries...');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/analytics/historical'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/content'] }),
        ]);

        // Dispatch events to notify other components
        window.dispatchEvent(new Event('workspace-changed'));
      } else if (validWorkspaceId) {
        console.log('[useCurrentWorkspace] ✅ Workspace ID is valid:', validWorkspaceId);
        // Keep the SSR cookie in sync so the next reload's server shell renders
        // the CORRECT workspace pill (no placeholder flash), even when no
        // localStorage correction was needed.
        setActiveWorkspaceCookie(validWorkspaceId);
      }

      setIsValidating(false);
      setHasValidated(true);
    };

    syncLocalStorage();
  }, [workspaces, workspacesLoading, validWorkspaceId, isValidating, hasValidated, queryClient]);

  // Auto-create a default workspace in production if none exists
  useEffect(() => {
    if (workspacesLoading) return;
    if (workspaces.length === 0) {
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
            setActiveWorkspaceCookie(created.id);
            setStoredWorkspaceId(created.id);
          } else {
            console.warn('[useCurrentWorkspace] ⚠️ Workspace creation returned invalid ID:', created?.id);
          }
          window.dispatchEvent(new Event('workspace-changed'));
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] }),
            queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
          ]);
        } catch { }
      })();
    }
  }, [workspaces, workspacesLoading, queryClient]);

  // Listen for localStorage changes to keep hook reactive
  useEffect(() => {
    const handleStorageChange = () => {
      // ✅ FIX: Always sanitize when reading from localStorage
      setStoredWorkspaceId(getSanitizedWorkspaceId())
      setHasValidated(false) // Re-validate after external change
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

  // ✅ CRITICAL: isReady indicates when workspace data is safe to use
  const isReady = !workspacesLoading && !!currentWorkspace?.id;

  return {
    currentWorkspace,
    currentWorkspaceId: currentWorkspace?.id || null,
    workspaces,
    isValidating,
    isReady,
    isLoading: workspacesLoading
  }
}
