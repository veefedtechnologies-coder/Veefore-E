/**
 * Pure (DB-free, LLM-free) helpers for VeeGPT's cost-control routing layer.
 *
 * The goal mirrors how large assistants keep cost down: never send an LLM call
 * for socially trivial messages, and let a cheap router decide intent + how much
 * context to load for everything else. These functions are deterministic so they
 * can be unit-tested in isolation.
 */

export type TrivialKind = 'greeting' | 'thanks' | 'farewell';

export interface TrivialMatch {
  kind: TrivialKind;
  /** A friendly, on-brand canned reply (no LLM call needed). */
  reply: string;
}

/**
 * Normalize a message for trivial-intent matching: lowercase, strip emoji and
 * surrounding punctuation, collapse whitespace. We do NOT alter inner words so a
 * multi-word message stays multi-word (and therefore won't match a 1-word set).
 */
function normalizeTrivial(text: string): string {
  return (text || '')
    .toLowerCase()
    // Drop emoji / pictographs and most symbols, keep letters/numbers/space/apostrophe.
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Unambiguous, context-INDEPENDENT phrases. A bare greeting/thanks/farewell means
// the same thing no matter what came before, so a canned reply is always correct.
// NOTE: deliberately EXCLUDES ok / okay / yes / yeah / yep / no / nope / sure /
// cool / great / fine / alright — those are CONTINUATIONS ("ok, schedule it",
// "yes, go ahead") whose meaning depends on the prior turn, so they MUST reach
// the model with full context.
const GREETINGS = new Set([
  'hi', 'hii', 'hiii', 'hello', 'helloo', 'hey', 'heya', 'hiya', 'yo',
  'hi there', 'hello there', 'hey there', 'good morning', 'good afternoon',
  'good evening', 'gm', 'morning',
]);

const THANKS = new Set([
  'thanks', 'thank you', 'thankyou', 'thank u', 'thx', 'tysm', 'ty',
  'thanks a lot', 'thank you so much', 'thanks so much', 'many thanks',
  'appreciate it', 'much appreciated', 'thanks a ton',
]);

const FAREWELLS = new Set([
  'bye', 'byee', 'goodbye', 'good bye', 'see you', 'see ya', 'cya',
  'see you later', 'take care', 'good night', 'goodnight', 'gn', 'later',
]);

const GREETING_REPLIES = [
  'Hey! How can I help with your social media today?',
  'Hi there! What would you like to work on?',
  'Hello! Ready when you are — what can I help you create or plan?',
];
const THANKS_REPLIES = [
  "You're welcome! Anything else I can help with?",
  'Happy to help! Let me know if you need anything else.',
  'Anytime! What else can I do for you?',
];
const FAREWELL_REPLIES = [
  'Take care! Come back anytime you want to plan or post something.',
  'See you! I’ll be here whenever you need a hand.',
  'Bye for now — happy creating!',
];

/** Deterministic-ish pick so replies vary but stay test-friendly. */
function pick(list: string[], seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

/**
 * Detect a socially trivial message that can be answered WITHOUT any LLM call.
 * Returns null for anything that isn't an exact, whole-message greeting/thanks/
 * farewell — including continuations ("ok", "yes") and any longer sentence
 * (e.g. "thanks, now schedule it"), which must go to the model.
 *
 * `hasMedia` short-circuits to null: if the user attached media they're trying
 * to do something real, so never treat the message as trivial.
 */
export function detectTrivialMessage(text: string, hasMedia = false): TrivialMatch | null {
  if (hasMedia) return null;
  const norm = normalizeTrivial(text);
  if (!norm) return null;
  // Guard: only ever match very short messages (defense-in-depth; the Set match
  // already requires an exact whole-message hit). Longest legit phrase is
  // "thank you so much" (4 words / 17 chars), so cap a little above that.
  if (norm.length > 28 || norm.split(' ').length > 4) return null;

  if (GREETINGS.has(norm)) return { kind: 'greeting', reply: pick(GREETING_REPLIES, norm) };
  if (THANKS.has(norm)) return { kind: 'thanks', reply: pick(THANKS_REPLIES, norm) };
  if (FAREWELLS.has(norm)) return { kind: 'farewell', reply: pick(FAREWELL_REPLIES, norm) };
  return null;
}
