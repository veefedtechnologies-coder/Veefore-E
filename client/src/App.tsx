import React, { useEffect, useRef, useCallback, useMemo } from 'react'
import { useLocation } from 'wouter'
import { useFirebaseAuth } from './hooks/useFirebaseAuth'
import { useTokenRefresh } from './hooks/useTokenRefresh'
import LoadingSpinner from './components/LoadingSpinner'
import { initializeTheme } from './lib/theme'
import { initializeP6System, P6Provider, ToastContainer } from './lib/p6-integration'
import { initializeAccessibilityCompliance, useAccessibilityRouteAnnouncements } from './lib/accessibility-compliance'
import { initializeSEO } from './lib/seo-optimization'
import { initializeCoreWebVitals } from './lib/core-web-vitals'
import { initializeComponentModernization } from './lib/component-modernization'
import { WaitlistProvider } from './context/WaitlistContext'
import { useEarlyAccessCheck } from './hooks/useEarlyAccessCheck'
// import { WaitlistModal } from './components/waitlist/WaitlistModal'
import { MainNavigation } from './components/MainNavigation'
import MainFooter from './components/MainFooter'
import { RouteErrorBoundary } from './shared/components/ErrorBoundary'

const Landing = React.lazy(() => import('./features/landing/Landing').then(m => ({ default: m.Landing })))

const AuthenticatedApp = React.lazy(() => import('./AuthenticatedApp'))

const SignUpIntegrated = React.lazy(() => import('./pages/SignUpIntegrated'))
const SignIn = React.lazy(() => import('./pages/SignIn'))
const AdminLogin = React.lazy(() => import('./pages/AdminLogin'))
const Features = React.lazy(() => import('./pages/Features'))
const Pricing = React.lazy(() => import('./pages/Pricing'))
const FreeTrial = React.lazy(() => import('./pages/FreeTrial'))
const Changelog = React.lazy(() => import('./pages/Changelog'))
const About = React.lazy(() => import('./pages/About'))
const Blog = React.lazy(() => import('./pages/Blog'))
const Careers = React.lazy(() => import('./pages/Careers'))
const Contact = React.lazy(() => import('./pages/Contact'))
const Security = React.lazy(() => import('./pages/Security'))
const GDPR = React.lazy(() => import('./pages/GDPR'))
const PrivacyPolicyPage = React.lazy(() => import('./pages/PrivacyPolicy'))
const TermsOfServicePage = React.lazy(() => import('./pages/TermsOfService'))
const HelpCenter = React.lazy(() => import('./pages/HelpCenter'))
const Community = React.lazy(() => import('./pages/Community'))
const Status = React.lazy(() => import('./pages/Status'))
const CookiePolicy = React.lazy(() => import('./pages/CookiePolicy'))
const CookieConsentBanner = React.lazy(() => import('./components/CookieConsentBanner'))
const WaitlistPage = React.lazy(() => import('./pages/WaitlistPage'))
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'))

const publicRoutes = [
  '/', '/features', '/pricing', '/changelog', '/about', '/blog', '/careers',
  '/contact', '/security', '/gdpr', '/privacy-policy', '/terms-of-service',
  '/free-trial', '/help', '/community', '/status', '/cookies', '/waitlist',
  '/signup', '/signin', '/admin-login', '/landing', '/auth/reset-password'
]

const protectedRoutes = [
  '/integration', '/plan', '/create', '/analytics', '/inbox', '/video-generator',
  '/workspaces', '/profile', '/automation', '/veegpt', '/admin', '/settings',
  '/security-dashboard', '/integrations', '/test-fixtures', '/encryption-health',
  '/best-time', '/social-listening'
]

function App() {
  const themeInitialized = useRef(false)
  const p6Initialized = useRef(false)
  const accessibilityInitialized = useRef(false)
  const seoInitialized = useRef(false)
  const webVitalsInitialized = useRef(false)
  const componentModernizationInitialized = useRef(false)

  const { user, loading } = useFirebaseAuth()
  const [location, setLocation] = useLocation()
  
  // Debug logging to see auth state in App
  useEffect(() => {
    console.log('[App] Auth state changed:', {
      user: user ? `User(${user.email})` : 'null',
      loading,
      location
    })
  }, [user, loading, location])
  
  // [SERVER-SIDE OAUTH - Task 16.4] Initialize background token refresh
  // This maintains user sessions without interruption by proactively refreshing
  // tokens 5 minutes before they expire (Requirement 19.7)
  useTokenRefresh(!loading && !!user)

  // Handle OAuth callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('oauth_success') === 'true') {
      console.log('[App] OAuth success detected, cleaning up URL')
      // Remove oauth_success and welcome params from URL
      params.delete('oauth_success')
      params.delete('welcome')
      const newSearch = params.toString()
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '')
      window.history.replaceState({}, '', newUrl)
      
      // The useFirebaseAuth hook will automatically call /api/auth/session
      // and restore the session - we just need to wait for it
      console.log('[App] Waiting for useFirebaseAuth to restore session...')
    }
  }, [])

  const handleNavigate = useCallback((page: string) => {
    setLocation(`/${page}`)
  }, [setLocation])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location])

  useAccessibilityRouteAnnouncements(location)

  useEffect(() => {
    const initAll = () => {
      if (!themeInitialized.current) {
        initializeTheme()
        themeInitialized.current = true
      }
      if (!accessibilityInitialized.current) {
        initializeAccessibilityCompliance()
        accessibilityInitialized.current = true
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
        initializeP6System()
        p6Initialized.current = true
      }
    }

    const timer = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(initAll, { timeout: 3000 })
      } else {
        initAll()
      }
    }, 1500)

    return () => clearTimeout(timer)
  }, [])

  const effectiveLocation = location || '/'

  const isPublicRoute = useMemo(() => publicRoutes.some(route =>
    effectiveLocation === route || effectiveLocation.startsWith(route + '/')
  ), [effectiveLocation])

  const isProtectedRoute = useMemo(() => protectedRoutes.some(route =>
    effectiveLocation === route || effectiveLocation.startsWith(route + '/')
  ), [effectiveLocation])

  const { hasEarlyAccess, isLoading: earlyAccessLoading } = useEarlyAccessCheck()

  useEffect(() => {
    // PROTECTED ROUTE CHECK
    if (!loading && !user && isProtectedRoute) {
      setLocation('/signin')
    }

    // If user is logged in but on signin/signup pages (shouldn't happen in normal flow)
    // This catches the case where Firebase has stale auth but user wants to sign in fresh
    if (!loading && user && (effectiveLocation === '/signin' || effectiveLocation === '/signup')) {
      console.log('[App] User is authenticated but on auth page, checking if this is intentional...')
      // Allow if they're resuming onboarding
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.get('resume') !== 'true') {
        // Not resuming onboarding, user just signed in - App.tsx will render AuthenticatedApp automatically
        // No need to redirect, just let the render logic handle it
        console.log('[App] User authenticated, AuthenticatedApp will render automatically')
      }
    }

    // EARLY ACCESS GATING (UX Only)
    // 1. If trying to access signup but NOT approved -> Go to waitlist
    // (We do not gate /signin because returning users on new devices/domains won't have the localStorage flag)
    if (!loading && !user && !earlyAccessLoading && !hasEarlyAccess) {
      if (effectiveLocation === '/signup') {
        setLocation('/waitlist')
      }
    }

    // 2. If visiting waitlist but ALREADY approved -> Go to signup
    if (!loading && !earlyAccessLoading && hasEarlyAccess && effectiveLocation === '/waitlist') {
      setLocation('/signup')
    }

    // PHASE 1 REVIEW GUARD: Prevent direct access to locked features
    if (import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true' && (effectiveLocation === '/automation' || effectiveLocation === '/inbox')) {
      setLocation('/')
    }
  }, [loading, user, isProtectedRoute, setLocation, hasEarlyAccess, earlyAccessLoading, effectiveLocation])

  // Show loading spinner while Firebase auth is resolving
  // IMPORTANT: Show loading for ANY auth state transition to prevent flickering
  if (loading) {
    // For protected routes or root path, always show loading
    if (!isPublicRoute || effectiveLocation === '/') {
      return <LoadingSpinner type="dashboard" />
    }
    // For public routes (except root), only show loading if we think user might be authenticated
    // This prevents flickering on public pages during auth initialization
    if (user !== null) {
      return <LoadingSpinner type="dashboard" />
    }
  }

  const renderPublicPage = () => {
    switch (effectiveLocation) {
      case '/':
        return <RouteErrorBoundary routeName="Home"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><Landing onNavigate={handleNavigate} /></React.Suspense></RouteErrorBoundary>
      case '/features':
        return <RouteErrorBoundary routeName="Features"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><Features /></React.Suspense></RouteErrorBoundary>
      case '/pricing':
        return <RouteErrorBoundary routeName="Pricing"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><Pricing /></React.Suspense></RouteErrorBoundary>
      case '/changelog':
        return <RouteErrorBoundary routeName="Changelog"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><Changelog /></React.Suspense></RouteErrorBoundary>
      case '/about':
        return <RouteErrorBoundary routeName="About"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><About /></React.Suspense></RouteErrorBoundary>
      case '/blog':
        return <RouteErrorBoundary routeName="Blog"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><Blog /></React.Suspense></RouteErrorBoundary>
      case '/careers':
        return <RouteErrorBoundary routeName="Careers"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><Careers /></React.Suspense></RouteErrorBoundary>
      case '/contact':
        return <RouteErrorBoundary routeName="Contact"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><Contact /></React.Suspense></RouteErrorBoundary>
      case '/security':
        return <RouteErrorBoundary routeName="Security"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><Security /></React.Suspense></RouteErrorBoundary>
      case '/gdpr':
        return <RouteErrorBoundary routeName="GDPR"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><GDPR /></React.Suspense></RouteErrorBoundary>
      case '/privacy-policy':
        return <RouteErrorBoundary routeName="Privacy Policy"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><PrivacyPolicyPage /></React.Suspense></RouteErrorBoundary>
      case '/terms-of-service':
        return <RouteErrorBoundary routeName="Terms of Service"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><TermsOfServicePage /></React.Suspense></RouteErrorBoundary>
      case '/free-trial':
        return <RouteErrorBoundary routeName="Free Trial"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><FreeTrial /></React.Suspense></RouteErrorBoundary>
      case '/help':
        return <RouteErrorBoundary routeName="Help Center"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><HelpCenter /></React.Suspense></RouteErrorBoundary>
      case '/community':
        return <RouteErrorBoundary routeName="Community"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><Community /></React.Suspense></RouteErrorBoundary>
      case '/status':
        return <RouteErrorBoundary routeName="Status"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><Status /></React.Suspense></RouteErrorBoundary>
      case '/cookies':
        return <RouteErrorBoundary routeName="Cookie Policy"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><CookiePolicy /></React.Suspense></RouteErrorBoundary>
      case '/signup':
        return <RouteErrorBoundary routeName="Sign Up"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><SignUpIntegrated /></React.Suspense></RouteErrorBoundary>
      case '/signin':
        return <RouteErrorBoundary routeName="Sign In"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><SignIn onNavigate={handleNavigate} /></React.Suspense></RouteErrorBoundary>
      case '/admin-login':
        return <RouteErrorBoundary routeName="Admin Login"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><AdminLogin /></React.Suspense></RouteErrorBoundary>
      case '/landing':
        return <RouteErrorBoundary routeName="Landing"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><Landing onNavigate={handleNavigate} /></React.Suspense></RouteErrorBoundary>
      case '/waitlist':
        return <RouteErrorBoundary routeName="Waitlist"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><WaitlistPage /></React.Suspense></RouteErrorBoundary>
      case '/auth/reset-password':
        return <RouteErrorBoundary routeName="Reset Password"><React.Suspense fallback={<LoadingSpinner type="minimal" />}><ResetPassword /></React.Suspense></RouteErrorBoundary>
      default:
        return null
    }
  }

  return (
    <P6Provider>
      <WaitlistProvider>
        <>

          <React.Suspense fallback={null}>
            <CookieConsentBanner />
          </React.Suspense>

          {/* CRITICAL: Always show AuthenticatedApp for logged-in users, regardless of route */}
          {user ? (
            <RouteErrorBoundary routeName="App">
              <React.Suspense fallback={<LoadingSpinner type="dashboard" />}>
                <AuthenticatedApp />
              </React.Suspense>
            </RouteErrorBoundary>
          ) : isPublicRoute ? (
            effectiveLocation === '/waitlist' || effectiveLocation === '/signin' || effectiveLocation === '/signup' ? (
              // Waitlist, SignIn, and SignUp pages render without header/footer
              effectiveLocation === '/waitlist' ? (
                <RouteErrorBoundary routeName="Waitlist">
                  <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
                    <WaitlistPage />
                  </React.Suspense>
                </RouteErrorBoundary>
              ) : effectiveLocation === '/signin' ? (
                <RouteErrorBoundary routeName="Sign In">
                  <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
                    <SignIn onNavigate={handleNavigate} />
                  </React.Suspense>
                </RouteErrorBoundary>
              ) : (
                <RouteErrorBoundary routeName="Sign Up">
                  <React.Suspense fallback={<LoadingSpinner type="minimal" />}>
                    <SignUpIntegrated />
                  </React.Suspense>
                </RouteErrorBoundary>
              )
            ) : (
              <div className="min-h-screen bg-black text-white">
                <MainNavigation />
                <main>
                  {renderPublicPage()}
                </main>
                <MainFooter />
              </div>
            )
          ) : (
            <div className="min-h-screen bg-[#030303] flex items-center justify-center p-6">
              <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">
                  Page Not Found
                </h2>
                <p className="text-white/60 mb-6">
                  The page you're looking for doesn't exist or has been moved.
                </p>
                <button
                  onClick={() => setLocation('/')}
                  className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90 transition-opacity"
                >
                  Go Home
                </button>
              </div>
            </div>
          )}

          <ToastContainer position="top-right" />
        </>
      </WaitlistProvider>
    </P6Provider>
  )
}

export default App
