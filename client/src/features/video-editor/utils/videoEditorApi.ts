/**
 * Video Editor (client) — API + NDJSON streaming helpers.
 *
 * Thin wrappers over the existing client conventions:
 *   - Request/response JSON uses the shared {@link apiRequest} (Firebase-auth +
 *     401 refresh + `{ success, data | error }` envelope), with the active
 *     workspace passed via the `x-workspace-id` header the Video Editor routes'
 *     `validateWorkspaceAccess` middleware resolves from (Req 19.5).
 *   - Streaming uses the SAME NDJSON-over-HTTP transport as `useChatStream`
 *     (fetch → `ReadableStream` reader → newline-delimited JSON), delegating the
 *     line-splitting to the pure {@link createNdjsonParser}.
 *
 * All access control remains server-authoritative; these helpers only attach the
 * caller's identity + active workspace so the server can enforce ownership.
 */

import { apiRequest } from '@/lib/queryClient';
import { createNdjsonParser } from './ndjson';

/** Base path for every Video Editor API route (mounted in `server/routes.ts`). */
export const VIDEO_EDITOR_API_BASE = '/api/video-editor';

/** Unwrap the `{ success, data }` envelope, throwing on `{ success:false }`. */
export function unwrapEnvelope<T>(payload: unknown): T {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (record.success === true && 'data' in record) return record.data as T;
    if (record.success === false && record.error && typeof record.error === 'object') {
      const err = record.error as { code?: string; message?: string };
      const e = new Error(err.message || err.code || 'Request failed') as Error & { code?: string };
      e.code = err.code;
      throw e;
    }
  }
  // Fall back to the raw payload for non-enveloped responses.
  return payload as T;
}

/**
 * A workspace-scoped JSON request against the Video Editor API. Attaches the
 * active workspace via the `x-workspace-id` header and unwraps the envelope.
 */
export async function videoEditorRequest<T>(
  path: string,
  workspaceId: string,
  options: RequestInit = {},
): Promise<T> {
  const payload = await apiRequest(`${VIDEO_EDITOR_API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      'x-workspace-id': workspaceId,
    },
  });
  return unwrapEnvelope<T>(payload);
}

/** Resolve the current Firebase ID token for a streaming request. */
async function getAuthToken(): Promise<string> {
  const { getAuth } = await import('firebase/auth');
  const user = getAuth().currentUser;
  if (!user) throw new Error('Please sign in to continue');
  return user.getIdToken();
}

export interface VideoEditorUploadOptions {
  /** Path relative to the Video Editor API base (e.g. `/projects/abc/sources`). */
  path: string;
  /** Active workspace id, sent as the `x-workspace-id` header (Req 19.5). */
  workspaceId: string;
  /** The multipart form body (typically a `FormData` carrying the `file` field). */
  body: FormData;
  /** Abort signal wired to an unmount / cancel control. */
  signal?: AbortSignal;
}

/**
 * POST a multipart (`FormData`) body to the Video Editor API and unwrap the
 * `{ success, data }` envelope. Mirrors {@link streamNdjson}'s auth/header setup
 * (Firebase bearer + `x-workspace-id`) but sends a `FormData` body — the browser
 * sets the `multipart/form-data` boundary Content-Type itself, so it is NOT set
 * here. Access control stays server-authoritative; this only attaches identity +
 * the active workspace.
 */
export async function videoEditorUpload<T>(options: VideoEditorUploadOptions): Promise<T> {
  const { path, workspaceId, body, signal } = options;
  const token = await getAuthToken();

  const response = await fetch(`${VIDEO_EDITOR_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-workspace-id': workspaceId,
      Accept: 'application/json',
      // NOTE: no Content-Type — the browser sets the multipart boundary.
    },
    credentials: 'include',
    body,
    signal,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* non-JSON body — handled below */
  }

  if (!response.ok) {
    // The server sends the `{ success:false, error }` envelope; surface its
    // code + message so the caller can react (e.g. SOURCE_PROBE_FAILED).
    const err = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    const e = new Error(
      err?.message || `Upload failed (HTTP ${response.status})`,
    ) as Error & { code?: string; status?: number };
    e.code = err?.code;
    e.status = response.status;
    throw e;
  }

  return unwrapEnvelope<T>(payload);
}

export interface StreamNdjsonOptions<T> {
  /** Path relative to the Video Editor API base (e.g. `/projects/abc/converse`). */
  path: string;
  /** Active workspace id, sent as the `x-workspace-id` header (Req 19.5). */
  workspaceId: string;
  /** HTTP method (defaults to POST for converse, GET for job streams). */
  method?: 'GET' | 'POST';
  /** JSON body for POST turns. */
  body?: unknown;
  /** Abort signal wired to a Stop control / unmount (reuses the chat Stop model). */
  signal?: AbortSignal;
  /** Called for every complete NDJSON event as it arrives. */
  onEvent: (event: T) => void;
}

/**
 * Open an NDJSON stream against the Video Editor API and invoke `onEvent` for
 * each event until the stream ends (or the signal aborts). Mirrors the reader
 * loop in `useChatStream`, but the line-splitting is the pure
 * {@link createNdjsonParser}. Resolves when the server closes the stream.
 *
 * On a non-OK pre-stream response the server still sends the `{ success:false,
 * error }` JSON envelope (auth/ownership/validation), which is surfaced as a
 * thrown Error carrying the error `code`.
 */
export async function streamNdjson<T>(options: StreamNdjsonOptions<T>): Promise<void> {
  const { path, workspaceId, method, body, signal, onEvent } = options;
  const token = await getAuthToken();
  const resolvedMethod = method ?? (body !== undefined ? 'POST' : 'GET');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'x-workspace-id': workspaceId,
    Accept: 'application/x-ndjson',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${VIDEO_EDITOR_API_BASE}${path}`, {
    method: resolvedMethod,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok || !response.body) {
    // Pre-stream failure — read the JSON envelope for a diagnosable message.
    let message = `Request failed (HTTP ${response.status})`;
    let code: string | undefined;
    try {
      const ct = response.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await response.json();
        const err = data?.error;
        message = err?.message || data?.message || message;
        code = err?.code || data?.code;
      }
    } catch {
      /* body unreadable — keep the status message */
    }
    const e = new Error(message) as Error & { code?: string; status?: number };
    e.code = code;
    e.status = response.status;
    throw e;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createNdjsonParser<T>();

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        onEvent(event);
      }
    }
    const tail = parser.flush();
    if (tail !== null) onEvent(tail);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}
