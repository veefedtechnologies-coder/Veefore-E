import React, { Suspense, lazy, useState, useEffect, memo } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const LandingEntry = lazy(() => import('./LandingEntry'))
const FullApp = lazy(() => import('./AppWrapper'))

const landingRoutes = ['/', '/landing', '/waitlist']
const isLandingRoute = (path: string) => landingRoutes.includes(path) || path === ''

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
      <Suspense fallback={null}>
        <FullApp />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={null}>
      <LandingEntry onNavigate={handleNavigate} />
    </Suspense>
  )
})

Router.displayName = 'Router'

createRoot(document.getElementById('root')!).render(<Router />)
