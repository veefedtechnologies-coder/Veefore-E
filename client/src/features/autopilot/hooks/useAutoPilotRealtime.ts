/**
 * useAutoPilotRealtime
 *
 * Subscribes the Mission Control view to the workspace-scoped Auto Pilot live
 * channel. The server's {@link AutoPilotChatBridge} broadcasts every narration
 * and Approval_Card over `RealtimeService.broadcastToWorkspace(workspaceId,
 * 'autopilot_message', …)` (Task 19.1) on the Socket.IO server mounted at
 * `/ws/metrics`. This hook opens an authenticated Socket.IO connection, joins
 * the workspace room, and invokes `onMessage` whenever an `autopilot_message`
 * event arrives so the caller can refetch/invalidate the relevant queries and
 * reflect progress + approvals within seconds (R16.5).
 *
 * The connection is best-effort: if the socket cannot connect the dashboard
 * still works via its react-query polling fallback. The Socket.IO factory and
 * token getter are injectable so the hook is unit-testable without a live
 * socket server or Firebase.
 *
 * Requirements: 16.5
 */

import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'

/** The live event the server broadcasts for Auto Pilot narration/cards. */
export const AUTOPILOT_CHAT_EVENT = 'autopilot_message'

/** Socket.IO server path (mirrors `RealtimeService.initialize`). */
const SOCKET_PATH = '/ws/metrics'

/** Minimal Socket.IO surface this hook relies on (keeps tests light). */
export interface RealtimeSocket {
  on(event: string, listener: (payload: unknown) => void): unknown
  off(event: string, listener?: (payload: unknown) => void): unknown
  emit(event: string, ...args: unknown[]): unknown
  disconnect(): unknown
}

/** Factory that opens a socket given an auth token; injectable for tests. */
export type SocketFactory = (token: string) => RealtimeSocket

export interface UseAutoPilotRealtimeOptions {
  /** Workspace whose Auto Pilot channel to subscribe to. */
  workspaceId?: string | null
  /** Called on every `autopilot_message` broadcast for this workspace. */
  onMessage: (payload: unknown) => void
  /** Turn the subscription off (e.g. when no mission is selected). */
  enabled?: boolean
  /** Resolve the auth token (defaults to the Firebase ID token). */
  getToken?: () => Promise<string | null>
  /** Socket factory (defaults to a real Socket.IO client). */
  socketFactory?: SocketFactory
}

/** Default token getter — the Firebase ID token used for all authed requests. */
async function defaultGetToken(): Promise<string | null> {
  try {
    const { getAuth } = await import('firebase/auth')
    const user = getAuth().currentUser
    return user ? await user.getIdToken() : null
  } catch {
    return null
  }
}

/** Default factory — a real Socket.IO client against the metrics socket server. */
const defaultSocketFactory: SocketFactory = (token) =>
  io({
    path: SOCKET_PATH,
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: true,
  }) as unknown as RealtimeSocket

/**
 * Open (and tear down) a workspace-scoped Auto Pilot live subscription. The
 * `onMessage` callback is kept in a ref so re-renders don't churn the socket;
 * the connection is re-established only when `workspaceId`/`enabled` change.
 */
export function useAutoPilotRealtime({
  workspaceId,
  onMessage,
  enabled = true,
  getToken = defaultGetToken,
  socketFactory = defaultSocketFactory,
}: UseAutoPilotRealtimeOptions): void {
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!enabled || !workspaceId) return

    let socket: RealtimeSocket | null = null
    let cancelled = false

    const handler = (payload: unknown) => {
      onMessageRef.current(payload)
    }

    void (async () => {
      const token = await getToken()
      if (cancelled || !token) return

      socket = socketFactory(token)
      // Join the workspace room once connected (and again on any reconnect) so
      // broadcasts scoped to `workspace:<id>` reach this client.
      const join = () => socket?.emit('join-workspace', { workspaceId })
      socket.on('connect', join)
      join()
      socket.on(AUTOPILOT_CHAT_EVENT, handler)
    })()

    return () => {
      cancelled = true
      if (socket) {
        socket.off(AUTOPILOT_CHAT_EVENT, handler)
        socket.disconnect()
      }
    }
  }, [workspaceId, enabled, getToken, socketFactory])
}
