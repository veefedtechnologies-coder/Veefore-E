import { memo } from 'react'
import { motion } from 'framer-motion'
import Landing from './pages/Landing'
import { useIsMobile } from './hooks/useIsMobile'

interface LandingEntryProps {
  onNavigate: (page: string) => void
}

const GlassCard = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => {
  const isMobile = useIsMobile()
  return (
    <div className={`relative ${isMobile ? 'bg-white/[0.04]' : 'backdrop-blur-xl bg-white/[0.02]'} border border-white/[0.08] rounded-[24px] overflow-hidden ${className}`}>
      {!isMobile && <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-transparent pointer-events-none" />}
      {children}
    </div>
  )
}

const LandingNavigation = memo(({ onNavigate }: { onNavigate: (page: string) => void }) => {
  return (
    <div className="landing-nav-wrapper w-full z-50">
      <motion.nav 
        initial={{ y: -100 }} 
        animate={{ y: 0 }} 
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mx-4 mt-4">
          <GlassCard className="max-w-[1200px] mx-auto !rounded-full px-5 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-8">
                <div className="flex items-center cursor-pointer" onClick={() => onNavigate('/')}>
                  <img 
                    src="/veefore-logo.png" 
                    alt="VeeFore" 
                    className="h-8 w-auto"
                  />
                  <span className="text-xl font-bold tracking-tight ml-[-2px] text-white">eefore</span>
                </div>
                
                <div className="hidden md:flex items-center space-x-4 lg:space-x-6 text-xs md:text-sm font-medium text-white/50">
                  {['Features', 'How it Works', 'Pricing', 'FAQ'].map((item) => (
                    <a key={item} href={`#${item.toLowerCase().replace(' ', '-')}`} className="hover:text-white transition-colors duration-300 relative group">
                      {item}
                      <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 group-hover:w-full transition-all duration-300" />
                    </a>
                  ))}
                </div>
              </div>

              <div className="flex items-center space-x-2 sm:space-x-3">
                <button className="hidden sm:block text-sm font-medium text-white/60 hover:text-white transition-colors px-4 py-2" onClick={() => onNavigate('signin')}>Login</button>
                <button 
                  className="bg-white text-black hover:bg-white/90 rounded-full px-3 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-all duration-300"
                  onClick={() => onNavigate('signup')}
                >
                  <span className="hidden sm:inline">Start Free Trial</span>
                  <span className="sm:hidden">Start Free</span>
                </button>
              </div>
            </div>
          </GlassCard>
        </div>
      </motion.nav>
    </div>
  )
})

LandingNavigation.displayName = 'LandingNavigation'

const LandingEntry = memo(({ onNavigate }: LandingEntryProps) => {
  return (
    <div className="min-h-screen bg-[#030303]">
      <LandingNavigation onNavigate={onNavigate} />
      <Landing onNavigate={onNavigate} />
    </div>
  )
})

LandingEntry.displayName = 'LandingEntry'

export default LandingEntry
