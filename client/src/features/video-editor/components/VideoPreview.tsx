/**
 * VideoPreview — plays the active artifact via a short-lived signed URL, or shows
 * a live/idle placeholder surface (task 23.4).
 *
 * Artifact bytes are only ever delivered through the signed-URL endpoint
 * (Req 19.3); {@link useSignedArtifactUrl} resolves the link for the active
 * workspace and refreshes it before it lapses. This component is purely
 * presentational around that hook — it never fetches or interprets progress.
 *
 * WHY the four distinct states: a flat "your video will preview here" rectangle
 * made a working card look dead. The frame now always says something true about
 * where the edit is:
 *   1. working (no artifact yet) → the shared animated dot-grid surface in its
 *      `video` variant (a playhead scrubbing the frame) with the live stage text,
 *   2. idle (a source is attached, nothing running) → the SAME grid, static and
 *      dimmed, so an idle card is unmistakably different from a working one,
 *   3. resolving a signed URL → a shimmer skeleton inside the same frame,
 *   4. artifact ready → the `<video>` player with a blur-to-sharp reveal,
 *   plus an honest inline notice when the signed URL could not be resolved.
 *
 * Borderless rounded frame, blue accent, dark-mode aware — visually consistent
 * with the image card.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { GenerativeDotGridSurface } from '@/features/chat/components/GenerativeDotGridSurface';

import { useSignedArtifactUrl } from '../hooks/useSignedArtifactUrl';
import type { VideoEditorAttachedSource } from '../types';

interface VideoPreviewProps {
  workspaceId: string | null;
  /** Artifact id of the active/rendered output, when available. */
  artifactId: string | null;
  attachedSource: VideoEditorAttachedSource | null;
  /**
   * True while the server is driving an edit for this card. Drives the animated
   * surface; when false the grid renders static so idle reads as idle.
   */
  working?: boolean;
  /** Live stage/status text to overlay while working (server text wins upstream). */
  stageText?: string;
  /**
   * Stage-derived percent. INTENTIONALLY NOT DISPLAYED — the card no longer shows
   * a progress bar or a percentage anywhere. Kept on the prop contract because the
   * server still streams it and other callers may pass it.
   */
  percent?: number;
}

export function VideoPreview({
  workspaceId,
  artifactId,
  attachedSource,
  working = false,
  stageText,
}: VideoPreviewProps) {
  const { url, isLoading, error } = useSignedArtifactUrl(workspaceId, artifactId);
  const [loaded, setLoaded] = useState(false);

  // A refreshed signed URL remounts the player, so the reveal must re-arm too.
  useEffect(() => {
    setLoaded(false);
  }, [url]);

  const hasVideo = !!artifactId && !!url;

  return (
    <div
      data-testid="video-editor-preview-surface"
      aria-busy={working && !hasVideo ? true : undefined}
      className={`relative w-full aspect-video overflow-hidden rounded-2xl shadow-sm ${
        hasVideo ? 'bg-black' : 'bg-gray-100 dark:bg-slate-800/60'
      }`}
    >
      {hasVideo ? (
        <video
          key={url}
          src={url ?? undefined}
          controls
          playsInline
          onLoadedData={() => setLoaded(true)}
          // Belt-and-braces: never leave the player stuck invisible if
          // `loadeddata` does not arrive (slow metadata, or a decode failure).
          onCanPlay={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          className={`h-full w-full rounded-2xl object-contain transition-all duration-700 ease-out ${
            loaded ? 'blur-0 opacity-100' : 'blur-md opacity-0'
          }`}
          data-testid="video-editor-preview-video"
        />
      ) : artifactId && isLoading ? (
        // Resolving the signed URL: a skeleton in the same frame, so the layout
        // never jumps between "loading" and "playing".
        <div className="absolute inset-0">
          <div className="veegpt-vid-skeleton absolute inset-0" aria-hidden="true" />
          <p
            role="status"
            aria-live="polite"
            className="absolute left-4 top-4 text-[13px] font-medium text-gray-500 dark:text-gray-300"
          >
            Loading preview…
          </p>
        </div>
      ) : artifactId && error ? (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Preview unavailable right now.
          </div>
        </div>
      ) : working ? (
        // The main live state: the playhead sweep + the real streamed stage text.
        <GenerativeDotGridSurface
          variant="video"
          stageText={stageText || 'Working on your video…'}
        />
      ) : (
        // Idle: same grid, static and dimmed, with context-aware copy.
        <GenerativeDotGridSurface variant="video" animate={false}>
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <p className="max-w-[80%] text-center text-sm text-gray-500 dark:text-gray-400">
              {attachedSource
                ? 'Your attached video is ready to edit. Describe an edit to get started.'
                : 'Your edited video will preview here.'}
            </p>
          </div>
        </GenerativeDotGridSurface>
      )}
    </div>
  );
}

export default VideoPreview;
