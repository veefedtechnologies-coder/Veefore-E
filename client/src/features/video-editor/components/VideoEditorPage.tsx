import React, { useMemo } from 'react';

import { VideoEditorSkeleton } from '@/components/skeletons/pages/VideoEditorSkeleton';

import { useVideoEditorContext } from '../hooks/useVideoEditorContext';
import { useVideoEditorProject } from '../hooks/useVideoEditorProject';
import { useVideoEditorConverse } from '../hooks/useVideoEditorConverse';
import { useVideoEditorSource } from '../hooks/useVideoEditorSource';
import type { VideoEditorAttachedSource } from '../types';
import { VideoEditorNoWorkspace, VideoEditorContextUnavailable } from './VideoEditorStates';
import { ConversationalEditBox } from './ConversationalEditBox';
import { JobProgressPanel } from './JobProgressPanel';
import { SourceUploadPanel } from './SourceUploadPanel';
import { VersionPanel } from './VersionPanel';
import { VideoPreview } from './VideoPreview';

/**
 * VideoEditorPage — the Video Editor surface (veefore-ai-video-editor).
 *
 * Registered at the `/video-editor` route (`AuthenticatedApp.tsx`), delivered
 * inside the VeeGPT experience and reusing the existing sidebar shell + design
 * system.
 *
 * Task 23.3 loads the active workspace context (subscription tier + credit
 * balance + brand profile) via {@link useVideoEditorContext} and enforces the
 * workspace-context gate (Req 1.4–1.7).
 *
 * Task 23.4 fills the interactive seams:
 *   - Conversational edit box (posts to the `/converse` NDJSON endpoint and
 *     renders the streamed pipeline events) — {@link ConversationalEditBox} +
 *     {@link useVideoEditorConverse}.
 *   - Job/progress panel (stage-derived status/stream from task 20.2, always
 *     stage-derived/indeterminate, never timer-interpolated) — {@link JobProgressPanel}.
 *   - Version panel (list/restore via the task 19.4 endpoints) — {@link VersionPanel}.
 *   - Signed-URL preview — {@link VideoPreview}.
 *
 * Task 23.5 fills the credit-estimate confirmation UI (Req 17.7–17.9): when a
 * turn streams a server-computed `estimate`, the edit box presents it and
 * requires explicit confirmation before the generative operation executes.
 * Credit-consuming actions remain gated on `gate.canConsumeCredits` (Req 1.5).
 */
function VideoEditorPageImpl() {
  const { gate, context, attachedSource } = useVideoEditorContext();

  // The editor operates against a single project (resolved/created lazily on the
  // first turn). The conversational box, job panel, and version panel are scoped
  // to it. No project is created just by opening the editor.
  const { project, ensureProject } = useVideoEditorProject(context.workspaceId, {
    suggestedName: context.brandProfile?.name
      ? `${context.brandProfile.name} video edit`
      : 'Untitled video edit',
  });

  const converse = useVideoEditorConverse(context.workspaceId, ensureProject);

  // Source ingestion: lets the user attach a video so the project has an
  // analyzable source (durationMs > 0) the /converse gate requires.
  const source = useVideoEditorSource(context.workspaceId, ensureProject);

  // The effective source the editor operates against: a just-uploaded source
  // takes precedence over the VeeGPT handoff (Req 1.7); otherwise fall back to
  // the attached-source query-string handoff.
  const effectiveSource = useMemo<VideoEditorAttachedSource | null>(() => {
    if (source.source) return { id: source.source.sourceId };
    return attachedSource;
  }, [source.source, attachedSource]);

  // The job the progress panel tracks: the newest job spawned by the latest turn.
  const activeJobId = useMemo(() => {
    const jobIds = converse.current?.jobIds ?? [];
    return jobIds.length > 0 ? jobIds[jobIds.length - 1] : null;
  }, [converse.current]);

  // While the workspace context resolves, mirror the route skeleton so there is
  // zero layout shift and the surface stays interactive within 3 s (Req 1.2).
  if (gate.status === 'loading') {
    return <VideoEditorSkeleton />;
  }

  // Req 1.6 — an active workspace is required; do not open the editor.
  if (gate.status === 'no-workspace') {
    return <VideoEditorNoWorkspace />;
  }

  const creditsGated = !gate.canConsumeCredits;

  return (
    <div
      data-testid="video-editor-page"
      className="flex-1 flex flex-col px-6 py-6 gap-6 lg:flex-row"
    >
      {/* Preview + version panels. */}
      <section
        data-testid="video-editor-preview"
        aria-label="Video preview and versions"
        className="flex-1 flex flex-col gap-4 min-w-0"
      >
        <VideoPreview
          workspaceId={context.workspaceId}
          artifactId={null}
          attachedSource={effectiveSource}
        />

        {/* Upload affordance (task 7.3 client seam): shown until a source is
            attached — either uploaded here or handed off from VeeGPT (Req 1.7).
            Gated on `canConsumeCredits` the same way the composer is (Req 1.5). */}
        {!effectiveSource && (
          <SourceUploadPanel source={source} canConsumeCredits={gate.canConsumeCredits} />
        )}

        <VersionPanel workspaceId={context.workspaceId} projectId={project?.projectId ?? null} />
      </section>

      {/* Conversational editing + job/progress. */}
      <aside
        data-testid="video-editor-conversation"
        aria-label="Conversational editing"
        className="w-full lg:max-w-sm flex flex-col gap-4"
      >
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Video Editor</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Describe the edit you want and Veefore will handle the rest.
          </p>
        </div>

        {/* Workspace context strip — applies the active subscription tier and
            credit balance (Req 1.4). Rendered only when context is available. */}
        {gate.contextAvailable && (
          <div
            data-testid="video-editor-context"
            className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/40 px-3 py-2 text-xs text-gray-600 dark:text-gray-300"
          >
            <span className="truncate" title={context.brandProfile?.name ?? undefined}>
              {context.brandProfile?.name ?? 'Workspace'}
            </span>
            <span className="flex items-center gap-2">
              {context.subscriptionTier && (
                <span className="capitalize font-medium text-gray-700 dark:text-gray-200">
                  {context.subscriptionTier}
                </span>
              )}
              {context.creditBalance != null && (
                <span data-testid="video-editor-credit-balance">
                  {new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
                    Math.max(0, context.creditBalance),
                  )}{' '}
                  credits
                </span>
              )}
            </span>
          </div>
        )}

        {/* Gating banner (task 23.3, Req 1.5): shown when the workspace context
            could not be retrieved. Credit-consuming actions are blocked. */}
        {creditsGated && !gate.contextResolving && <VideoEditorContextUnavailable />}

        {/* Job/progress panel (task 23.4, Req 23.2, 23.6). */}
        <JobProgressPanel workspaceId={context.workspaceId} jobId={activeJobId} />

        {/* Conversational edit box (task 23.4) with the credit-estimate
            confirmation UI (task 23.5) layered in per-turn; the composer gates
            on `canConsumeCredits` (Req 1.5). */}
        <div className="flex-1 flex flex-col min-h-0">
          <ConversationalEditBox
            converse={converse}
            canConsumeCredits={gate.canConsumeCredits}
            attachedSource={effectiveSource}
          />
        </div>
      </aside>
    </div>
  );
}

export const VideoEditorPage = React.memo(VideoEditorPageImpl);
VideoEditorPage.displayName = 'VideoEditorPage';

export default VideoEditorPage;
