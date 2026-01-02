import React, { useEffect, useRef, useCallback, useMemo } from 'react'
import { useLocation } from 'wouter'
import { useFirebaseAuth } from './hooks/useFirebaseAuth'
import LoadingSpinner from './components/LoadingSpinner'
import { initializeTheme } from './lib/theme'
import { initializeP6System, P6Provider, ToastContainer } from './lib/p6-integration'
import { initializeAccessibilityCompliance, useAccessibilityRouteAnnouncements } from './lib/accessibility-compliance'
import { initializeMobileExcellence } from './lib/mobile-excellence'
import { AdaptiveAnimationProvider } from '@/lib/mobile-performance-optimizer'
import { initializeSEO } from './lib/seo-optimization'
import { initializeCoreWebVitals } from './lib/core-web-vitals'
import { initializeComponentModernization } from './lib/component-modernization'
import { WaitlistProvider } from './context/WaitlistContext'
import { WaitlistModal } from './components/waitlist/WaitlistModal'

import Landing from './pages/Landing'

const AuthenticatedApp = React.lazy(() => import('./AuthenticatedApp'))

const Landing3D = React.lazy(() => import('./pages/Landing3D'))
const Landing3DAdvanced = React.lazy(() => import('./pages/Landing3DAdvanced'))
const SplineKeyboardLanding = React.lazy(() => import('./pages/SplineKeyboardLanding'))
const RobotHeroLanding = React.lazy(() => import('./pages/RobotHeroLanding'))
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

const publicRoutes = [
  '/', '/features', '/pricing', '/changelog', '/about', '/blog', '/careers',
  '/contact', '/security', '/gdpr', '/privacy-policy', '/terms-of-service',
  '/free-trial', '/help', '/community', '/status', '/cookies', '/waitlist',
  '/signup', '/signin', '/admin-login', '/3d', '/3d-advanced', '/keyboard',
  '/robot-hero', '/landing'
]

const protectedRoutes = [
  '/integration', '/plan', '/create', '/analytics', '/inbox', '/video-generator',
  '/workspaces', '/profile', '/automation', '/veegpt', '/admin', '/settings',
  '/security-dashboard', '/integrations', '/test-fixtures', '/encryption-health'
]

function App() {
  const themeInitialized = useRef(false)
  const p6Initialized = useRef(false)
  const accessibilityInitialized = useRef(false)
  const mobileInitialized = useRef(false)
  const seoInitialized = useRef(false)
  const webVitalsInitialized = useRef(false)
  const componentModernizationInitialized = useRef(false)

  const { user, loading } = useFirebaseAuth()
  const [location, setLocation] = useLocation()
  
  const handleNavigate = useCallback((page: string) => {
    setLocation(`/${page}`)
  }, [setLocation])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location])

  useAccessibilityRouteAnnouncements(location)

  useEffect(() => {
    if (!themeInitialized.current) {
      initializeTheme()
      themeInitialized.current = true
    }
  }, [])

  useEffect(() => {
    if (!accessibilityInitialized.current) {
      initializeAccessibilityCompliance()
      accessibilityInitialized.current = true
    }

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
        initializeP6System()
        p6Initialized.current = true
      }
    }

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(deferInit, { timeout: 2000 })
    } else {
      setTimeout(deferInit, 100)
    }
  }, [])

  const effectiveLocation = location || '/'
  
  const isPublicRoute = useMemo(() => publicRoutes.some(route => 
    effectiveLocation === route || effectiveLocation.startsWith(route + '/')
  ), [effectiveLocation])
  
  const isProtectedRoute = useMemo(() => protectedRoutes.some(route => 
    effectiveLocation === route || effectiveLocation.startsWith(route + '/')
  ), [effectiveLocation])

  useEffect(() => {
    if (!loading && !user && isProtectedRoute) {
      setLocation('/signin')
    }
  }, [loading, user, isProtectedRoute, setLocation])

  if (loading && !isPublicRoute) {
    return <LoadingSpinner type="dashboard" />
  }

  const renderPublicPage = () => {
    switch (effectiveLocation) {
      case '/':
        return <Landing onNavigate={handleNavigate} />
      case '/features':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><Features /></React.Suspense>
      case '/pricing':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><Pricing /></React.Suspense>
      case '/changelog':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><Changelog /></React.Suspense>
      case '/about':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><About /></React.Suspense>
      case '/blog':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><Blog /></React.Suspense>
      case '/careers':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><Careers /></React.Suspense>
      case '/contact':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><Contact /></React.Suspense>
      case '/security':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><Security /></React.Suspense>
      case '/gdpr':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><GDPR /></React.Suspense>
      case '/privacy-policy':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><PrivacyPolicyPage /></React.Suspense>
      case '/terms-of-service':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><TermsOfServicePage /></React.Suspense>
      case '/free-trial':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><FreeTrial /></React.Suspense>
      case '/help':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><HelpCenter /></React.Suspense>
      case '/community':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><Community /></React.Suspense>
      case '/status':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><Status /></React.Suspense>
      case '/cookies':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><CookiePolicy /></React.Suspense>
      case '/signup':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><SignUpIntegrated /></React.Suspense>
      case '/signin':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><SignIn onNavigate={handleNavigate} /></React.Suspense>
      case '/admin-login':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><AdminLogin /></React.Suspense>
      case '/3d':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><Landing3D /></React.Suspense>
      case '/3d-advanced':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><Landing3DAdvanced /></React.Suspense>
      case '/keyboard':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><SplineKeyboardLanding /></React.Suspense>
      case '/robot-hero':
        return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><RobotHeroLanding /></React.Suspense>
      case '/landing':
        return <Landing onNavigate={handleNavigate} />
      default:
        return null
    }
  }

  return (
    <AdaptiveAnimationProvider
      autoMonitor={true}
      autoDowngradeThreshold={25}
      autoUpgradeThreshold={50}
    >
      <P6Provider>
        <WaitlistProvider>
          <>
            <WaitlistModal />
            <React.Suspense fallback={null}>
              <CookieConsentBanner />
            </React.Suspense>

            {!user && isPublicRoute && effectiveLocation !== '/' ? (
              <div className="min-h-screen">
                {renderPublicPage()}
              </div>
            ) : !user && effectiveLocation === '/' ? (
              <Landing onNavigate={handleNavigate} />
            ) : user ? (
              <React.Suspense fallback={<LoadingSpinner type="dashboard" />}>
                <AuthenticatedApp />
              </React.Suspense>
            ) : isPublicRoute ? (
              <div className="min-h-screen">
                {renderPublicPage()}
              </div>
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
    </AdaptiveAnimationProvider>
  )
}

export default App
