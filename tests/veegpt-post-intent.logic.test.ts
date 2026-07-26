import { describe, it, expect } from 'vitest';
import { parsePostIntentDeterministic, mergePostIntent } from '../server/routes/veegpt-post-intent.logic';

describe('parsePostIntentDeterministic', () => {
  const localNow = '2026-06-26T18:00'; // Friday 6pm

  it("parses the user's reel+schedule+caption+collab message", () => {
    const r = parsePostIntentDeterministic(
      'schedule this post as a reel at 1 pm tommorow and generate caption and hashtags and collaborate with @arpit.10',
      true,
      localNow,
    );
    expect(r.type).toBe('reel');
    expect(r.generateCaption).toBe(true);
    expect(r.generateHashtags).toBe(true);
    expect(r.schedule).toBe(true);
    expect(r.scheduledLocal).toBe('2026-06-27T13:00');
    expect(r.collaborators).toContain('arpit.10');
  });

  it('resolves "tonight" to 8pm same day', () => {
    const r = parsePostIntentDeterministic('post this tonight', false, localNow);
    expect(r.schedule).toBe(true);
    expect(r.scheduledLocal).toBe('2026-06-26T20:00');
    expect(r.missing).toContain('images');
  });

  it('rolls a past time today to tomorrow', () => {
    // 2pm is before 6pm now → should roll to next day
    const r = parsePostIntentDeterministic('schedule at 2pm', false, localNow);
    expect(r.scheduledLocal).toBe('2026-06-27T14:00');
  });

  it('post now has no schedule', () => {
    const r = parsePostIntentDeterministic('post this now', true, localNow);
    expect(r.schedule).toBe(false);
    expect(r.scheduledLocal).toBeNull();
  });

  it('declined caption is NOT marked missing', () => {
    const r = parsePostIntentDeterministic(
      "schedule a reel for today and I don't want captions and hashtags and collaborate with @arpit.10",
      true,
      localNow,
    );
    expect(r.generateCaption).toBe(false);
    expect(r.missing).not.toContain('caption');
    expect(r.collaborators).toContain('arpit.10');
  });

  it('"today" with no time still asks for a time (scheduledAt missing)', () => {
    const r = parsePostIntentDeterministic('schedule a reel for today', true, localNow);
    expect(r.schedule).toBe(true);
    expect(r.scheduledLocal).toBeNull();
    expect(r.missing).toContain('scheduledAt');
  });

  it('extracts explicit hashtags and mention', () => {
    const r = parsePostIntentDeterministic('post this #travel #fun and tag @john', true, localNow);
    expect(r.hashtags).toEqual(expect.arrayContaining(['travel', 'fun']));
    expect(r.mentions).toContain('john');
  });

  it('resolves next monday 9am', () => {
    const r = parsePostIntentDeterministic('schedule for next monday 9am', true, localNow);
    // Fri 2026-06-26 → upcoming Monday is 2026-06-29
    expect(r.scheduledLocal).toBe('2026-06-29T09:00');
  });
});

describe('mergePostIntent', () => {
  const localNow = '2026-06-26T18:00';
  const det = parsePostIntentDeterministic(
    'schedule as reel at 1pm tomorrow generate caption collaborate with @arpit.10',
    true,
    localNow,
  );

  it('falls back to deterministic when llm is empty', () => {
    const m = mergePostIntent(null, det);
    expect(m.type).toBe('reel');
    expect(m.scheduledLocal).toBe('2026-06-27T13:00');
    expect(m.collaborators).toContain('arpit.10');
  });

  it('prefers llm values where present', () => {
    const m = mergePostIntent({ type: 'story', scheduledLocal: '2026-06-28T10:00' }, det);
    expect(m.type).toBe('story');
    expect(m.scheduledLocal).toBe('2026-06-28T10:00');
    // gaps filled from deterministic
    expect(m.collaborators).toContain('arpit.10');
  });
});
