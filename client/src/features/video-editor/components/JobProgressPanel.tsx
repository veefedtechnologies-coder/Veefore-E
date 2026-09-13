/**
 * JobProgressPanel — renders a `Video_Edit_Job`'s stage-derived progress
 * (task 23.4, Req 23.2, 23.6).
 *
 * Consumes {@link useVideoEditorJob}, which reads the stage-derived status/stream
 * endpoints from task 20.2. Progress is ALWAYS stage-derived: when the job's
 * completion state is known the panel shows the server's integer percentage; when
 * it is unknown the panel shows an INDETERMINATE indicator and no percentage —
 * never a timer-interpolated or fabricated value (Req 23.2, 23.6).
 */

import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

import { useVideoEditorJob } from '../hooks/useVideoEditorJob';

interface JobProgressPanelProps {
  workspaceId: string | null;
  jobId: string | null;
}

export function JobProgressPanel({ workspaceId, jobId }: JobProgressPanelProps) {
  const { status, isStreaming, error, cancel } = useVideoEditorJob(workspaceId, jobId);

  // No job to track yet — a quiet placeholder keeps the layout stable.
  if (!jobId) {
    return (
      <div
        data-testid="video-editor-progress"
        className="min-h-[6rem] rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center"
      >
        <p className="text-xs text-gray-400 dark:text-gray-500">No active job</p>
      </div>
    );
  }

  const determinate = status?.determinate === true && status?.percent != null;
  const terminal = status?.terminal === true;
  const succeeded = status?.succeeded === true;
  const failed = status?.failed === true;

  return (
    <div
      data-testid="video-editor-progress"
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/40 px-4 py-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {succeeded ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" aria-hidden="true" />
          ) : failed ? (
            <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" aria-hidden="true" />
          ) : (
            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-500" aria-hidden="true" />
          )}
          <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
            {status?.label ?? 'Starting…'}
          </span>
        </div>
        {!terminal && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => void cancel()}
            data-testid="video-editor-job-cancel"
          >
            Cancel
          </Button>
        )}
      </div>

      {/* Progress bar — determinate percentage OR an explicit indeterminate bar. */}
      <div className="mt-3">
        {determinate ? (
          <>
            <Progress value={status?.percent ?? 0} className="h-2" aria-label="Job progress" />
            <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
              <span data-testid="video-editor-job-percent">{status?.percent}%</span>
              {status && status.totalStages > 0 && (
                <span>
                  {status.completedStages}/{status.totalStages} stages
                </span>
              )}
            </div>
          </>
        ) : (
          // Req 23.6 — completion state unknown: show an indeterminate indicator,
          // NEVER a specific percentage.
          <div data-testid="video-editor-job-indeterminate">
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-400/70" />
            </div>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              Working… progress will appear as stages complete
            </p>
          </div>
        )}
      </div>

      {failed && status?.errorCode && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span data-testid="video-editor-job-error">{status.errorCode}</span>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400" data-testid="video-editor-job-stream-error">
          {error}
        </p>
      )}

      {!isStreaming && !terminal && !status && (
        <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Connecting to job…</p>
      )}
    </div>
  );
}

export default JobProgressPanel;
