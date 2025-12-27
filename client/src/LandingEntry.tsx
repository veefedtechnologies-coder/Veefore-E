import React, { Suspense, lazy, useEffect, useState, memo } from 'react'

const Landing = lazy(() => import('./pages/Landing'))

const LandingFallback = memo(() => (
  <div className="min-h-screen bg-black flex items-center justify-center">
    <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
  </div>
))

interface LandingEntryProps {
  onNavigate: (page: string) => void
}

const LandingEntry = ({ onNavigate }: LandingEntryProps) => {
  return (
    <Suspense fallback={<LandingFallback />}>
      <Landing onNavigate={onNavigate} />
    </Suspense>
  )
}

export default LandingEntry
