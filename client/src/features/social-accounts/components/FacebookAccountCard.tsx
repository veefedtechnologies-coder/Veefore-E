import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Facebook,
  RefreshCw,
  Trash2,
  Settings,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Facebook-specific metadata stored in `platformMetadata`.
 * Mirrors `FacebookPlatformMetadata` from the server model — kept local to
 * avoid importing server-side code into the React bundle.
 */
export interface FacebookPlatformMetadata {
  pageCategory?: string;
  pageFanCount?: number;
  /** Meta Business Suite ID — used to detect MetaBusinessRelationship with Instagram accounts. */
  metaBusinessId?: string;
  linkedInstagramAccountId?: string;
}

/**
 * Shape of a Facebook SocialAccount record as returned by
 * `GET /api/social-accounts/:workspaceId` after the multi-platform reshape.
 *
 * Requirements: 4.1, 4.2, 4.5, 4.7
 */
export interface FacebookSocialAccount {
  _id?: string;
  id?: string;
  platform: 'facebook';
  /** Facebook Page name (top-level for quick rendering) */
  pageName?: string;
  /** Falls back to `pageName` for display label */
  username?: string;
  profilePictureUrl?: string;
  /** Facebook Page or account fan/follower count */
  followersCount?: number;
  connectionStatus?: 'ACTIVE' | 'DISCONNECTED' | 'REQUIRES_RECONNECT' | 'SYNCING';
  tokenStatus?: string;
  /** ISO timestamp of last successful data sync */
  lastSyncAt?: string | Date | null;
  /** ISO timestamp when the platform token expires */
  tokenExpiresAt?: string | Date | null;
  /** Facebook-specific metadata sub-document */
  platformMetadata?: FacebookPlatformMetadata | Record<string, unknown>;
}

export interface FacebookAccountCardProps {
  account: FacebookSocialAccount;
  /** Called when the user clicks Reconnect */
  onReconnect?: (account: FacebookSocialAccount) => void;
  /** Called when the user clicks Disconnect */
  onDisconnect?: (account: FacebookSocialAccount) => void;
  /** Called when the user clicks Refresh (force-sync) */
  onRefresh?: (account: FacebookSocialAccount) => void;
  /** Called when the user clicks Settings */
  onSettings?: (account: FacebookSocialAccount) => void;
  /** Whether a background operation (sync, disconnect, etc.) is in progress */
  isOperationPending?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Derive the display label for the account (page name takes precedence). */
function resolveDisplayName(account: FacebookSocialAccount): string {
  return account.pageName ?? account.username ?? 'Facebook Page';
}

/** Extract `pageFanCount` from `platformMetadata` safely. */
function resolveFanCount(account: FacebookSocialAccount): number | null {
  const meta = account.platformMetadata as FacebookPlatformMetadata | undefined;
  if (meta && typeof meta.pageFanCount === 'number') return meta.pageFanCount;
  // Fall back to top-level `followersCount` (may be populated by legacy API shape)
  if (typeof account.followersCount === 'number') return account.followersCount;
  return null;
}

/** Format a raw fan/follower count to a human-readable string. */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

type HealthLevel = 'healthy' | 'warning' | 'error';

/** Map `connectionStatus` to a tri-state health level used for visual indicators. */
function resolveHealth(account: FacebookSocialAccount): HealthLevel {
  const status = account.connectionStatus;
  if (status === 'REQUIRES_RECONNECT' || status === 'DISCONNECTED') return 'error';
  if (status === 'SYNCING') return 'warning';
  // Legacy tokenStatus fallback
  if (!status && account.tokenStatus && account.tokenStatus !== 'valid') return 'warning';
  return 'healthy';
}

/** Derive the contextual reconnect reason message from the account data. */
function resolveReconnectReason(account: FacebookSocialAccount): string {
  if (account.tokenStatus === 'expired') return 'Token expired — please reconnect to restore access.';
  if (account.connectionStatus === 'REQUIRES_RECONNECT') {
    // Check if expiry date has passed
    if (account.tokenExpiresAt) {
      const expiresAt = new Date(account.tokenExpiresAt);
      if (expiresAt < new Date()) return 'Token expired — please reconnect to restore access.';
    }
    return 'Permission revoked — please reconnect to restore access.';
  }
  if (account.connectionStatus === 'DISCONNECTED') return 'This account has been disconnected.';
  return 'Reconnection required.';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** The Facebook platform logo badge with official blue color. */
function FacebookLogoIcon({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-[#1877F2] text-white ${className ?? ''}`}
      aria-label="Facebook"
    >
      <Facebook className="w-4 h-4" />
    </div>
  );
}

/** Connection health dot with label — mirrors the pattern in IntegrationsSettings. */
function HealthIndicator({ level }: { level: HealthLevel }) {
  const configs = {
    healthy: {
      /* skeleton-guard-allow: status-dot — live connection health indicator, not a loading placeholder */
      dot: 'bg-emerald-500 animate-pulse',
      label: 'Healthy',
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    warning: {
      dot: 'bg-amber-500',
      label: 'Syncing',
      color: 'text-amber-600 dark:text-amber-400',
    },
    error: {
      dot: 'bg-red-500',
      label: 'Error',
      color: 'text-red-600 dark:text-red-400',
    },
  };

  const cfg = configs[level];

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} aria-hidden="true" />
      <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
    </div>
  );
}

/** `connectionStatus` badge — coloured pill label. */
function ConnectionStatusBadge({
  status,
}: {
  status: FacebookSocialAccount['connectionStatus'];
}) {
  if (!status || status === 'ACTIVE') {
    return (
      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-xs">
        Active
      </Badge>
    );
  }

  if (status === 'REQUIRES_RECONNECT') {
    return (
      <Badge className="bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20 text-xs">
        Requires Reconnect
      </Badge>
    );
  }

  if (status === 'SYNCING') {
    return (
      <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20 text-xs">
        Syncing
      </Badge>
    );
  }

  if (status === 'DISCONNECTED') {
    return (
      <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20 text-xs">
        Disconnected
      </Badge>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Skeleton (loading state) — Requirements 4.7
// ---------------------------------------------------------------------------

/**
 * `FacebookAccountCardSkeleton` — pixel-for-pixel placeholder while data loads.
 * Mirrors the real card layout without any visible text or metric values.
 * Uses `<Skeleton>` primitives from the Veefore design system.
 */
export function FacebookAccountCardSkeleton() {
  return (
    <div
      data-testid="facebook-account-card-skeleton"
      className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
    >
      {/* Header row */}
      <div className="flex items-center gap-3 mb-4">
        <Skeleton variant="avatar" className="w-12 h-12 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" className="h-4 w-36" />
          <Skeleton variant="text" className="h-3 w-24" />
        </div>
        <Skeleton variant="pill" className="h-6 w-20 rounded-full" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
          <Skeleton variant="text" className="h-5 w-16 mb-1" />
          <Skeleton variant="text" className="h-3 w-12" />
        </div>
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
          <Skeleton variant="text" className="h-5 w-16 mb-1" />
          <Skeleton variant="text" className="h-3 w-12" />
        </div>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-2 justify-end">
        <Skeleton variant="button" className="h-9 w-9 rounded-md" />
        <Skeleton variant="button" className="h-9 w-9 rounded-md" />
        <Skeleton variant="button" className="h-9 w-24 rounded-md" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * `FacebookAccountCard` — account card for a connected Facebook Page.
 *
 * Renders the Facebook platform logo, profile picture (or a platform-coloured
 * placeholder when unavailable), page name, `platform: "Facebook"` label,
 * `connectionStatus` badge, fan count from `platformMetadata.pageFanCount` (or
 * "Unavailable"), a connection health indicator, the last sync timestamp, and
 * four action buttons: Reconnect, Disconnect, Refresh, Settings.
 *
 * When `connectionStatus === 'REQUIRES_RECONNECT'`: the Reconnect button is
 * visually highlighted and a contextual error message is shown specifying the
 * reason (token expired / permission revoked).
 *
 * Reuses Veefore's existing Card, Badge, Button, Skeleton, and Tooltip
 * primitives — no new design patterns introduced.
 *
 * Requirements: 4.1, 4.2, 4.5, 4.7
 */
export function FacebookAccountCard({
  account,
  onReconnect,
  onDisconnect,
  onRefresh,
  onSettings,
  isOperationPending = false,
}: FacebookAccountCardProps) {
  const displayName = resolveDisplayName(account);
  const fanCount = resolveFanCount(account);
  const health = resolveHealth(account);
  const needsReconnect =
    account.connectionStatus === 'REQUIRES_RECONNECT' ||
    account.connectionStatus === 'DISCONNECTED';
  const reconnectReason = needsReconnect ? resolveReconnectReason(account) : null;

  const lastSyncLabel = account.lastSyncAt
    ? formatDistanceToNow(new Date(account.lastSyncAt), { addSuffix: true })
    : 'Never';

  return (
    <TooltipProvider>
      <div
        data-testid="facebook-account-card"
        className={`p-4 rounded-xl border transition-colors bg-white dark:bg-gray-800 ${
          needsReconnect
            ? 'border-red-300 dark:border-red-700 ring-1 ring-red-200 dark:ring-red-800'
            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/70'
        }`}
      >
        {/* ------------------------------------------------------------------ */}
        {/* Header: profile picture + page name + status badge                  */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex items-start gap-3 mb-4">
          {/* Avatar with Facebook logo overlay */}
          <div className="relative shrink-0">
            {account.profilePictureUrl ? (
              <img
                src={account.profilePictureUrl}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-xl object-cover ring-2 ring-gray-100 dark:ring-gray-700"
              />
            ) : (
              /* Platform-colored placeholder when no profile picture is available */
              <div
                className="w-12 h-12 rounded-xl bg-[#1877F2]/10 dark:bg-[#1877F2]/20 flex items-center justify-center ring-2 ring-gray-100 dark:ring-gray-700"
                aria-hidden="true"
              >
                <Facebook className="w-7 h-7 text-[#1877F2]" />
              </div>
            )}

            {/* Platform logo badge (bottom-right overlay) */}
            <FacebookLogoIcon className="absolute -bottom-1.5 -right-1.5 w-5 h-5 shadow-sm" />
          </div>

          {/* Name + platform label */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight truncate">
                {displayName}
              </h3>
              {needsReconnect && (
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" aria-label="Requires reconnection" />
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Facebook</p>
          </div>

          {/* Connection status badge */}
          <ConnectionStatusBadge status={account.connectionStatus} />
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Reconnect error banner (shown only when REQUIRES_RECONNECT)          */}
        {/* Requirements: 4.5                                                    */}
        {/* ------------------------------------------------------------------ */}
        {needsReconnect && reconnectReason && (
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-red-700 dark:text-red-400 leading-snug">{reconnectReason}</p>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Stats: fan count + health + last sync                               */}
        {/* ------------------------------------------------------------------ */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Fan count */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200/60 dark:border-gray-700/40">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Users className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Fans
              </p>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">
              {fanCount !== null ? formatCount(fanCount) : (
                <span className="text-sm font-medium text-gray-400 dark:text-gray-500">Unavailable</span>
              )}
            </p>
          </div>

          {/* Connection health + last sync */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200/60 dark:border-gray-700/40">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">
              Health
            </p>
            <HealthIndicator level={health} />
          </div>
        </div>

        {/* Last sync row */}
        <div className="flex items-center gap-1.5 mb-4">
          <Clock className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Last sync: {lastSyncLabel}
          </span>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Action buttons                                                       */}
        {/* Requirements: 4.2                                                    */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex items-center gap-2 justify-end flex-wrap">
          {/* Refresh (force-sync) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onRefresh?.(account)}
                disabled={isOperationPending || needsReconnect}
                aria-label="Refresh sync"
                className="h-9 w-9"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isOperationPending ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh sync</TooltipContent>
          </Tooltip>

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onSettings?.(account)}
                disabled={isOperationPending}
                aria-label="Account settings"
                className="h-9 w-9"
              >
                <Settings className="w-4 h-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>

          {/* Disconnect */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onDisconnect?.(account)}
                disabled={isOperationPending}
                aria-label="Disconnect account"
                className="h-9 w-9 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border-gray-200 dark:border-gray-700"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Disconnect</TooltipContent>
          </Tooltip>

          {/* Reconnect — visually highlighted when required (Requirements: 4.5) */}
          {needsReconnect ? (
            <Button
              onClick={() => onReconnect?.(account)}
              disabled={isOperationPending}
              aria-label="Reconnect account"
              className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-medium gap-1.5"
            >
              <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
              Reconnect
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => onReconnect?.(account)}
                  disabled={isOperationPending}
                  aria-label="Reconnect account"
                  className="h-9 px-3 text-sm gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                  Reconnect
                </Button>
              </TooltipTrigger>
              <TooltipContent>Re-authorise this account</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

export default FacebookAccountCard;
