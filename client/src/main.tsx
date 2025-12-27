import React, { Suspense, lazy, useState, useEffect, memo } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LandingEntry from './LandingEntry'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
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

  return <LandingEntry onNavigate={handleNavigate} />
})

Router.displayName = 'Router'

createRoot(document.getElementById('root')!).render(<Router />)
