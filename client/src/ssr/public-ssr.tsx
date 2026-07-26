import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Router } from 'wouter'
import { NewLandingPage, PublicPageLayout } from '@/features/new-landing'
import { WaitlistProvider } from '@/context/WaitlistContext'
import { P6Provider } from '@/lib/p6-integration'

// Marketing/content pages (default exports). Imported eagerly here so the SSR
// bundle can render them; the client still lazy-loads them in App.tsx.
import Features from '@/pages/Features'
import Pricing from '@/pages/Pricing'
import FreeTrial from '@/pages/FreeTrial'
import Changelog from '@/pages/Changelog'
import About from '@/pages/About'
import Blog from '@/pages/Blog'
import Careers from '@/pages/Careers'
import Contact from '@/pages/Contact'
import Security from '@/pages/Security'
import GDPR from '@/pages/GDPR'
import PrivacyPolicy from '@/pages/PrivacyPolicy'
import TermsOfService from '@/pages/TermsOfService'
import HelpCenter from '@/pages/HelpCenter'
import Community from '@/pages/Community'
import Status from '@/pages/Status'
import CookiePolicy from '@/pages/CookiePolicy'

/**
 * SSR entry for public marketing/content pages.
 *
 * Renders the page to static HTML so the server can inline real content on the
 * first byte (instant paint + SEO). The client mounts with `createRoot`
 * (replace), so there's no hydration coupling. FAIL-OPEN: returns '' on any
 * render error → server serves the normal empty-#root document.
 *
 * The provider tree mirrors `App.tsx` (Router + P6Provider + WaitlistProvider)
 * so context consumers resolve during SSR; effects don't run server-side, so
 * provider/page side effects (fetches, listeners) are inert here.
 *
 * Excluded on purpose: auth flows (/signin, /signup, /waitlist, reset, admin) —
 * no SEO value, highly interactive, and risky to SSR.
 */

const noop = () => {}

/** Marketing pages that render inside the shared nav/footer chrome. */
const LAYOUT_PAGES: Record<string, () => ReactNode> = {
  '/features': () => <Features />,
  '/pricing': () => <Pricing />,
  '/free-trial': () => <FreeTrial />,
  '/changelog': () => <Changelog />,
  '/about': () => <About />,
  '/blog': () => <Blog />,
  '/careers': () => <Careers />,
  '/contact': () => <Contact />,
  '/security': () => <Security />,
  '/gdpr': () => <GDPR />,
  '/privacy-policy': () => <PrivacyPolicy />,
  '/terms-of-service': () => <TermsOfService />,
  '/help': () => <HelpCenter />,
  '/community': () => <Community />,
  '/status': () => <Status />,
  '/cookies': () => <CookiePolicy />,
}

/** All routes this entry can server-render. */
export const PUBLIC_SSR_ROUTES: string[] = ['/', '/landing', ...Object.keys(LAYOUT_PAGES)]

function renderTree(pathname: string): ReactNode | null {
  if (pathname === '/' || pathname === '/landing') {
    return <NewLandingPage onNavigate={noop} />
  }
  const factory = LAYOUT_PAGES[pathname]
  if (factory) {
    return <PublicPageLayout onNavigate={noop}>{factory()}</PublicPageLayout>
  }
  return null
}

export function renderPublic(pathname: string): string {
  try {
    const tree = renderTree(pathname)
    if (!tree) return ''
    return renderToStaticMarkup(
      <Router ssrPath={pathname}>
        <P6Provider>
          <WaitlistProvider>{tree}</WaitlistProvider>
        </P6Provider>
      </Router>
    )
  } catch (e) {
    if (typeof process !== 'undefined' && (process as any).env?.SSR_DEBUG) {
      // eslint-disable-next-line no-console
      console.error(`[public-ssr] render failed for ${pathname}:`, e)
    }
    return ''
  }
}
