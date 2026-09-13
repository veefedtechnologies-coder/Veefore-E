/**
 * useVideoEditorVersions — lists, creates, and restores the immutable
 * `Video_Version` history for a project (task 19.4 endpoints):
 *   - `GET  /api/video-editor/projects/:id/versions`
 *   - `POST /api/video-editor/projects/:id/versions/:versionId/restore`
 *
 * Versions are append-only and immutable; restoring makes a prior version active
 * without deleting any other (Req 16.4–16.8). This hook is a thin React Query
 * wrapper — every rule is enforced server-side — that exposes the ordered history
 * plus the active-version pointer, and a `restore` mutation that refreshes the
 * list on success.
 */

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { videoEditorRequest } from '../utils/videoEditorApi';
import type { VideoEditorVersion, VideoEditorVersionsResponse } from '../types';

/** React Query key for a project's version history. */
export function videoEditorVersionsKey(workspaceId: string | null, projectId: string | null) {
  return ['video-editor', 'versions', workspaceId, projectId] as const;
}

export interface UseVideoEditorVersionsResult {
  versions: VideoEditorVersion[];
  activeVersionId: string | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  /** Restore a prior version as active (Req 16.7). */
  restore: (versionId: string) => Promise<void>;
  isRestoring: boolean;
}

/**
 * @param workspaceId Active workspace id (sent as `x-workspace-id`).
 * @param projectId   The project whose versions to load (null disables the query).
 */
export function useVideoEditorVersions(
  workspaceId: string | null,
  projectId: string | null,
): UseVideoEditorVersionsResult {
  const queryClient = useQueryClient();
  const enabled = !!workspaceId && !!projectId;

  const query = useQuery({
    queryKey: videoEditorVersionsKey(workspaceId, projectId),
    enabled,
    queryFn: () =>
      videoEditorRequest<VideoEditorVersionsResponse>(
        `/projects/${encodeURIComponent(projectId as string)}/versions`,
        workspaceId as string,
      ),
    staleTime: 1000 * 15,
  });

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) =>
      videoEditorRequest<{ projectId: string; activeVersionId: string }>(
        `/projects/${encodeURIComponent(projectId as string)}/versions/${encodeURIComponent(versionId)}/restore`,
        workspaceId as string,
        { method: 'POST' },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: videoEditorVersionsKey(workspaceId, projectId),
      });
    },
  });

  const restore = useCallback(
    async (versionId: string) => {
      if (!enabled) return;
      await restoreMutation.mutateAsync(versionId);
    },
    [enabled, restoreMutation],
  );

  const refetch = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    versions: query.data?.versions ?? [],
    activeVersionId: query.data?.activeVersionId ?? null,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    refetch,
    restore,
    isRestoring: restoreMutation.isPending,
  };
}
