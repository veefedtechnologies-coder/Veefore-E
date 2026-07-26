/**
 * PlatformSelector — chip-strip for selecting content generation target platform(s).
 *
 * Renders three mutually-exclusive options:
 *   - Instagram
 *   - Facebook
 *   - Both
 *
 * The "Both" option maps to `['instagram', 'facebook']` in targetPlatforms.
 *
 * Follows the same chip-button design pattern as AnalyticsPlatformFilterControl
 * in the dashboard module (rounded-full chips, blue active state, gray inactive).
 *
 * Requirements: 11.1
 */

import { cn } from '@/lib/utils'
import type { PlatformId } from '@platform-registry/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The three user-facing options in the platform selector. */
export type ContentPlatformOption = 'instagram' | 'facebook' | 'both'

interface PlatformSelectorProps {
  /** Currently active option. */
  value: ContentPlatformOption
  /** Called when the user clicks a different option. */
  onChange: (value: ContentPlatformOption) => void
  /** When true the selector is rendered but non-interactive (e.g. while generating). */
  disabled?: boolean
  /** Additional CSS class names applied to the wrapper. */
  className?: string
}

// ---------------------------------------------------------------------------
// Icons — inline SVG to avoid an extra asset import
// ---------------------------------------------------------------------------

function InstagramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 fill-current"
      aria-hidden="true"
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 fill-current"
      aria-hidden="true"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function BothIcon() {
  // Simple dual-circle icon suggesting two platforms
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <circle cx="8" cy="12" r="5" />
      <circle cx="16" cy="12" r="5" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Options config
// ---------------------------------------------------------------------------

const OPTIONS: Array<{
  value: ContentPlatformOption
  label: string
  icon: React.ReactNode
}> = [
  { value: 'instagram', label: 'Instagram', icon: <InstagramIcon /> },
  { value: 'facebook', label: 'Facebook', icon: <FacebookIcon /> },
  { value: 'both', label: 'Both', icon: <BothIcon /> },
]

// ---------------------------------------------------------------------------
// Helper — convert UI option to PlatformId[]
// ---------------------------------------------------------------------------

/**
 * Map the user-facing `ContentPlatformOption` to the `PlatformId[]` array
 * consumed by the content generation API request.
 */
export function platformOptionToIds(option: ContentPlatformOption): PlatformId[] {
  switch (option) {
    case 'instagram':
      return ['instagram']
    case 'facebook':
      return ['facebook']
    case 'both':
      return ['instagram', 'facebook']
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Chip-strip platform selector for Content Studio.
 *
 * @example
 * ```tsx
 * const [platform, setPlatform] = useState<ContentPlatformOption>('instagram')
 *
 * <PlatformSelector value={platform} onChange={setPlatform} />
 * ```
 */
export function PlatformSelector({
  value,
  onChange,
  disabled = false,
  className,
}: PlatformSelectorProps) {
  return (
    <div
      className={cn('flex items-center gap-2', disabled && 'opacity-60 pointer-events-none', className)}
      role="group"
      aria-label="Target platform for content generation"
    >
      {OPTIONS.map((opt) => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            aria-pressed={isActive}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              isActive
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
