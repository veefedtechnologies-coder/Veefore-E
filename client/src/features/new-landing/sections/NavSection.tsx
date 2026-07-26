import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'

import { GlowButton } from '../primitives/GlowButton'
import { NAV_LINKS } from '../constants/content'
import type { NavLink } from '../constants/content'
import { useLandingMotion } from '../context/LandingMotionProvider'
import { usePrimaryCta } from '../hooks/usePrimaryCta'

/**
 * Props for {@link NavSection}.
 */
export interface NavSectionProps {
  /**
   * Invoked when a navigation control wants to route the host app to a named
   * page (e.g. `'signup'`). Optional so the section can mount standalone for
   * tests without a router (Requirement 3.3).
   */
  onNavigate?: (page: string) => void
}

/** Scroll offset (px) past which the nav morphs from full-width bar to pill. */
const SCROLL_THRESHOLD = 30

/** Per-letter hover-rise stagger, in seconds (design brief: 40ms per letter). */
const LETTER_STAGGER = 0.04

/**
 * A single center nav link.
 *
 * Splits its label into individual letters so each one rises on hover (design
 * brief — "each letter rises individually, 40ms stagger"). The active link
 * shows a coral underline that scales in from the left. Under reduced motion
 * the letters are static and the underline appears instantly.
 */
const NavCenterLink: React.FC<{
  link: NavLink
  active: boolean
  reducedMotion: boolean
  onSelect: (link: NavLink) => void
}> = ({ link, active, reducedMotion, onSelect }) => {
  const letters = Array.from(link.label)

  return (
    <a
      href={link.href}
      onClick={(e) => {
        // SPA-route the internal page links; let hash anchors scroll natively.
        if (link.href.startsWith('/')) e.preventDefault()
        onSelect(link)
      }}
      className="veef-nav-link group relative inline-flex items-center text-[15px] font-medium text-[#7A8FA8] transition-colors duration-200 hover:text-[#FFFFFF]"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
      aria-current={active ? 'page' : undefined}
    >
      {/* Visible label — split into per-letter spans for the hover rise. */}
      <span aria-hidden="true" className="inline-flex">
        {letters.map((letter, index) => (
          <span
            key={index}
            className="inline-block transition-transform duration-200 ease-out group-hover:-translate-y-1"
            style={{
              whiteSpace: 'pre',
              transitionDelay: reducedMotion ? '0ms' : `${index * LETTER_STAGGER}s`,
            }}
          >
            {letter === ' ' ? '\u00A0' : letter}
          </span>
        ))}
      </span>

      {/* Coral underline — slides in from the left when the link is active. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-1 left-0 h-[2px] w-full origin-left bg-[#4C82F7]"
        style={{
          transform: `scaleX(${active ? 1 : 0})`,
          transition: reducedMotion ? 'none' : 'transform 250ms ease-out',
        }}
      />
    </a>
  )
}

/**
 * Fixed top navigation for the new landing page.
 *
 * - Stays fixed at the top of the viewport (Requirement 6.1).
 * - Tracks scroll position: past {@link SCROLL_THRESHOLD}px it applies a blurred
 *   navy background; within the threshold it is transparent. The two states are
 *   mutually exclusive on the threshold (Requirements 6.2, 6.3).
 * - Left: the Veefore "V" logomark (`/veefore.svg`) beside the "eefore"
 *   wordmark (Syne 700).
 * - Center: the {@link NAV_LINKS} (Home / Features / How It Works / Pricing /
 *   Blog) in DM Sans secondary text, each with a per-letter hover rise and a
 *   coral active underline (Requirement 6.4).
 * - Right: a "Try Free" {@link GlowButton} with a coral glow hover that routes
 *   via `onNavigate('signup')` (Requirements 6.4, 6.5).
 * - At the mobile breakpoint (`<=768px`) a hamburger control toggles a
 *   full-screen overlay menu with staggered links and animates into an ×
 *   (Requirement 6.6).
 * - All colours come from the Colour_System — ZERO purple (Requirements 4.1,
 *   4.2). Under reduced motion every state change is instant: no letter rise,
 *   no link stagger (Requirement 21.1).
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 20.2, 21.1
 */
export const NavSection: React.FC<NavSectionProps> = ({ onNavigate }) => {
  const { reducedMotion } = useLandingMotion()
  const cta = usePrimaryCta(onNavigate)

  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeHref, setActiveHref] = useState<string>(() => {
    // Highlight the nav item matching the current route on first render.
    if (typeof window === 'undefined') return NAV_LINKS[0]?.href ?? ''
    const path = window.location.pathname
    const match = NAV_LINKS.find((l) => l.href === path)
    return match?.href ?? (path === '/' || path === '/landing' ? '/' : '')
  })

  // Track scroll position; toggle the blurred state at the 80px threshold.
  // Transparent (<= 80) and blurred (> 80) are mutually exclusive (6.2 / 6.3).
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > SCROLL_THRESHOLD)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Lock body scroll while the mobile overlay is open; restore on close/unmount.
  useEffect(() => {
    if (!mobileOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileOpen])

  const handleSelect = useCallback((link: NavLink) => {
    setActiveHref(link.href)
    setMobileOpen(false)

    // Route real page links via the host's SPA navigation so the nav works on
    // every public page (no full-page reload). Hash links fall through to the
    // browser's default anchor behaviour (scroll to a section on the landing).
    if (link.href.startsWith('/') && onNavigate) {
      // onNavigate prepends '/', so strip the leading slash. Home ('/') → ''.
      onNavigate(link.href.replace(/^\//, ''))
    }
  }, [onNavigate])

  const handleTryFree = useCallback(() => {
    setMobileOpen(false)
    cta.go()
  }, [cta])

  const handleSignIn = useCallback(() => {
    setMobileOpen(false)
    onNavigate?.('signin')
  }, [onNavigate])

  return (
    <header
      className="veef-nav fixed inset-x-0 top-0 z-50"
      style={{
        paddingLeft: scrolled ? '1rem' : '0rem',
        paddingRight: scrolled ? '1rem' : '0rem',
        paddingTop: scrolled ? '0.875rem' : '0rem',
        transition: reducedMotion
          ? 'none'
          : 'padding 400ms cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <nav
        className="mx-auto flex items-center justify-between pl-5 pr-3"
        style={{
          height: scrolled ? '60px' : '72px',
          maxWidth: scrolled ? '1100px' : '1280px',
          borderRadius: scrolled ? '9999px' : '0px',
          backgroundColor: scrolled ? 'rgba(10,11,15,0.72)' : 'transparent',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
          border: scrolled ? '1px solid rgba(255,255,255,0.10)' : '1px solid transparent',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.10)' : '1px solid transparent',
          boxShadow: scrolled
            ? '0 1px 0 rgba(255,255,255,0.06) inset, 0 18px 50px -24px rgba(0,0,0,0.85)'
            : 'none',
          transition: reducedMotion
            ? 'none'
            : 'max-width 400ms cubic-bezier(0.22,1,0.36,1), height 400ms cubic-bezier(0.22,1,0.36,1), border-radius 400ms cubic-bezier(0.22,1,0.36,1), background-color 300ms ease, box-shadow 300ms ease, border-color 300ms ease, backdrop-filter 300ms ease',
        }}
      >
        {/* ── Left: logomark + wordmark ──────────────────────────────── */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault()
            handleSelect({ label: 'Home', href: '/' })
          }}
          className="group flex items-center"
          aria-label="Veefore home"
        >
          <img
            src="/veefore.svg"
            alt="Veefore"
            className="h-8 w-8 object-contain"
            style={{
              filter: 'drop-shadow(0 0 12px rgba(76,130,247,0.35))',
            }}
          />
          <span
            className="text-[22px] font-bold tracking-tight text-[#F5F6F8]"
            style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, marginLeft: '-2px' }}
          >
            eefore
          </span>
        </a>

        {/* ── Center: links (desktop) ────────────────────────────────── */}
        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <NavCenterLink
              key={link.href}
              link={link}
              active={activeHref === link.href}
              reducedMotion={reducedMotion}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {/* ── Right: auth controls (desktop) ─────────────────────────── */}
        <div className="hidden items-center gap-3 md:flex">
          {cta.hasEarlyAccess && (
            <button
              type="button"
              onClick={handleSignIn}
              className="text-[14px] font-medium text-[#9BA3B4] transition-colors duration-200 hover:text-[#F5F6F8]"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              Sign In
            </button>
          )}
          <GlowButton size="sm" onClick={handleTryFree}>{cta.shortLabel}</GlowButton>
        </div>

        {/* ── Mobile: hamburger toggle ───────────────────────────────── */}
        <button
          type="button"
          className="relative z-50 flex h-10 w-10 items-center justify-center md:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <span className="relative block h-4 w-6">
            <span
              className="absolute left-0 block h-[2px] w-6 bg-[#FFFFFF]"
              style={{
                top: mobileOpen ? '7px' : '0px',
                transform: mobileOpen ? 'rotate(45deg)' : 'none',
                transition: reducedMotion ? 'none' : 'top 200ms ease, transform 200ms ease',
              }}
            />
            <span
              className="absolute left-0 top-[7px] block h-[2px] w-6 bg-[#FFFFFF]"
              style={{
                opacity: mobileOpen ? 0 : 1,
                transition: reducedMotion ? 'none' : 'opacity 150ms ease',
              }}
            />
            <span
              className="absolute left-0 block h-[2px] w-6 bg-[#FFFFFF]"
              style={{
                top: mobileOpen ? '7px' : '14px',
                transform: mobileOpen ? 'rotate(-45deg)' : 'none',
                transition: reducedMotion ? 'none' : 'top 200ms ease, transform 200ms ease',
              }}
            />
          </span>
        </button>
      </nav>

      {/* ── Mobile: full-screen overlay menu ─────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <m.div
            key="veef-nav-overlay"
            className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 md:hidden"
            style={{ backgroundColor: '#040C18' }}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
          >
            {NAV_LINKS.map((link, index) => (
              <m.a
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  if (link.href.startsWith('/')) e.preventDefault()
                  handleSelect(link)
                }}
                className="text-2xl font-medium text-[#FFFFFF]"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
                initial={reducedMotion ? false : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reducedMotion ? 0 : 0.3,
                  delay: reducedMotion ? 0 : 0.05 + index * 0.06,
                }}
              >
                {link.label}
              </m.a>
            ))}

            <m.div
              className="flex flex-col items-center gap-4"
              initial={reducedMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reducedMotion ? 0 : 0.3,
                delay: reducedMotion ? 0 : 0.05 + NAV_LINKS.length * 0.06,
              }}
            >
              <GlowButton onClick={handleTryFree}>{cta.shortLabel}</GlowButton>
              {cta.hasEarlyAccess && (
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="text-lg font-medium text-[#9BA3B4] transition-colors duration-200 hover:text-[#FFFFFF]"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  Sign In
                </button>
              )}
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  )
}

NavSection.displayName = 'NavSection'
