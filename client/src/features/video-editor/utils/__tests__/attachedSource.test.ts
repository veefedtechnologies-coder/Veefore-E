import { describe, it, expect } from 'vitest';

import { parseAttachedSource } from '../attachedSource';

describe('parseAttachedSource', () => {
  it('returns null for empty/absent search strings', () => {
    expect(parseAttachedSource(undefined)).toBeNull();
    expect(parseAttachedSource(null)).toBeNull();
    expect(parseAttachedSource('')).toBeNull();
    expect(parseAttachedSource('?')).toBeNull();
  });

  it('parses a stored source id (Req 1.7)', () => {
    expect(parseAttachedSource('?sourceId=src_123')).toEqual({ id: 'src_123' });
    expect(parseAttachedSource('sourceId=src_123')).toEqual({ id: 'src_123' });
  });

  it('parses a direct source url (Req 1.7)', () => {
    expect(parseAttachedSource('?sourceUrl=https://cdn.example.com/a.mp4')).toEqual({
      url: 'https://cdn.example.com/a.mp4',
    });
  });

  it('prefers the source id when both are present (single source, Req 1.7)', () => {
    expect(parseAttachedSource('?sourceId=src_1&sourceUrl=https://x/a.mp4')).toEqual({
      id: 'src_1',
    });
  });

  it('returns null when neither param is present', () => {
    expect(parseAttachedSource('?foo=bar')).toBeNull();
  });

  it('ignores blank values', () => {
    expect(parseAttachedSource('?sourceId=%20')).toBeNull();
  });
});
