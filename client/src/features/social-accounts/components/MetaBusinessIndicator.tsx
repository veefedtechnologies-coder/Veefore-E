/**
 * MetaBusinessIndicator
 *
 * Renders a labeled grouping badge between an Instagram account card and a
 * Facebook Page card when both share the same Meta Business Suite account
 * (i.e. `platformMetadata.metaBusinessId` is identical and non-empty on both).
 *
 * When either account lacks a `metaBusinessId`, or the two IDs do not match,
 * this component renders nothing (`null`).
 *
 * Requirements: 2.12, 4.4
 *
 * Usage:
 *   <MetaBusinessIndicator
 *     instagramAccount={igAccount}
 *     facebookAccount={fbAccount}
 *   />
 */

import React from 'react'
import { Link2, Building2 } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Minimal type for the account props — mirrors ISocialAccount fields that are
// available from the API response (front-end shape).
// ---------------------------------------------------------------------------

export interface SocialAccountLike {
  /** Discriminator field — must be 'instagram' or 'facebook' respectively. */
  platform: string
  /**
   * Platform-specific metadata. For the Meta Business relationship check we
   * only need `metaBusinessId` (string or undefined) from this sub-document.
   */
  platformMetadata?: {
    metaBusinessId?: string
    [key: string]: unknown
  }
  /** Optional: human-readable business name stored on the Facebook account. */
  pageName?: string
  username?: string
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MetaBusinessIndicatorProps {
  /** The Instagram SocialAccount in this workspace. */
  instagramAccount: SocialAccountLike
  /** The Facebook SocialAccount (Page) in this workspace. */
  facebookAccount: SocialAccountLike
  /** Optional extra class names applied to the outer wrapper. */
  className?: string
}

// ---------------------------------------------------------------------------
// Helper — extract and validate the shared metaBusinessId
// ---------------------------------------------------------------------------

function getSharedMetaBusinessId(
  igAccount: SocialAccountLike,
  fbAccount: SocialAccountLike,
): string | null {
  const igId = igAccount.platformMetadata?.metaBusinessId?.trim()
  const fbId = fbAccount.platformMetadata?.metaBusinessId?.trim()

  // Both must be non-empty strings and must match to constitute a relationship.
  if (!igId || !fbId) return null
  if (igId !== fbId) return null

  return igId
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a "Connected via Meta Business" grouping indicator badge when the
 * provided Instagram and Facebook accounts share the same Meta Business Suite
 * account.  Returns `null` when no relationship is detected.
 *
 * Designed to be placed _between_ the two account cards in the Social Accounts
 * page list so the user can visually understand that the two accounts are linked.
 */
export function MetaBusinessIndicator({
  instagramAccount,
  facebookAccount,
  className,
}: MetaBusinessIndicatorProps) {
  const sharedId = getSharedMetaBusinessId(instagramAccount, facebookAccount)

  // No shared relationship detected — render nothing.
  if (!sharedId) return null

  // Derive a human-readable business name. The Facebook Page's pageName is the
  // most reliable source; fall back to the page's username, then a generic label.
  const businessName =
    facebookAccount.pageName ||
    facebookAccount.username ||
    instagramAccount.username ||
    'Meta Business'

  return (
    <TooltipProvider>
      <div
        className={cn(
          // Horizontal rule with a centered badge — visually "connects" two cards.
          'relative flex items-center justify-center my-2 px-4',
          className,
        )}
        role="status"
        aria-label={`${businessName}: Instagram and Facebook are connected via the same Meta Business account`}
      >
        {/* Left decorative line */}
        <div
          className="flex-1 h-px bg-gradient-to-r from-transparent to-blue-300/60 dark:to-blue-500/30"
          aria-hidden="true"
        />

        {/* Centre badge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'mx-3 flex items-center gap-1.5 cursor-default',
                'px-3 py-1 rounded-full border',
                'border-blue-200 dark:border-blue-700/60',
                'bg-blue-50 dark:bg-blue-900/20',
                'text-blue-700 dark:text-blue-300',
                'text-xs font-semibold leading-none',
                'shadow-sm select-none',
                // Subtle ring on focus for keyboard navigation
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
              )}
              tabIndex={0}
            >
              {/* Icon: two links joined — represents the cross-platform connection */}
              <Link2
                className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0"
                aria-hidden="true"
              />

              {/* Label */}
              <span>Connected via Meta Business</span>

              {/* Business icon */}
              <Building2
                className="w-3.5 h-3.5 text-blue-400 dark:text-blue-500 shrink-0"
                aria-hidden="true"
              />
            </div>
          </TooltipTrigger>

          <TooltipContent
            side="top"
            className="max-w-xs text-center"
          >
            <p className="font-semibold mb-0.5">{businessName}</p>
            <p className="text-xs text-muted-foreground">
              Your Instagram account and Facebook Page are managed under the same
              Meta Business Suite account. Analytics and publishing settings are
              coordinated between these two accounts.
            </p>
          </TooltipContent>
        </Tooltip>

        {/* Right decorative line */}
        <div
          className="flex-1 h-px bg-gradient-to-l from-transparent to-blue-300/60 dark:to-blue-500/30"
          aria-hidden="true"
        />
      </div>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Named export of the helper for unit-testing the detection logic in isolation
// ---------------------------------------------------------------------------
export { getSharedMetaBusinessId }
