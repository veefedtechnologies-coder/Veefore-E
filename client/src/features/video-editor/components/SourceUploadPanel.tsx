/**
 * SourceUploadPanel — the upload affordance that attaches a video to the editor
 * (task 7.3 client seam, Req 3.2, 1.7).
 *
 * Shown when the editor has no attached source yet. Offers a drag-and-drop zone
 * and a file-picker button; on selection it delegates to
 * {@link UseVideoEditorSourceResult.uploadSource}, which ensures a project and
 * POSTs the file to `POST /api/video-editor/projects/:id/sources`. All
 * validation/probing is server-authoritative — this component only picks bytes
 * and surfaces the resulting source or the server's error (e.g.
 * `SOURCE_INGESTION_REJECTED` / `SOURCE_PROBE_FAILED`).
 *
 * The control is gated the same way the composer is (Req 1.5): when
 * `canConsumeCredits` is false (or no workspace) the picker is disabled.
 */

import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AlertTriangle, Loader2, UploadCloud } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { UseVideoEditorSourceResult } from '../hooks/useVideoEditorSource';

interface SourceUploadPanelProps {
  source: UseVideoEditorSourceResult;
  /** Whether uploads are permitted (mirrors the composer's credit gate, Req 1.5). */
  canConsumeCredits: boolean;
}

export function SourceUploadPanel({ source, canConsumeCredits }: SourceUploadPanelProps) {
  const { uploadSource, isUploading, error } = source;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const disabled = !canConsumeCredits || isUploading;

  const pickFile = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const handleFile = useCallback(
    (file: File | undefined | null) => {
      if (!file || disabled) return;
      // Errors are captured into hook state; swallow the rejection here so an
      // unhandled promise never surfaces (the panel renders the message).
      void uploadSource(file).catch(() => undefined);
    },
    [uploadSource, disabled],
  );

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      handleFile(e.target.files?.[0]);
      // Reset so re-picking the same file still fires a change event.
      e.target.value = '';
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      handleFile(e.dataTransfer.files?.[0]);
    },
    [handleFile],
  );

  const onDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!disabled) setDragging(true);
    },
    [disabled],
  );

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  return (
    <div
      data-testid="video-editor-source-upload"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={[
        'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
        dragging
          ? 'border-blue-400 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-900/20'
          : 'border-gray-300 bg-white/50 dark:border-gray-700 dark:bg-gray-800/30',
        disabled ? 'opacity-70' : '',
      ].join(' ')}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        data-testid="video-editor-source-upload-input"
        onChange={onInputChange}
        disabled={disabled}
      />

      {isUploading ? (
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" aria-hidden="true" />
      ) : (
        <UploadCloud className="h-6 w-6 text-gray-400" aria-hidden="true" />
      )}

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
          {isUploading ? 'Uploading and preparing your video…' : 'Add a video to edit'}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {canConsumeCredits
            ? 'Drag & drop a video here, or choose a file to get started.'
            : 'Editing is paused — workspace context is unavailable.'}
        </p>
      </div>

      <Button
        type="button"
        size="sm"
        onClick={pickFile}
        disabled={disabled}
        data-testid="video-editor-source-upload-button"
      >
        {isUploading ? 'Uploading…' : 'Choose video'}
      </Button>

      {error && (
        <div
          data-testid="video-editor-source-upload-error"
          className="flex items-start gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export default SourceUploadPanel;
