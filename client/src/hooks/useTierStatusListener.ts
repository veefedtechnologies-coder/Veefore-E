/**
 * useTierStatusListener — WebSocket Tier Status Listener Hook
 *
 * Listens for real-time tier status events via Socket.IO and maintains
 * per-account tier state for UI consumption. Events consumed:
 *
 *   - `tier-change`        → { accountId, oldTier, newTier, estimatedMinutesToRecover }
 *   - `sync-complete`      → { accountId, postsLoaded }
 *   - `deferred-operation` → { accountId, operation, estimatedRetryMinutes }
 *
 * This hook connects to the same Socket.IO server used by the Instagram webhook
 * listener (path: /ws/metrics). It maintains a local state map of account tier
 * statuses and dispatches CustomEvents so other components can react to changes.
 *
 * Requirements: 4.10, 6.8, 8.6
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher';
import { io, Socket } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Usage tier levels matching server-side UsageTier enum */
export type UsageTier = 'NORMAL' | 'CAUTION' | 'RESTRICTED' | 'CRITICAL';

/** Tier change event payload from the server */
export interface TierChangeEvent {
  accountId: string;
  oldTier: UsageTier;
  newTier: UsageTier;
  estimatedMinutesToRecover: number;
  timestamp?: string;
}

/** Sync complete event payload from the server (backfill finished) */
export interface SyncCompleteEvent {
  accountId: string;
  postsLoaded: number;
  timestamp?: string;
}

/** Deferred operation event payload from the server */
export interface DeferredOperationEvent {
  accountId: string;
  operation: string;
  estimatedRetryMinutes: number;
  timestamp?: string;
}

/** Per-account tier status state */
export interface AccountTierStatus {
  accountId: string;
  currentTier: UsageTier;
  estimatedMinutesToRecover: number;
  lastTierChangeAt: Date | null;
  isSyncing: boolean;
  syncPostsLoaded: number | null;
  lastDeferredOperation: string | null;
  lastDeferredRetryMinutes: number | null;
}

/** Return type of the useTierStatusListener hook */
export interface TierStatusListenerResult {
  /** Map of accountId → current tier status */
  accountStatuses: Map<string, AccountTierStatus>;
  /** Get the tier status for a specific account */
  getAccountStatus: (accountId: string) => AccountTierStatus | null;
  /** Whether the WebSocket connection is active */
  isConnected: boolean;
  /** Most recent tier change event (for global UI indicators) */
  lastTierChange: TierChangeEvent | null;
  /** Most recent sync-complete event */
  lastSyncComplete: SyncCompleteEvent | null;
  /** Most recent deferred-operation event */
  lastDeferredOperation: DeferredOperationEvent | null;
}

// ---------------------------------------------------------------------------
// Custom Event Names (dispatched for other components to consume)
// ---------------------------------------------------------------------------

export const TIER_STATUS_EVENTS = {
  TIER_CHANGE: 'tier-status:tier-change',
  SYNC_COMPLETE: 'tier-status:sync-complete',
  DEFERRED_OPERATION: 'tier-status:deferred-operation',
} as const;

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * Hook that listens for tier status WebSocket events and provides real-time
 * per-account tier information to dashboard components.
 *
 * Usage:
 * ```tsx
 * const { accountStatuses, getAccountStatus, lastTierChange } = useTierStatusListener();
 * const status = getAccountStatus(myAccountId);
 * if (status?.currentTier === 'CRITICAL') {
 *   // Show warning UI
 * }
 * ```
 */
export function useTierStatusListener(): TierStatusListenerResult {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useCurrentWorkspace();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [accountStatuses, setAccountStatuses] = useState<Map<string, AccountTierStatus>>(
    new Map()
  );
  const [lastTierChange, setLastTierChange] = useState<TierChangeEvent | null>(null);
  const [lastSyncComplete, setLastSyncComplete] = useState<SyncCompleteEvent | null>(null);
  const [lastDeferredOperation, setLastDeferredOperation] = useState<DeferredOperationEvent | null>(
    null
  );

  /**
   * Get or create an account's tier status entry.
   */
  const getOrCreateStatus = useCallback(
    (accountId: string, existing: Map<string, AccountTierStatus>): AccountTierStatus => {
      return (
        existing.get(accountId) ?? {
          accountId,
          currentTier: 'NORMAL',
          estimatedMinutesToRecover: 0,
          lastTierChangeAt: null,
          isSyncing: false,
          syncPostsLoaded: null,
          lastDeferredOperation: null,
          lastDeferredRetryMinutes: null,
        }
      );
    },
    []
  );

  /**
   * Handle tier-change event from WebSocket.
   */
  const handleTierChange = useCallback(
    (data: TierChangeEvent) => {
      console.log('[TierStatus] Received tier-change:', data);

      setLastTierChange(data);

      setAccountStatuses((prev) => {
        const next = new Map(prev);
        const status = getOrCreateStatus(data.accountId, next);
        next.set(data.accountId, {
          ...status,
          currentTier: data.newTier,
          estimatedMinutesToRecover: data.estimatedMinutesToRecover,
          lastTierChangeAt: new Date(),
        });
        return next;
      });

      // Dispatch CustomEvent for other components to consume
      window.dispatchEvent(
        new CustomEvent(TIER_STATUS_EVENTS.TIER_CHANGE, { detail: data })
      );

      // Invalidate relevant queries when tier changes so UI reflects current state
      queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] });
    },
    [getOrCreateStatus, queryClient]
  );

  /**
   * Handle sync-complete event from WebSocket (initial backfill finished).
   */
  const handleSyncComplete = useCallback(
    (data: SyncCompleteEvent) => {
      console.log('[TierStatus] Received sync-complete:', data);

      setLastSyncComplete(data);

      setAccountStatuses((prev) => {
        const next = new Map(prev);
        const status = getOrCreateStatus(data.accountId, next);
        next.set(data.accountId, {
          ...status,
          isSyncing: false,
          syncPostsLoaded: data.postsLoaded,
        });
        return next;
      });

      // Dispatch CustomEvent for other components (e.g., dismiss syncing indicator)
      window.dispatchEvent(
        new CustomEvent(TIER_STATUS_EVENTS.SYNC_COMPLETE, { detail: data })
      );

      // Refresh data queries since new posts are now available
      queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] });
      queryClient.invalidateQueries({
        queryKey: ['/api/social-accounts', currentWorkspace?.id],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/analytics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/instagram-content'] });
    },
    [getOrCreateStatus, queryClient, currentWorkspace?.id]
  );

  /**
   * Handle deferred-operation event from WebSocket.
   */
  const handleDeferredOperation = useCallback(
    (data: DeferredOperationEvent) => {
      console.log('[TierStatus] Received deferred-operation:', data);

      setLastDeferredOperation(data);

      setAccountStatuses((prev) => {
        const next = new Map(prev);
        const status = getOrCreateStatus(data.accountId, next);
        next.set(data.accountId, {
          ...status,
          lastDeferredOperation: data.operation,
          lastDeferredRetryMinutes: data.estimatedRetryMinutes,
        });
        return next;
      });

      // Dispatch CustomEvent for other components
      window.dispatchEvent(
        new CustomEvent(TIER_STATUS_EVENTS.DEFERRED_OPERATION, { detail: data })
      );
    },
    [getOrCreateStatus]
  );

  /**
   * Get account status helper (returned to consumers).
   */
  const getAccountStatus = useCallback(
    (accountId: string): AccountTierStatus | null => {
      return accountStatuses.get(accountId) ?? null;
    },
    [accountStatuses]
  );

  // ---------------------------------------------------------------------------
  // Socket.IO Connection
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    // Realtime socket OFF by default — see AUTH_LOAD_AUDIT.md §2B and the matching
    // guard in instagram-webhook-listener. Re-enable with VITE_ENABLE_REALTIME
    // once socket auth is fixed.
    if ((import.meta as any).env?.VITE_ENABLE_REALTIME !== 'true') return;

    const connectSocket = () => {
      try {
        const socketUrl = `${window.location.protocol}//${window.location.host}`;

        console.log('[TierStatus] Connecting to Socket.IO for tier status updates:', socketUrl);

        const socket = io(socketUrl, {
          path: '/ws/metrics',
          transports: ['polling'],
          auth: {
            token: localStorage.getItem('firebase-token') || 'anonymous',
          },
          timeout: 20000,
          forceNew: false, // Reuse existing connection if possible
          upgrade: false,
          rememberUpgrade: false,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 2000,
          reconnectionDelayMax: 30000,
        });

        socket.on('connect', () => {
          console.log('[TierStatus] Connected successfully');
          setIsConnected(true);

          // Join workspace room to receive workspace-scoped events
          socket.emit('join-workspace', { workspaceId: currentWorkspace.id });

          // Also join the global room for cross-workspace tier events
          socket.emit('join-workspace', { workspaceId: 'global' });
        });

        // Listen for tier status events
        socket.on('tier-change', handleTierChange);
        socket.on('sync-complete', handleSyncComplete);
        socket.on('deferred-operation', handleDeferredOperation);

        socket.on('disconnect', (reason) => {
          console.log('[TierStatus] Disconnected:', reason);
          setIsConnected(false);
        });

        socket.on('connect_error', (error) => {
          console.warn('[TierStatus] Connection error:', error.message);
          setIsConnected(false);
        });

        socketRef.current = socket;
      } catch (error) {
        console.error('[TierStatus] Failed to connect:', error);
        setIsConnected(false);
      }
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.off('tier-change', handleTierChange);
        socketRef.current.off('sync-complete', handleSyncComplete);
        socketRef.current.off('deferred-operation', handleDeferredOperation);
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
    };
  }, [currentWorkspace?.id, handleTierChange, handleSyncComplete, handleDeferredOperation]);

  return {
    accountStatuses,
    getAccountStatus,
    isConnected,
    lastTierChange,
    lastSyncComplete,
    lastDeferredOperation,
  };
}

export default useTierStatusListener;
