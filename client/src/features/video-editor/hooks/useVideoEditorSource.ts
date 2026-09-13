/**
 * useVideoEditorSource — attach a video source to the editor's project.
 *
 * The conversational `/converse` route can only edit a project that already has
 * an analyzable `Video_Source` (`durationMs > 0`). This hook provides the client
 * affordance that creates one:
 *   - {@link uploadSource} ensures a project exists (reusing
 *     `useVideoEditorProject.ensureProject`), then POSTs the picked file as
 *     multipart form-data to `POST /api/video-editor/projects/:id/sources` via
 *     {@link videoEditorUpload} (Firebase bearer + `x-workspace-id`, Req 19.5).
 *
 * All validation/ownership/probing is server-authoritative; this hook only
 * uploads the bytes and surfaces the resulting source (or the server's error
 * code, e.g. `SOURCE_INGESTION_REJECTED` / `SOURCE_PROBE_FAILED`). The freshly
 * ingested source is held in local state so the preview + subsequent turns use
 * it, taking precedence over any attached-source handoff.
 */

import { useCallback, useState } from 'react';

import { videoEditorUpload } from '../utils/videoEditorApi';
import type { VideoEditorIngestedSource } from '../types';

export interface UseVideoEditorSourceResult {
  /** The most recently ingested source for this session, or null. */
  source: VideoEditorIngestedSource | null;
  /** True while an upload + probe is in flight. */
  isUploading: boolean;
  /** The last upload error message (with the server error code when present). */
  error: string | null;
  /** Upload a picked file, ensuring a project first. Resolves to the ingested source. */
  uploadSource: (file: File) => Promise<VideoEditorIngestedSource>;
  /** Clear the current error (e.g. before retrying). */
  clearError: () => void;
}

/**
 * @param workspaceId Active workspace id (null blocks uploads).
 * @param ensureProject Resolves (creating on demand) the project id to attach to.
 */
export function useVideoEditorSource(
  workspaceId: string | null,
  ensureProject: () => Promise<string>,
): UseVideoEditorSourceResult {
  const [source, setSource] = useState<VideoEditorIngestedSource | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const uploadSource = useCallback(
    async (file: File): Promise<VideoEditorIngestedSource> => {
      if (!workspaceId) throw new Error('An active workspace is required');
      setIsUploading(true);
      setError(null);
      try {
        const projectId = await ensureProject();
        const form = new FormData();
        form.append('file', file, file.name);

        const ingested = await videoEditorUpload<VideoEditorIngestedSource>({
          path: `/projects/${projectId}/sources`,
          workspaceId,
          body: form,
        });
        setSource(ingested);
        return ingested;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'The video could not be uploaded';
        setError(message);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [workspaceId, ensureProject],
  );

  return { source, isUploading, error, uploadSource, clearError };
}
