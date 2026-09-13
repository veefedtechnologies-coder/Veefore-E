/**
 * Video Editor (client) — attached-source parsing (pure).
 *
 * When the user opens VeeGPT with exactly one video attached and lands on the
 * editor, the source is handed off via the route query string (e.g.
 * `/video-editor?sourceId=...` or `?sourceUrl=...`). This parses that handoff so
 * the editor reuses the attached video as an input source without a re-upload
 * (Req 1.7). The conversational source panel (task 23.4) consumes the result.
 *
 * Kept pure (string in, value out) so it is unit-testable without a router.
 */

import type { VideoEditorAttachedSource } from '../types';

/**
 * Parse a single attached video source from a location search string.
 *
 * Accepts either `sourceId` (a stored Video_Source id) or `sourceUrl` (a direct
 * URL). Returns `null` when neither is present, so the editor falls back to its
 * normal upload flow. Only a single source is honored (Req 1.7).
 *
 * @param search The location search string (with or without a leading `?`).
 */
export function parseAttachedSource(search: string | undefined | null): VideoEditorAttachedSource | null {
  if (!search) return null;

  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const id = params.get('sourceId')?.trim();
  const url = params.get('sourceUrl')?.trim();

  if (id) return { id };
  if (url) return { url };
  return null;
}
