/**
 * PhoneMockup — a premium CSS-drawn phone frame that wraps arbitrary content.
 *
 * Renders a rounded dark bezel with a notch, a power button and volume buttons
 * on the sides, a status bar, and a gesture-bar indicator at the bottom.
 * Content fills the screen area without internal scroll.
 *
 * All sizing is relative (`w-full`, aspect-ratio driven) so the frame scales
 * with its container — drop it in a width-constrained parent.
 */
export interface PhoneMockupProps {
  /** Content to render inside the phone screen. */
  children: React.ReactNode
  className?: string
  /** Optional override for screen background. Defaults to the canvas near-black. */
  screenBg?: string
}

export const PhoneMockup: React.FC<PhoneMockupProps> = ({
  children,
  className,
  screenBg = '#07070A',
}) => (
  <div
    className={`relative mx-auto ${className ?? ''}`}
    style={{ maxWidth: '320px' }}
    aria-hidden="false"
  >
    {/* Outer bezel */}
    <div
      className="relative w-full overflow-hidden"
      style={{
        aspectRatio: '9/19.5',
        borderRadius: '44px',
        background: 'linear-gradient(160deg, #252630, #16171D)',
        boxShadow:
          '0 0 0 1.5px rgba(255,255,255,0.12), 0 0 0 3px rgba(0,0,0,0.6), 0 40px 100px -40px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.08)',
        padding: '10px',
      }}
    >
      {/* Power button groove (right side, decorative) */}
      <div
        aria-hidden="true"
        className="absolute"
        style={{
          right: '-2px',
          top: '22%',
          width: '3px',
          height: '48px',
          borderRadius: '0 3px 3px 0',
          background: 'rgba(255,255,255,0.12)',
        }}
      />
      {/* Volume buttons (left side, decorative) */}
      {[{ top: '20%', h: '32px' }, { top: '28%', h: '32px' }].map((b, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="absolute"
          style={{
            left: '-2px',
            top: b.top,
            width: '3px',
            height: b.h,
            borderRadius: '3px 0 0 3px',
            background: 'rgba(255,255,255,0.10)',
          }}
        />
      ))}

      {/* Screen */}
      <div
        className="relative flex h-full w-full flex-col overflow-hidden"
        style={{
          borderRadius: '36px',
          background: screenBg,
        }}
      >
        {/* Notch / dynamic island */}
        <div className="relative flex w-full flex-shrink-0 items-center justify-between px-5 pt-3 pb-1">
          {/* Status bar - time left */}
          <span className="veef-mono text-[9px] font-semibold text-white/80">9:41</span>
          {/* Dynamic island pill */}
          <div
            className="absolute left-1/2 top-3 -translate-x-1/2"
            style={{
              width: '80px',
              height: '22px',
              borderRadius: '20px',
              background: '#0A0A0E',
            }}
          />
          {/* Status bar - icons right */}
          <div className="flex items-center gap-1">
            <svg width="14" height="10" viewBox="0 0 14 10" fill="white" opacity={0.8}>
              <rect x="0" y="4" width="3" height="6" rx="0.5" />
              <rect x="4" y="2" width="3" height="8" rx="0.5" />
              <rect x="8" y="0" width="3" height="10" rx="0.5" />
            </svg>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.2" opacity={0.8}>
              <rect x="1" y="2" width="7" height="6" rx="1" />
              <path d="M8 4.5h1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* App content */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {children}
        </div>

        {/* Home indicator */}
        <div className="flex flex-shrink-0 items-center justify-center pb-2 pt-1">
          <div
            style={{
              width: '100px',
              height: '4px',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.28)',
            }}
          />
        </div>
      </div>
    </div>
  </div>
)

PhoneMockup.displayName = 'PhoneMockup'
