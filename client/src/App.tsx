import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Route, Switch, useLocation } from 'wouter'
import { Sidebar } from './components/layout/sidebar'
import { Header } from './components/layout/header'
import { CreateDropdown } from './components/layout/create-dropdown'
import { QuickActions } from './components/dashboard/quick-actions'
import { PerformanceScore } from './components/dashboard/performance-score'
import { Recommendations } from './components/dashboard/recommendations'
import { GetStarted } from './components/dashboard/get-started'
import { ScheduledPosts, Drafts } from './components/dashboard/scheduled-posts'
import { Listening } from './components/dashboard/listening'
import { SocialAccounts } from './components/dashboard/social-accounts'
import InstagramWebhookListener from './components/dashboard/instagram-webhook-listener'
import { ScheduledPostsSection } from './components/dashboard/scheduled-posts-section'
import { DraftsSection } from './components/dashboard/drafts-section'
import { CalendarView } from './components/calendar/calendar-view'
import { AnalyticsDashboard } from './components/analytics/analytics-dashboard'
import { CreatePost } from './components/create/create-post'
const VeeGPT = React.lazy(() => import('./pages/VeeGPT'))
const Landing = React.lazy(() => import('./pages/Landing'))
const Landing3D = React.lazy(() => import('./pages/Landing3D'))
const Landing3DAdvanced = React.lazy(() => import('./pages/Landing3DAdvanced'))
const SplineKeyboardLanding = React.lazy(() => import('./pages/SplineKeyboardLanding'))
const RobotHeroLanding = React.lazy(() => import('./pages/RobotHeroLanding'))
const GlobalLandingPage = React.lazy(() => import('./pages/GlobalLandingPage'))
const SignUpIntegrated = React.lazy(() => import('./pages/SignUpIntegrated'))
const SignIn = React.lazy(() => import('./pages/SignIn'))
const Workspaces = React.lazy(() => import('./pages/Workspaces'))
const Waitlist = React.lazy(() => import('./pages/Waitlist'))
const WaitlistStatus = React.lazy(() => import('./pages/WaitlistStatus'))
import OnboardingFlow from './components/onboarding/OnboardingFlow'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { useFirebaseAuth } from './hooks/useFirebaseAuth'
import LoadingSpinner from './components/LoadingSpinner'
import AccountNotFoundBanner from './components/AccountNotFoundBanner'
import { SectionErrorBoundary } from './components/ErrorBoundary'
import WorkspaceCreationOverlay from './components/WorkspaceCreationOverlay'
import { getAuth } from 'firebase/auth'
import { useQuery } from '@tanstack/react-query'
import { apiRequest, queryClient } from '@/lib/queryClient'
const Profile = React.lazy(() => import('./pages/Profile'))
const Integration = React.lazy(() => import('./pages/Integration'))
const AutomationStepByStep = React.lazy(() => import('./pages/AutomationStepByStep'))
const VideoGeneratorAdvanced = React.lazy(() => import('./pages/VideoGeneratorAdvanced'))
const AdminPanel = React.lazy(() => import('./pages/AdminPanel'))
const AdminLogin = React.lazy(() => import('./pages/AdminLogin'))
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy'))
const TermsOfService = React.lazy(() => import('./pages/TermsOfService'))
const Settings = React.lazy(() => import('./pages/Settings'))
const SecurityDashboard = React.lazy(() => import('./pages/SecurityDashboard'))
const TestFixtures = React.lazy(() => import('./pages/TestFixtures'))
import { GuidedTour } from './components/walkthrough/GuidedTour'
import { initializeTheme } from './lib/theme'
// P6: Frontend SEO, Accessibility & UX System
import { initializeP6System, P6Provider, ToastContainer } from './lib/p6-integration'
// P7: Accessibility System
import { initializeAccessibilityCompliance, useAccessibilityRouteAnnouncements } from './lib/accessibility-compliance'
// P11: Mobile & Cross-Platform Excellence
import { initializeMobileExcellence } from './lib/mobile-excellence'
// P7: SEO, Core Web Vitals & Accessibility Excellence
import { initializeSEO } from './lib/seo-optimization';
import { initializeCoreWebVitals } from './lib/core-web-vitals';
import { initializeComponentModernization } from './lib/component-modernization';
import { ProtectedRoute } from './components/ProtectedRoute'
const EncryptionHealth = React.lazy(() => import('./pages/EncryptionHealth'))

// ✅ CRITICAL FIX: Normalize workspace data to ensure 'id' field exists (MongoDB returns _id)
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
  id: ws.id || ws._id,  // Use id if exists, fallback to _id
});

const normalizeWorkspaces = (workspaces: any): NormalizedWorkspace[] => {
  // Handle nested API response { success: true, data: [...] }
  const rawWorkspaces = workspaces?.data || workspaces || [];
  if (!Array.isArray(rawWorkspaces)) return [];
  return rawWorkspaces.map(normalizeWorkspace);
};

function App() {
  // Initialization guards to prevent re-initialization
  const themeInitialized = useRef(false)
  const p6Initialized = useRef(false)
  const accessibilityInitialized = useRef(false)
  const mobileInitialized = useRef(false)
  const seoInitialized = useRef(false)
  const webVitalsInitialized = useRef(false)
  const componentModernizationInitialized = useRef(false)

  // Always call hooks at the top level - never inside conditions
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false)
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false)
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState(false)
  const { user, loading } = useFirebaseAuth()
  const [location, setLocation] = useLocation()

  // P7: Route announcements for accessibility
  useAccessibilityRouteAnnouncements(location)

  // Initialize theme system - only once
  useEffect(() => {
    if (!themeInitialized.current) {
      initializeTheme()
      themeInitialized.current = true
    }
  }, [])

  // P6: Initialize Frontend SEO, Accessibility & UX System  
  // P7: Initialize Accessibility System
  // P11: Initialize Mobile & Cross-Platform Excellence
  // Optimized: Defer non-critical initializations to prevent blank page
  useEffect(() => {
    // Critical: Run immediately for accessibility - only once
    if (!accessibilityInitialized.current) {
      initializeAccessibilityCompliance()
      accessibilityInitialized.current = true
    }
    
    // Defer non-critical initializations to prevent blocking render
    const deferInit = () => {
      if (!mobileInitialized.current) {
        initializeMobileExcellence()
        mobileInitialized.current = true
      }
      if (!seoInitialized.current) {
        initializeSEO()
        seoInitialized.current = true
      }
      if (!webVitalsInitialized.current) {
        initializeCoreWebVitals()
        webVitalsInitialized.current = true
      }
      if (!componentModernizationInitialized.current) {
        initializeComponentModernization()
        componentModernizationInitialized.current = true
      }
      if (!p6Initialized.current) {
        initializeP6System({
          seo: {
            defaultTitle: 'VeeFore - AI-Powered Social Media Management',
            defaultDescription: 'Transform your social media presence with VeeFore\'s AI-powered content creation, automated scheduling, and comprehensive analytics.',
            siteName: 'VeeFore',
            twitterHandle: '@VeeFore'
          },
          accessibility: {
            enableScreenReaderSupport: true,
            enableKeyboardNavigation: true,
            announceRouteChanges: true
          },
          ux: {
            enableLoadingStates: true,
            enableToastNotifications: true,
            autoSaveInterval: 30000
          },
          mobile: {
            enableTouchOptimization: true,
            enableGestureSupport: true,
            enablePullToRefresh: true
          },
          performance: {
            enableLazyLoading: true,
            enableImageOptimization: true,
            enableWebVitalsMonitoring: true
          }
        })
        p6Initialized.current = true
      }
    }
    
    // Use requestIdleCallback if available, otherwise setTimeout
    if ('requestIdleCallback' in window) {
      requestIdleCallback(deferInit)
    } else {
      setTimeout(deferInit, 1)
    }
  }, [])

  // Google sign-in is now handled directly in SignIn.tsx with popup method
  // No need for redirect result handling

  // Fetch user data when authenticated - with retry for new users
  const { data: userData, isLoading: userDataLoading, error: userDataError } = useQuery({
    queryKey: ['/api/user'],
    queryFn: () => apiRequest('/api/user'),
    enabled: !!user && !loading,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  })
  
  // Check for Firebase auth in localStorage
  const hasFirebaseAuthInStorage = Object.keys(localStorage).some(key => 
    key.includes('firebase:authUser') && localStorage.getItem(key)
  )
  useEffect(() => {
    if (!loading && !user && hasFirebaseAuthInStorage) {
      Object.keys(localStorage).forEach((key) => {
        if (key.includes('firebase:authUser')) localStorage.removeItem(key)
      })
    }
  }, [user, loading, hasFirebaseAuthInStorage])

  // Pre-fetch workspaces data for faster navigation - uses global cache settings
  const { data: rawWorkspacesResponse, isLoading: workspacesLoading } = useQuery({
    queryKey: ['/api/workspaces'],
    queryFn: () => apiRequest('/api/workspaces'),
    enabled: !!user && !loading && !!userData,
  })
  
  // ✅ CRITICAL FIX: Normalize workspace data to ensure 'id' field exists (MongoDB returns _id)
  const workspaces = useMemo(() => normalizeWorkspaces(rawWorkspacesResponse), [rawWorkspacesResponse])

  const [enforceHang, setEnforceHang] = useState(false)
  const needEnforce = !!user && !!userData && !workspacesLoading && (workspaces.length === 0 || !workspaces.some((w) => w.isDefault === true))
  const { data: enforceResult, isLoading: enforcing, error: enforceError, refetch: enforceRefetch } = useQuery({
    queryKey: ['/api/workspaces/enforce-default'],
    queryFn: () => apiRequest('/api/workspaces/enforce-default', { method: 'POST' }),
    enabled: needEnforce,
    retry: false,
    staleTime: 5 * 60 * 1000
  })

  useEffect(() => {
    if (enforcing) {
      const t = setTimeout(() => setEnforceHang(true), 7000)
      return () => clearTimeout(t)
    } else {
      setEnforceHang(false)
    }
  }, [enforcing])

  useEffect(() => {
    if (enforceResult && (enforceResult as any).success) {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] })
      queryClient.refetchQueries({ queryKey: ['/api/workspaces'], type: 'active' })
    }
  }, [enforceResult])

  // ✅ PRODUCTION FIX: Clean up any 'undefined' string in localStorage on app initialization
  useEffect(() => {
    const storedId = localStorage.getItem('currentWorkspaceId');
    if (storedId === 'undefined' || storedId === 'null' || storedId === '') {
      console.warn('[APP INIT] 🧹 Removing invalid localStorage value:', storedId);
      localStorage.removeItem('currentWorkspaceId');
    }
  }, []);

  // ✅ PRODUCTION FIX: Validate workspace ID on app initialization
  useEffect(() => {
    const safeWorkspaces = Array.isArray(workspaces) ? workspaces : [];
    if (!safeWorkspaces || safeWorkspaces.length === 0) return;

    const validateAndCorrectWorkspace = async () => {
      const storedWorkspaceId = localStorage.getItem('currentWorkspaceId');
      
      // Check if stored workspace ID is a valid string (not 'undefined', 'null', empty)
      const isValidString = storedWorkspaceId && storedWorkspaceId !== 'undefined' && storedWorkspaceId !== 'null' && storedWorkspaceId !== '';
      
      // Check if stored workspace ID exists in user's workspaces
      const isValid = isValidString && safeWorkspaces.some((ws: any) => ws.id === storedWorkspaceId);
      
      if (!isValid) {
        // INVALID WORKSPACE ID - Auto-correct on app initialization
        console.warn('[APP INIT] ❌ Invalid workspace ID detected:', storedWorkspaceId);
        console.log('[APP INIT] 🔧 Auto-correcting to valid workspace...');
        
        const defaultWorkspace = safeWorkspaces.find((ws: any) => ws.isDefault) || safeWorkspaces[0];
        
        // ✅ GUARD: Only set if we have a valid workspace with a valid ID
        if (!defaultWorkspace || !defaultWorkspace.id) {
          console.warn('[APP INIT] ⚠️ No valid workspace found, cannot auto-correct');
          return;
        }
        
        const correctedWorkspaceId = defaultWorkspace.id;
        
        console.log('[APP INIT] ✅ Auto-corrected workspace:', {
          from: storedWorkspaceId,
          to: correctedWorkspaceId,
          name: defaultWorkspace.name
        });
        
        // Update localStorage with correct workspace ID
        localStorage.setItem('currentWorkspaceId', correctedWorkspaceId);
        
        // ✅ CRITICAL: Invalidate all React Query caches that depend on workspace ID
        console.log('[APP INIT] 🔄 Invalidating all workspace-dependent queries...');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/analytics/historical'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/content'] }),
          // Refetch immediately to get data for correct workspace
          queryClient.refetchQueries({ queryKey: ['/api/social-accounts'], type: 'active' }),
          queryClient.refetchQueries({ queryKey: ['/api/dashboard/analytics'], type: 'active' })
        ]);
        console.log('[APP INIT] ✅ All queries invalidated and refetched with correct workspace ID');
        
        // Dispatch events to notify components
        window.dispatchEvent(new Event('workspace-changed'));
      } else {
        console.log('[APP INIT] ✅ Workspace ID validated:', storedWorkspaceId);
      }
    };

    validateAndCorrectWorkspace();
  }, [workspaces]);

  // Pre-fetch social accounts for current workspace to eliminate loading on Integration page
  // ✅ PRODUCTION FIX: Use localStorage workspace ID (now validated)
  const safeWorkspacesForPrefetch = Array.isArray(workspaces) ? workspaces : [];
  // ✅ GUARD: Filter out invalid localStorage values ('undefined', 'null', '')
  const storedWorkspaceId = localStorage.getItem('currentWorkspaceId');
  const validStoredId = storedWorkspaceId && storedWorkspaceId !== 'undefined' && storedWorkspaceId !== 'null' && storedWorkspaceId !== '' ? storedWorkspaceId : null;
  const currentWorkspaceId = validStoredId || safeWorkspacesForPrefetch.find((w: any) => w.isDefault)?.id || safeWorkspacesForPrefetch[0]?.id;
  // ✅ GUARD: Ensure currentWorkspaceId is valid before making API call
  const isValidWorkspaceId = currentWorkspaceId && currentWorkspaceId !== 'undefined' && currentWorkspaceId !== 'null';
  useQuery({
    queryKey: ['/api/social-accounts', currentWorkspaceId],
    queryFn: () => isValidWorkspaceId ? apiRequest(`/api/social-accounts?workspaceId=${currentWorkspaceId}`) : Promise.resolve([]),
    enabled: !!user && !loading && !!isValidWorkspaceId,
  })
  
  // Authentication and onboarding guard logic - STRICT ENFORCEMENT
  useEffect(() => {
    // Force-correct: if userData reports not onboarded but workspaces exist, mark modal closed
    if (!loading && !userDataLoading) {
      const workspacesLoaded = !workspacesLoading && Array.isArray(workspaces)
      const hasWorkspaces = workspacesLoaded && workspaces.length > 0
      const localOnboarded = localStorage.getItem('isOnboarded') === 'true'
      if (user && userData && (userData.isOnboarded || hasWorkspaces)) {
        if (location === '/signin' || location === '/signup' || location === '/onboarding') {
          setLocation('/')
        }
        // Close onboarding modal if open
        if (isOnboardingModalOpen) {
          setIsOnboardingModalOpen(false)
        }
        // If backend userData.isOnboarded is stale, invalidate to refresh
        if (!userData.isOnboarded && hasWorkspaces) {
          queryClient.invalidateQueries({ queryKey: ['/api/user'] })
        }
        if (!userData.isOnboarded && localOnboarded) {
          queryClient.invalidateQueries({ queryKey: ['/api/user'] })
        }
      } else if (user && userData && !userData.isOnboarded && workspacesLoaded && !hasWorkspaces) {
        // Always ensure modal is open for non-onboarded users
        if (!isOnboardingModalOpen) {
          setIsOnboardingModalOpen(true)
        }
        
        // FORCE redirect away from auth pages to dashboard where modal will show
        if (location === '/signin' || location === '/signup') {
          setLocation('/')
          return // Exit early to prevent rendering auth page
        }
      }
      
      // If user is not authenticated, close modal and restrict access
      else if (!user && !loading) {
        if (isOnboardingModalOpen) {
          setIsOnboardingModalOpen(false)
        }
        if (location === '/onboarding') {
          setLocation('/')
        }
      }
    }
  }, [user, loading, userData, userDataLoading, location, setLocation, isOnboardingModalOpen, workspaces, workspacesLoading])

  // Show loading spinner only during initial auth - not for user data loading (better UX)
  if (loading) {
    return <LoadingSpinner type="minimal" />
  }
  
  // Show loading spinner for protected routes when auth is still loading
  const protectedRoutes = ['/integration', '/plan', '/create', '/analytics', '/inbox', '/video-generator', '/workspaces', '/profile', '/automation', '/veegpt']
  if (!user && protectedRoutes.some(route => location.startsWith(route))) {
    return <LoadingSpinner type="dashboard" />
  }

  const handleCreateOptionSelect = (option: string) => {
    setIsCreateDropdownOpen(false)
  }

  return (
    <P6Provider>
    <>
    <Switch>
      {/* Waitlist pages - full screen without sidebar */}
      <Route path="/waitlist">
        <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
          <div className="min-h-screen">
            <Waitlist />
          </div>
        </React.Suspense>
      </Route>

      <Route path="/waitlist-status">
        <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
          <div className="min-h-screen">
            <WaitlistStatus />
          </div>
        </React.Suspense>
      </Route>

      {/* Authentication pages - full screen without sidebar */}
      <Route path="/signup">
        <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
          <div className="min-h-screen">
            <SignUpIntegrated />
          </div>
        </React.Suspense>
      </Route>
      
      <Route path="/signin">
        <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
          <div className="min-h-screen">
            <SignIn onNavigate={(page: string) => setLocation(`/${page}`)} />
          </div>
        </React.Suspense>
      </Route>

      {/* Removed old onboarding route - now handled by modal */}


      {/* Admin Login - Accessible to everyone */}
      <Route path="/admin-login">
        <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
          <div className="min-h-screen">
            <AdminLogin />
          </div>
        </React.Suspense>
      </Route>

      {/* Admin Panel - Protected */}
      <Route path="/admin">
        <ProtectedRoute>
          <React.Suspense fallback={<LoadingSpinner type="admin" />}>
            <div className="min-h-screen bg-gray-50">
              <AdminPanel />
            </div>
          </React.Suspense>
        </ProtectedRoute>
      </Route>

      {/* 3D Landing Page - Public access */}
      <Route path="/3d">
        <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
          <Landing3D />
        </React.Suspense>
      </Route>

      {/* Advanced 3D Landing Page with Spline Robot - Public access */}
      <Route path="/3d-advanced">
        <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
          <Landing3DAdvanced />
        </React.Suspense>
      </Route>

      {/* Spline Keyboard Landing Page - Public access */}
      <Route path="/keyboard">
        <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
          <SplineKeyboardLanding />
        </React.Suspense>
      </Route>

      {/* Robot Hero Landing Page - Public access */}
      <Route path="/robot-hero">
        <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
          <RobotHeroLanding />
        </React.Suspense>
      </Route>

      {/* Global Landing Page - Public access */}
      <Route path="/global">
        <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
          <GlobalLandingPage />
        </React.Suspense>
      </Route>

      {/* Original Landing Page - Public access */}
      <Route path="/landing">
        <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
          <div className="min-h-screen">
            <Landing onNavigate={(page: string) => setLocation(`/${page}`)} />
          </div>
        </React.Suspense>
      </Route>

      {/* Protected routes with sidebar layout - uses ProtectedRoute for auth */}
      <Route path="/plan">
        <ProtectedRoute>
             <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
               {/* Sidebar - Fixed height with independent scrolling */}
               <div className="h-screen overflow-y-auto">
                 <Sidebar 
                   className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                   isCreateDropdownOpen={isCreateDropdownOpen}
                   setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                 />
               </div>

              {/* Main Content Area - Independent scrolling */}
              <div className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Header */}
                <Header 
                  onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                />
                
                {/* Create Dropdown */}
                {isCreateDropdownOpen && (
                  <CreateDropdown
                    isOpen={isCreateDropdownOpen}
                    onClose={() => setIsCreateDropdownOpen(false)}
                    onOptionSelect={handleCreateOptionSelect}
                  />
                )}

                                 {/* Main Content - Scrollable */}
                 <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                   <div className="space-y-6">
                     <Tabs defaultValue="calendar" className="w-full">
                       <TabsList className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                         <TabsTrigger value="calendar">Calendar</TabsTrigger>
                         <TabsTrigger value="drafts">Drafts</TabsTrigger>
                         <TabsTrigger value="content">Content</TabsTrigger>
                         <TabsTrigger value="dm-automation">DM automation</TabsTrigger>
                       </TabsList>
                      <TabsContent value="calendar" className="mt-6">
                        <CalendarView />
                      </TabsContent>
                      <TabsContent value="drafts" className="mt-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <ScheduledPosts />
                          <Drafts />
                        </div>
                      </TabsContent>
                                             <TabsContent value="content" className="mt-6">
                         <div className="text-center py-12">
                           <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Content Library</h3>
                           <p className="text-gray-600 dark:text-gray-400">Manage your content library and templates here.</p>
                         </div>
                       </TabsContent>
                       <TabsContent value="dm-automation" className="mt-6">
                         <div className="text-center py-12">
                           <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">DM Automation</h3>
                           <p className="text-gray-600 dark:text-gray-400">Set up automated direct message responses.</p>
                         </div>
                       </TabsContent>
                    </Tabs>
                  </div>
                </main>
              </div>
            </div>
        </ProtectedRoute>
          </Route>
          
                    <Route path="/create">
        <ProtectedRoute>
           <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
               {/* Sidebar - Fixed height with independent scrolling */}
               <div className="h-screen overflow-y-auto">
                 <Sidebar 
                   className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                   isCreateDropdownOpen={isCreateDropdownOpen}
                   setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                 />
               </div>

               {/* Main Content Area - Independent scrolling */}
               <div className="flex-1 flex flex-col h-screen overflow-hidden">
                 {/* Header */}
                 <Header 
                   onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                 />
                 
                 {/* Create Dropdown */}
                 {isCreateDropdownOpen && (
                   <CreateDropdown
                     isOpen={isCreateDropdownOpen}
                     onClose={() => setIsCreateDropdownOpen(false)}
                     onOptionSelect={handleCreateOptionSelect}
                   />
                 )}

                 {/* Main Content - Scrollable */}
                 <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                   {/* Instagram Webhook Listener for Real-time Updates */}
                   <InstagramWebhookListener />
                   <CreatePost />
                </main>
             </div>
           </div>
        </ProtectedRoute>
           </Route>
          
      <Route path="/analytics">
        <ProtectedRoute>
           <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
               {/* Sidebar - Fixed height with independent scrolling */}
               <div className="h-screen overflow-y-auto">
                 <Sidebar 
                   className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                   isCreateDropdownOpen={isCreateDropdownOpen}
                   setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                 />
               </div>

               {/* Main Content Area - Independent scrolling */}
               <div className="flex-1 flex flex-col h-screen overflow-hidden">
                 {/* Header */}
                 <Header 
                   onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                 />
                 
                 {/* Create Dropdown */}
                 {isCreateDropdownOpen && (
                   <CreateDropdown
                     isOpen={isCreateDropdownOpen}
                     onClose={() => setIsCreateDropdownOpen(false)}
                     onOptionSelect={handleCreateOptionSelect}
                   />
                 )}

                 {/* Main Content - Scrollable */}
                 <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                   {/* Instagram Webhook Listener for Real-time Updates */}
                   <InstagramWebhookListener />
                   <AnalyticsDashboard />
                 </main>
              </div>
           </div>
        </ProtectedRoute>
           </Route>
          
                    <Route path="/inbox">
        <ProtectedRoute>
           <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
               {/* Sidebar - Fixed height with independent scrolling */}
               <div className="h-screen overflow-y-auto">
                 <Sidebar 
                   className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                   isCreateDropdownOpen={isCreateDropdownOpen}
                   setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                 />
               </div>

               {/* Main Content Area - Independent scrolling */}
               <div className="flex-1 flex flex-col h-screen overflow-hidden">
                 {/* Header */}
                 <Header 
                   onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                 />
                 
                 {/* Create Dropdown */}
                 {isCreateDropdownOpen && (
                   <CreateDropdown
                     isOpen={isCreateDropdownOpen}
                     onClose={() => setIsCreateDropdownOpen(false)}
                     onOptionSelect={handleCreateOptionSelect}
                   />
                 )}

                 {/* Main Content - Scrollable */}
                 <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                   <div className="text-center py-12">
                     <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Inbox 2.0</h3>
                     <p className="text-gray-600 dark:text-gray-400">Manage your social media conversations here.</p>
                   </div>
                 </main>
              </div>
           </div>
        </ProtectedRoute>
           </Route>
          

          
                    <Route path="/video-generator">
        <ProtectedRoute>
           <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
               {/* Sidebar - Fixed height with independent scrolling */}
               <div className="h-screen overflow-y-auto">
                 <Sidebar 
                   className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                   isCreateDropdownOpen={isCreateDropdownOpen}
                   setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                 />
               </div>

              {/* Main Content Area - Cosmos Studio interface without VeeFore header */}
              <div className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Create Dropdown */}
                {isCreateDropdownOpen && (
                  <CreateDropdown
                    isOpen={isCreateDropdownOpen}
                    onClose={() => setIsCreateDropdownOpen(false)}
                    onOptionSelect={handleCreateOptionSelect}
                  />
                )}

                {/* Cosmos Studio Interface - Full height with scrolling */}
                <main className="flex-1 overflow-y-auto">
                  <React.Suspense fallback={<LoadingSpinner type="video" />}>
                    <VideoGeneratorAdvanced />
                  </React.Suspense>
                </main>
              </div>
            </div>
        </ProtectedRoute>
          </Route>
          
                     <Route path="/workspaces">
        <ProtectedRoute>
           <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
               {/* Sidebar - Fixed height with independent scrolling */}
               <div className="h-screen overflow-y-auto">
                 <Sidebar 
                   className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                   isCreateDropdownOpen={isCreateDropdownOpen}
                   setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                 />
               </div>

               {/* Main Content Area - Independent scrolling */}
               <div className="flex-1 flex flex-col h-screen overflow-hidden">
                 {/* Header */}
                 <Header 
                   onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                 />
                 
                 {/* Create Dropdown */}
                 {isCreateDropdownOpen && (
                   <CreateDropdown
                     isOpen={isCreateDropdownOpen}
                     onClose={() => setIsCreateDropdownOpen(false)}
                     onOptionSelect={handleCreateOptionSelect}
                   />
                 )}

                 {/* Main Content - Scrollable */}
                 <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                   <React.Suspense fallback={<LoadingSpinner type="workspaces" />}>
                     <Workspaces />
                   </React.Suspense>
                 </main>
               </div>
            </div>
        </ProtectedRoute>
           </Route>



                     <Route path="/profile">
        <ProtectedRoute>
           <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
               {/* Sidebar - Fixed height with independent scrolling */}
               <div className="h-screen overflow-y-auto">
                 <Sidebar 
                   className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                   isCreateDropdownOpen={isCreateDropdownOpen}
                   setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                 />
               </div>

               {/* Main Content Area - Independent scrolling */}
               <div className="flex-1 flex flex-col h-screen overflow-hidden">
                 {/* Header */}
                 <Header 
                   onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                 />
                 
                 {/* Create Dropdown */}
                 {isCreateDropdownOpen && (
                   <CreateDropdown
                     isOpen={isCreateDropdownOpen}
                     onClose={() => setIsCreateDropdownOpen(false)}
                     onOptionSelect={handleCreateOptionSelect}
                   />
                 )}

                 {/* Main Content - Scrollable */}
                 <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                   <React.Suspense fallback={<LoadingSpinner type="profile" />}>
                     <Profile />
                   </React.Suspense>
                 </main>
               </div>
             </div>
        </ProtectedRoute>
           </Route>

      <Route path="/integration">
        <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
               {/* Sidebar - Fixed height with independent scrolling */}
               <div className="h-screen overflow-y-auto">
                 <Sidebar 
                   className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                   isCreateDropdownOpen={isCreateDropdownOpen}
                   setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                 />
               </div>

               {/* Main Content Area - Independent scrolling */}
               <div className="flex-1 flex flex-col h-screen overflow-hidden">
                 {/* Header */}
                 <Header 
                   onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                 />
                 
                 {/* Create Dropdown */}
                 {isCreateDropdownOpen && (
                   <CreateDropdown
                     isOpen={isCreateDropdownOpen}
                     onClose={() => setIsCreateDropdownOpen(false)}
                     onOptionSelect={handleCreateOptionSelect}
                   />
                 )}

                 {/* Main Content - Scrollable */}
                 <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                   {/* Instagram Webhook Listener for Real-time Updates */}
                   <InstagramWebhookListener />
                   <React.Suspense fallback={<LoadingSpinner type="integration" />}>
                     <Integration />
                   </React.Suspense>
                 </main>
               </div>
             </div>
        </ProtectedRoute>
           </Route>

                     <Route path="/automation">
        <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
               {/* Sidebar - Fixed height with independent scrolling */}
               <div className="h-screen overflow-y-auto">
                 <Sidebar 
                   className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                   isCreateDropdownOpen={isCreateDropdownOpen}
                   setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                 />
               </div>

               {/* Main Content Area - Independent scrolling */}
               <div className="flex-1 flex flex-col h-screen overflow-hidden">
                 {/* Create Dropdown */}
                 {isCreateDropdownOpen && (
                   <CreateDropdown
                     isOpen={isCreateDropdownOpen}
                     onClose={() => setIsCreateDropdownOpen(false)}
                     onOptionSelect={handleCreateOptionSelect}
                   />
                 )}

                 {/* Main Content - Scrollable */}
                 <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                   <React.Suspense fallback={<LoadingSpinner type="automation" />}>
                     <AutomationStepByStep />
                   </React.Suspense>
                 </main>
              </div>
           </div>
        </ProtectedRoute>
           </Route>

                     {/* VeeGPT Route - with main sidebar */}
           <Route path="/veegpt">
        <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
               {/* Sidebar - Fixed height with independent scrolling */}
               <div className="h-screen overflow-y-auto">
                 <Sidebar 
                   className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                   isCreateDropdownOpen={isCreateDropdownOpen}
                   setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                 />
               </div>

               {/* Main Content Area - VeeGPT takes full remaining space */}
               <div className="flex-1 h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                 <React.Suspense fallback={<LoadingSpinner type="veegpt" />}>
                   <VeeGPT />
                 </React.Suspense>
              </div>
            </div>
        </ProtectedRoute>
          </Route>

           <Route path="/integrations">
            <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
               {/* Sidebar - Fixed height with independent scrolling */}
               <div className="h-screen overflow-y-auto">
                 <Sidebar 
                   className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                   isCreateDropdownOpen={isCreateDropdownOpen}
                   setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                 />
               </div>

               {/* Main Content Area - Independent scrolling */}
               <div className="flex-1 flex flex-col h-screen overflow-hidden">
                 {/* Header */}
                 <Header 
                   onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                 />
                 
                 {/* Create Dropdown */}
                 {isCreateDropdownOpen && (
                   <CreateDropdown
                     isOpen={isCreateDropdownOpen}
                     onClose={() => setIsCreateDropdownOpen(false)}
                     onOptionSelect={handleCreateOptionSelect}
                   />
                 )}

                 {/* Main Content - Scrollable */}
                 <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                   {/* Instagram Webhook Listener for Real-time Updates */}
                   <InstagramWebhookListener />
                   <React.Suspense fallback={<LoadingSpinner type="integration" />}>
                     <Integration />
                   </React.Suspense>
                </main>
              </div>
            </div>
            </ProtectedRoute>
          </Route>

          <Route path="/settings">
            <ProtectedRoute>
             <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
               {/* Sidebar - Fixed height with independent scrolling */}
               <div className="h-screen overflow-y-auto">
                 <Sidebar 
                   className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                   isCreateDropdownOpen={isCreateDropdownOpen}
                   setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                 />
               </div>

               {/* Main Content Area - Independent scrolling */}
               <div className="flex-1 flex flex-col h-screen overflow-hidden">
                 {/* Header */}
                 <Header 
                   onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                 />
                 
                 {/* Create Dropdown */}
                 {isCreateDropdownOpen && (
                   <CreateDropdown
                     isOpen={isCreateDropdownOpen}
                     onClose={() => setIsCreateDropdownOpen(false)}
                     onOptionSelect={(option) => {
                       setIsCreateDropdownOpen(false)
                       // Handle navigation based on option
                       if (option === 'post') setLocation('/create')
                       if (option === 'automation') setLocation('/automation')
                       if (option === 'video') setLocation('/video-generator')
                     }}
                   />
                 )}
                 
                 {/* Page Content */}
                 <div className="flex-1 overflow-y-auto">
                   <React.Suspense fallback={<LoadingSpinner type="settings" />}>
                     <Settings />
                   </React.Suspense>
                 </div>
               </div>
             </div>
            </ProtectedRoute>
           </Route>

           {/* P8: Security Operations Center Route */}
           <Route path="/security">
             <ProtectedRoute>
               <React.Suspense fallback={<LoadingSpinner type="security" />}>
                 <SecurityDashboard />
               </React.Suspense>
             </ProtectedRoute>
           </Route>

          {/* Privacy Policy Route - Public access */}
          <Route path="/privacy-policy">
            <PrivacyPolicy />
          </Route>

          <Route path="/test-fixtures">
            <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
              {/* Sidebar - Fixed height with independent scrolling */}
              <div className="h-screen overflow-y-auto">
                <Sidebar 
                  className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                  isCreateDropdownOpen={isCreateDropdownOpen}
                  setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                />
              </div>

              {/* Main Content Area - Independent scrolling */}
              <div className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Header */}
                <Header 
                  onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                />
                {/* Main Content - Scrollable */}
                <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                  <React.Suspense fallback={<LoadingSpinner type="default" />}>
                    <TestFixtures />
                  </React.Suspense>
                </main>
              </div>
            </div>
            </ProtectedRoute>
      </Route>

      <Route path="/encryption-health">
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
                 <Header 
                   onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                 />
                 {isCreateDropdownOpen && (
                   <CreateDropdown
                     isOpen={isCreateDropdownOpen}
                     onClose={() => setIsCreateDropdownOpen(false)}
                     onOptionSelect={handleCreateOptionSelect}
                   />
                 )}
                 <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                   <React.Suspense fallback={<LoadingSpinner type="security" />}> 
                     <EncryptionHealth />
                   </React.Suspense>
                 </main>
              </div>
           </div>
        </ProtectedRoute>
      </Route>

          {/* Terms of Service Route - Public access */}
          <Route path="/terms-of-service">
            <TermsOfService />
          </Route>
      
      {/* Public routes for legal pages - accessible without authentication */}
      <Route path="/privacy-policy">
        <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
          <PrivacyPolicy />
        </React.Suspense>
      </Route>

      <Route path="/terms-of-service">
        <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
          <TermsOfService />
        </React.Suspense>
      </Route>

      {/* Root route - Spline Keyboard Landing for unauthenticated, Dashboard for authenticated users (modal handles onboarding) */}
      <Route path="/">
        {!user && !loading ? (
          <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
            <GlobalLandingPage />
          </React.Suspense>
        ) : user && userData ? (
          // ONBOARDED users see dashboard - Check userData FIRST to avoid stuck loading
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
            {(needEnforce && enforcing && !enforceHang) && <WorkspaceCreationOverlay onRetry={() => {}} />}
            {(needEnforce && ((enforceHang && enforcing) || (!enforcing && enforceError))) && (
              <WorkspaceCreationOverlay 
                error={String(enforceError || 'Taking longer than usual')} 
                onRetry={() => enforceRefetch()} 
                onSignOut={() => { const auth = getAuth(); auth.signOut(); setLocation('/signin'); }}
              />
            )}
            {/* Sidebar - Fixed height with independent scrolling */}
            <div className="h-screen overflow-y-auto bg-white dark:bg-gray-800 transition-colors duration-300">
              <Sidebar 
                className="w-24 bg-white dark:bg-gray-800 h-full transition-colors duration-300"
                isCreateDropdownOpen={isCreateDropdownOpen}
                setIsCreateDropdownOpen={setIsCreateDropdownOpen}
              />
            </div>

            {/* Main Content Area - Independent scrolling */}
            <div className="flex-1 flex flex-col h-screen overflow-hidden">
              {/* Header */}
              <Header 
                onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
              />
              
              {/* Create Dropdown */}
              {isCreateDropdownOpen && (
                <CreateDropdown
                  isOpen={isCreateDropdownOpen}
                  onClose={() => setIsCreateDropdownOpen(false)}
                  onOptionSelect={handleCreateOptionSelect}
                />
              )}

              {/* Main Content - Scrollable */}
              <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                <>
                  {/* Instagram Webhook Listener for Real-time Updates */}
                  <InstagramWebhookListener />
                  
                  {/* Quick Actions - Top Section */}
                  <div className="mb-8">
                    <QuickActions />
                  </div>
                  
                  {/* Main Dashboard Layout - Hootsuite Style */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
                    {/* Left Column - Performance Score + Get Started + Scheduled Posts + Drafts */}
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
                    
                    {/* Right Column - Recommendations + Social Accounts + Listening */}
                    <div className="space-y-6">
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
                </>
              </main>
            </div>

            {/* Onboarding Flow for new users - triple safety check:
                1. Backend says not onboarded
                2. localStorage doesn't say onboarded
                3. User doesn't have workspaces (which indicates completed onboarding) */}
            {userData && !userData.isOnboarded && 
             localStorage.getItem('isOnboarded') !== 'true' &&
             !(Array.isArray(workspaces) && workspaces.length > 0) && (
              <OnboardingFlow 
                open={isOnboardingModalOpen}
                userData={userData}
                onComplete={async (onboardingData) => {
                console.log('🎯 COMPLETING ONBOARDING with data:', onboardingData)
                try {
                  const response = await fetch('/api/user/complete-onboarding', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${await user?.getIdToken()}`
                    },
                    body: JSON.stringify({ preferences: onboardingData })
                  })
                  if (response.ok) {
                    console.log('✅ Onboarding completed successfully!')
                    
                    // First, close the onboarding modal immediately
                    setIsOnboardingModalOpen(false)
                    localStorage.setItem('isOnboarded', 'true')
                    
                    // Invalidate and refetch user data in background
                    queryClient.invalidateQueries({ queryKey: ['/api/user'] })
                    queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] })
                    
                    // Wait a bit for the modal to close, then start the guided tour
                    setTimeout(() => {
                      setIsWalkthroughOpen(true)
                    }, 500) // Small delay to ensure modal closes first
                  } else {
                    const errorText = await response.text().catch(() => 'Unknown error')
                    console.error('❌ Failed to complete onboarding:', errorText)
                    throw new Error(`Failed to complete onboarding: ${response.status}`)
                  }
                } catch (error) {
                  console.error('❌ Onboarding completion error:', error)
                  throw error // Re-throw to let OnboardingFlow handle it
                }
              }}
              />
            )}
          </div>
        ) : userDataLoading ? (
          <LoadingSpinner type="dashboard" />
        ) : user && !userData && !userDataLoading && userDataError ? (
          String(userDataError).includes('404') ? (
            <AccountNotFoundBanner
              onSignup={() => setLocation('/signup')}
              onSignOut={() => { auth.signOut(); setLocation('/signin') }}
              onAssociate={async () => {
                try {
                  await apiRequest('/api/auth/associate-uid', { method: 'POST' })
                  queryClient.invalidateQueries({ queryKey: ['/api/user'] })
                  window.location.reload()
                } catch {}
              }}
            />
          ) : (
          // If user exists but userData failed to load after retries, show error
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
                    auth.signOut()
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
          <LoadingSpinner type="dashboard" />
        )}
      </Route>

      {/* Catch-all route - handles unmatched routes and redirects appropriately */}
      <Route>
        {() => {
          if (!user && !loading) {
            return (
              <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
                <GlobalLandingPage />
              </React.Suspense>
            )
          }
          if (user && !userData && userDataLoading) {
            return <LoadingSpinner type="dashboard" />
          }
          if (user && userData && !userData.isOnboarded) {
            setLocation('/')
            return <LoadingSpinner type="dashboard" />
          }
          return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
              <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
                <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Page Not Found
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  The page you're looking for doesn't exist or has been moved.
                </p>
                <button
                  onClick={() => setLocation('/')}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          )
        }}
      </Route>
      
    </Switch>

    {/* Guided Tour */}
    <GuidedTour
      isActive={isWalkthroughOpen}
      onClose={() => setIsWalkthroughOpen(false)}
    />
    
    {/* P6: Toast notifications container */}
    <ToastContainer position="top-right" />
    </>
    </P6Provider>
  )
}

export default App
