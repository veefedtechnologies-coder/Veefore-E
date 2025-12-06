import React, { Suspense } from 'react'
import ChunkBoundary from './ChunkBoundary'
import GlobalLoader from './GlobalLoader'

export default function RouteSuspense({ children }: { children: React.ReactNode }) {
  return (
    <ChunkBoundary>
      <Suspense fallback={<GlobalLoader />}>{children}</Suspense>
    </ChunkBoundary>
  )
}
