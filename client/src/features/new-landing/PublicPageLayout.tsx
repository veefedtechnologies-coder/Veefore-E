import type { ReactNode } from 'react'

import './newLanding.css'

import { LandingMotionProvider } from './context/LandingMotionProvider'
import { NavSection } from './sections/NavSection'
import { FooterSection } from './sections/FooterSection'

export interface PublicPageLayoutProps {
  /** Routing callback shared with the nav + footer (e.g. `(page) => setLocation('/' + page)`). */
  onNavigate?: (page: string) => void
  /** The public page content rendered between the shared nav and footer. */
  children: ReactNode
}

/**
 * Shared chrome for every PUBLIC marketing page (Features, Pricing, About,
 * Blog, Careers, Contact, Security, Legal, etc.).
 *
 * Wraps the page content with the new-landing {@link NavSection} (header) and
 * {@link FooterSection} (footer) so all public pages share one consistent
 * header/footer instead of the legacy MainNavigation / MainFooter.
 *
 * The whole tree is scoped under `.veef-landing` (so the landing design tokens
 * and fonts apply) and wrapped in {@link LandingMotionProvider} because the nav
 * reads motion-gating flags via `useLandingMotion`.
 *
 * The fixed nav overlaps content, so a top padding spacer keeps page content
 * clear of the header.
 */
export const PublicPageLayout: React.FC<PublicPageLayoutProps> = ({ onNavigate, children }) => {
  return (
    <LandingMotionProvider>
      <div className="veef-landing" style={{ position: 'relative', minHeight: '100vh', backgroundColor: '#07070A' }}>
        <NavSection onNavigate={onNavigate} />
        {/* Spacer so content clears the fixed nav (72px tall at top). */}
        <main style={{ position: 'relative', zIndex: 1, paddingTop: '72px' }}>
          {children}
        </main>
        <FooterSection onNavigate={onNavigate} />
      </div>
    </LandingMotionProvider>
  )
}

PublicPageLayout.displayName = 'PublicPageLayout'

export default PublicPageLayout
