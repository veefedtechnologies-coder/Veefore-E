import React, { useState, useEffect, useRef } from 'react'
import { Route, Switch, useLocation, Redirect } from 'wouter'
import { useFirebaseAuth } from './hooks/useFirebaseAuth'
import { Skeleton } from './components/ui/skeleton'
import {
  DashboardSkeleton,
  PostsSkeleton,
  ScheduledPostsSkeleton,
  DraftsSkeleton,
  PublishedPostsSkeleton,
  CreatePostSkeleton,
  PlanSkeleton,
  AnalyticsSkeleton,
  PostAnalyticsSkeleton,
  VeeGPTSkeleton,
  AutomationSkeleton,
  VideoGeneratorSkeleton,
  ProfileSkeleton,
  SettingsSkeleton,
  SocialListeningSkeleton,
  SecurityDashboardSkeleton,
  TestFixturesSkeleton,
  EncryptionHealthSkeleton,
} from '@/components/skeletons/pages'
import { getAuth } from 'firebase/auth'
import { useQuery } from '@tanstack/react-query'
import { apiRequest, queryClient } from '@/lib/queryClient'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RealtimeProvider } from './context/RealtimeContext'
import { LoadingStatusProvider } from '@/components/skeletons/LoadingStatusProvider'
import useSubscription from '@/hooks/useSubscription'

import { Sidebar } from './components/layout/sidebar'
import { Header } from './components/layout/header'
import {
  Calendar, LayoutGrid, FileText, PenLine, Plus as PlusIcon,
  RefreshCw, Clock, Zap, Settings2, Brain,
  Activity, Video, ChevronLeft, Coins,
  Calendar as CalendarIcon, FileEdit, LayoutGrid as LayoutGridAlias,
  MessageSquare as MessageSquareIcon, Zap as ZapIcon, TrendingUp as TrendingUpIcon,
  BarChart3 as BarChart3Icon, FileBarChart2 as FileBarChart2Icon, Plus,
} from 'lucide-react'


const CreateDropdown = React.lazy(() => import('./components/layout/create-dropdown').then(m => ({ default: m.CreateDropdown })))
const QuickActions = React.lazy(() => import('./components/dashboard/quick-actions').then(m => ({ default: m.QuickActions })))
const PerformanceScore = React.lazy(() => import('./components/dashboard/performance-score').then(m => ({ default: m.PerformanceScore })))
const Recommendations = React.lazy(() => import('./components/dashboard/recommendations').then(m => ({ default: m.Recommendations })))
const GetStarted = React.lazy(() => import('./components/dashboard/get-started').then(m => ({ default: m.GetStarted })))
const ScheduledPosts = React.lazy(() => import('./components/dashboard/scheduled-posts').then(m => ({ default: m.ScheduledPosts })))
const Drafts = React.lazy(() => import('./components/dashboard/scheduled-posts').then(m => ({ default: m.Drafts })))
const PublishedPosts = React.lazy(() => import('./components/dashboard/scheduled-posts').then(m => ({ default: m.PublishedPosts })))
const Listening = React.lazy(() => import('./components/dashboard/listening').then(m => ({ default: m.Listening })))
const SocialAccounts = React.lazy(() => import('./components/dashboard/social-accounts').then(m => ({ default: m.SocialAccounts })))
const InstagramWebhookListener = React.lazy(() => import('./components/dashboard/instagram-webhook-listener'))
const ScheduledPostsSection = React.lazy(() => import('./components/dashboard/scheduled-posts-section').then(m => ({ default: m.ScheduledPostsSection })))
const DraftsSection = React.lazy(() => import('./components/dashboard/drafts-section').then(m => ({ default: m.DraftsSection })))
const BestTimeWidget = React.lazy(() => import('./components/dashboard/best-time-widget').then(m => ({ default: m.BestTimeWidget })))
const CalendarView = React.lazy(() => import('./components/calendar/calendar-view').then(m => ({ default: m.CalendarView })))
const PlanPageComponent = React.lazy(() => import('./pages/PlanPage').then(m => ({ default: m.PlanPage })))
// Enterprise Analytics workspace (Phase 1 foundation). Supersedes the legacy
// mock `analytics-dashboard.tsx`, which remains on disk (replace-alongside)
// until later phases fully port its functionality.
const AnalyticsApp = React.lazy(() => import('./features/analytics').then(m => ({ default: m.AnalyticsApp })))
const CreatePost = React.lazy(() => import('./components/create/create-post').then(m => ({ default: m.CreatePost })))
const ScheduledPostsPage = React.lazy(() => import('./pages/ScheduledPostsPage'))
const DraftsPage = React.lazy(() => import('./pages/DraftsPage'))
const PublishedPostsPage = React.lazy(() => import('./pages/PublishedPostsPage'))
const PostAnalyticsPage = React.lazy(() => import('./pages/PostAnalyticsPage'))
const VeeGPT = React.lazy(() => import('./pages/VeeGPT'))
const Profile = React.lazy(() => import('./pages/Profile'))
const AutomationStepByStep = React.lazy(() => import('./pages/AutomationStepByStep'))
const VideoGeneratorAdvanced = React.lazy(() => import('./pages/VideoGeneratorAdvanced'))
const AdminPanel = React.lazy(() => import('./pages/AdminPanel'))
const Settings = React.lazy(() => import('./pages/Settings'))
const SecurityDashboard = React.lazy(() => import('./pages/SecurityDashboard'))
const SocialListeningPage = React.lazy(() => import('./pages/SocialListeningPage'))
const TestFixtures = React.lazy(() => import('./pages/TestFixtures'))
const EncryptionHealth = React.lazy(() => import('./pages/EncryptionHealth'))
const BillingPage = React.lazy(() => import('./pages/BillingPage').then(m => ({ default: m.BillingPage })))
const CreditsPage = React.lazy(() => import('./pages/CreditsPage'))
const SubscriptionCheckoutPage = React.lazy(() => import('./pages/SubscriptionCheckoutPage').then(m => ({ default: m.SubscriptionCheckoutPage })))
const AIUsageDashboard = React.lazy(() => import('./pages/AIUsageDashboard'))
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
// OnboardingFlow removed - onboarding now happens inline during signup
const AccountNotFoundBanner = React.lazy(() => import('./components/AccountNotFoundBanner'))
const SectionErrorBoundary = React.lazy(() => import('./components/ErrorBoundary').then(m => ({ default: m.SectionErrorBoundary })))
const WorkspaceCreationOverlay = React.lazy(() => import('./components/WorkspaceCreationOverlay'))
const GuidedTour = React.lazy(() => import('./components/walkthrough/GuidedTour').then(m => ({ default: m.GuidedTour })))
const MemoryStorageAlert = React.lazy(() => import('./components/MemoryStorageAlert'))

// Enterprise Analytics workspace route pattern. A RegExp matches `/analytics`
// and every nested section (e.g. `/analytics/audience/growth`) while keeping
// wouter's location ABSOLUTE (so the primary rail sidebar highlight keeps
// working). It intentionally does NOT match `/analyticsfoo`. The post-level
// analytics detail route is registered before this so it wins in the Switch.
const ANALYTICS_ROUTE_PATTERN = /^\/analytics(?=$|\/)/i

interface NormalizedWorkspace {
  id: string;
  _id?: string;
  name: string;
  description?: string;
  theme?: string;
  aiPersonality?: string;
  isDefault?: boolean;
  maxTeamMembers?: number;
  credits?: number;
  createdAt?: string;
}

const normalizeWorkspace = (ws: any): NormalizedWorkspace => ({
  ...ws,
  id: ws.id || ws._id,
});

const normalizeWorkspaces = (workspaces: any): NormalizedWorkspace[] => {
  const rawWorkspaces = workspaces?.data || workspaces || [];
  if (!Array.isArray(rawWorkspaces)) return [];
  return rawWorkspaces.map(normalizeWorkspace);
};

const DashboardLayout = ({ 
  children, 
  isCreateDropdownOpen, 
  setIsCreateDropdownOpen,
  handleCreateOptionSelect
}: { 
  children: React.ReactNode,
  isCreateDropdownOpen: boolean,
  setIsCreateDropdownOpen: (open: boolean) => void,
  handleCreateOptionSelect: (option: string) => void
}) => (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
    <div className="h-screen overflow-y-auto flex-shrink-0">
      <Sidebar
        className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
        isCreateDropdownOpen={isCreateDropdownOpen}
        setIsCreateDropdownOpen={setIsCreateDropdownOpen}
      />
    </div>
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {isCreateDropdownOpen && (
        <React.Suspense fallback={null}>
          <CreateDropdown
            isOpen={isCreateDropdownOpen}
            onClose={() => setIsCreateDropdownOpen(false)}
            onOptionSelect={handleCreateOptionSelect}
          />
        </React.Suspense>
      )}
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
        {children}
      </main>
    </div>
  </div>
)

export default function AuthenticatedApp() {
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false)
  // Onboarding modal removed - now inline during signup
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState(false)
  const { user, loading } = useFirebaseAuth()
  const { aiCredits, limits } = useSubscription()
  const availableCredits = aiCredits?.remaining
  // Drafts are a Creator+ feature. Used to hide the Drafts tab on /posts for Free.
  const canUseDrafts = limits?.features?.draftPosts === true
  const [location, setLocation] = useLocation()

  // The server paints the app-shell as a fixed overlay (see html-bootstrap.ts)
  // so the client mounts into an empty #root without a flash. Once the real
  // authenticated app has mounted here, dissolve that overlay to reveal the live
  // dashboard underneath. EXCEPTION: the /veegpt route's real page is a separate
  // lazy chunk that mounts later — VeeGPT triggers the dissolve itself once it's
  // mounted, so we skip it here to avoid revealing VeeGPT's (white) loading gap.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/veegpt')) return
    const id = requestAnimationFrame(() => {
      try { (window as any).__vfRemoveShell?.('authenticatedapp-mount') } catch { /* ignore */ }
    })
    return () => cancelAnimationFrame(id)
  }, [])

  const { data: userDataRaw, isLoading: userDataLoading, error: userDataError } = useQuery({
    queryKey: ['/api/user'],
    queryFn: () => apiRequest('/api/user'),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })

  // Normalize the API response shape: /api/user returns { success: true, data: {...} }
  // but older code expected the user object directly. Handle both shapes.
  const userData = (userDataRaw as any)?.data?.user ?? (userDataRaw as any)?.data ?? (userDataRaw as any)?.user ?? userDataRaw

  const { data: workspacesRaw, isLoading: workspacesLoading, error: workspacesError, refetch: enforceRefetch } = useQuery({
    queryKey: ['/api/workspaces'],
    queryFn: () => apiRequest('/api/workspaces'),
    enabled: !!user && !!userData,
    staleTime: 5 * 60 * 1000,
    retry: 3,
  })

  const workspaces = normalizeWorkspaces(workspacesRaw)
  const [enforceHang, setEnforceHang] = useState(false)
  // Guard: the "refresh /api/user to pick up an updated onboarding flag" logic
  // must run AT MOST ONCE. Without this, invalidating ['/api/user'] returns a new
  // userData object, which re-triggers the effect, which invalidates again — an
  // infinite refetch loop that floods /api/user and trips the rate limiter (429),
  // breaking every other data fetch on the page.
  const onboardingRefreshedRef = useRef(false)
  
  const workspacesLoaded = typeof workspacesRaw !== 'undefined'
  const hasWorkspaces = workspacesLoaded && Array.isArray(workspaces) && workspaces.length > 0

  // Only show the creation overlay if we KNOW they have 0 workspaces after loading
  const needEnforce = userData && !userData.isOnboarded && workspacesLoaded && !hasWorkspaces
  // We don't use workspacesLoading here because it flashes on every reload
  const enforcing = needEnforce
  const enforceError = workspacesError

  useEffect(() => {
    if (enforcing) {
      const timer = setTimeout(() => setEnforceHang(true), 10000)
      return () => clearTimeout(timer)
    } else {
      setEnforceHang(false)
    }
  }, [enforcing])

  useEffect(() => {
    if (!loading && !userDataLoading) {
      const workspacesLoaded = !workspacesLoading && Array.isArray(workspaces)
      const hasWorkspaces = workspacesLoaded && workspaces.length > 0
      const localOnboarded = localStorage.getItem('isOnboarded') === 'true'
      if (user && userData && (userData.isOnboarded || hasWorkspaces)) {
        // Confirmed onboarded (DB flag OR has workspaces). Persist a durable,
        // cross-tab signal so a later transient (empty/loading workspaces after a
        // cross-tab Firebase re-auth, or a stale `isOnboarded:false` from the DB)
        // can NEVER bounce this browser into the onboarding flow again.
        try { localStorage.setItem('isOnboarded', 'true') } catch { /* ignore */ }

        if (location === '/signin' || location === '/signup' || location === '/onboarding') {
          setLocation('/')
        }

        if (!userData.isOnboarded && hasWorkspaces && !onboardingRefreshedRef.current) {
          onboardingRefreshedRef.current = true
          queryClient.invalidateQueries({ queryKey: ['/api/user'] })
        }
        if (!userData.isOnboarded && localOnboarded && !onboardingRefreshedRef.current) {
          onboardingRefreshedRef.current = true
          queryClient.invalidateQueries({ queryKey: ['/api/user'] })
        }
      } else if (
        user && userData && !userData.isOnboarded &&
        workspacesLoaded && !hasWorkspaces &&
        // Never bounce a browser that has previously confirmed onboarding. This
        // guards against a transient empty `/api/workspaces` result (e.g. a
        // cross-tab re-auth or a momentary refetch) hard-redirecting an already
        // onboarded user to /signup?resume=true.
        !localOnboarded
      ) {
        // User is authenticated but hasn't completed onboarding - redirect to signup to complete it
        // Check both wouter location and actual URL to account for query params
        const currentUrl = window.location.pathname
        if (!currentUrl.startsWith('/signup')) {
          console.log('[ONBOARDING] User not onboarded, redirecting to signup to complete onboarding')
          window.location.href = '/signup?resume=true'
          return
        }
      }
    }
  }, [user, loading, userData, userDataLoading, location, setLocation, workspaces, workspacesLoading])

  const handleCreateOptionSelect = (option: string) => {
    setIsCreateDropdownOpen(false)
    if (option === 'post') setLocation('/posts')
    if (option === 'automation') setLocation('/automation')
    if (option === 'video') setLocation('/video-generator')
  }
  return (
    <RealtimeProvider>
      <LoadingStatusProvider>
        <React.Suspense fallback={null}>
          <MemoryStorageAlert />
        </React.Suspense>
        {/* Mounted ONCE here (not per-route) so the realtime metrics socket stays
            connected across navigation. Mounting it inside each page remounted it
            on every tab switch → new socket → server re-sync → forced
            refetchQueries(['/api/social-accounts']) → the dashboard appeared to
            "refetch on every page switch". A single persistent mount keeps the
            cache intact on navigation; genuine webhook events still refresh. */}
        <React.Suspense fallback={null}>
          <InstagramWebhookListener />
        </React.Suspense>
        <Switch location={location}>


        <Route path="/plan">
          <ProtectedRoute>
            <div className="min-h-screen bg-white dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
              <div className="h-screen overflow-y-auto flex-shrink-0">
                <Sidebar
                  className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                  isCreateDropdownOpen={isCreateDropdownOpen}
                  setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                />
              </div>
              <div className="flex flex-1 min-w-0 h-screen overflow-hidden">
                <React.Suspense fallback={<PlanSkeleton />}>
                  <PlanPageComponent />
                </React.Suspense>
              </div>
            </div>
          </ProtectedRoute>
        </Route>

        <Route path="/posts">
          <ProtectedRoute>
            <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
              {/* Posts header: title + status tabs */}
              <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <div>
                  <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Content</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage all your posts across statuses</p>
                </div>
                <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                  <button className="px-3 py-1.5 rounded-md bg-white dark:bg-gray-700 shadow-sm text-xs font-semibold text-blue-600 dark:text-blue-400">Scheduled</button>
                  {canUseDrafts && (
                    <button className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Drafts</button>
                  )}
                  <button className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Published</button>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <React.Suspense fallback={<PostsSkeleton />}>
                  <div className="flex flex-col space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <ScheduledPosts />
                      <Drafts />
                      <PublishedPosts />
                    </div>
                  </div>
                </React.Suspense>
              </div>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/posts/scheduled">
          <ProtectedRoute>
            <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
              <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <Clock className="h-5 w-5 text-blue-500" />
                <div>
                  <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Scheduled Posts</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Posts queued for future publishing</p>
                </div>
              </div>
              <div className="p-6">
                <React.Suspense fallback={<ScheduledPostsSkeleton />}>
                  <ScheduledPostsPage />
                </React.Suspense>
              </div>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/posts/drafts">
          <ProtectedRoute>
            <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
              <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <PenLine className="h-5 w-5 text-amber-500" />
                <div>
                  <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Drafts</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Unfinished posts waiting to be completed</p>
                </div>
              </div>
              <div className="p-6">
                <React.Suspense fallback={<DraftsSkeleton />}>
                  <DraftsPage />
                </React.Suspense>
              </div>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/posts/published">
          <ProtectedRoute>
            <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
              <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <LayoutGrid className="h-5 w-5 text-emerald-500" />
                <div>
                  <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Published Posts</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Posts that are live on your social accounts</p>
                </div>
              </div>
              <div className="p-6">
                <React.Suspense fallback={<PublishedPostsSkeleton />}>
                  <PublishedPostsPage />
                </React.Suspense>
              </div>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/create">
          <ProtectedRoute>
            <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
              {/* Create header: title + platform pills + tip */}
              <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
                    <PlusIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Create Post</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Craft content for Instagram</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300">Instagram</span>
                </div>
              </div>
              <div className="p-6">
                <React.Suspense fallback={<CreatePostSkeleton />}>
                  <CreatePost />
                </React.Suspense>
              </div>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        {/* Post-level analytics detail. Registered BEFORE the analytics
            workspace shell so it wins in the Switch (first match), since the
            shell's RegExp pattern would otherwise also match this path. */}
        <Route path="/analytics/post/:contentId">
          <ProtectedRoute>
            <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
              {/* Post analytics — minimal, content-focused */}
              <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <button onClick={() => setLocation('/analytics')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                  <ChevronLeft className="h-4 w-4" /> Back to Analytics
                </button>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Post Performance</h1>
              </div>
              <div className="p-6">
                <React.Suspense fallback={<PostAnalyticsSkeleton />}>
                  <PostAnalyticsPage />
                </React.Suspense>
              </div>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        {/* Enterprise Analytics workspace — has its own page-level headers.
            We add a slim global bar at the top for workspace/profile controls. */}
        <Route path={ANALYTICS_ROUTE_PATTERN}>
          <ProtectedRoute>
            <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
              {/* Analytics workspace owns its own per-section headers — no outer header needed */}
              <React.Suspense fallback={<AnalyticsSkeleton />}>
                <AnalyticsApp />
              </React.Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        {import.meta.env.VITE_META_PHASE_1_REVIEW_MODE !== 'true' && (
          <Route path="/inbox">
            <ProtectedRoute>
              <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
                {/* Inbox header: unread count + filter chips */}
                <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Inbox</h1>
                    <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[11px] font-bold text-white">0</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                    <button className="px-3 py-1.5 rounded-md bg-white dark:bg-gray-700 shadow-sm text-xs font-semibold text-gray-900 dark:text-gray-100">All</button>
                    <button className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400">Unread</button>
                    <button className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400">Mentions</button>
                  </div>
                </div>
                <div className="p-6 text-center py-12">
                  <p className="text-gray-600 dark:text-gray-400">Manage your social media conversations here.</p>
                </div>
              </DashboardLayout>
            </ProtectedRoute>
          </Route>
        )}

        <Route path="/video-generator">
          <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
              <div className="h-screen overflow-y-auto">
                <Sidebar
                  className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                  isCreateDropdownOpen={isCreateDropdownOpen}
                  setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                />
              </div>
              <div className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Video Studio header: title + credits */}
                <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-900/20">
                      <Video className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Video Studio</h1>
                      <p className="text-xs text-gray-500 dark:text-gray-400">AI-powered video creation</p>
                    </div>
                  </div>
                </div>
                {isCreateDropdownOpen && (
                  <React.Suspense fallback={null}>
                    <CreateDropdown
                      isOpen={isCreateDropdownOpen}
                      onClose={() => setIsCreateDropdownOpen(false)}
                      onOptionSelect={handleCreateOptionSelect}
                    />
                  </React.Suspense>
                )}
                <main className="flex-1 overflow-y-auto">
                  <React.Suspense fallback={<VideoGeneratorSkeleton />}>
                    <VideoGeneratorAdvanced />
                  </React.Suspense>
                </main>
              </div>
            </div>
          </ProtectedRoute>
        </Route>

        <Route path="/profile">
          <ProtectedRoute>
            <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
              {/* Profile header: avatar + name + type */}
              <div className="flex items-center gap-4 px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-lg flex-shrink-0">
                  {userData?.displayName?.[0]?.toUpperCase() ?? userData?.email?.[0]?.toUpperCase() ?? 'U'}
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                    {userData?.displayName ?? userData?.email?.split('@')[0] ?? 'Your Profile'}
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{userData?.email}</p>
                </div>
                <span className="ml-auto rounded-full bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300 flex-shrink-0">
                  {userData?.plan ?? 'Free'}
                </span>
              </div>
              <div className="p-6">
                <React.Suspense fallback={<ProfileSkeleton />}>
                  <Profile />
                </React.Suspense>
              </div>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/social-listening">
          <ProtectedRoute>
            <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
              {/* Social Listening header: title + live indicator + refresh */}
              <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                    <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Social Listening</h1>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Live monitoring</span>
                    </div>
                  </div>
                </div>
                <button className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <RefreshCw className="h-3.5 w-3.5" />Refresh
                </button>
              </div>
              <div className="p-6">
                <React.Suspense fallback={<SocialListeningSkeleton />}>
                  <SocialListeningPage />
                </React.Suspense>
              </div>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>


        <Route path="/automation">
          <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
              <div className="h-screen overflow-y-auto">
                <Sidebar
                  className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                  isCreateDropdownOpen={isCreateDropdownOpen}
                  setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                />
              </div>
              <div className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Automation header: title + active count + new rule */}
                <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20">
                      <Zap className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Automation</h1>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Workflows & DM sequences</p>
                    </div>
                  </div>
                  <button className="flex items-center gap-1.5 rounded-xl bg-gray-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-gray-900 hover:bg-gray-800 transition-colors">
                    <PlusIcon className="h-3.5 w-3.5" />New Rule
                  </button>
                </div>
                {isCreateDropdownOpen && (
                  <React.Suspense fallback={null}>
                    <CreateDropdown
                      isOpen={isCreateDropdownOpen}
                      onClose={() => setIsCreateDropdownOpen(false)}
                      onOptionSelect={handleCreateOptionSelect}
                    />
                  </React.Suspense>
                )}
                <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                  <React.Suspense fallback={<AutomationSkeleton />}>
                    <AutomationStepByStep />
                  </React.Suspense>
                </main>
              </div>
            </div>
          </ProtectedRoute>
        </Route>

        <Route path="/veegpt">
          <ProtectedRoute>
            <div className="h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
              <div className="h-screen overflow-y-auto">
                <Sidebar
                  className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                  isCreateDropdownOpen={isCreateDropdownOpen}
                  setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                />
              </div>
              <div className="flex-1 h-screen overflow-hidden bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
                <React.Suspense fallback={<VeeGPTSkeleton />}>
                  <VeeGPT />
                </React.Suspense>
              </div>
            </div>
          </ProtectedRoute>
        </Route>

        <Route path="/ai-usage">
          <ProtectedRoute>
            <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
              {/* AI Usage header: title + credits progress bar */}
              <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/20">
                    <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">AI Usage</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Monitor credit consumption this month</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{aiCredits?.usedThisCycle ?? 0} credits used</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">of {availableCredits ?? '—'} available</p>
                </div>
              </div>
              <div className="p-6">
                <React.Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading AI usage…</div>}>
                  <AIUsageDashboard />
                </React.Suspense>
              </div>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/credits">
          <ProtectedRoute>
            <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
              {/* Credits header: title + live balance */}
              <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
                    <Coins className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Credits</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400">AI credit balance and full transaction history</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{availableCredits ?? '—'} available</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">{aiCredits?.usedThisCycle ?? 0} used this cycle</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <React.Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading credits…</div>}>
                  <CreditsPage />
                </React.Suspense>
              </div>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/settings">
          <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
              <div className="h-screen overflow-y-auto">
                <Sidebar
                  className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                  isCreateDropdownOpen={isCreateDropdownOpen}
                  setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                />
              </div>
              <div className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Settings header: section indicator */}
                <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                  <Settings2 className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                  <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Settings</h1>
                </div>
                {isCreateDropdownOpen && (
                  <React.Suspense fallback={null}>
                    <CreateDropdown
                      isOpen={isCreateDropdownOpen}
                      onClose={() => setIsCreateDropdownOpen(false)}
                      onOptionSelect={(option) => {
                        setIsCreateDropdownOpen(false)
                        if (option === 'post') setLocation('/posts')
                        if (option === 'automation') setLocation('/automation')
                        if (option === 'video') setLocation('/video-generator')
                      }}
                    />
                  </React.Suspense>
                )}
                <div className="flex-1 overflow-y-auto">
                  <React.Suspense fallback={<SettingsSkeleton />}>
                    <Settings />
                  </React.Suspense>
                </div>
              </div>
            </div>
          </ProtectedRoute>
        </Route>

        <Route path="/security-dashboard">
          <ProtectedRoute>
            <React.Suspense fallback={<SecurityDashboardSkeleton />}>
              <SecurityDashboard />
            </React.Suspense>
          </ProtectedRoute>
        </Route>

        <Route path="/settings/billing">
          <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
              <div className="h-screen overflow-y-auto flex-shrink-0">
                <Sidebar
                  className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                  isCreateDropdownOpen={isCreateDropdownOpen}
                  setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                />
              </div>
              <div className="flex-1 h-screen overflow-y-auto">
                <React.Suspense fallback={<SettingsSkeleton />}>
                  <BillingPage />
                </React.Suspense>
              </div>
            </div>
          </ProtectedRoute>
        </Route>

        <Route path="/subscription/checkout">
          <ProtectedRoute>
            {/* skeleton-guard-allow: pre-auth route transition spinner, not a content loader */}
            <React.Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>}>
              <SubscriptionCheckoutPage />
            </React.Suspense>
          </ProtectedRoute>
        </Route>

        {/* /best-time is a legacy standalone page superseded by the Analytics
            workspace's "Best Time to Post" dashboard (Smart Pick tab), which is
            powered by the unified best-time engine (audience + engagement + reach).
            Redirect here so there's a single source of truth. */}
        <Route path="/best-time">
          <Redirect to="/analytics/best-time" />
        </Route>

        <Route path="/test-fixtures">
          <ProtectedRoute>
            <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
              <React.Suspense fallback={<TestFixturesSkeleton />}>
                <TestFixtures />
              </React.Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/encryption-health">
          <ProtectedRoute>
            <DashboardLayout isCreateDropdownOpen={isCreateDropdownOpen} setIsCreateDropdownOpen={setIsCreateDropdownOpen} handleCreateOptionSelect={handleCreateOptionSelect}>
              <React.Suspense fallback={<EncryptionHealthSkeleton />}>
                <EncryptionHealth />
              </React.Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/">
          {userData ? (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
              {(needEnforce && enforcing && !enforceHang) && (
                <React.Suspense fallback={null}>
                  <WorkspaceCreationOverlay onRetry={() => { }} />
                </React.Suspense>
              )}
              {(needEnforce && ((enforceHang && enforcing) || (!enforcing && enforceError))) && (
                <React.Suspense fallback={null}>
                  <WorkspaceCreationOverlay
                    error={String(enforceError || 'Taking longer than usual')}
                    onRetry={() => enforceRefetch()}
                    onSignOut={() => { const auth = getAuth(); auth.signOut(); setLocation('/signin'); }}
                  />
                </React.Suspense>
              )}
              <div className="h-screen overflow-y-auto bg-white dark:bg-gray-800 transition-colors duration-300">
                <Sidebar
                  className="w-24 bg-white dark:bg-gray-800 h-full transition-colors duration-300"
                  isCreateDropdownOpen={isCreateDropdownOpen}
                  setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                />
              </div>
              <div className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Home page: restore the original full header with workspace switcher, search, notifications */}
                <Header onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)} />
                {isCreateDropdownOpen && (
                  <React.Suspense fallback={null}>
                    <CreateDropdown
                      isOpen={isCreateDropdownOpen}
                      onClose={() => setIsCreateDropdownOpen(false)}
                      onOptionSelect={handleCreateOptionSelect}
                    />
                  </React.Suspense>
                )}
                <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                  <React.Suspense fallback={<DashboardSkeleton />}>
                    <div className="mb-8">
                      <QuickActions />
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
                      <div className="space-y-6">
                        <SectionErrorBoundary sectionName="Performance Score">
                          <PerformanceScore />
                        </SectionErrorBoundary>
                        <SectionErrorBoundary sectionName="Get Started">
                          <GetStarted />
                        </SectionErrorBoundary>
                        <SectionErrorBoundary sectionName="Scheduled Posts">
                          <ScheduledPostsSection />
                        </SectionErrorBoundary>
                        <SectionErrorBoundary sectionName="Drafts">
                          <DraftsSection />
                        </SectionErrorBoundary>
                      </div>
                      <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
                        <SectionErrorBoundary sectionName="Best Time to Post">
                          <BestTimeWidget />
                        </SectionErrorBoundary>
                        <SectionErrorBoundary sectionName="Recommendations">
                          <Recommendations />
                        </SectionErrorBoundary>
                        <SectionErrorBoundary sectionName="Social Accounts">
                          <SocialAccounts />
                        </SectionErrorBoundary>
                        <SectionErrorBoundary sectionName="Listening">
                          <Listening />
                        </SectionErrorBoundary>
                      </div>
                    </div>
                  </React.Suspense>
                </main>
              </div>
              {/* OnboardingFlow modal removed - onboarding now happens inline during signup */}
            </div>
          ) : userDataLoading ? (
            // The authenticated dashboard has a pixel-perfect Page_Skeleton, so we
            // render the full app shell (sidebar + header) with <DashboardSkeleton />
            // instead of the brand spinner while the /api/user data resolves.
            <DashboardLayout
              isCreateDropdownOpen={isCreateDropdownOpen}
              setIsCreateDropdownOpen={setIsCreateDropdownOpen}
              handleCreateOptionSelect={handleCreateOptionSelect}
            >
              <DashboardSkeleton />
            </DashboardLayout>
          ) : user && !userData && !userDataLoading && userDataError ? (
            String(userDataError).includes('404') ? (
              <React.Suspense fallback={(
                <div className="min-h-screen flex items-center justify-center p-6">
                  <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
                    <Skeleton variant="circle" className="w-16 h-16 rounded-full mx-auto mb-4" />
                    <Skeleton variant="text" className="h-6 w-48 mx-auto mb-2" />
                    <Skeleton variant="text" className="h-4 w-64 mx-auto mb-6" />
                    <div className="space-y-3">
                      <Skeleton variant="button" className="h-10 w-full rounded-lg" />
                      <Skeleton variant="button" className="h-10 w-full rounded-lg" />
                      <Skeleton variant="button" className="h-10 w-full rounded-lg" />
                    </div>
                  </div>
                </div>
              )}>
                <AccountNotFoundBanner
                  onSignup={() => setLocation('/signup')}
                  onSignOut={() => { getAuth().signOut(); setLocation('/signin') }}
                  onAssociate={async () => {
                    try {
                      await apiRequest('/api/auth/associate-uid', { method: 'POST' })
                      queryClient.invalidateQueries({ queryKey: ['/api/user'] })
                      window.location.reload()
                    } catch { }
                  }}
                />
              </React.Suspense>
            ) : (
              <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Unable to Load Account
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    We're having trouble loading your account. This might be a temporary issue.
                  </p>
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        queryClient.invalidateQueries({ queryKey: ['/api/user'] })
                        window.location.reload()
                      }}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={() => {
                        getAuth().signOut()
                        setLocation('/signin')
                      }}
                      className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      Sign Out and Try Again
                    </button>
                  </div>
                </div>
              </div>
            )
          ) : (
            // Default loading fallback for the home route — render the full app
            // shell with the dashboard skeleton rather than the brand spinner,
            // since the authenticated dashboard has a Page_Skeleton.
            <DashboardLayout
              isCreateDropdownOpen={isCreateDropdownOpen}
              setIsCreateDropdownOpen={setIsCreateDropdownOpen}
              handleCreateOptionSelect={handleCreateOptionSelect}
            >
              <DashboardSkeleton />
            </DashboardLayout>
          )}
        </Route>

        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>

      {isWalkthroughOpen && (
        <React.Suspense fallback={null}>
          <GuidedTour
            isActive={isWalkthroughOpen}
            onClose={() => setIsWalkthroughOpen(false)}
          />
        </React.Suspense>
      )}
      </LoadingStatusProvider>
    </RealtimeProvider>
  )
}
