/**
 * The gate that decides whether an ATTACHED image goes to the posting flow or to
 * normal chat (where vision runs).
 *
 * Kept deliberately narrow: a false positive drops the user into a scheduling
 * flow they never asked for — the exact bug this fixes — while a false negative
 * just gives a normal chat reply.
 *
 * Mirrors POSTING_INTENT in client/src/pages/VeeGPT.tsx.
 */
import { describe, it, expect } from 'vitest';

const POSTING_INTENT =
  /\b(post|publish|schedule|upload)\s+(this|these|it|that|them)\b|\b(post|publish|schedule)\b[^.]{0,20}\b(on|to)\s+(instagram|facebook|ig|fb|story|reel|feed)\b|\b(make|create|draft)\s+(a\s+)?(post|reel|story|carousel)\b|\b(add|put)\s+(this|it)\s+(to|on)\s+my\s+(feed|calendar|schedule)\b/i;

describe('genuine posting intent → post-agent flow', () => {
  it.each([
    'post this',
    'post this tomorrow at 7pm',
    'publish this on instagram',
    'schedule it for Friday on instagram',
    'schedule this',
    'upload this to my feed',
    'make a reel from this',
    'create a post',
    'draft a carousel',
    'put this on my calendar',
    'Post these on IG',
  ])('%s', text => {
    expect(POSTING_INTENT.test(text)).toBe(true);
  });
});

describe('questions about the media → normal chat with vision', () => {
  it.each([
    'can you tell me which logo is this',
    'what is this image',
    'can you tell me is this image remember something to you it was a web series',
    'does this fit my brand?',
    'read this PDF and summarise it',
    'what does this document say',
    'is the text in this readable?',
    'describe this',
    'what colors are used here',
    'rate this thumbnail',
    'what trends match this photo',
    '', // image with no text at all — describe it, do not schedule it
  ])('%s', text => {
    expect(POSTING_INTENT.test(text)).toBe(false);
  });
});

describe('caption requests stay in chat (they are not a publish action)', () => {
  it.each([
    'write a caption for this',
    'give me hashtags for this image',
    'suggest 3 hooks for this',
  ])('%s', text => {
    expect(POSTING_INTENT.test(text)).toBe(false);
  });
});
