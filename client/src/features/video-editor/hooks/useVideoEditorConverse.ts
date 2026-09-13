/**
 * useVideoEditorConverse — drives one conversational editing turn at a time over
 * the NDJSON transport (`POST /api/video-editor/projects/:id/converse`).
 *
 * Reuses the VeeGPT streaming model: a single in-flight turn, an `AbortController`
 * wired to a Stop control, and newline-delimited JSON events reduced into a
 * render-ready {@link ConverseTurnState} by the pure {@link reduceConverseEvent}.
 * Each turn runs the server pipeline (Intent_Router → new Version →
 * Editing_Planner → Model_Router → editors) and streams `status`/`progress`/
 * `version`/`plan`/`routing`/`clarification`/`complete`/`error`/`stopped` events;
 * progress is always the stage-derived value the server computes, never
 * timer-interpolated (Req 23.2, 23.6).
 *
 * The turn keeps a lightweight transcript (`turns`) so the edit box can render
 * the user's request alongside the streamed result. On completion the version
 * list is invalidated so the version panel reflects the new immutable version.
 */

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { streamNdjson, videoEditorRequest } from '../utils/videoEditorApi';
import {
  reduceConverseEvent,
  initialConverseTurnState,
  isTerminalPhase,
  type ConverseEvent,
  type ConverseTurnState,
} from '../utils/converseEvents';
import { videoEditorVersionsKey } from './useVideoEditorVersions';

/** A single entry in the conversational transcript. */
export interface ConverseTurn {
  id: string;
  /** The user's turn text. */
  message: string;
  /** The accumulated, streamed result state for this turn. */
  state: ConverseTurnState;
}

export interface SendTurnOptions {
  /** Refine a specific parent version instead of the active one (Req 16.1). */
  parentVersionId?: string | null;
  /** Whether a video is attached to the turn (feeds the hybrid intent gate). */
  hasVideo?: boolean;
  /** Attached source references (ids/urls) for the turn. */
  inputAssets?: string[];
}

export interface UseVideoEditorConverseResult {
  /** The conversational transcript, oldest first. */
  turns: ConverseTurn[];
  /** True while a turn is streaming. */
  isStreaming: boolean;
  /** The current (or most recent) turn's accumulated state, or null. */
  current: ConverseTurnState | null;
  /** A pre-stream/transport error not tied to a specific turn event. */
  error: string | null;
  /** Send a conversational editing turn; resolves when the stream ends. */
  sendTurn: (message: string, options?: SendTurnOptions) => Promise<void>;
  /** Stop the in-flight turn within ~5 s (aborts locally + server-side). */
  stop: () => void;
  /**
   * Confirm a turn's presented credit estimate so the generative operation may
   * proceed (Req 17.7). Notifies the server best-effort; keeps the stream open.
   */
  confirmEstimate: (turnId: string) => void;
  /**
   * Decline a turn's presented credit estimate — cancels the operation with no
   * provider call and no deduction (Req 17.8). Aborts the in-flight turn.
   */
  declineEstimate: (turnId: string) => void;
  /**
   * Mark a turn's estimate as expired after the 300 s confirmation window
   * elapsed — cancels the operation with no provider call (Req 17.8).
   */
  expireEstimate: (turnId: string) => void;
  /** Clear the transcript (does not affect server state). */
  reset: () => void;
}

let turnCounter = 0;
function nextTurnId(): string {
  turnCounter += 1;
  return `turn_${Date.now()}_${turnCounter}`;
}

/**
 * @param workspaceId  Active workspace id (sent as `x-workspace-id`).
 * @param ensureProject Resolve/create the project id to converse against.
 */
export function useVideoEditorConverse(
  workspaceId: string | null,
  ensureProject: () => Promise<string>,
): UseVideoEditorConverseResult {
  const queryClient = useQueryClient();
  const [turns, setTurns] = useState<ConverseTurn[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeProjectRef = useRef<string | null>(null);

  /** Merge an event into a specific turn's state (immutable update). */
  const applyEvent = useCallback((turnId: string, event: ConverseEvent) => {
    setTurns((prev) =>
      prev.map((t) => (t.id === turnId ? { ...t, state: reduceConverseEvent(t.state, event) } : t)),
    );
  }, []);

  const sendTurn = useCallback(
    async (message: string, options: SendTurnOptions = {}): Promise<void> => {
      const text = message.trim();
      if (!text || isStreaming) return;
      if (!workspaceId) {
        setError('An active workspace is required');
        return;
      }

      setError(null);
      const turnId = nextTurnId();
      setTurns((prev) => [...prev, { id: turnId, message: text, state: initialConverseTurnState() }]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const projectId = await ensureProject();
        activeProjectRef.current = projectId;

        await streamNdjson<ConverseEvent>({
          path: `/projects/${encodeURIComponent(projectId)}/converse`,
          workspaceId,
          method: 'POST',
          body: {
            message: text,
            ...(options.parentVersionId ? { parentVersionId: options.parentVersionId } : {}),
            hasVideo: options.hasVideo === true,
            ...(options.inputAssets ? { inputAssets: options.inputAssets } : {}),
          },
          signal: controller.signal,
          onEvent: (event) => {
            // Stamp the credit estimate with its client receipt time so the
            // confirmation UI can drive the 300 s window (Req 17.8). The balance
            // and cost themselves stay server-authoritative (Req 17.6).
            if (event.type === 'estimate' && typeof event.presentedAtMs !== 'number') {
              applyEvent(turnId, { ...event, presentedAtMs: Date.now() });
              return;
            }
            applyEvent(turnId, event);
          },
        });

        // Refresh the version list so the panel shows the version this turn made.
        void queryClient.invalidateQueries({
          queryKey: videoEditorVersionsKey(workspaceId, projectId),
        });
      } catch (err) {
        if (controller.signal.aborted) {
          // A local Stop; the server-side stop is issued in stop().
          applyEvent(turnId, { type: 'stopped' });
        } else {
          const message = err instanceof Error ? err.message : 'The edit could not be started';
          setError(message);
          applyEvent(turnId, { type: 'error', error: message });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [workspaceId, ensureProject, isStreaming, applyEvent, queryClient],
  );

  const stop = useCallback(() => {
    const controller = abortRef.current;
    if (controller && !controller.signal.aborted) controller.abort();
    // Ask the server to abort the in-flight turn too (best-effort, ~5 s, Req 18.5).
    const projectId = activeProjectRef.current;
    if (workspaceId && projectId) {
      void videoEditorRequest(`/projects/${encodeURIComponent(projectId)}/converse/stop`, workspaceId, {
        method: 'POST',
      }).catch(() => {
        /* best-effort — the local abort already halted the stream */
      });
    }
  }, [workspaceId]);

  /**
   * Relay the user's credit-estimate decision to the reducer and, best-effort,
   * to the server (mirrors the `/converse/stop` side-channel). On a decline or
   * timeout the in-flight turn is aborted locally so no provider call proceeds
   * and no credits are deducted (Req 17.8) — the reducer has already recorded
   * the precise `declined`/`expired` status for the transcript.
   */
  const dispatchEstimateDecision = useCallback(
    (turnId: string, decision: 'confirm' | 'decline' | 'timeout') => {
      const eventType =
        decision === 'confirm'
          ? ('estimate_confirmed' as const)
          : decision === 'decline'
            ? ('estimate_declined' as const)
            : ('estimate_expired' as const);
      applyEvent(turnId, { type: eventType });

      const projectId = activeProjectRef.current;
      if (workspaceId && projectId) {
        void videoEditorRequest(
          `/projects/${encodeURIComponent(projectId)}/converse/confirm`,
          workspaceId,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision }),
          },
        ).catch(() => {
          /* best-effort — the local decision already gated the UI */
        });
      }

      // Decline/timeout cancels the operation entirely (Req 17.8): abort the
      // open stream so the turn ends without a provider call. Confirm keeps the
      // stream open so execution can proceed.
      if (decision !== 'confirm') {
        const controller = abortRef.current;
        if (controller && !controller.signal.aborted) controller.abort();
      }
    },
    [applyEvent, workspaceId],
  );

  const confirmEstimate = useCallback(
    (turnId: string) => dispatchEstimateDecision(turnId, 'confirm'),
    [dispatchEstimateDecision],
  );
  const declineEstimate = useCallback(
    (turnId: string) => dispatchEstimateDecision(turnId, 'decline'),
    [dispatchEstimateDecision],
  );
  const expireEstimate = useCallback(
    (turnId: string) => dispatchEstimateDecision(turnId, 'timeout'),
    [dispatchEstimateDecision],
  );

  const reset = useCallback(() => {
    setTurns([]);
    setError(null);
  }, []);

  const current = turns.length > 0 ? turns[turns.length - 1].state : null;
  // Defensive: if the last turn is terminal, we are not streaming.
  const streaming = isStreaming && !(current && isTerminalPhase(current.phase));

  return {
    turns,
    isStreaming: streaming,
    current,
    error,
    sendTurn,
    stop,
    confirmEstimate,
    declineEstimate,
    expireEstimate,
    reset,
  };
}
