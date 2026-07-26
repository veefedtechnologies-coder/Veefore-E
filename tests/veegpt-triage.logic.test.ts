import { describe, it, expect } from 'vitest';
import { detectTrivialMessage } from '../server/routes/veegpt-triage.logic';

describe('detectTrivialMessage — trivial short-circuit (zero-LLM)', () => {
  it('matches plain greetings', () => {
    for (const t of ['hi', 'Hi', 'HELLO', 'hey', 'hey there', 'good morning', 'yo', 'Hello!!!', 'hi 👋']) {
      const r = detectTrivialMessage(t);
      expect(r, `expected greeting for "${t}"`).toBeTruthy();
      expect(r!.kind).toBe('greeting');
      expect(r!.reply.length).toBeGreaterThan(0);
    }
  });

  it('matches thanks and farewells', () => {
    expect(detectTrivialMessage('thanks')!.kind).toBe('thanks');
    expect(detectTrivialMessage('thank you so much')!.kind).toBe('thanks');
    expect(detectTrivialMessage('ty')!.kind).toBe('thanks');
    expect(detectTrivialMessage('bye')!.kind).toBe('farewell');
    expect(detectTrivialMessage('see you later')!.kind).toBe('farewell');
    expect(detectTrivialMessage('good night')!.kind).toBe('farewell');
  });

  it('does NOT match context-dependent continuations', () => {
    // These must reach the model with full context.
    for (const t of ['ok', 'okay', 'yes', 'yeah', 'yep', 'no', 'nope', 'sure', 'cool', 'great', 'fine', 'alright']) {
      expect(detectTrivialMessage(t), `"${t}" must NOT be trivial`).toBeNull();
    }
  });

  it('does NOT match longer sentences that merely start with a greeting', () => {
    expect(detectTrivialMessage('hi, can you schedule a post for tomorrow?')).toBeNull();
    expect(detectTrivialMessage('thanks, now write me a caption')).toBeNull();
    expect(detectTrivialMessage('hello what is my follower count')).toBeNull();
    expect(detectTrivialMessage('good morning, draft a reel idea')).toBeNull();
  });

  it('never treats a message with attached media as trivial', () => {
    expect(detectTrivialMessage('hi', true)).toBeNull();
    expect(detectTrivialMessage('thanks', true)).toBeNull();
  });

  it('handles empty / whitespace input safely', () => {
    expect(detectTrivialMessage('')).toBeNull();
    expect(detectTrivialMessage('   ')).toBeNull();
    expect(detectTrivialMessage('\n\t')).toBeNull();
  });

  it('is deterministic for the same input (stable canned reply)', () => {
    const a = detectTrivialMessage('hi')!.reply;
    const b = detectTrivialMessage('hi')!.reply;
    expect(a).toBe(b);
  });
});
