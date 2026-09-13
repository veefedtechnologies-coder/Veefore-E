/**
 * useVideoEditorProject — resolves (or lazily creates) the active `Video_Project`
 * the editor operates against.
 *
 * The conversational edit box, job/progress panel, and version panel are all
 * scoped to a single project, so the editor needs one before it can call the
 * `/converse`, `/jobs`, or `/versions` endpoints. Rather than create a project as
 * a side effect of opening the editor, this hook:
 *   - loads the workspace's projects (newest first) via React Query, and
 *   - exposes {@link ensureProject}, which returns the most-recent project's id
 *     or creates one on demand (used when the user submits their first turn).
 *
 * All ownership/workspace scoping is server-authoritative; the active workspace
 * is passed via the `x-workspace-id` header (Req 19.5). No project is created
 * until the user actually acts, so merely opening the editor mutates nothing.
 */

import { useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { videoEditorRequest } from '../utils/videoEditorApi';
import type { VideoEditorProject } from '../types';

/** React Query key for the workspace's Video Editor project list. */
export function videoEditorProjectsKey(workspaceId: string | null) {
  return ['video-editor', 'projects', workspaceId] as const;
}

export interface UseVideoEditorProjectResult {
  /** The most-recent project for the workspace, or null when none exists yet. */
  project: VideoEditorProject | null;
  /** All of the workspace's projects, newest first. */
  projects: VideoEditorProject[];
  isLoading: boolean;
  error: Error | null;
  /**
   * Return the active project's id, creating a project on demand when none
   * exists. Safe to call repeatedly — an in-flight creation is de-duplicated so
   * concurrent turns can never create two projects.
   */
  ensureProject: () => Promise<string>;
}

/**
 * @param workspaceId Active workspace id (null disables the query + creation).
 * @param options.suggestedName Name used when a project must be created.
 * @param options.targetPlatform Optional platform preset for a created project.
 */
export function useVideoEditorProject(
  workspaceId: string | null,
  options: { suggestedName?: string; targetPlatform?: string } = {},
): UseVideoEditorProjectResult {
  const queryClient = useQueryClient();
  const creatingRef = useRef<Promise<string> | null>(null);

  const query = useQuery({
    queryKey: videoEditorProjectsKey(workspaceId),
    enabled: !!workspaceId,
    queryFn: () => videoEditorRequest<VideoEditorProject[]>('/projects', workspaceId as string),
    staleTime: 1000 * 30,
  });

  const projects = useMemo(() => query.data ?? [], [query.data]);
  const project = projects.length > 0 ? projects[0] : null;

  const ensureProject = useCallback(async (): Promise<string> => {
    if (!workspaceId) throw new Error('An active workspace is required');

    // Prefer an existing project.
    const existing = queryClient.getQueryData<VideoEditorProject[]>(
      videoEditorProjectsKey(workspaceId),
    );
    if (existing && existing.length > 0) return existing[0].projectId;
    if (project) return project.projectId;

    // De-duplicate concurrent creations (two turns firing at once).
    if (creatingRef.current) return creatingRef.current;

    const create = (async () => {
      const created = await videoEditorRequest<VideoEditorProject>('/projects', workspaceId, {
        method: 'POST',
        body: JSON.stringify({
          name: options.suggestedName?.trim() || 'Untitled video edit',
          ...(options.targetPlatform ? { targetPlatform: options.targetPlatform } : {}),
        }),
      });
      // Seed the cache so subsequent reads see the new project immediately.
      queryClient.setQueryData<VideoEditorProject[]>(
        videoEditorProjectsKey(workspaceId),
        (old) => [created, ...(old ?? [])],
      );
      return created.projectId;
    })();

    creatingRef.current = create;
    try {
      return await create;
    } finally {
      creatingRef.current = null;
    }
  }, [workspaceId, queryClient, project, options.suggestedName, options.targetPlatform]);

  return {
    project,
    projects,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    ensureProject,
  };
}
