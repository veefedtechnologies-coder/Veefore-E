/**
 * Pure helpers for assembling OpenAI-style streamed tool calls.
 *
 * When a chat model streams a function/tool call, the call does NOT arrive in
 * one piece. Each stream chunk carries a `delta.tool_calls` array whose entries
 * are keyed by `index`, and the `function.arguments` string is delivered in
 * fragments that must be concatenated. Only once the stream ends do we have the
 * complete JSON argument string to parse.
 *
 * These functions are deterministic and network-free so the accumulation logic
 * can be unit-tested in isolation from the SDK/provider.
 */

export interface StreamingToolCall {
  index: number;
  id?: string;
  name?: string;
  /** Concatenated JSON argument fragments (parsed only when complete). */
  argsText: string;
}

export interface ParsedToolCall {
  id?: string;
  name: string;
  /** Parsed arguments object; {} if the JSON was empty/invalid. */
  args: Record<string, unknown>;
}

/**
 * Merge a single chunk's `delta.tool_calls` array into the accumulator map
 * (keyed by tool-call index). Safe to call with undefined/empty deltas.
 */
export function accumulateToolCallDeltas(
  acc: Map<number, StreamingToolCall>,
  deltaToolCalls: any[] | undefined | null,
): void {
  if (!Array.isArray(deltaToolCalls)) return;
  for (const tc of deltaToolCalls) {
    if (!tc || typeof tc.index !== 'number') continue;
    const existing = acc.get(tc.index) || { index: tc.index, argsText: '' };
    if (tc.id) existing.id = tc.id;
    if (tc.function?.name) existing.name = tc.function.name;
    if (typeof tc.function?.arguments === 'string') {
      existing.argsText += tc.function.arguments;
    }
    acc.set(tc.index, existing);
  }
}

/** Best-effort JSON parse of an arguments string; returns {} on empty/invalid. */
export function safeParseArgs(argsText: string): Record<string, unknown> {
  const t = (argsText || '').trim();
  if (!t) return {};
  try {
    const parsed = JSON.parse(t);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Finalize the accumulator into a list of complete tool calls (in index order),
 * dropping any entry that never received a name (incomplete/garbage).
 */
export function finalizeToolCalls(acc: Map<number, StreamingToolCall>): ParsedToolCall[] {
  return Array.from(acc.values())
    .sort((a, b) => a.index - b.index)
    .filter((t) => !!t.name)
    .map((t) => ({ id: t.id, name: t.name as string, args: safeParseArgs(t.argsText) }));
}
