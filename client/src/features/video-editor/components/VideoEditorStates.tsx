/**
 * VideoEditorStates — non-editor UI states for the Video Editor surface.
 *
 * These cover the workspace-context gate (Requirements 1.5, 1.6): a blocking
 * "no active workspace" error (editor not opened) and a non-blocking
 * "workspace context unavailable" banner (editor opens, credit-consuming actions
 * blocked). Kept presentational so they are easy to unit-test.
 */

import { AlertTriangle, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shown when no active workspace is associated with the session. Per Req 1.6 the
 * editor is NOT opened; this replaces the editor surface entirely.
 */
export function VideoEditorNoWorkspace() {
  return (
    <div
      role="alert"
      data-testid="video-editor-no-workspace"
      className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
        <Building2 className="h-7 w-7" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        An active workspace is required
      </h1>
      <p className="mt-1 max-w-md text-sm text-gray-600 dark:text-gray-400">
        The Video Editor works inside a workspace. Select or create a workspace to start editing.
      </p>
      <div className="mt-6">
        <Button
          onClick={() => {
            window.location.href = '/';
          }}
        >
          Go to workspaces
        </Button>
      </div>
    </div>
  );
}

/**
 * Inline banner shown when the subscription tier, credit balance, or brand
 * profile could not be retrieved (Req 1.5). The editor stays open and the
 * VeeGPT session is not terminated, but credit-consuming actions are blocked.
 */
export function VideoEditorContextUnavailable() {
  return (
    <div
      role="alert"
      data-testid="video-editor-context-unavailable"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-900/20"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Workspace context unavailable
          </p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
            We couldn&apos;t load your subscription, credit balance, or brand profile. Editing
            actions that consume credits are paused until it&apos;s available.
          </p>
        </div>
      </div>
    </div>
  );
}
