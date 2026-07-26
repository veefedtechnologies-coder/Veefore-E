import { useCallback } from 'react'
import { Instagram, Twitter, Youtube, Linkedin, Facebook, Mail, MapPin, ArrowUpRight } from 'lucide-react'

import { COLORS } from '../constants/colors'

export interface FooterSectionProps {
  onNavigate?: (page: string) => void
}

interface FooterLink { label: string; page: string }
interface SocialIcon {
  label: string
  href: string
  Icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string }>
}

/**
 * Footer navigation — mirrors the legacy MainFooter so every public page is
 * reachable. `page` is a route name (no leading slash); the host passes
 * `onNavigate` which routes to `/<page>` (see App.tsx handleNavigate).
 */
const PRODUCT_LINKS: FooterLink[] = [
  { label: 'Features', page: 'features' },
  { label: 'Pricing', page: 'pricing' },
  { label: 'Changelog', page: 'changelog' },
]

const COMPANY_LINKS: FooterLink[] = [
  { label: 'About Us', page: 'about' },
  { label: 'Blog', page: 'blog' },
  { label: 'Careers', page: 'careers' },
  { label: 'Contact', page: 'contact' },
]

const RESOURCES_LINKS: FooterLink[] = [
  { label: 'Help Center', page: 'help' },
  { label: 'Community', page: 'community' },
  { label: 'Status', page: 'status' },
]

const LEGAL_LINKS: FooterLink[] = [
  { label: 'Privacy Policy', page: 'privacy-policy' },
  { label: 'Terms of Service', page: 'terms-of-service' },
  { label: 'Security', page: 'security' },
  { label: 'Cookie Policy', page: 'cookies' },
  { label: 'GDPR', page: 'gdpr' },
]

const BOTTOM_LEGAL_LINKS: FooterLink[] = [
  { label: 'Privacy', page: 'privacy-policy' },
  { label: 'Terms', page: 'terms-of-service' },
  { label: 'Cookies', page: 'cookies' },
  { label: 'GDPR', page: 'gdpr' },
]

const SOCIAL_ICONS: SocialIcon[] = [
  { label: 'Veefore on Instagram', href: 'https://www.instagram.com/veefore_inc/', Icon: Instagram },
  { label: 'Veefore on X', href: 'https://x.com/Veefore_inc', Icon: Twitter },
  { label: 'Veefore on YouTube', href: 'https://youtube.com/@veefore', Icon: Youtube },
  { label: 'Veefore on LinkedIn', href: 'https://linkedin.com/company/veefore', Icon: Linkedin },
  { label: 'Veefore on Facebook', href: 'https://facebook.com/veefore', Icon: Facebook },
]

const LinkCol: React.FC<{
  heading: string
  links: FooterLink[]
  onNavigate: (page: string) => void
}> = ({ heading, links, onNavigate }) => (
  <div className="flex flex-col gap-3">
    <h3
      className="text-[10px] uppercase tracking-[0.22em] font-semibold"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        color: COLORS.coral,
      }}
    >
      {heading}
    </h3>
    {links.map((link) => (
      <button
        key={link.label}
        type="button"
        onClick={() => onNavigate(link.page)}
        className="w-max text-left text-[14px] transition-colors duration-200"
        style={{
          fontFamily: "'DM Sans', sans-serif",
          color: '#7A8FA8',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#F5F6F8' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#7A8FA8' }}
      >
        {link.label}
      </button>
    ))}
  </div>
)

/**
 * Footer — prominent, solid opaque background, blue-themed accents.
 *
 * Uses flex layout exclusively (no CSS grid) to avoid the grid-layer
 * bleed-through and flicker loop. The solid `#030308` background sits
 * above everything (z-index 5) so neither the fixed grid overlay nor the
 * scroll-path SVG (z-index 10) can bleed through — the scroll-path is
 * pointer-events:none so it floats above harmlessly.
 *
 * Requirements: 17.1, 17.2
 */
export const FooterSection: React.FC<FooterSectionProps> = ({ onNavigate }) => {
  const handleNavigate = useCallback(
    (page: string) => onNavigate?.(page),
    [onNavigate],
  )

  // Brand → site root. The host's onNavigate prepends '/', so '' yields '/'.
  const handleHome = useCallback(() => onNavigate?.(''), [onNavigate])

  return (
    <footer
      className="veef-footer relative w-full"
      style={{
        borderTop: `1px solid rgba(255,255,255,0.07)`,
        position: 'relative',
        zIndex: 3,
      }}
    >
      {/* Solid dark background — path ends before footer so no conflict.
          The large box-shadow paints a solid "floor" extending below the
          footer so the fixed grid / bg-layer never bleed through under it
          (covers any trailing document height without adding scroll height). */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundColor: '#030308',
          boxShadow: '0 1200px 0 1200px #030308',
          zIndex: 0,
        }}
      />
      {/* Top gradient accent line */}
      <div
        aria-hidden="true"
        className="relative z-10 inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${COLORS.coral}55, transparent)`,
        }}
      />

      {/* Subtle background glow in footer */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-full"
        style={{
          width: '600px',
          height: '200px',
          background: `radial-gradient(ellipse, ${COLORS.coral}09 0%, transparent 70%)`,
          filter: 'blur(50px)',
        }}
      />

      {/* All visible content — sits above the background layer */}
      <div className="relative z-10">

      {/* ── Newsletter / CTA strip ─────────────────────────────────────── */}
      <div
        className="relative border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
          <div>
            <p
              className="text-[15px] font-semibold text-[#E6E8EC]"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              Stay in the loop
            </p>
            <p
              className="mt-0.5 text-[13px] text-[#5A6172]"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              Product updates, creator tips, and early-access drops — no spam.
            </p>
          </div>
          <div className="flex w-full max-w-[380px] items-center gap-2 sm:w-auto">
            <input
              type="email"
              placeholder="you@example.com"
              className="h-10 flex-1 rounded-xl border px-4 text-[13px] text-[#D7DBE3] outline-none placeholder:text-[#3A4150] focus:outline-none"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                fontFamily: "'DM Sans', sans-serif",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = `${COLORS.coral}66`
                e.currentTarget.style.boxShadow = `0 0 0 3px ${COLORS.coral}18`
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
            <button
              type="button"
              className="flex h-10 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold text-white transition-all duration-200"
              style={{
                background: COLORS.coral,
                fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.85'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.transform = 'none'
              }}
            >
              Subscribe <ArrowUpRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main footer content ────────────────────────────────────────── */}
      <div className="mx-auto max-w-[1280px] px-6 py-14">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-20">

          {/* Brand column */}
          <div className="flex-shrink-0 lg:w-[280px]">
            <button
              type="button"
              onClick={handleHome}
              className="flex items-center"
              aria-label="Veefore home"
            >
              <img
                src="/veefore.svg"
                alt="Veefore"
                className="h-8 w-8 object-contain"
                style={{ filter: `drop-shadow(0 0 12px ${COLORS.coral}60)` }}
              />
              <span
                className="text-[22px] font-bold tracking-tight text-[#F5F6F8]"
                style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, marginLeft: '-2px' }}
              >
                eefore
              </span>
            </button>

            <p
              className="mt-4 text-[14px] leading-[1.7] text-[#5A6172]"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              India&apos;s AI-native Instagram management platform for creators, businesses, and agencies.
              Grow smarter — not harder.
            </p>

            {/* Badges */}
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { label: 'Meta Official API', color: COLORS.coral },
                { label: 'Made in India 🇮🇳', color: '#5EE6C4' },
              ].map(({ label, color }) => (
                <span
                  key={label}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    background: `${color}12`,
                    color,
                    border: `1px solid ${color}28`,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Social icons */}
            <div className="mt-6 flex items-center gap-2">
              {SOCIAL_ICONS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-[#5A6172] transition-all duration-200"
                  style={{
                    border: '1px solid rgba(255,255,255,0.07)',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = `${COLORS.coral}55`
                    e.currentTarget.style.color = '#F5F6F8'
                    e.currentTarget.style.boxShadow = `0 0 14px ${COLORS.coral}30`
                    e.currentTarget.style.backgroundColor = `${COLORS.coral}12`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                    e.currentTarget.style.color = '#5A6172'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'
                  }}
                >
                  <Icon size={15} strokeWidth={1.75} />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div className="flex flex-1 flex-wrap gap-x-14 gap-y-10">
            <LinkCol heading="Product" links={PRODUCT_LINKS} onNavigate={handleNavigate} />
            <LinkCol heading="Company" links={COMPANY_LINKS} onNavigate={handleNavigate} />
            <LinkCol heading="Resources" links={RESOURCES_LINKS} onNavigate={handleNavigate} />
            <LinkCol heading="Legal" links={LEGAL_LINKS} onNavigate={handleNavigate} />

            {/* Contact column */}
            <div className="flex flex-col gap-3">
              <h3
                className="text-[10px] uppercase tracking-[0.22em] font-semibold"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  color: COLORS.coral,
                }}
              >
                Contact
              </h3>
              <a
                href="mailto:support@veefore.com"
                className="flex items-center gap-2 text-[14px] text-[#7A8FA8] transition-colors duration-200 hover:text-[#F5F6F8]"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                <Mail size={14} strokeWidth={1.75} aria-hidden="true" />
                support@veefore.com
              </a>
              <span
                className="flex items-center gap-2 text-[14px] text-[#7A8FA8]"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                <MapPin size={14} strokeWidth={1.75} aria-hidden="true" />
                Bareilly, India
              </span>
              <button
                type="button"
                onClick={() => handleNavigate('free-trial')}
                className="mt-2 flex items-center gap-1.5 text-[13px] transition-colors duration-200"
                style={{ color: COLORS.coral, fontFamily: "'DM Sans', sans-serif" }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                Start free trial <ArrowUpRight size={13} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div
          className="mt-14 flex flex-col items-center justify-between gap-4 pt-8 sm:flex-row"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-3">
            <img
              src="/veefore.svg"
              alt=""
              aria-hidden="true"
              className="h-4 w-4 opacity-40"
            />
            <p
              className="text-[12px] text-[#3D5166]"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              © {new Date().getFullYear()} Veefed Technologies Pvt. Ltd. · All rights reserved
            </p>
          </div>

          <div className="flex items-center gap-5">
            {BOTTOM_LEGAL_LINKS.map((link) => (
              <button
                key={link.label}
                type="button"
                onClick={() => handleNavigate(link.page)}
                className="text-[12px] text-[#3D5166] transition-colors duration-200 hover:text-[#7A8FA8]"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      </div>
    </footer>
  )
}

FooterSection.displayName = 'FooterSection'
