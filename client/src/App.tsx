import React, { useEffect, useRef, useCallback, useMemo } from 'react'
import { useLocation } from 'wouter'
import { useFirebaseAuth } from './hooks/useFirebaseAuth'
import { useTokenRefresh } from './hooks/useTokenRefresh'
import { useOnboardingStatus } from './hooks/useOnboardingStatus'
import LoadingSpinner from './components/LoadingSpinner'
// Eager import: the app-shell skeleton must paint instantly (before the lazy
// AuthenticatedApp chunk loads), so it ships in the main bundle. It replaces the
// brand spinner for logged-in users entering the dashboard.
import { AppShellSkeleton } from './components/skeletons/AppShellSkeleton'
import { isBootstrapAuthed, isBootstrapOnboarded, isBootstrapCookied, hasAuthHint, isBootstrapExplicitlyLoggedOut } from './lib/bootstrap'
import { initializeTheme } from './lib/theme'
import { initializeP6System, P6Provider, ToastContainer } from './lib/p6-integration'
import { initializeAccessibilityCompliance, useAccessibilityRouteAnnouncements } from './lib/accessibility-compliance'
import { initializeSEO } from './lib/seo-optimization'
import { initializeCoreWebVitals } from './lib/core-web-vitals'
import { initializeComponentModernization } from './lib/component-modernization'
import { WaitlistProvider } from './context/WaitlistContext'
import { useEarlyAccessCheck } from './hooks/useEarlyAccessCheck'
// import { WaitlistModal } from './components/waitlist/WaitlistModal'
import { RouteErrorBoundary } from './shared/components/ErrorBoundary'

// Eager import: the landing page is the primary public entry point, so it ships
// in the main bundle and paints immediately (no Suspense spinner on first load).
import { NewLandingPage as NewLanding, PublicPageLayout } from './features/new-landing'

// Eager import: auth/waitlist entry pages must paint instantly with NO loading
// spinner (they're the first thing many visitors see), so they ship in the main
// bundle instead of behind React.lazy + Suspense.
import SignUpIntegrated from './pages/SignUpIntegrated'
import SignIn from './pages/SignIn'
import WaitlistPage from './pages/WaitlistPage'

const AuthenticatedApp = React.lazy(() => import('./AuthenticatedApp'))

// Reliable first-paint auth signal injected by the server into the HTML document
// (see server/lib/html-bootstrap.ts). Read once at module load — it reflects the
// session at the moment this HTML was served.
const SERVER_AUTHED = isBootstrapAuthed()
// Auth cookies were present on this load (even if the server couldn't verify):
// treat as logged-in for the "never show landing on /" decision. The persisted
// optimistic-auth hint is used ONLY as a tiebreaker when the server's answer is
// absent/uncertain — never when the server EXPLICITLY says logged-out (so a real
// logout correctly shows the landing page).
const SERVER_COOKIED = isBootstrapCookied() || (!isBootstrapExplicitlyLoggedOut() && hasAuthHint())
// Server injected a verified, ONBOARDED user with seeded data → safe to mount the
// dashboard immediately, before the client Firebase session finishes restoring.
const SERVER_ONBOARDED = isBootstrapOnboarded()

// Prefetch the lazy AuthenticatedApp chunk IMMEDIATELY for a server-verified
// session, in parallel with the main bundle — so by the time React mounts and
// hits the Suspense boundary the chunk is already loaded and the dashboard
// renders without an extra shell-fallback frame. (Vite dedupes this with the
// React.lazy import below, so the chunk downloads once.)
if (SERVER_AUTHED) {
  void import('./AuthenticatedApp')
  // VeeGPT is its own heavy lazy chunk (not part of AuthenticatedApp). On a
  // direct /veegpt load, prefetch it in parallel so it's ready by the time the
  // route renders — otherwise the shell overlay dissolves onto VeeGPT's Suspense
  // fallback / a white content gap (VeeGPT's chat area is white) → a flash.
  try {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/veegpt')) {
      void import('./pages/VeeGPT')
    }
  } catch { /* ignore */ }
}


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
  '/best-time', '/social-listening', '/ai-usage'
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

  // Onboarding gate: a logged-in user who has NOT completed onboarding must never
  // mount AuthenticatedApp (which would flash the dashboard before bouncing them
  // out). We resolve onboarding status here, at the top level, and only hand the
  // user to the authenticated dashboard once onboarding is confirmed complete.
  const { isResolving: onboardingResolving, isOnboarded } = useOnboardingStatus()

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
    // DIAGNOSTIC: set VITE_DISABLE_PERF_OPT=true in client .env to skip all
    // runtime "optimizers" that mutate the DOM/CSSOM at runtime (Core Web Vitals
    // style mutations, component modernization, P6). Used to isolate whether these
    // are the source of the mobile/Safari scroll flicker. Theme/SEO/a11y still run.
    const disablePerfOpt =
      (import.meta as any).env?.VITE_DISABLE_PERF_OPT === 'true'

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

      if (disablePerfOpt) {
        console.warn('[DIAGNOSTIC] VITE_DISABLE_PERF_OPT=true — skipping CoreWebVitals / ComponentModernization / P6 init')
        return
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

  // Whether the current navigation is an onboarding resume (/signup?resume=true)
  // OR a return from Meta OAuth (/signup?authorizedBrandCount=N or ?meta_error=...).
  // Read from the live URL because wouter's location does not include the query string.
  const isResumingOnboarding = useMemo(
    () => {
      const sp = new URLSearchParams(window.location.search)
      return (
        sp.get('resume') === 'true' ||
        sp.get('authorizedBrandCount') !== null ||
        sp.get('meta_error') !== null
      )
    },
    [location]
  )

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

  // ONBOARDING GATE REDIRECT
  // A logged-in user who has NOT completed onboarding belongs in the onboarding
  // flow — never on the dashboard, the landing page, or a bare signup/signin
  // form.
  useEffect(() => {
    if (loading || !user || onboardingResolving || isOnboarded) return

    // Fast-path: check localStorage before doing the redirect.
    try {
      if (localStorage.getItem('isOnboarded') === 'true') return
    } catch { /* ignore */ }

    // If the server bootstrap says this user is onboarded, trust it — skip the gate.
    if (SERVER_ONBOARDED || isBootstrapOnboarded()) return

    // Already on the resume flow — nothing to do.
    const searchParams = new URLSearchParams(window.location.search)
    const onSignupResume =
      effectiveLocation === '/signup' &&
      searchParams.get('resume') === 'true'
    if (onSignupResume) return

    // Already on the Meta callback return flow — don't redirect away from it.
    // This covers /signup?authorizedBrandCount=N and /signup?meta_error=...
    const isMetaCallback =
      effectiveLocation === '/signup' &&
      (searchParams.get('authorizedBrandCount') !== null || searchParams.get('meta_error') !== null)
    if (isMetaCallback) return

    console.log('[App] User not onboarded — navigating to /signup?resume=true to complete onboarding')
    setLocation('/signup?resume=true')
  }, [loading, user, onboardingResolving, isOnboarded, effectiveLocation, setLocation])

  // When the server verified an onboarded session and seeded the data, mount the
  // authenticated dashboard IMMEDIATELY (real frame + seeded data) rather than
  // waiting for the client Firebase session to finish restoring. Restricted to
  // authenticated routes / the root entry so public + auth pages are unaffected.
  // The dashboard mounts inside the provider tree below (not an early return),
  // so React context is intact.
  const mountAppEarly =
    loading && SERVER_AUTHED && SERVER_ONBOARDED &&
    (!isPublicRoute || effectiveLocation === '/' || effectiveLocation === '/landing')

  // Show the app-shell skeleton while Firebase auth is resolving — but ONLY on
  // protected (authenticated) routes, OR on the app's root entry when the SERVER
  // confirmed an authenticated session for this load (so a returning user goes
  // straight to the dashboard with no landing flash). Logged-out visitors and
  // anyone on an explicit auth page (signin / signup / waitlist / reset) render
  // their public page — never the dashboard. Skipped entirely when mounting the
  // app early (the real dashboard renders instead of the shell).
  if (loading && !mountAppEarly) {
    if (!isPublicRoute) {
      return <AppShellSkeleton pathname={effectiveLocation} />
    }
    // A request that carried auth cookies is a logged-in user — show the shell,
    // never the public landing, on the root entry while Firebase restores.
    if ((SERVER_AUTHED || SERVER_COOKIED) && (effectiveLocation === '/' || effectiveLocation === '/landing')) {
      return <AppShellSkeleton pathname={effectiveLocation} />
    }
  }

  const renderPublicPage = () => {
    switch (effectiveLocation) {
      case '/':
        return <RouteErrorBoundary routeName="Home"><React.Suspense fallback={null}><NewLanding onNavigate={handleNavigate} /></React.Suspense></RouteErrorBoundary>
      case '/features':
        return <RouteErrorBoundary routeName="Features"><React.Suspense fallback={null}><Features /></React.Suspense></RouteErrorBoundary>
      case '/pricing':
        return <RouteErrorBoundary routeName="Pricing"><React.Suspense fallback={null}><Pricing /></React.Suspense></RouteErrorBoundary>
      case '/changelog':
        return <RouteErrorBoundary routeName="Changelog"><React.Suspense fallback={null}><Changelog /></React.Suspense></RouteErrorBoundary>
      case '/about':
        return <RouteErrorBoundary routeName="About"><React.Suspense fallback={null}><About /></React.Suspense></RouteErrorBoundary>
      case '/blog':
        return <RouteErrorBoundary routeName="Blog"><React.Suspense fallback={null}><Blog /></React.Suspense></RouteErrorBoundary>
      case '/careers':
        return <RouteErrorBoundary routeName="Careers"><React.Suspense fallback={null}><Careers /></React.Suspense></RouteErrorBoundary>
      case '/contact':
        return <RouteErrorBoundary routeName="Contact"><React.Suspense fallback={null}><Contact /></React.Suspense></RouteErrorBoundary>
      case '/security':
        return <RouteErrorBoundary routeName="Security"><React.Suspense fallback={null}><Security /></React.Suspense></RouteErrorBoundary>
      case '/gdpr':
        return <RouteErrorBoundary routeName="GDPR"><React.Suspense fallback={null}><GDPR /></React.Suspense></RouteErrorBoundary>
      case '/privacy-policy':
        return <RouteErrorBoundary routeName="Privacy Policy"><React.Suspense fallback={null}><PrivacyPolicyPage /></React.Suspense></RouteErrorBoundary>
      case '/terms-of-service':
        return <RouteErrorBoundary routeName="Terms of Service"><React.Suspense fallback={null}><TermsOfServicePage /></React.Suspense></RouteErrorBoundary>
      case '/free-trial':
        return <RouteErrorBoundary routeName="Free Trial"><React.Suspense fallback={null}><FreeTrial /></React.Suspense></RouteErrorBoundary>
      case '/help':
        return <RouteErrorBoundary routeName="Help Center"><React.Suspense fallback={null}><HelpCenter /></React.Suspense></RouteErrorBoundary>
      case '/community':
        return <RouteErrorBoundary routeName="Community"><React.Suspense fallback={null}><Community /></React.Suspense></RouteErrorBoundary>
      case '/status':
        return <RouteErrorBoundary routeName="Status"><React.Suspense fallback={null}><Status /></React.Suspense></RouteErrorBoundary>
      case '/cookies':
        return <RouteErrorBoundary routeName="Cookie Policy"><React.Suspense fallback={null}><CookiePolicy /></React.Suspense></RouteErrorBoundary>
      case '/signup':
        return <RouteErrorBoundary routeName="Sign Up"><React.Suspense fallback={null}><SignUpIntegrated /></React.Suspense></RouteErrorBoundary>
      case '/signin':
        return <RouteErrorBoundary routeName="Sign In"><React.Suspense fallback={null}><SignIn onNavigate={handleNavigate} /></React.Suspense></RouteErrorBoundary>
      case '/admin-login':
        return <RouteErrorBoundary routeName="Admin Login"><React.Suspense fallback={null}><AdminLogin /></React.Suspense></RouteErrorBoundary>
      case '/landing':
        return <RouteErrorBoundary routeName="New Landing"><React.Suspense fallback={null}><NewLanding onNavigate={handleNavigate} /></React.Suspense></RouteErrorBoundary>
      case '/waitlist':
        return <RouteErrorBoundary routeName="Waitlist"><React.Suspense fallback={null}><WaitlistPage /></React.Suspense></RouteErrorBoundary>
      case '/auth/reset-password':
        return <RouteErrorBoundary routeName="Reset Password"><React.Suspense fallback={null}><ResetPassword /></React.Suspense></RouteErrorBoundary>
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

          {/* A logged-in user who still needs to finish onboarding is sent to
              /signup?resume=true. We must render the SignUpIntegrated onboarding
              UI here instead of AuthenticatedApp; otherwise AuthenticatedApp has
              no /signup route, falls through to <Redirect to="/">, and the
              not-onboarded check immediately re-redirects to /signup?resume=true,
              producing an infinite loop that renders a blank screen. */}
          {user && effectiveLocation === '/signup' && isResumingOnboarding ? (
            <RouteErrorBoundary routeName="Sign Up">
              <React.Suspense fallback={null}>
                <SignUpIntegrated />
              </React.Suspense>
            </RouteErrorBoundary>
          ) : user && onboardingResolving && !SERVER_ONBOARDED ? (
            /* Logged in, but onboarding status not yet resolved. Show the app
               shell skeleton so we never flash the dashboard before we know
               whether the user is allowed into it. SKIPPED when the SERVER
               already verified an onboarded session (SERVER_ONBOARDED): in that
               case AuthenticatedApp is already mounted via mountAppEarly, and
               dropping back to this skeleton when Firebase's `loading` flips
               false would UNMOUNT/remount AuthenticatedApp (and the VeeGPT chunk)
               — a blank flash on warm loads. Staying on the AuthenticatedApp
               branch below keeps it mounted continuously. */
            <AppShellSkeleton pathname={effectiveLocation} />
          ) : (user && isOnboarded) || mountAppEarly || (user && SERVER_ONBOARDED) ? (
            /* Onboarded user (or a server-verified onboarded session still
               restoring on the client): mount the authenticated dashboard. With
               the server-seeded user/workspace data, the real dashboard frame
               renders immediately and the per-widget data fills in. */
            <RouteErrorBoundary routeName="App">
              <React.Suspense fallback={<AppShellSkeleton pathname={effectiveLocation} />}>
                <AuthenticatedApp />
              </React.Suspense>
            </RouteErrorBoundary>
          ) : user && !isOnboarded ? (
            /* Logged in but NOT onboarded and NOT on the resume flow yet. The
               onboarding gate effect is redirecting to /signup?resume=true. Hold
               the loader for ALL routes (landing, signin, dashboard, bare signup,
               etc.) so the user never sees a flash of the wrong page and never
               sees the misleading "redirecting to your dashboard" message. */
            <LoadingSpinner type="dashboard" /> /* skeleton-guard-allow: pre-auth-boot-loader */
          ) : isPublicRoute ? (
            effectiveLocation === '/' || effectiveLocation === '/waitlist' || effectiveLocation === '/signin' || effectiveLocation === '/signup' || effectiveLocation === '/landing' ? (
              // Home (new landing), Waitlist, SignIn, SignUp render without global header/footer
              effectiveLocation === '/waitlist' ? (
                <RouteErrorBoundary routeName="Waitlist">
                  <React.Suspense fallback={null}>
                    <WaitlistPage />
                  </React.Suspense>
                </RouteErrorBoundary>
              ) : effectiveLocation === '/signin' ? (
                <RouteErrorBoundary routeName="Sign In">
                  <React.Suspense fallback={null}>
                    <SignIn onNavigate={handleNavigate} />
                  </React.Suspense>
                </RouteErrorBoundary>
              ) : effectiveLocation === '/landing' || effectiveLocation === '/' ? (
                <RouteErrorBoundary routeName="Home">
                  <React.Suspense fallback={null}>
                    <NewLanding onNavigate={handleNavigate} />
                  </React.Suspense>
                </RouteErrorBoundary>
              ) : (
                <RouteErrorBoundary routeName="Sign Up">
                  <React.Suspense fallback={null}>
                    <SignUpIntegrated />
                  </React.Suspense>
                </RouteErrorBoundary>
              )
            ) : (
              <PublicPageLayout onNavigate={handleNavigate}>
                {renderPublicPage()}
              </PublicPageLayout>
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
