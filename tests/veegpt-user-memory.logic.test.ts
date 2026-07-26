import { describe, it, expect } from 'vitest';
import {
  mergeMemoryItems,
  computeUsage,
  totalChars,
  clampItemText,
  hasSaveIntent,
  extractSaveIntentFact,
  dedupeMemoryItems,
  isMemoryFull,
  MEMORY_LIMITS,
  type MemoryItem,
} from '../server/routes/veegpt-user-memory.logic';

let counter = 0;
const makeId = () => `id${counter++}`;

function items(texts: string[]): MemoryItem[] {
  return texts.map((t, i) => ({ id: `e${i}`, text: t }));
}

describe('mergeMemoryItems', () => {
  it('adds new unique items', () => {
    const res = mergeMemoryItems(items(['Name is Alice']), ['Niche is fitness'], makeId);
    expect(res.added).toBe(1);
    expect(res.items.map((i) => i.text)).toEqual(['Name is Alice', 'Niche is fitness']);
  });

  it('skips near-duplicates (case/punctuation-insensitive)', () => {
    const res = mergeMemoryItems(items(['Name is Alice']), ['name is alice!', 'NAME IS ALICE'], makeId);
    expect(res.added).toBe(0);
    expect(res.skippedDuplicate).toBe(2);
    expect(res.items).toHaveLength(1);
  });

  it('skips blanks and dedupes within the incoming batch', () => {
    const res = mergeMemoryItems([], ['  ', 'fact one', 'fact one'], makeId);
    expect(res.added).toBe(1);
    expect(res.items).toHaveLength(1);
  });

  it('clamps overly long item text to MAX_ITEM_CHARS', () => {
    const long = 'x'.repeat(MEMORY_LIMITS.MAX_ITEM_CHARS + 100);
    const res = mergeMemoryItems([], [long], makeId);
    expect(res.items[0].text.length).toBe(MEMORY_LIMITS.MAX_ITEM_CHARS);
  });

  it('evicts oldest items when exceeding MAX_ITEMS', () => {
    const existing = items(Array.from({ length: MEMORY_LIMITS.MAX_ITEMS }, (_, i) => `old${i}`));
    const res = mergeMemoryItems(existing, ['brand new fact'], makeId);
    expect(res.items).toHaveLength(MEMORY_LIMITS.MAX_ITEMS);
    expect(res.evicted).toBe(1);
    // The very oldest is gone, the new one is present.
    expect(res.items.map((i) => i.text)).not.toContain('old0');
    expect(res.items.map((i) => i.text)).toContain('brand new fact');
  });

  it('evicts oldest items when exceeding MAX_CHARS', () => {
    // Each item ~ MAX_ITEM_CHARS; a handful overflows the char budget.
    const big = 'y'.repeat(MEMORY_LIMITS.MAX_ITEM_CHARS);
    const count = Math.ceil(MEMORY_LIMITS.MAX_CHARS / MEMORY_LIMITS.MAX_ITEM_CHARS) + 5;
    const existing = items(Array.from({ length: count }, () => big));
    const res = mergeMemoryItems(existing, [], makeId);
    expect(totalChars(res.items)).toBeLessThanOrEqual(MEMORY_LIMITS.MAX_CHARS);
    expect(res.evicted).toBeGreaterThan(0);
  });

  it('never evicts below a single item even if it exceeds char budget', () => {
    const huge = 'z'.repeat(MEMORY_LIMITS.MAX_ITEM_CHARS);
    const res = mergeMemoryItems([], [huge], makeId);
    expect(res.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('computeUsage', () => {
  it('empty → 0% used, 100% remaining', () => {
    const u = computeUsage([]);
    expect(u.itemCount).toBe(0);
    expect(u.usedChars).toBe(0);
    expect(u.usedPercent).toBe(0);
    expect(u.remainingPercent).toBe(100);
    expect(u.maxItems).toBe(MEMORY_LIMITS.MAX_ITEMS);
    expect(u.maxChars).toBe(MEMORY_LIMITS.MAX_CHARS);
  });

  it('reports the more-constraining of char% and item%', () => {
    // Fill all item slots with tiny text → item% dominates and is ~100%.
    const tiny = items(Array.from({ length: MEMORY_LIMITS.MAX_ITEMS }, () => 'x'));
    const u = computeUsage(tiny);
    expect(u.usedPercent).toBe(100);
    expect(u.remainingPercent).toBe(0);
  });

  it('caps usedPercent at 100', () => {
    const over = items(Array.from({ length: MEMORY_LIMITS.MAX_ITEMS + 10 }, () => 'x'));
    const u = computeUsage(over);
    expect(u.usedPercent).toBe(100);
  });

  it('char-based usage is reported proportionally', () => {
    const half = 'a'.repeat(Math.floor(MEMORY_LIMITS.MAX_CHARS / 2));
    const u = computeUsage([{ id: '1', text: half }]);
    // ~50% by chars (1 item is negligible % of MAX_ITEMS)
    expect(u.usedPercent).toBeGreaterThanOrEqual(49);
    expect(u.usedPercent).toBeLessThanOrEqual(51);
  });
});

describe('clampItemText', () => {
  it('trims and clamps', () => {
    expect(clampItemText('  hi  ')).toBe('hi');
    expect(clampItemText('x'.repeat(MEMORY_LIMITS.MAX_ITEM_CHARS + 50)).length).toBe(MEMORY_LIMITS.MAX_ITEM_CHARS);
  });
});

describe('hasSaveIntent', () => {
  it('detects explicit save requests', () => {
    for (const m of [
      'remember my brand color is blue',
      'please save that I post on weekends',
      'note this: I prefer short captions',
      'keep in mind I target Gen-Z',
      "don't forget my goal is 10k followers",
      'make a note that my niche is travel',
      'memorize my posting schedule',
      'keep track of my campaign ideas',
      'take note of my preferred tone',
    ]) {
      expect(hasSaveIntent(m)).toBe(true);
    }
  });

  it('ignores normal messages without save intent', () => {
    for (const m of [
      'what is my name',
      'give me 5 reel ideas',
      'how do I grow on instagram',
      'write a caption about coffee',
      '',
    ]) {
      expect(hasSaveIntent(m)).toBe(false);
    }
  });

  it('is case-insensitive', () => {
    expect(hasSaveIntent('REMEMBER this please')).toBe(true);
  });
});

describe('extractSaveIntentFact', () => {
  it('strips a leading save phrase but keeps the user wording', () => {
    expect(extractSaveIntentFact('remember that I post only on weekends')).toMatch(/^I post only on weekends/i);
    expect(extractSaveIntentFact('save my brand color is blue')).toMatch(/^My brand color is blue/i);
  });

  it('strips a trailing save phrase', () => {
    expect(extractSaveIntentFact('we only post in weekend remember that')).toMatch(/we only post in weekend/i);
  });

  it('capitalizes the result', () => {
    const f = extractSaveIntentFact('remember my niche is travel') || '';
    expect(f[0]).toBe(f[0].toUpperCase());
  });

  it('returns null when nothing meaningful remains', () => {
    expect(extractSaveIntentFact('remember that')).toBeNull();
    expect(extractSaveIntentFact('please remember')).toBeNull();
    expect(extractSaveIntentFact('')).toBeNull();
  });

  it('clamps very long facts', () => {
    const long = 'remember that ' + 'x'.repeat(MEMORY_LIMITS.MAX_ITEM_CHARS + 100);
    expect((extractSaveIntentFact(long) || '').length).toBeLessThanOrEqual(MEMORY_LIMITS.MAX_ITEM_CHARS);
  });
});

describe('dedupeMemoryItems', () => {
  it('collapses items with the same normalized text, keeping the first', () => {
    const list: MemoryItem[] = [
      { id: 'a', text: "Arpit's posting schedule is Sunday and Monday." },
      { id: 'b', text: "arpit's posting schedule is sunday and monday" },
      { id: 'c', text: 'Brand color is violet.' },
    ];
    const res = dedupeMemoryItems(list);
    expect(res.removed).toBe(1);
    expect(res.items.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('keeps distinct facts untouched', () => {
    const list: MemoryItem[] = [
      { id: 'a', text: 'Name is Alice' },
      { id: 'b', text: 'Niche is fitness' },
    ];
    const res = dedupeMemoryItems(list);
    expect(res.removed).toBe(0);
    expect(res.items).toHaveLength(2);
  });
});

describe('isMemoryFull', () => {
  it('is true when item count reaches the cap', () => {
    const list: MemoryItem[] = Array.from({ length: MEMORY_LIMITS.MAX_ITEMS }, (_, i) => ({ id: `i${i}`, text: `fact ${i}` }));
    expect(isMemoryFull(list)).toBe(true);
  });

  it('is false when under both caps', () => {
    expect(isMemoryFull([{ id: 'a', text: 'one fact' }])).toBe(false);
  });
});

describe('mergeMemoryItems single-value topic replacement', () => {
  it('replaces an existing posting-schedule fact instead of duplicating', () => {
    const existing = items(["Arpit's posting schedule is Sunday."]);
    const res = mergeMemoryItems(existing, ["Arpit's posting schedule is Sunday and Monday."], makeId);
    expect(res.added).toBe(0);
    expect(res.replaced).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].text).toBe("Arpit's posting schedule is Sunday and Monday.");
  });

  it('replaces an existing brand-color fact on change', () => {
    const existing = items(['Brand color is blue.']);
    const res = mergeMemoryItems(existing, ['Brand color is red.'], makeId);
    expect(res.replaced).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].text).toBe('Brand color is red.');
  });

  it('does not merge facts on different topics', () => {
    const existing = items(['Niche is fitness']);
    const res = mergeMemoryItems(existing, ['Brand color is blue.'], makeId);
    expect(res.added).toBe(1);
    expect(res.replaced).toBe(0);
    expect(res.items).toHaveLength(2);
  });
});
