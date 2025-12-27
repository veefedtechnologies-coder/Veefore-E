import { memo } from 'react'
import Landing from './pages/Landing'

interface LandingEntryProps {
  onNavigate: (page: string) => void
}

const LandingEntry = memo(({ onNavigate }: LandingEntryProps) => {
  return <Landing onNavigate={onNavigate} />
})

LandingEntry.displayName = 'LandingEntry'

export default LandingEntry
