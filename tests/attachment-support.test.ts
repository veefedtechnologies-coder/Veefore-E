/**
 * Attachment acceptance + rejection.
 *
 * The bug this locks down: unsupported files were filtered out SILENTLY, so
 * picking a HEIC attached nothing, said nothing, and a send with no text then
 * bailed — which looked like the chat had died. Every rejection must now carry a
 * reason, and nothing here may throw.
 */
import { describe, it, expect } from 'vitest';
import {
  validateAttachments,
  isSupportedType,
  resolveMimeType,
  kindOf,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_VIDEO_ATTACHMENT_BYTES,
  ALL_SUPPORTED_TYPES,
} from '../shared/attachment-support';
import { resolveRoute, supportsCapability } from '../server/services/ai-model-routing';

const file = (name: string, type = '', size = 1024) => ({ name, type, size });

describe('required formats are supported', () => {
  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['photo.png', 'image/png'],
    ['photo.heic', 'image/heic'],
    ['clip.mp4', 'video/mp4'],
    ['clip.mov', 'video/quicktime'],
    ['doc.pdf', 'application/pdf'],
  ])('%s (%s)', (name, type) => {
    const { accepted, rejected } = validateAttachments([file(name, type)]);
    expect(rejected).toEqual([]);
    expect(accepted).toHaveLength(1);
  });
});

describe('browsers that report an EMPTY File.type still work', () => {
  // Chrome on macOS reports '' for .heic, and sometimes for .mov.
  it.each([
    ['IMG_4021.HEIC', 'image/heic'],
    ['IMG_4021.heic', 'image/heic'],
    ['movie.MOV', 'video/quicktime'],
    ['pic.JPG', 'image/jpeg'],
    ['scan.PDF', 'application/pdf'],
  ])('%s recovers to %s from the extension', (name, expected) => {
    expect(resolveMimeType(name, '')).toBe(expected);
    const { accepted, rejected } = validateAttachments([file(name, '')]);
    expect(rejected).toEqual([]);
    expect(accepted).toHaveLength(1);
  });

  it('recovers from a generic application/octet-stream too', () => {
    expect(resolveMimeType('IMG_1.heic', 'application/octet-stream')).toBe('image/heic');
  });
});

describe('unsupported files are REJECTED WITH A REASON, never silently dropped', () => {
  it.each(['notes.txt', 'sheet.xlsx', 'archive.zip', 'song.mp3', 'design.psd', 'clip.avi'])(
    '%s',
    name => {
      const { accepted, rejected } = validateAttachments([file(name, '')]);
      expect(accepted).toEqual([]);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].name).toBe(name);
      expect(rejected[0].reason).toMatch(/aren't supported/i);
      // The message must tell the user what IS allowed.
      expect(rejected[0].reason).toMatch(/JPG|PNG|HEIC|MP4|MOV|PDF/);
    }
  );

  it('reports the offending extension in the message', () => {
    const { rejected } = validateAttachments([file('notes.txt', '')]);
    expect(rejected[0].reason).toContain('TXT');
  });
});

describe('size and count limits also produce reasons', () => {
  it('rejects an oversized file', () => {
    const { accepted, rejected } = validateAttachments([
      file('huge.png', 'image/png', MAX_ATTACHMENT_BYTES + 1),
    ]);
    expect(accepted).toEqual([]);
    expect(rejected[0].reason).toMatch(/too large/i);
  });

  it('accepts a video larger than the 25MB image cap (up to the 200MB video cap)', () => {
    // A ~120MB video (typical phone clip) must NOT be rejected client-side —
    // the server accepts videos up to 200MB. Regression guard for the bug where
    // videos were rejected with a misleading "max 25MB".
    const { accepted, rejected } = validateAttachments([
      file('clip.mp4', 'video/mp4', 120 * 1024 * 1024),
    ]);
    expect(rejected).toEqual([]);
    expect(accepted).toHaveLength(1);
  });

  it('still rejects a video above the 200MB video cap', () => {
    const { accepted, rejected } = validateAttachments([
      file('massive.mp4', 'video/mp4', MAX_VIDEO_ATTACHMENT_BYTES + 1),
    ]);
    expect(accepted).toEqual([]);
    expect(rejected[0].reason).toMatch(/too large.*200MB/i);
  });

  it('a >25MB image is still rejected (image cap unchanged)', () => {
    const { accepted, rejected } = validateAttachments([
      file('big.png', 'image/png', 30 * 1024 * 1024),
    ]);
    expect(accepted).toEqual([]);
    expect(rejected[0].reason).toMatch(/too large.*25MB/i);
  });

  it(`caps at ${MAX_ATTACHMENTS} files`, () => {
    const many = Array.from({ length: MAX_ATTACHMENTS + 2 }, (_, i) =>
      file(`p${i}.png`, 'image/png')
    );
    const { accepted, rejected } = validateAttachments(many);
    expect(accepted).toHaveLength(MAX_ATTACHMENTS);
    expect(rejected).toHaveLength(2);
    expect(rejected[0].reason).toMatch(/up to/i);
  });

  it('respects files already attached', () => {
    const { accepted, rejected } = validateAttachments(
      [file('a.png', 'image/png'), file('b.png', 'image/png')],
      MAX_ATTACHMENTS - 1
    );
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});

describe('mixed picks are partially accepted', () => {
  it('keeps the good files and reports only the bad ones', () => {
    const { accepted, rejected } = validateAttachments([
      file('a.heic', ''),
      file('b.txt', ''),
      file('c.mov', ''),
      file('d.zip', ''),
    ]);
    expect(accepted.map(f => f.name)).toEqual(['a.heic', 'c.mov']);
    expect(rejected.map(r => r.name)).toEqual(['b.txt', 'd.zip']);
  });
});

describe('never throws', () => {
  it.each([[[]], [[file('', '')]], [[{ name: 'x' } as any]]])('input %#', input => {
    expect(() => validateAttachments(input as any)).not.toThrow();
  });
});

describe('kind classification', () => {
  it('separates heic from ordinary images', () => {
    expect(kindOf('image/heic')).toBe('heic');
    expect(kindOf('image/jpeg')).toBe('image');
    expect(kindOf('video/quicktime')).toBe('video');
    expect(kindOf('application/pdf')).toBe('document');
    expect(kindOf('text/plain')).toBeNull();
  });

  it('every listed type classifies', () => {
    for (const t of ALL_SUPPORTED_TYPES) {
      expect(isSupportedType(t), t).toBe(true);
    }
  });
});

describe('HEIC routing: Gemini only', () => {
  it('OpenAI models cannot read HEIC and get substituted', () => {
    for (const m of ['openai-gpt4o', 'openai-gpt-5-nano', 'openai-gpt-4o-mini']) {
      expect(supportsCapability(m, 'heic')).toBe(false);
      const r = resolveRoute(m, 'heic');
      expect(r.provider).toBe('gemini');
      expect(r.overriddenFor).toBe('heic');
    }
  });

  it('Gemini keeps HEIC itself', () => {
    expect(supportsCapability('veegpt-hybrid', 'heic')).toBe(true);
    expect(resolveRoute('veegpt-hybrid', 'heic').overriddenFor).toBeUndefined();
  });

  it('plain JPEG is NOT downgraded away from OpenAI', () => {
    expect(resolveRoute('openai-gpt4o', 'vision').provider).toBe('openai');
  });
});
