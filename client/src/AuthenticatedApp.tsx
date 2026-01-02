import React, { useState, useEffect } from 'react'
import { Route, Switch, useLocation } from 'wouter'
import { useFirebaseAuth } from './hooks/useFirebaseAuth'
import LoadingSpinner from './components/LoadingSpinner'
import { SkeletonPageLoader } from './components/ui/skeleton'
import { getAuth } from 'firebase/auth'
import { useQuery } from '@tanstack/react-query'
import { apiRequest, queryClient } from '@/lib/queryClient'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RealtimeProvider } from './contexts/RealtimeContext'

const Sidebar = React.lazy(() => import('./components/layout/sidebar').then(m => ({ default: m.Sidebar })))
const Header = React.lazy(() => import('./components/layout/header').then(m => ({ default: m.Header })))
const CreateDropdown = React.lazy(() => import('./components/layout/create-dropdown').then(m => ({ default: m.CreateDropdown })))
const QuickActions = React.lazy(() => import('./components/dashboard/quick-actions').then(m => ({ default: m.QuickActions })))
const PerformanceScore = React.lazy(() => import('./components/dashboard/performance-score').then(m => ({ default: m.PerformanceScore })))
const Recommendations = React.lazy(() => import('./components/dashboard/recommendations').then(m => ({ default: m.Recommendations })))
const GetStarted = React.lazy(() => import('./components/dashboard/get-started').then(m => ({ default: m.GetStarted })))
const ScheduledPosts = React.lazy(() => import('./components/dashboard/scheduled-posts').then(m => ({ default: m.ScheduledPosts })))
const Drafts = React.lazy(() => import('./components/dashboard/scheduled-posts').then(m => ({ default: m.Drafts })))
const Listening = React.lazy(() => import('./components/dashboard/listening').then(m => ({ default: m.Listening })))
const SocialAccounts = React.lazy(() => import('./components/dashboard/social-accounts').then(m => ({ default: m.SocialAccounts })))
const InstagramWebhookListener = React.lazy(() => import('./components/dashboard/instagram-webhook-listener'))
const ScheduledPostsSection = React.lazy(() => import('./components/dashboard/scheduled-posts-section').then(m => ({ default: m.ScheduledPostsSection })))
const DraftsSection = React.lazy(() => import('./components/dashboard/drafts-section').then(m => ({ default: m.DraftsSection })))
const CalendarView = React.lazy(() => import('./components/calendar/calendar-view').then(m => ({ default: m.CalendarView })))
const AnalyticsDashboard = React.lazy(() => import('./components/analytics/analytics-dashboard').then(m => ({ default: m.AnalyticsDashboard })))
const CreatePost = React.lazy(() => import('./components/create/create-post').then(m => ({ default: m.CreatePost })))
const VeeGPT = React.lazy(() => import('./pages/VeeGPT'))
const Workspaces = React.lazy(() => import('./pages/Workspaces'))
const Profile = React.lazy(() => import('./pages/Profile'))
const Integration = React.lazy(() => import('./pages/Integration'))
const AutomationStepByStep = React.lazy(() => import('./pages/AutomationStepByStep'))
const VideoGeneratorAdvanced = React.lazy(() => import('./pages/VideoGeneratorAdvanced'))
const AdminPanel = React.lazy(() => import('./pages/AdminPanel'))
const Settings = React.lazy(() => import('./pages/Settings'))
const SecurityDashboard = React.lazy(() => import('./pages/SecurityDashboard'))
const TestFixtures = React.lazy(() => import('./pages/TestFixtures'))
const EncryptionHealth = React.lazy(() => import('./pages/EncryptionHealth'))
const Tabs = React.lazy(() => import('./components/ui/tabs').then(m => ({ default: m.Tabs })))
const TabsContent = React.lazy(() => import('./components/ui/tabs').then(m => ({ default: m.TabsContent })))
const TabsList = React.lazy(() => import('./components/ui/tabs').then(m => ({ default: m.TabsList })))
const TabsTrigger = React.lazy(() => import('./components/ui/tabs').then(m => ({ default: m.TabsTrigger })))
const OnboardingFlow = React.lazy(() => import('./components/onboarding/OnboardingFlow'))
const AccountNotFoundBanner = React.lazy(() => import('./components/AccountNotFoundBanner'))
const SectionErrorBoundary = React.lazy(() => import('./components/ErrorBoundary').then(m => ({ default: m.SectionErrorBoundary })))
const WorkspaceCreationOverlay = React.lazy(() => import('./components/WorkspaceCreationOverlay'))
const GuidedTour = React.lazy(() => import('./components/walkthrough/GuidedTour').then(m => ({ default: m.GuidedTour })))

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

export default function AuthenticatedApp() {
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false)
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false)
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState(false)
  const { user, loading } = useFirebaseAuth()
  const [location, setLocation] = useLocation()

  const { data: userData, isLoading: userDataLoading, error: userDataError } = useQuery({
    queryKey: ['/api/user'],
    queryFn: async () => {
      const token = await user?.getIdToken()
      if (!token) throw new Error('No token')
      const response = await fetch('/api/user', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) throw new Error(`${response.status}`)
      return response.json()
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })

  const { data: workspacesRaw, isLoading: workspacesLoading, error: workspacesError, refetch: enforceRefetch } = useQuery({
    queryKey: ['/api/workspaces'],
    queryFn: async () => {
      const token = await user?.getIdToken()
      if (!token) return []
      const response = await fetch('/api/workspaces', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) throw new Error(`${response.status}`)
      return response.json()
    },
    enabled: !!user && !!userData,
    staleTime: 5 * 60 * 1000,
    retry: 3,
  })
  
  const workspaces = normalizeWorkspaces(workspacesRaw)
  const [enforceHang, setEnforceHang] = useState(false)
  const needEnforce = userData && !userData.isOnboarded && Array.isArray(workspaces) && workspaces.length === 0
  const enforcing = workspacesLoading
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
        if (location === '/signin' || location === '/signup' || location === '/onboarding') {
          setLocation('/')
        }
        if (isOnboardingModalOpen) {
          setIsOnboardingModalOpen(false)
        }
        if (!userData.isOnboarded && hasWorkspaces) {
          queryClient.invalidateQueries({ queryKey: ['/api/user'] })
        }
        if (!userData.isOnboarded && localOnboarded) {
          queryClient.invalidateQueries({ queryKey: ['/api/user'] })
        }
      } else if (user && userData && !userData.isOnboarded && workspacesLoaded && !hasWorkspaces) {
        if (!isOnboardingModalOpen) {
          setIsOnboardingModalOpen(true)
        }
        if (location === '/signin' || location === '/signup') {
          setLocation('/')
          return
        }
      }
    }
  }, [user, loading, userData, userDataLoading, location, setLocation, isOnboardingModalOpen, workspaces, workspacesLoading])

  const handleCreateOptionSelect = () => {
    setIsCreateDropdownOpen(false)
  }

  const DashboardLayout = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
      <div className="h-screen overflow-y-auto">
        <React.Suspense fallback={null}>
          <Sidebar
            className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
            isCreateDropdownOpen={isCreateDropdownOpen}
            setIsCreateDropdownOpen={setIsCreateDropdownOpen}
          />
        </React.Suspense>
      </div>
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <React.Suspense fallback={null}>
          <Header onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)} />
        </React.Suspense>
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
          {children}
        </main>
      </div>
    </div>
  )

  return (
    <RealtimeProvider>
      <Switch location={location}>
        <Route path="/admin">
          <ProtectedRoute>
            <React.Suspense fallback={<LoadingSpinner type="admin" />}>
              <div className="min-h-screen bg-gray-50">
                <AdminPanel />
              </div>
            </React.Suspense>
          </ProtectedRoute>
        </Route>

        <Route path="/plan">
          <ProtectedRoute>
            <DashboardLayout>
              <div className="space-y-6">
                <React.Suspense fallback={<SkeletonPageLoader type="dashboard" />}>
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
                </React.Suspense>
              </div>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/create">
          <ProtectedRoute>
            <DashboardLayout>
              <React.Suspense fallback={<SkeletonPageLoader type="default" />}>
                <InstagramWebhookListener />
                <CreatePost />
              </React.Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/analytics">
          <ProtectedRoute>
            <DashboardLayout>
              <React.Suspense fallback={<SkeletonPageLoader type="dashboard" />}>
                <InstagramWebhookListener />
                <AnalyticsDashboard />
              </React.Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/inbox">
          <ProtectedRoute>
            <DashboardLayout>
              <div className="text-center py-12">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Inbox 2.0</h3>
                <p className="text-gray-600 dark:text-gray-400">Manage your social media conversations here.</p>
              </div>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/video-generator">
          <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
              <div className="h-screen overflow-y-auto">
                <React.Suspense fallback={null}>
                  <Sidebar
                    className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                    isCreateDropdownOpen={isCreateDropdownOpen}
                    setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                  />
                </React.Suspense>
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
                <main className="flex-1 overflow-y-auto">
                  <React.Suspense fallback={<SkeletonPageLoader type="video" />}>
                    <VideoGeneratorAdvanced />
                  </React.Suspense>
                </main>
              </div>
            </div>
          </ProtectedRoute>
        </Route>

        <Route path="/workspaces">
          <ProtectedRoute>
            <DashboardLayout>
              <React.Suspense fallback={<SkeletonPageLoader type="workspaces" />}>
                <Workspaces />
              </React.Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/profile">
          <ProtectedRoute>
            <DashboardLayout>
              <React.Suspense fallback={<SkeletonPageLoader type="profile" />}>
                <Profile />
              </React.Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/integration">
          <ProtectedRoute>
            <DashboardLayout>
              <React.Suspense fallback={<SkeletonPageLoader type="integration" />}>
                <InstagramWebhookListener />
                <Integration />
              </React.Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/integrations">
          <ProtectedRoute>
            <DashboardLayout>
              <React.Suspense fallback={<SkeletonPageLoader type="integration" />}>
                <InstagramWebhookListener />
                <Integration />
              </React.Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/automation">
          <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
              <div className="h-screen overflow-y-auto">
                <React.Suspense fallback={null}>
                  <Sidebar
                    className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                    isCreateDropdownOpen={isCreateDropdownOpen}
                    setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                  />
                </React.Suspense>
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
                  <React.Suspense fallback={<SkeletonPageLoader type="automation" />}>
                    <AutomationStepByStep />
                  </React.Suspense>
                </main>
              </div>
            </div>
          </ProtectedRoute>
        </Route>

        <Route path="/veegpt">
          <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
              <div className="h-screen overflow-y-auto">
                <React.Suspense fallback={null}>
                  <Sidebar
                    className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                    isCreateDropdownOpen={isCreateDropdownOpen}
                    setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                  />
                </React.Suspense>
              </div>
              <div className="flex-1 h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
                <React.Suspense fallback={<SkeletonPageLoader type="veegpt" />}>
                  <VeeGPT />
                </React.Suspense>
              </div>
            </div>
          </ProtectedRoute>
        </Route>

        <Route path="/settings">
          <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
              <div className="h-screen overflow-y-auto">
                <React.Suspense fallback={null}>
                  <Sidebar
                    className="w-24 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full shadow-sm transition-colors duration-300"
                    isCreateDropdownOpen={isCreateDropdownOpen}
                    setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                  />
                </React.Suspense>
              </div>
              <div className="flex-1 flex flex-col h-screen overflow-hidden">
                <React.Suspense fallback={null}>
                  <Header onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)} />
                </React.Suspense>
                {isCreateDropdownOpen && (
                  <React.Suspense fallback={null}>
                    <CreateDropdown
                      isOpen={isCreateDropdownOpen}
                      onClose={() => setIsCreateDropdownOpen(false)}
                      onOptionSelect={(option) => {
                        setIsCreateDropdownOpen(false)
                        if (option === 'post') setLocation('/create')
                        if (option === 'automation') setLocation('/automation')
                        if (option === 'video') setLocation('/video-generator')
                      }}
                    />
                  </React.Suspense>
                )}
                <div className="flex-1 overflow-y-auto">
                  <React.Suspense fallback={<SkeletonPageLoader type="settings" />}>
                    <Settings />
                  </React.Suspense>
                </div>
              </div>
            </div>
          </ProtectedRoute>
        </Route>

        <Route path="/security-dashboard">
          <ProtectedRoute>
            <React.Suspense fallback={<LoadingSpinner type="security" />}>
              <SecurityDashboard />
            </React.Suspense>
          </ProtectedRoute>
        </Route>

        <Route path="/test-fixtures">
          <ProtectedRoute>
            <DashboardLayout>
              <React.Suspense fallback={<LoadingSpinner type="default" />}>
                <TestFixtures />
              </React.Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/encryption-health">
          <ProtectedRoute>
            <DashboardLayout>
              <React.Suspense fallback={<LoadingSpinner type="security" />}>
                <EncryptionHealth />
              </React.Suspense>
            </DashboardLayout>
          </ProtectedRoute>
        </Route>

        <Route path="/">
          {user && userData ? (
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
                <React.Suspense fallback={null}>
                  <Sidebar
                    className="w-24 bg-white dark:bg-gray-800 h-full transition-colors duration-300"
                    isCreateDropdownOpen={isCreateDropdownOpen}
                    setIsCreateDropdownOpen={setIsCreateDropdownOpen}
                  />
                </React.Suspense>
              </div>
              <div className="flex-1 flex flex-col h-screen overflow-hidden">
                <React.Suspense fallback={null}>
                  <Header onCreateClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)} />
                </React.Suspense>
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
                  <React.Suspense fallback={<SkeletonPageLoader type="dashboard" />}>
                    <InstagramWebhookListener />
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
                  </React.Suspense>
                </main>
              </div>
              {userData && !userData.isOnboarded &&
                localStorage.getItem('isOnboarded') !== 'true' &&
                !(Array.isArray(workspaces) && workspaces.length > 0) && (
                  <React.Suspense fallback={null}>
                    <OnboardingFlow
                      open={isOnboardingModalOpen}
                      userData={userData}
                      onComplete={async (onboardingData) => {
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
                            setIsOnboardingModalOpen(false)
                            localStorage.setItem('isOnboarded', 'true')
                            queryClient.invalidateQueries({ queryKey: ['/api/user'] })
                            queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] })
                            setTimeout(() => {
                              setIsWalkthroughOpen(true)
                            }, 500)
                          } else {
                                throw new Error(`Failed to complete onboarding: ${response.status}`)
                          }
                        } catch (error) {
                          throw error
                        }
                      }}
                    />
                  </React.Suspense>
                )}
            </div>
          ) : userDataLoading ? (
            <LoadingSpinner type="dashboard" />
          ) : user && !userData && !userDataLoading && userDataError ? (
            String(userDataError).includes('404') ? (
              <React.Suspense fallback={<LoadingSpinner type="dashboard" />}>
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
            <LoadingSpinner type="dashboard" />
          )}
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
    </RealtimeProvider>
  )
}
