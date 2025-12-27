import React, { Suspense, lazy, useState, useEffect, memo, Component, ErrorInfo } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LandingEntry from './LandingEntry'

// TEMPORARILY DISABLED: Unregister service worker to rule out caching issues
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister())
  })
}

// Global error handler for uncaught errors
window.onerror = (message, source, lineno, colno, error) => {
  console.error('GLOBAL ERROR:', { message, source, lineno, colno, error })
  alert(`JS Error: ${message}\nAt: ${source}:${lineno}`)
  return false
}

window.onunhandledrejection = (event) => {
  console.error('UNHANDLED PROMISE:', event.reason)
}

// Simple error boundary for landing page
class LandingErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('LANDING ERROR BOUNDARY:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold mb-4 text-red-500">Something went wrong</h1>
            <p className="text-white/60 mb-4">{this.state.error?.message}</p>
            <pre className="text-xs text-left bg-white/10 p-4 rounded overflow-auto max-h-40 mb-4">
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 rounded text-white"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const FullApp = lazy(() => import('./AppWrapper'))

const landingRoutes = ['/', '/landing', '/waitlist']
const isLandingRoute = (path: string) => landingRoutes.includes(path) || path === ''

const AppLoader = () => (
  <div className="min-h-screen bg-black flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-white/60 text-sm">Loading...</p>
    </div>
  </div>
)

const Router = memo(() => {
  const [currentPath, setCurrentPath] = useState(window.location.pathname)
  const [showFullApp, setShowFullApp] = useState(!isLandingRoute(window.location.pathname))

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname
      setCurrentPath(path)
      if (!isLandingRoute(path)) {
        setShowFullApp(true)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleNavigate = (page: string) => {
    if (page === 'signup' || page === 'signin' || page === 'workspaces' || page === 'dashboard') {
      setShowFullApp(true)
      const newPath = page === 'signup' ? '/signup' : page === 'signin' ? '/signin' : page === 'dashboard' ? '/dashboard' : `/${page}`
      window.history.pushState({}, '', newPath)
      setCurrentPath(newPath)
    }
  }

  if (showFullApp) {
    return (
      <Suspense fallback={<AppLoader />}>
        <FullApp />
      </Suspense>
    )
  }

  return (
    <LandingErrorBoundary>
      <LandingEntry onNavigate={handleNavigate} />
    </LandingErrorBoundary>
  )
})

Router.displayName = 'Router'

createRoot(document.getElementById('root')!).render(<Router />)
