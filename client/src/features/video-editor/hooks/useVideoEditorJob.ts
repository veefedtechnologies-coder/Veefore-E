/**
 * useVideoEditorJob — tracks a `Video_Edit_Job`'s stage-derived progress via the
 * task 20.2 endpoints:
 *   - `GET  /api/video-editor/jobs/:jobId/stream`  (NDJSON progress stream)
 *   - `GET  /api/video-editor/jobs/:jobId`         (one-shot fallback)
 *   - `POST /api/video-editor/jobs/:jobId/cancel`  (cancel within ~5 s)
 *
 * Progress is derived SOLELY from the server's completed-stage count and is
 * reported as indeterminate (no percentage) whenever the completion state is
 * unknown — the pure {@link interpretJobStatus} enforces that a `null` percent is
 * never replaced by a fabricated value (Req 18.4, 23.2, 23.6). When the stream is
 * unavailable the hook falls back to a single status read so the panel still
 * shows the real state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { streamNdjson, videoEditorRequest } from '../utils/videoEditorApi';
import {
  interpretJobStatus,
  type JobStatusPayload,
  type JobStatusView,
  type JobStreamEvent,
} from '../utils/jobProgress';

export interface UseVideoEditorJobResult {
  /** The job's normalized, stage-derived status (null before the first event). */
  status: JobStatusView | null;
  /** True while the progress stream is open. */
  isStreaming: boolean;
  /** A transport/read error, if any. */
  error: string | null;
  /** Request cancellation of the job within ~5 s (Req 18.5). */
  cancel: () => Promise<void>;
}

/**
 * @param workspaceId Active workspace id (sent as `x-workspace-id`).
 * @param jobId       The job to track (null tracks nothing).
 */
export function useVideoEditorJob(
  workspaceId: string | null,
  jobId: string | null,
): UseVideoEditorJobResult {
  const [status, setStatus] = useState<JobStatusView | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Reset when the tracked job changes.
    setStatus(null);
    setError(null);

    if (!workspaceId || !jobId) return;

    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;
    setIsStreaming(true);

    (async () => {
      try {
        await streamNdjson<JobStreamEvent>({
          path: `/jobs/${encodeURIComponent(jobId)}/stream`,
          workspaceId,
          method: 'GET',
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === 'error') {
              setError(event.code ?? 'JOB_STREAM_ERROR');
              return;
            }
            setStatus(interpretJobStatus(event));
          },
        });
      } catch (err) {
        if (controller.signal.aborted || cancelled) return;
        // Stream unavailable — fall back to a single stage-derived status read so
        // the panel still reflects the real job state (never a fabricated one).
        try {
          const payload = await videoEditorRequest<JobStatusPayload>(
            `/jobs/${encodeURIComponent(jobId)}`,
            workspaceId,
          );
          if (!cancelled) setStatus(interpretJobStatus(payload));
        } catch (readErr) {
          if (!cancelled) {
            setError(readErr instanceof Error ? readErr.message : 'Could not read job status');
          }
        }
      } finally {
        if (!cancelled) setIsStreaming(false);
      }
    })();

    return () => {
      cancelled = true;
      if (!controller.signal.aborted) controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
    };
  }, [workspaceId, jobId]);

  const cancel = useCallback(async () => {
    if (!workspaceId || !jobId) return;
    try {
      const result = await videoEditorRequest<JobStatusPayload>(
        `/jobs/${encodeURIComponent(jobId)}/cancel`,
        workspaceId,
        { method: 'POST' },
      );
      // Reflect the post-cancel state immediately (the stream will confirm). The
      // cancel response carries the authoritative state; progress stays
      // indeterminate here until the stream reports the terminal stage counts.
      if (result?.state) {
        setStatus(interpretJobStatus({ ...result, jobId }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the job');
    }
  }, [workspaceId, jobId]);

  return { status, isStreaming, error, cancel };
}
