/**
 * VersionPanel — lists a project's immutable `Video_Version` history and lets the
 * user restore a prior version (task 23.4, task 19.4 endpoints).
 *
 * Consumes {@link useVideoEditorVersions}. Versions are append-only and immutable;
 * restoring makes a prior version active without deleting any other (Req 16.4–16.8),
 * all enforced server-side. The active version is marked; each other version
 * offers a Restore action.
 */

import { History, RotateCcw, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { useVideoEditorVersions } from '../hooks/useVideoEditorVersions';

interface VersionPanelProps {
  workspaceId: string | null;
  projectId: string | null;
}

/** Format an epoch-millis timestamp as a short, locale-aware label. */
function formatCreatedAt(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return '';
  }
}

export function VersionPanel({ workspaceId, projectId }: VersionPanelProps) {
  const { versions, activeVersionId, isLoading, error, restore, isRestoring } =
    useVideoEditorVersions(workspaceId, projectId);

  return (
    <div
      data-testid="video-editor-versions"
      aria-label="Version history"
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/40 p-3"
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        Versions
      </div>

      {!projectId ? (
        <p className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">
          Your edit versions will appear here.
        </p>
      ) : isLoading ? (
        <p className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">Loading versions…</p>
      ) : error ? (
        <p className="py-4 text-center text-xs text-amber-600 dark:text-amber-400">
          Couldn&apos;t load versions.
        </p>
      ) : versions.length === 0 ? (
        <p className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">
          No versions yet. Describe an edit to create the first one.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="video-editor-version-list">
          {versions.map((version, index) => {
            const isActive = version.versionId === activeVersionId;
            const label = version.label || `Version ${index + 1}`;
            const created = formatCreatedAt(version.createdAt);
            return (
              <li
                key={version.versionId}
                data-testid="video-editor-version-item"
                data-active={isActive}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                  isActive
                    ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-gray-800 dark:text-gray-100" title={label}>
                      {label}
                    </span>
                    {isActive && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        <Check className="h-2.5 w-2.5" aria-hidden="true" /> Active
                      </span>
                    )}
                  </div>
                  {created && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">{created}</span>
                  )}
                </div>
                {!isActive && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 flex-shrink-0 gap-1 px-2 text-[11px]"
                    disabled={isRestoring}
                    onClick={() => void restore(version.versionId)}
                    data-testid="video-editor-version-restore"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    Restore
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default VersionPanel;
