/**
 * Pure (no DB / no AI) deterministic parser for VeeGPT post/schedule requests.
 *
 * It extracts the same structured fields the LLM parser returns, using plain
 * regex + date math. It exists so the Post Composer ALWAYS pre-fills what the
 * user said, even when every AI provider is rate-limited (429) or down. The
 * route uses the LLM result when available and falls back to / fills gaps from
 * this deterministic parse.
 *
 * All datetimes are LOCAL "YYYY-MM-DDTHH:mm" strings (no timezone / Z) computed
 * from the caller-supplied `localNow` so relative phrases ("tomorrow 1pm")
 * resolve in the user's timezone.
 */

export type ParsedPostIntent = {
  type: 'post' | 'reel' | 'story';
  caption: string | null;
  generateCaption: boolean;
  generateHashtags: boolean;
  hashtags: string[];
  mentions: string[];
  collaborators: string[];
  schedule: boolean;
  scheduledLocal: string | null;
  scheduleMentioned: boolean;
  missing: string[];
  /** True when the user explicitly declined a caption ("no caption"). */
  declineCaption?: boolean;
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const pad = (n: number): string => String(n).padStart(2, '0');

/** Format a Date's LOCAL parts as "YYYY-MM-DDTHH:mm" (no timezone). */
function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse a "YYYY-MM-DDTHH:mm" (or with space) local string into a Date in local time. */
function parseLocal(localNow?: string): Date {
  if (localNow) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(localNow.trim());
    if (m) {
      return new Date(
        Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0,
      );
    }
    const d = new Date(localNow);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Extract a clock time (hour/minute) from the message, if present. */
function extractTime(text: string): { hour: number; minute: number } | null {
  // 1 pm, 1:30pm, 13:00, 9 am, at 5
  const ampm = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(text);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    const minute = ampm[2] ? Number(ampm[2]) : 0;
    if (/p/i.test(ampm[3])) hour += 12;
    return { hour, minute };
  }
  const h24 = /\b(\d{1,2}):(\d{2})\b/.exec(text);
  if (h24) {
    const hour = Number(h24[1]);
    const minute = Number(h24[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return { hour, minute };
  }
  // "tonight" / "noon" / "midnight"
  if (/\bnoon\b/i.test(text)) return { hour: 12, minute: 0 };
  if (/\bmidnight\b/i.test(text)) return { hour: 0, minute: 0 };
  if (/\btonight\b/i.test(text)) return { hour: 20, minute: 0 };
  if (/\bmorning\b/i.test(text)) return { hour: 9, minute: 0 };
  if (/\bafternoon\b/i.test(text)) return { hour: 15, minute: 0 };
  if (/\bevening\b/i.test(text)) return { hour: 18, minute: 0 };
  return null;
}

/** Resolve a relative/absolute day reference into a base Date (time zeroed). */
function resolveDay(text: string, now: Date): Date | null {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/\btomorrow\b/i.test(text)) { base.setDate(base.getDate() + 1); return base; }
  if (/\b(day after tomorrow)\b/i.test(text)) { base.setDate(base.getDate() + 2); return base; }
  if (/\btoday\b|\btonight\b/i.test(text)) return base;

  // "next monday", "on friday", "this saturday"
  const wd = /\b(?:next|this|on|coming)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(text);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1].toLowerCase());
    const isNext = /\bnext\b/i.test(text);
    let delta = (target - base.getDay() + 7) % 7;
    if (delta === 0) delta = 7; // a named weekday means the upcoming one
    if (isNext && delta <= 7) delta += 0; // "next" already lands on upcoming; keep simple
    base.setDate(base.getDate() + delta);
    return base;
  }

  // "in 3 days" / "in 2 hours"
  const inDays = /\bin\s+(\d+)\s+days?\b/i.exec(text);
  if (inDays) { base.setDate(base.getDate() + Number(inDays[1])); return base; }

  // explicit date "2026-06-27"
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  return null;
}

/**
 * Deterministically parse a post/schedule message into structured fields.
 * `hasImages` and `localNow` come from the client.
 */
export function parsePostIntentDeterministic(
  message: string,
  hasImages: boolean,
  localNow?: string,
): ParsedPostIntent {
  const text = (message || '').trim();
  const lower = text.toLowerCase();
  const now = parseLocal(localNow);

  // Type.
  let type: 'post' | 'reel' | 'story' = 'post';
  if (/\breels?\b/i.test(lower)) type = 'reel';
  else if (/\bstory|stories\b/i.test(lower)) type = 'story';

  // Caption: did the user ask us to generate it, OR explicitly decline it?
  const declineCaption = /\b(no|don'?t|do not|without|skip|dont)\b[^.]*\bcaption/i.test(lower) ||
    /\bcaption[^.]*\b(not needed|no need)\b/i.test(lower);
  const generateCaption = !declineCaption && (
    /\b(generate|write|create|make|suggest|come up with|draft)\b[^.]*\bcaption/i.test(lower) ||
    /\bcaption\b[^.]*\b(for me|yourself|automatically|by yourself)\b/i.test(lower) ||
    /\b(auto|ai)[- ]?caption\b/i.test(lower)
  );

  const declineHashtags = /\b(no|don'?t|do not|without|skip|dont)\b[^.]*\bhashtags?/i.test(lower);
  const generateHashtags = !declineHashtags && (
    /\b(generate|write|create|make|suggest|add|include|come up with)\b[^.]*\bhashtags?\b/i.test(lower)
  );

  // Explicit hashtags / mentions / collaborators.
  const hashtags = Array.from(new Set((text.match(/#([\p{L}\p{N}_]+)/gu) || []).map((h) => h.slice(1))));

  // Collaborators: "collaborate with @x", "collab with @x", "collaborator @x".
  const collaborators: string[] = [];
  const collabRe = /\bcollab(?:orate|orator|oration)?\s*(?:with)?\s*((?:@[\p{L}\p{N}._]+(?:\s*,?\s*(?:and\s*)?)?)+)/giu;
  let cm: RegExpExecArray | null;
  while ((cm = collabRe.exec(text)) !== null) {
    const handles = cm[1].match(/@([\p{L}\p{N}._]+)/gu) || [];
    handles.forEach((h) => collaborators.push(h.slice(1)));
  }

  // Mentions: "mention @x" / "tag @x".
  const mentions: string[] = [];
  const mentionRe = /\b(?:mention|tag)\s*((?:@[\p{L}\p{N}._]+(?:\s*,?\s*(?:and\s*)?)?)+)/giu;
  let mm: RegExpExecArray | null;
  while ((mm = mentionRe.exec(text)) !== null) {
    const handles = mm[1].match(/@([\p{L}\p{N}._]+)/gu) || [];
    handles.forEach((h) => mentions.push(h.slice(1)));
  }

  // Any @handle that isn't already a collaborator/mention → treat as a mention.
  const claimed = new Set([...collaborators, ...mentions]);
  const allHandles = (text.match(/@([\p{L}\p{N}._]+)/gu) || []).map((h) => h.slice(1));
  for (const h of allHandles) {
    if (!claimed.has(h)) { mentions.push(h); claimed.add(h); }
  }

  // Scheduling.
  const scheduleMentioned = /\b(schedule|scheduled|later|tomorrow|tonight|today|next|on\s+(?:mon|tue|wed|thu|fri|sat|sun)|at\s+\d|am\b|pm\b|noon|midnight|in\s+\d+\s+(?:day|hour))/i.test(lower);
  const wantsScheduleWord = /\bschedule|scheduled|later\b/i.test(lower);
  const time = extractTime(lower);
  const day = resolveDay(lower, now);
  // "today"/"tomorrow" with NO clock time given → we know the day but not the
  // time, so we must still ask for a time (don't silently default to 9am).
  const hasExplicitTime = !!time;

  let schedule = false;
  let scheduledLocal: string | null = null;
  if (wantsScheduleWord || day || time) {
    schedule = true;
    if (hasExplicitTime) {
      const dt = day ? new Date(day) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
      dt.setHours(time!.hour, time!.minute, 0, 0);
      // A time-only reference in the past rolls to tomorrow.
      if (!day && dt.getTime() <= now.getTime()) dt.setDate(dt.getDate() + 1);
      scheduledLocal = fmtLocal(dt);
    }
    // If a day was given but no time, leave scheduledLocal null → ask for time.
  }

  // Missing fields.
  const missing: string[] = [];
  // Caption is missing only if the user neither provided one, asked us to
  // generate it, NOR explicitly declined it.
  if (!generateCaption && !declineCaption) missing.push('caption');
  if (schedule && !scheduledLocal) missing.push('scheduledAt');
  if (!hasImages) missing.push('images');
  missing.push('account');

  return {
    type,
    caption: null,
    generateCaption,
    generateHashtags,
    hashtags,
    mentions,
    collaborators,
    schedule,
    scheduledLocal,
    scheduleMentioned,
    missing,
    declineCaption,
  };
}

/**
 * Merge an LLM parse result with the deterministic parse: prefer the LLM's
 * value when it provided one, otherwise fill from deterministic. Guarantees a
 * fully-populated, well-typed object even if `llm` is empty/partial.
 */
export function mergePostIntent(
  llm: Partial<ParsedPostIntent> | null | undefined,
  deterministic: ParsedPostIntent,
): ParsedPostIntent {
  const l = llm || {};
  const arr = (v: any): string[] | undefined => (Array.isArray(v) && v.length ? v.map((x) => String(x).replace(/^[#@]+/, '')) : undefined);

  const collaborators = arr(l.collaborators) ?? deterministic.collaborators;
  const mentions = arr(l.mentions) ?? deterministic.mentions;
  const hashtags = arr(l.hashtags) ?? deterministic.hashtags;

  const type = (l.type === 'reel' || l.type === 'story' || l.type === 'post') ? l.type : deterministic.type;
  const generateCaption = typeof l.generateCaption === 'boolean' ? l.generateCaption : deterministic.generateCaption;
  const generateHashtags = typeof l.generateHashtags === 'boolean' ? l.generateHashtags : deterministic.generateHashtags;
  const caption = typeof l.caption === 'string' && l.caption.trim() ? l.caption : deterministic.caption;
  const schedule = typeof l.schedule === 'boolean' ? l.schedule : deterministic.schedule;
  const scheduleMentioned = typeof l.scheduleMentioned === 'boolean' ? l.scheduleMentioned : deterministic.scheduleMentioned;
  const scheduledLocal =
    (typeof l.scheduledLocal === 'string' && l.scheduledLocal.trim())
      ? l.scheduledLocal
      : deterministic.scheduledLocal;
  const missing = Array.isArray(l.missing) ? l.missing : deterministic.missing;

  return {
    type,
    caption,
    generateCaption,
    generateHashtags,
    hashtags,
    mentions,
    collaborators,
    schedule,
    scheduledLocal,
    scheduleMentioned,
    missing,
  };
}
