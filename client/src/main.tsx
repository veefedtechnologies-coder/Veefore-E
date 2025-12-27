import React, { Suspense, lazy, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const LandingEntry = lazy(() => import('./LandingEntry'))

const FullApp = lazy(() => import('./AppWrapper'))

const LoadingSpinner = () => (
  <div className="min-h-screen bg-black flex items-center justify-center">
    <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
  </div>
)

const landingRoutes = ['/', '/landing', '/waitlist']

const isLandingRoute = (path: string) => {
  return landingRoutes.includes(path) || path === ''
}

const Router = () => {
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
      <Suspense fallback={<LoadingSpinner />}>
        <FullApp />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LandingEntry onNavigate={handleNavigate} />
    </Suspense>
  )
}

if (!React || !React.useState || !createRoot) {
  console.error('React or createRoot is not available in main.tsx')
  document.getElementById('root')!.innerHTML = '<div>Error: React not available</div>'
} else {
  createRoot(document.getElementById('root')!).render(<Router />)
}
