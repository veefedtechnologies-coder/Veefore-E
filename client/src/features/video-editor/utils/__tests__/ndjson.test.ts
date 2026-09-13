import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { splitNdjson, flushNdjson, createNdjsonParser } from '../ndjson';

describe('splitNdjson', () => {
  it('parses complete newline-delimited JSON lines', () => {
    const { events, remainder } = splitNdjson('', '{"a":1}\n{"b":2}\n');
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
    expect(remainder).toBe('');
  });

  it('carries a trailing partial line into the remainder', () => {
    const { events, remainder } = splitNdjson('', '{"a":1}\n{"b":');
    expect(events).toEqual([{ a: 1 }]);
    expect(remainder).toBe('{"b":');
  });

  it('joins the previous buffer with the new chunk', () => {
    const first = splitNdjson('', '{"a":1}\n{"partial":');
    const second = splitNdjson(first.remainder, 'true}\n');
    expect(second.events).toEqual([{ partial: true }]);
    expect(second.remainder).toBe('');
  });

  it('ignores blank lines and skips malformed lines without throwing', () => {
    const { events, remainder } = splitNdjson('', '\n{"ok":1}\nnot json\n{"ok":2}\n');
    expect(events).toEqual([{ ok: 1 }, { ok: 2 }]);
    expect(remainder).toBe('');
  });

  it('flushNdjson parses a trailing line with no newline', () => {
    expect(flushNdjson('{"final":true}')).toEqual({ final: true });
    expect(flushNdjson('   ')).toBeNull();
    expect(flushNdjson('garbage')).toBeNull();
  });
});

describe('createNdjsonParser', () => {
  it('emits events as whole lines complete across chunks', () => {
    const parser = createNdjsonParser<{ n: number }>();
    expect(parser.push('{"n":1}\n{"n"')).toEqual([{ n: 1 }]);
    expect(parser.push(':2}\n')).toEqual([{ n: 2 }]);
    expect(parser.flush()).toBeNull();
  });

  it('flush drains a trailing unterminated line', () => {
    const parser = createNdjsonParser<{ done: boolean }>();
    expect(parser.push('{"done":')).toEqual([]);
    expect(parser.push('true}')).toEqual([]);
    expect(parser.flush()).toEqual({ done: true });
  });
});

describe('splitNdjson properties', () => {
  // Feature: veefore-ai-video-editor — NDJSON splitting is loss-free: every whole
  // JSON object written as a line is recovered exactly once, in order, regardless
  // of how the byte stream is chunked.
  it('recovers all events in order under arbitrary chunk boundaries', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ i: fc.integer(), s: fc.string() }), { maxLength: 25 }),
        fc.array(fc.integer({ min: 1, max: 8 }), { maxLength: 50 }),
        (objects, cutSizes) => {
          const wire = objects.map((o) => JSON.stringify(o)).join('\n') + (objects.length ? '\n' : '');

          // Chop the wire into arbitrary-sized chunks.
          const chunks: string[] = [];
          let pos = 0;
          let ci = 0;
          while (pos < wire.length) {
            const size = cutSizes.length ? cutSizes[ci % cutSizes.length] : 4;
            chunks.push(wire.slice(pos, pos + size));
            pos += size;
            ci += 1;
          }

          const parser = createNdjsonParser<{ i: number; s: string }>();
          const received: unknown[] = [];
          for (const chunk of chunks) received.push(...parser.push(chunk));
          const tail = parser.flush();
          if (tail !== null) received.push(tail);

          expect(received).toEqual(objects);
        },
      ),
      { numRuns: 200 },
    );
  });
});
