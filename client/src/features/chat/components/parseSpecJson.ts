/**
 * parseSpecJson — tolerant JSON reader for the ```chart / ```viz fenced blocks.
 *
 * WHY
 * The model writes this JSON freehand, token by token, and occasionally slips.
 * A real example from production:
 *
 *   {"week":"8","followers","followers":2850}
 *                ^^^^^^^^^^^ orphan key, no value
 *
 * One stray token in one row of nine invalidated the whole document, so a
 * perfectly good chart degraded to a grey block of raw JSON in the answer.
 *
 * So: try strict JSON first (the overwhelmingly common case), and only if that
 * fails apply a short list of conservative repairs for the mistakes models
 * actually make. Each repair is narrow enough that it cannot change the meaning
 * of well-formed JSON. If it still won't parse we return null and the caller
 * shows its visible fallback — we never silently invent data.
 */

/** Number of unclosed `{`/`[` at the end of the text, ignoring string contents. */
function unclosedBrackets(text: string): string[] {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return stack;
}

export function parseSpecJson(raw: string): any | null {
  const text = (raw || '').trim();
  if (!text) return null;

  // Fast path: valid JSON.
  try {
    return JSON.parse(text);
  } catch {
    /* fall through to repairs */
  }

  let s = text;

  // Strip a stray language tag or prose the model may have left on line 1.
  s = s.replace(/^[a-z]*\s*\n/i, m => (m.trim().startsWith('{') ? m : ''));

  // Non-JSON numeric literals the model sometimes emits.
  s = s.replace(/\b(NaN|Infinity|-Infinity|undefined|None|null_)\b/g, 'null');

  // Smart quotes around keys/strings.
  s = s.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");

  // ORPHAN KEY: a quoted string sitting in KEY position with no value, followed
  // by a real key/value pair — {"week":"8","followers","followers":2850}.
  //
  // The leading `[{,]` is essential and captured rather than looked behind (no
  // lookbehind: it isn't supported on older Safari and would throw at parse
  // time). It pins the match to key position, so a legitimate VALUE followed by
  // the next key — `{"type":"bar","data":…}` — is left alone.
  s = s.replace(/([{,])\s*"[^"\\]*"\s*,\s*(?="[^"\\]*"\s*:)/g, '$1');

  // ORPHAN KEY as the last entry of an OBJECT: {"a":1,"b"} → {"a":1}
  // Anchored to `}` only. Allowing `]` here would eat the final element of a
  // legitimate string array, e.g. ["a","b"] → ["a"].
  s = s.replace(/,\s*"[^"\\]*"\s*(?=\s*})/g, '');

  // Trailing commas.
  s = s.replace(/,\s*(?=[}\]])/g, '');

  // Truncated tail: close whatever is still open.
  const open = unclosedBrackets(s);
  if (open.length) {
    // Drop a dangling partial token so the close isn't appended mid-value.
    s = s.replace(/,\s*(?:"[^"]*)?$/, '');
    s += open
      .reverse()
      .map(b => (b === '{' ? '}' : ']'))
      .join('');
  }

  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export default parseSpecJson;
