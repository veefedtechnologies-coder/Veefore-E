/**
 * Veefore New Landing Page — Brand Logos
 *
 * Accurate, current official app-icon marks for the platforms Veefore connects
 * to, rendered as self-contained inline SVGs (no external assets). Each logo
 * fills its parent box as a rounded brand tile (matching the real app icons):
 * Instagram's gradient camera, Meta's blue infinity, YouTube's play, WhatsApp's
 * green bubble, Telegram's blue plane, TikTok's black chromatic note, LinkedIn's
 * blue "in", Facebook's blue "f", and X's black mark.
 *
 * Decorative only — callers wrap these and provide accessible labelling.
 */

type LogoProps = { className?: string }

/** Instagram — current camera glyph on the brand radial gradient tile. */
export const InstagramLogo: React.FC<LogoProps> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <defs>
      <radialGradient id="veefIg" cx="30%" cy="107%" r="150%">
        <stop offset="0%" stopColor="#FDD25A" />
        <stop offset="10%" stopColor="#FDD25A" />
        <stop offset="28%" stopColor="#FA8B30" />
        <stop offset="48%" stopColor="#EC2855" />
        <stop offset="62%" stopColor="#D31F76" />
        <stop offset="100%" stopColor="#8E3BD6" />
      </radialGradient>
    </defs>
    <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#veefIg)" />
    <rect x="11.5" y="11.5" width="25" height="25" rx="8" fill="none" stroke="#fff" strokeWidth="3" />
    <circle cx="24" cy="24" r="6.4" fill="none" stroke="#fff" strokeWidth="3" />
    <circle cx="32.2" cy="15.8" r="2.1" fill="#fff" />
  </svg>
)

/** Meta — official infinity glyph (white) on the brand blue gradient tile. */
export const MetaLogo: React.FC<LogoProps> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="veefMeta" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0064E1" />
        <stop offset="60%" stopColor="#0080FB" />
        <stop offset="100%" stopColor="#19AFFF" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#veefMeta)" />
    <g transform="translate(8.4 9.6) scale(1.3)" fill="#fff">
      <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.156-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.087-.262z" />
    </g>
  </svg>
)

/** YouTube — current rounded-rect play badge on a white tile. */
export const YouTubeLogo: React.FC<LogoProps> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <rect x="2" y="2" width="44" height="44" rx="13" fill="#fff" />
    <rect x="8" y="14" width="32" height="20" rx="6" fill="#FF0033" />
    <path d="M21 20.5l8 3.5-8 3.5z" fill="#fff" />
  </svg>
)

/** WhatsApp — current phone bubble on the brand green tile. */
export const WhatsAppLogo: React.FC<LogoProps> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <rect x="2" y="2" width="44" height="44" rx="13" fill="#25D366" />
    <path
      fill="#fff"
      d="M24 11.5c-6.9 0-12.5 5.6-12.5 12.5 0 2.2.6 4.3 1.6 6.1L11.5 36.5l6.6-1.7c1.8 1 3.8 1.5 5.9 1.5 6.9 0 12.5-5.6 12.5-12.5S30.9 11.5 24 11.5zm0 22.8c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-3.9 1 1-3.8-.2-.4c-1.1-1.7-1.6-3.6-1.6-5.6 0-5.7 4.7-10.4 10.4-10.4S34.4 18.3 34.4 24 29.7 34.3 24 34.3z"
    />
    <path
      fill="#fff"
      d="M30.2 27.1c-.3-.2-2-1-2.3-1.1-.3-.1-.5-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.7-1.7-1-.9-1.7-2-1.9-2.3-.2-.3 0-.5.1-.7.1-.1.3-.4.5-.6.1-.2.2-.3.3-.5.1-.2 0-.4 0-.6-.1-.2-.8-1.9-1.1-2.6-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.9 0 1.7 1.2 3.3 1.4 3.6.2.2 2.5 3.8 6 5.3.8.4 1.5.6 2 .7.8.3 1.6.2 2.2.1.7-.1 2-.8 2.3-1.6.3-.8.3-1.5.2-1.6-.1-.2-.3-.2-.6-.4z"
    />
  </svg>
)

/** Telegram — current paper-plane on the brand blue gradient tile. */
export const TelegramLogo: React.FC<LogoProps> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="veefTg" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor="#37BBFE" />
        <stop offset="100%" stopColor="#007DBB" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#veefTg)" />
    <path
      fill="#fff"
      d="M11.6 23.5l21.2-8.2c1-.4 1.9.2 1.5 1.7l-3.6 17c-.3 1.3-1.1 1.6-2.1 1l-5.9-4.3-2.8 2.7c-.3.3-.6.6-1.2.6l.4-6 10.9-9.9c.5-.4-.1-.6-.7-.2l-13.5 8.5-5.8-1.8c-1.3-.4-1.3-1.3.2-1.9z"
    />
  </svg>
)

/** TikTok — current chromatic note on the brand black tile (real app icon). */
export const TikTokLogo: React.FC<LogoProps> = ({ className }) => {
  // simpleicons TikTok glyph (24×24) scaled into the tile, layered for the
  // signature cyan/red chromatic offset behind a white note.
  const note =
    'M12.5 0c1.3 0 2.6 0 3.9 0 .1 1.5.6 3.1 1.7 4.2 1.1 1.1 2.7 1.6 4.2 1.8v4c-1.4-.05-2.9-.35-4.2-1-.6-.25-1.1-.6-1.6-.9 0 2.9 0 5.8 0 8.7-.1 1.4-.5 2.8-1.4 3.9-1.3 1.9-3.6 3.2-5.9 3.2-1.4.1-2.9-.3-4.1-1-2-1.2-3.4-3.4-3.6-5.7 0-.5 0-1 0-1.5.2-1.9 1.1-3.7 2.6-5 1.7-1.4 4-2.1 6.1-1.7 0 1.5 0 3 0 4.4-1-.3-2.1-.2-3 .4-.6.4-1.1 1-1.4 1.7-.2.5-.1 1.1-.1 1.6.2 1.6 1.8 3 3.5 2.9 1.1 0 2.2-.7 2.8-1.6.2-.3.4-.7.4-1.1.1-1.8.1-3.6.1-5.4 0-4 0-8.1 0-12.1z'
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="13" fill="#010101" />
      <g transform="translate(13.2 12) scale(0.93)">
        <path d={note} fill="#25F4EE" transform="translate(-1.1 1)" />
        <path d={note} fill="#FE2C55" transform="translate(1.1 -1)" />
        <path d={note} fill="#fff" />
      </g>
    </svg>
  )
}

/** LinkedIn — current white "in" on the brand blue tile. */
export const LinkedInLogo: React.FC<LogoProps> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <rect x="2" y="2" width="44" height="44" rx="13" fill="#0A66C2" />
    <circle cx="16.2" cy="16.4" r="2.6" fill="#fff" />
    <rect x="13.7" y="20.4" width="5" height="14.4" fill="#fff" />
    <path
      fill="#fff"
      d="M22 20.4h4.8v2c.7-1.2 2.3-2.5 4.7-2.5 4.4 0 5.5 2.7 5.5 6.6v8.3h-5v-7.4c0-1.8-.6-3-2.2-3-1.3 0-2 .9-2.3 1.7-.1.3-.1.7-.1 1.1v7.6h-5c.1-12.3.1-13.7.1-14.4z"
    />
  </svg>
)

/** Facebook — current white "f" on the brand blue tile. */
export const FacebookLogo: React.FC<LogoProps> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <rect x="2" y="2" width="44" height="44" rx="13" fill="#1877F2" />
    <path
      fill="#fff"
      d="M28.2 25.2l.8-5.2h-5v-3.4c0-1.4.7-2.8 3-2.8h2.3V9.4s-2.1-.4-4.1-.4c-4.2 0-6.9 2.5-6.9 7.1V20h-4.6v5.2h4.6V38h5.7V25.2z"
    />
  </svg>
)

/** X (Twitter) — current white mark on the brand black tile. */
export const XLogo: React.FC<LogoProps> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <rect x="2" y="2" width="44" height="44" rx="13" fill="#010101" />
    <path
      fill="#fff"
      d="M29.9 13.5h3.7l-8.1 9.2L35 34.5h-7.4l-5.8-7.6-6.7 7.6h-3.7l8.7-9.9L13 13.5h7.6l5.2 6.9zm-1.3 18.8h2L19.6 15.6h-2.2z"
    />
  </svg>
)
