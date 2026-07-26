/**
 * AddAccountSection
 *
 * Renders one connect button per platform whose `auth.oauthSupported === true`
 * in the Platform Capability Registry. The list is derived exclusively via
 * `CapabilityGuard.getConnectablePlatforms()` — never hardcoded.
 *
 * Special case: Instagram and Facebook share the same Meta OAuth flow.
 * When both are connectable, they are merged into a single "Meta" button
 * that starts the Facebook OAuth and auto-connects the linked Instagram
 * Business Account in the same flow. This avoids asking users to connect
 * two platforms that are already linked in Meta Business Suite.
 *
 * Requirements: 4.3
 */

import React from 'react'
import {
  Facebook,
  Youtube,
  Linkedin,
  Twitter,
  Link as LinkIcon,
  Plus,
} from 'lucide-react'
import { CapabilityGuard } from '@platform-registry'
import type { PlatformId } from '@platform-registry'

// ---------------------------------------------------------------------------
// Per-platform display metadata
// ---------------------------------------------------------------------------

interface PlatformMeta {
  name: string
  description: string
  color: string
  icon: React.ReactNode
}

/** Instagram SVG icon — inline so it renders without a Lucide dependency */
function InstagramIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="white" className={className} aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  )
}

const PLATFORM_META: Partial<Record<PlatformId | 'meta', PlatformMeta>> = {
  // "meta" is a synthetic entry used when both instagram + facebook are connectable.
  // Clicking it starts the Facebook OAuth flow which auto-connects the linked
  // Instagram Business Account in the same step.
  meta: {
    name: 'Facebook & Instagram',
    description: 'Connect via Meta Business — links both accounts at once',
    color: 'bg-blue-600 hover:bg-blue-700',
    icon: (
      <span className="flex items-center gap-1">
        <Facebook className="w-4 h-4 text-white" aria-hidden="true" />
        <span className="text-white text-xs font-bold">+</span>
        <InstagramIcon className="w-4 h-4" />
      </span>
    ),
  },
  facebook: {
    name: 'Facebook',
    description: 'Pages & Groups',
    color: 'bg-blue-600 hover:bg-blue-700',
    icon: <Facebook className="w-5 h-5 text-white" aria-hidden="true" />,
  },
  instagram: {
    name: 'Instagram',
    description: 'Business & Creator Accounts',
    color: 'bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600',
    icon: <InstagramIcon />,
  },
  youtube: {
    name: 'YouTube',
    description: 'Channels & Shorts',
    color: 'bg-red-600 hover:bg-red-700',
    icon: <Youtube className="w-5 h-5 text-white" aria-hidden="true" />,
  },
  linkedin: {
    name: 'LinkedIn',
    description: 'Personal & Company Pages',
    color: 'bg-blue-700 hover:bg-blue-800',
    icon: <Linkedin className="w-5 h-5 text-white" aria-hidden="true" />,
  },
  x: {
    name: 'X (Twitter)',
    description: 'Professional Accounts',
    color: 'bg-slate-900 hover:bg-black dark:hover:bg-slate-800',
    icon: <Twitter className="w-5 h-5 text-white" aria-hidden="true" />,
  },
}

function getFallbackMeta(platformId: string): PlatformMeta {
  return {
    name: platformId.charAt(0).toUpperCase() + platformId.slice(1),
    description: 'Connect your account',
    color: 'bg-gray-600 hover:bg-gray-700',
    icon: <LinkIcon className="w-5 h-5 text-white" aria-hidden="true" />,
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AddAccountSectionProps {
  workspaceId: string | undefined
  getConnectUrl?: (platformId: PlatformId) => string
  heading?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddAccountSection({
  workspaceId,
  getConnectUrl,
  heading = 'Add Account',
}: AddAccountSectionProps) {
  const connectablePlatforms: PlatformId[] = CapabilityGuard.getConnectablePlatforms()
  const [connecting, setConnecting] = React.useState<string | null>(null)

  const hasInstagram = connectablePlatforms.includes('instagram')
  const hasFacebook = connectablePlatforms.includes('facebook')

  /**
   * Build the display list:
   * - When both instagram AND facebook are connectable, replace them with a
   *   single synthetic "meta" entry that starts the Facebook OAuth flow.
   *   The backend auto-connects the linked Instagram account in the same step.
   * - Otherwise show platforms individually.
   */
  type DisplayEntry = { key: string; platformId: PlatformId | 'meta'; meta: PlatformMeta }
  const displayEntries: DisplayEntry[] = []

  if (hasInstagram && hasFacebook) {
    // Merged Meta entry
    displayEntries.push({
      key: 'meta',
      platformId: 'meta',
      meta: PLATFORM_META['meta']!,
    })
    // Add remaining connectable platforms (not instagram/facebook)
    for (const p of connectablePlatforms) {
      if (p !== 'instagram' && p !== 'facebook') {
        displayEntries.push({
          key: p,
          platformId: p,
          meta: PLATFORM_META[p] ?? getFallbackMeta(p),
        })
      }
    }
  } else {
    for (const p of connectablePlatforms) {
      displayEntries.push({
        key: p,
        platformId: p,
        meta: PLATFORM_META[p] ?? getFallbackMeta(p),
      })
    }
  }

  const handleConnect = async (platformId: PlatformId | 'meta') => {
    if (!workspaceId || connecting) return
    setConnecting(platformId)

    if (platformId === 'meta' || platformId === 'facebook') {
      try {
        // First check: does this workspace already have a brand connected?
        // If so, we can't add another brand to this workspace — enforce the one-brand rule
        const socialRes = await fetch(
          `/api/social-accounts?workspaceId=${encodeURIComponent(workspaceId)}`,
          { credentials: 'include' }
        )
        if (socialRes.ok) {
          const saData = await socialRes.json()
          const accounts = saData?.data ?? saData ?? []
          const activeAccounts = Array.isArray(accounts)
            ? accounts.filter((a: any) => a.connectionStatus === 'ACTIVE' || a.isActive !== false)
            : []
          if (activeAccounts.length > 0) {
            // Workspace already has a brand — show upgrade modal instead
            // Navigate to billing page with a message
            setConnecting(null)
            // Trigger the brand selection modal which will show the "workspace has brand" state
            window.location.href = `/settings?tab=social&brand_selection=true`
            return
          }
        }

        const res = await fetch(
          `/api/facebook/auth?workspaceId=${encodeURIComponent(workspaceId)}`,
          { credentials: 'include' }
        )
        const data = await res.json() as { authUrl?: string; error?: string }
        if (data.authUrl) {
          window.location.href = data.authUrl
        } else {
          console.error('[AddAccountSection] facebook/auth did not return an authUrl:', data)
          setConnecting(null)
        }
      } catch (err) {
        console.error('[AddAccountSection] Failed to fetch Facebook auth URL:', err)
        setConnecting(null)
      }
      return
    }

    if (platformId === 'instagram') {
      const url = getConnectUrl
        ? getConnectUrl(platformId)
        : `/api/social-auth/instagram/authorize?workspaceId=${workspaceId}`
      window.location.href = url
      return
    }

    const url = getConnectUrl
      ? getConnectUrl(platformId)
      : `/api/social-auth/${platformId}/authorize?workspaceId=${workspaceId}`
    window.location.href = url
  }

  if (displayEntries.length === 0) return null

  return (
    <section aria-labelledby="add-account-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <h3
          id="add-account-heading"
          className="text-lg font-semibold text-gray-900 dark:text-white"
        >
          {heading}
        </h3>
        <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-100 dark:bg-indigo-900/40 rounded-full">
          <Plus className="w-3 h-3 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        </span>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        Select a platform to authenticate. You will be redirected to securely grant
        permissions to Veefore.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="list">
        {displayEntries.map(({ key, platformId, meta }) => (
        <button
            key={key}
            role="listitem"
            onClick={() => void handleConnect(platformId)}
            disabled={!workspaceId || connecting !== null}
            className={`
              flex items-center gap-4 p-4 rounded-xl
              border border-gray-200 dark:border-gray-700
              hover:border-indigo-300 dark:hover:border-indigo-700
              bg-white dark:bg-gray-800
              transition-all group text-left
              disabled:opacity-50 disabled:cursor-not-allowed
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2
            `}
            aria-label={`Connect ${meta.name} account`}
          >
            <div
              className={`
                w-12 h-12 flex items-center justify-center rounded-xl
                shadow-sm transition-transform group-hover:scale-105
                ${meta.color}
              `}
            >
              {connecting === platformId ? (
                <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : meta.icon}
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">
                {meta.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {connecting === platformId ? 'Redirecting to Meta…' : meta.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
