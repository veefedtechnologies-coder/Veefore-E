/**
 * Video Editor (client) — NDJSON line splitting (pure).
 *
 * The Video Editor reuses the VeeGPT NDJSON-over-HTTP transport: the server
 * keeps the response body open and writes newline-delimited JSON events as the
 * conversational turn (or job) progresses. This module isolates the pure,
 * side-effect-free part of consuming that stream — turning a growing byte/text
 * buffer into whole JSON events — so it is unit-testable without a network,
 * `fetch`, or `ReadableStream`.
 *
 * Mirrors the buffer/`indexOf('\n')` reader loop in `useChatStream` but factored
 * out so both the conversational-edit and job-progress streams share one tested
 * splitter.
 */

/** The result of feeding a chunk of text into the NDJSON splitter. */
export interface NdjsonSplitResult<T = unknown> {
  /** Fully-received JSON events parsed from complete lines in this chunk. */
  events: T[];
  /** The trailing partial line (no newline yet), carried into the next chunk. */
  remainder: string;
}

/**
 * Split `buffer + chunk` into complete newline-delimited JSON events plus a
 * trailing remainder. Blank lines are ignored; unparseable lines are skipped
 * (never throw), exactly like the chat transport, so one malformed line can
 * never abort the stream. The `remainder` MUST be fed back in as `buffer` on the
 * next call (or flushed with {@link flushNdjson} at end-of-stream).
 *
 * @param buffer  Leftover partial line from the previous chunk (`''` initially).
 * @param chunk   Newly decoded text from the stream.
 */
export function splitNdjson<T = unknown>(buffer: string, chunk: string): NdjsonSplitResult<T> {
  const events: T[] = [];
  let working = buffer + chunk;

  let nlIndex: number;
  while ((nlIndex = working.indexOf('\n')) !== -1) {
    const line = working.slice(0, nlIndex).trim();
    working = working.slice(nlIndex + 1);
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as T);
    } catch {
      // Skip a malformed line rather than aborting the whole stream.
    }
  }

  return { events, remainder: working };
}

/**
 * Flush any trailing buffered line at end-of-stream (the server may write a final
 * event without a trailing newline). Returns the parsed event, or `null` when the
 * remainder is empty or unparseable.
 */
export function flushNdjson<T = unknown>(buffer: string): T | null {
  const tail = buffer.trim();
  if (!tail) return null;
  try {
    return JSON.parse(tail) as T;
  } catch {
    return null;
  }
}

/**
 * A tiny stateful splitter over the pure {@link splitNdjson}, convenient for the
 * streaming hooks: feed decoded chunks with {@link push}, drain trailing bytes
 * with {@link flush}. Keeps the buffer internally so the hook stays declarative.
 */
export function createNdjsonParser<T = unknown>() {
  let buffer = '';
  return {
    /** Feed a decoded text chunk; returns the complete events it produced. */
    push(chunk: string): T[] {
      const { events, remainder } = splitNdjson<T>(buffer, chunk);
      buffer = remainder;
      return events;
    },
    /** Drain the trailing partial line at end-of-stream (or `null`). */
    flush(): T | null {
      const evt = flushNdjson<T>(buffer);
      buffer = '';
      return evt;
    },
  };
}
