/**
 * NoAccountsEmptyState
 *
 * Rendered when the active workspace has zero connected SocialAccount records.
 * Displays a friendly call-to-action that opens the "Add Account" section/modal.
 *
 * Requirements: 4.6
 */

import React from 'react'
import { LinkIcon, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface NoAccountsEmptyStateProps {
  /** Called when the user clicks the primary "Connect First Account" CTA. */
  onConnectClick: () => void
}

/**
 * Empty state shown when no social accounts are connected in the workspace.
 * Matches the existing empty-state design used in SocialAccountsSettings
 * (same card container, icon, typography, and CTA button styles).
 */
export function NoAccountsEmptyState({ onConnectClick }: NoAccountsEmptyStateProps) {
  return (
    <div className="p-12 text-center flex flex-col items-center animate-in fade-in duration-300">
      {/* Icon container */}
      <div className="relative mb-6">
        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
          <LinkIcon className="w-9 h-9 text-gray-400 dark:text-gray-500" aria-hidden="true" />
        </div>
        {/* Accent dot */}
        <div
          className="absolute -top-1 -right-1 w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center shadow-sm"
          aria-hidden="true"
        >
          <Zap className="w-3 h-3 text-white" />
        </div>
      </div>

      {/* Headline */}
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        No Social Accounts Connected
      </h3>

      {/* Sub-copy */}
      <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md text-sm leading-relaxed">
        Connect your brand&apos;s social media profiles to enable cross-platform publishing,
        AI-powered automations, and centralised analytics — all from one place.
      </p>

      {/* Primary CTA */}
      <Button
        onClick={onConnectClick}
        className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 h-11 px-6 rounded-xl shadow-sm"
        aria-label="Connect your first social account"
      >
        <LinkIcon className="w-4 h-4" />
        Connect First Account
      </Button>
    </div>
  )
}
