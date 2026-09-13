/**
 * useSignedArtifactUrl — resolves a short-lived signed URL for a `Video_Artifact`
 * so the preview can play it (`GET /api/video-editor/artifacts/:artifactId/signed-url`).
 *
 * Artifact bytes are ONLY ever delivered through these short-lived signed URLs,
 * never a permanent public path (Req 19.3). The link's TTL is ≤3600 s, so the
 * query refetches before it lapses. All access control is server-authoritative;
 * this hook just requests the link for the active workspace.
 */

import { useQuery } from '@tanstack/react-query';

import { videoEditorRequest } from '../utils/videoEditorApi';

interface SignedUrlResponse {
  artifactId: string;
  url: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface UseSignedArtifactUrlResult {
  url: string | null;
  expiresAt: string | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * @param workspaceId Active workspace id (sent as `x-workspace-id`).
 * @param artifactId  The artifact to preview (null resolves nothing).
 */
export function useSignedArtifactUrl(
  workspaceId: string | null,
  artifactId: string | null,
): UseSignedArtifactUrlResult {
  const enabled = !!workspaceId && !!artifactId;

  const query = useQuery({
    queryKey: ['video-editor', 'signed-url', workspaceId, artifactId],
    enabled,
    queryFn: () =>
      videoEditorRequest<SignedUrlResponse>(
        `/artifacts/${encodeURIComponent(artifactId as string)}/signed-url`,
        workspaceId as string,
      ),
    // Refetch well before the ≤3600 s link expires so the preview never breaks.
    staleTime: 1000 * 60 * 30,
    refetchInterval: 1000 * 60 * 45,
  });

  return {
    url: query.data?.url ?? null,
    expiresAt: query.data?.expiresAt ?? null,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}
