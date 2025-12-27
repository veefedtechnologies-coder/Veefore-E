import React, { useEffect, useState, memo, Suspense, lazy } from 'react'

const Landing = lazy(() => import('./pages/Landing'))

interface LandingEntryProps {
  onNavigate: (page: string) => void
}

const LandingEntry = memo(({ onNavigate }: LandingEntryProps) => {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (ready) {
      const staticHero = document.getElementById('static-hero')
      if (staticHero) {
        staticHero.style.transition = 'opacity 0.2s ease-out'
        staticHero.style.opacity = '0'
        setTimeout(() => {
          staticHero.style.display = 'none'
        }, 200)
      }
    }
  }, [ready])

  return (
    <Suspense fallback={null}>
      <Landing onNavigate={onNavigate} onReady={() => setReady(true)} />
    </Suspense>
  )
})

LandingEntry.displayName = 'LandingEntry'

export default LandingEntry
