import { describe, it, expect } from 'vitest';
import {
  accumulateToolCallDeltas,
  finalizeToolCalls,
  safeParseArgs,
  type StreamingToolCall,
} from '../server/services/toolCallAccumulator';

describe('toolCallAccumulator — assembling streamed OpenAI tool calls', () => {
  it('concatenates fragmented argument deltas into one tool call', () => {
    const acc = new Map<number, StreamingToolCall>();
    // Simulate the way OpenAI streams a tool call across chunks.
    accumulateToolCallDeltas(acc, [{ index: 0, id: 'call_1', function: { name: 'schedule_post', arguments: '' } }]);
    accumulateToolCallDeltas(acc, [{ index: 0, function: { arguments: '{"type":"re' } }]);
    accumulateToolCallDeltas(acc, [{ index: 0, function: { arguments: 'el","schedule":' } }]);
    accumulateToolCallDeltas(acc, [{ index: 0, function: { arguments: 'true}' } }]);

    const calls = finalizeToolCalls(acc);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('schedule_post');
    expect(calls[0].id).toBe('call_1');
    expect(calls[0].args).toEqual({ type: 'reel', schedule: true });
  });

  it('handles multiple tool calls by index', () => {
    const acc = new Map<number, StreamingToolCall>();
    accumulateToolCallDeltas(acc, [
      { index: 0, id: 'a', function: { name: 'schedule_post', arguments: '{"type":"post"}' } },
      { index: 1, id: 'b', function: { name: 'other_tool', arguments: '{"x":1}' } },
    ]);
    const calls = finalizeToolCalls(acc);
    expect(calls.map((c) => c.name)).toEqual(['schedule_post', 'other_tool']);
    expect(calls[1].args).toEqual({ x: 1 });
  });

  it('ignores empty/undefined deltas safely', () => {
    const acc = new Map<number, StreamingToolCall>();
    accumulateToolCallDeltas(acc, undefined);
    accumulateToolCallDeltas(acc, null as any);
    accumulateToolCallDeltas(acc, []);
    expect(finalizeToolCalls(acc)).toHaveLength(0);
  });

  it('drops incomplete tool calls that never received a name', () => {
    const acc = new Map<number, StreamingToolCall>();
    accumulateToolCallDeltas(acc, [{ index: 0, function: { arguments: '{"partial":true}' } }]);
    expect(finalizeToolCalls(acc)).toHaveLength(0);
  });

  it('safeParseArgs returns {} for empty or invalid JSON', () => {
    expect(safeParseArgs('')).toEqual({});
    expect(safeParseArgs('   ')).toEqual({});
    expect(safeParseArgs('{bad json')).toEqual({});
    expect(safeParseArgs('"a string"')).toEqual({});
    expect(safeParseArgs('{"ok":1}')).toEqual({ ok: 1 });
  });
});
