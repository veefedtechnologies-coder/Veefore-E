/**
 * ConversationalEditBox — the natural-language edit composer + streamed-turn
 * transcript (task 23.4, Req 23.2, 23.6).
 *
 * Renders the conversational transcript produced by {@link useVideoEditorConverse}
 * (each turn's user request + the streamed pipeline result: status, plan,
 * version, routed operations, clarification, or error) and a composer to submit
 * the next turn. Reuses the VeeGPT NDJSON transport indirectly through the hook.
 *
 * Credit-consuming actions are blocked when the workspace context is unavailable
 * (`canConsumeCredits === false`, Req 1.5). The credit-estimate confirmation UI
 * (task 23.5, Req 17.7–17.9) layers on top of this composer: when a turn streams
 * an `estimate` event it enters the `awaiting_confirmation` phase and this
 * component renders {@link CreditEstimateConfirmation} inline in the transcript,
 * requiring explicit confirmation before the generative operation executes.
 */

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { AlertTriangle, ArrowUp, Loader2, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import type { ConverseTurn, UseVideoEditorConverseResult } from '../hooks/useVideoEditorConverse';
import type { VideoEditorAttachedSource } from '../types';
import { CreditEstimateConfirmation } from './CreditEstimateConfirmation';

interface ConversationalEditBoxProps {
  converse: UseVideoEditorConverseResult;
  /** Whether credit-consuming actions are permitted (Req 1.5). */
  canConsumeCredits: boolean;
  /** The single attached source (Req 1.7), used to signal `hasVideo` on a turn. */
  attachedSource: VideoEditorAttachedSource | null;
}

interface TurnViewProps {
  turn: ConverseTurn;
  /** Whether credit-consuming actions are permitted (Req 1.5). */
  canConsumeCredits: boolean;
  /** Confirm this turn's presented credit estimate (Req 17.7). */
  onConfirmEstimate: (turnId: string) => void;
  /** Decline this turn's presented credit estimate (Req 17.8). */
  onDeclineEstimate: (turnId: string) => void;
  /** Mark this turn's estimate expired after the 300 s window (Req 17.8). */
  onExpireEstimate: (turnId: string) => void;
}

/** Render one turn: the user's request plus its streamed result. */
function TurnView({
  turn,
  canConsumeCredits,
  onConfirmEstimate,
  onDeclineEstimate,
  onExpireEstimate,
}: TurnViewProps) {
  const { state } = turn;
  return (
    <div className="flex flex-col gap-2" data-testid="video-editor-turn">
      {/* User request bubble */}
      <div className="self-end max-w-[90%] rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm text-white">
        {turn.message}
      </div>

      {/* Streamed status line */}
      {state.statusText && state.phase === 'streaming' && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          <span>{state.statusText}</span>
          {state.progress != null && <span className="tabular-nums">{state.progress}%</span>}
        </div>
      )}

      {/* Clarification — the turn changed nothing and needs more detail (Req 2.6) */}
      {state.clarification && (
        <div
          data-testid="video-editor-turn-clarification"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
        >
          {state.clarification.reason || 'Could you add a bit more detail about the edit you want?'}
        </div>
      )}

      {/* Plan summary */}
      {state.plan && (
        <div className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-800/50">
          {state.plan.projectGoal && (
            <p className="font-medium text-gray-800 dark:text-gray-100">{state.plan.projectGoal}</p>
          )}
          {state.plan.operations.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 text-gray-600 dark:text-gray-300">
              {state.plan.operations.map((op) => (
                <li key={op.sequenceIndex} className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] text-gray-400">{op.sequenceIndex + 1}.</span>
                  <span className="capitalize">{op.kind.replace(/_/g, ' ')}</span>
                  {op.status && op.status !== 'executable' && (
                    <span className="text-[10px] uppercase text-amber-600 dark:text-amber-400">
                      {op.status}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {state.plan.warnings.length > 0 && (
            <ul className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
              {state.plan.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Routed operations (engine + provider) */}
      {state.routedOperations.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="video-editor-turn-routing">
          {state.routedOperations.map((op) => (
            <div
              key={op.sequenceIndex}
              className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] dark:bg-gray-800/60"
            >
              <span className="capitalize text-gray-700 dark:text-gray-200">
                {op.kind.replace(/_/g, ' ')}
              </span>
              <span className="text-gray-400 dark:text-gray-500">
                {op.engine === 'unavailable'
                  ? `unavailable${op.reason ? ` — ${op.reason}` : ''}`
                  : op.engine === 'generative'
                    ? `${op.provider ?? 'generative'} · ${op.status ?? 'queued'}`
                    : (op.engine ?? op.status ?? 'routed')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Credit-estimate confirmation (task 23.5, Req 17.7–17.9): the
          server-computed estimate is presented and requires explicit
          confirmation before the generative operation executes. */}
      {state.creditEstimate && (
        <CreditEstimateConfirmation
          estimate={state.creditEstimate}
          canConsumeCredits={canConsumeCredits}
          onConfirm={() => onConfirmEstimate(turn.id)}
          onDecline={() => onDeclineEstimate(turn.id)}
          onExpire={() => onExpireEstimate(turn.id)}
        />
      )}

      {/* Completed / no-op outcome */}
      {state.phase === 'complete' && state.outcome === 'not_video_edit' && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          This request isn&apos;t a video edit — try describing a change to your video.
        </p>
      )}

      {/* Stopped */}
      {state.phase === 'stopped' && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Stopped.</p>
      )}

      {/* Error (No-Mock: a real failure surfaces, prior state preserved, Req 23.5) */}
      {state.error && (
        <div
          data-testid="video-editor-turn-error"
          className="flex items-start gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span>{state.error.message || 'The edit could not be completed.'}</span>
        </div>
      )}
    </div>
  );
}

export function ConversationalEditBox({
  converse,
  canConsumeCredits,
  attachedSource,
}: ConversationalEditBoxProps) {
  const { turns, isStreaming, sendTurn, stop, error, confirmEstimate, declineEstimate, expireEstimate } =
    converse;
  const [draft, setDraft] = useState('');

  const disabled = !canConsumeCredits;

  const submit = () => {
    const text = draft.trim();
    if (!text || isStreaming || disabled) return;
    setDraft('');
    void sendTurn(text, {
      hasVideo: !!attachedSource,
      ...(attachedSource?.id ? { inputAssets: [attachedSource.id] } : {}),
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Shift+Enter for a newline (matches the chat composer).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="video-editor-conversation-box">
      {/* Transcript */}
      <div
        className="flex flex-col gap-4 overflow-y-auto"
        data-testid="video-editor-transcript"
        style={{ maxHeight: '40vh' }}
      >
        {turns.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400 dark:text-gray-500">
            Describe the edit you want — for example, &ldquo;trim this to 15 seconds for a Reel&rdquo;.
          </p>
        ) : (
          turns.map((turn) => (
            <TurnView
              key={turn.id}
              turn={turn}
              canConsumeCredits={canConsumeCredits}
              onConfirmEstimate={confirmEstimate}
              onDeclineEstimate={declineEstimate}
              onExpireEstimate={expireEstimate}
            />
          ))
        )}
      </div>

      {error && !isStreaming && (
        <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="video-editor-conversation-error">
          {error}
        </p>
      )}

      {/*
        The credit-estimate confirmation UI (task 23.5, Req 17.7–17.9) is rendered
        per-turn inside the transcript above (see TurnView →
        CreditEstimateConfirmation): when a turn streams a server-computed
        `estimate` it presents the figure and requires confirmation before the
        generative operation executes. This composer additionally gates on
        `canConsumeCredits` (Req 1.5).
      */}

      {/* Composer */}
      <form onSubmit={onSubmit} className="mt-auto">
        <div
          data-testid="video-editor-composer"
          aria-disabled={disabled}
          className="flex items-end gap-2 rounded-3xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled || isStreaming}
            rows={1}
            placeholder={
              disabled ? 'Editing paused — workspace context unavailable' : 'Describe an edit…'
            }
            aria-label="Describe an edit"
            data-testid="video-editor-composer-input"
            className="min-h-[40px] max-h-32 resize-none border-0 bg-transparent p-1 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {isStreaming ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9 w-9 flex-shrink-0 rounded-full p-0"
              onClick={stop}
              aria-label="Stop"
              data-testid="video-editor-composer-stop"
            >
              <Square className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="sm"
              className="h-9 w-9 flex-shrink-0 rounded-full p-0"
              disabled={disabled || draft.trim().length === 0}
              aria-label="Send"
              data-testid="video-editor-composer-send"
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

export default ConversationalEditBox;
