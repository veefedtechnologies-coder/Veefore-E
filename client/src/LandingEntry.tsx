import React, { Suspense, lazy, memo } from 'react'

const Landing = lazy(() => import('./pages/Landing'))

interface LandingEntryProps {
  onNavigate: (page: string) => void
}

const LandingEntry = memo(({ onNavigate }: LandingEntryProps) => {
  return (
    <Suspense fallback={null}>
      <Landing onNavigate={onNavigate} />
    </Suspense>
  )
})

LandingEntry.displayName = 'LandingEntry'

export default LandingEntry
