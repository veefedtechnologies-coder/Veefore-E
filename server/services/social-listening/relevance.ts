/**
 * Shared relevance scoring utilities for social listening.
 *
 * The goal is to ensure posts ingested from broad sources (Reddit search,
 * YouTube search, news feeds, etc.) actually match the user's niche before we
 * spend AI credits analyzing them or surface them as "signals".
 */

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'her',
  'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man',
  'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let',
  'put', 'say', 'she', 'too', 'use', 'with', 'this', 'that', 'from', 'they',
  'have', 'your', 'what', 'when', 'will', 'about', 'into', 'best', 'top'
]);

/**
 * Tokenize a free-text niche into meaningful keywords.
 */
export function tokenizeNiche(niche: string): string[] {
  return Array.from(
    new Set(
      niche
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    )
  );
}

/**
 * Score how relevant a piece of text is to a niche (0 - 1).
 *
 * - Exact phrase match of the full niche -> strong boost.
 * - Each matched keyword token contributes proportionally.
 */
export function scoreRelevance(text: string, niche: string): number {
  if (!text || !niche) return 0;

  const haystack = text.toLowerCase();
  const nicheLower = niche.trim().toLowerCase();

  // Full phrase match is the strongest signal.
  if (nicheLower.length >= 3 && haystack.includes(nicheLower)) {
    return 1;
  }

  const tokens = tokenizeNiche(niche);
  if (tokens.length === 0) {
    // Niche had only stopwords/short words; fall back to raw substring check.
    return haystack.includes(nicheLower) ? 1 : 0;
  }

  let matched = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) matched += 1;
  }

  return matched / tokens.length;
}

/**
 * Decide whether a post is relevant enough to keep.
 * Requires at least one strong token match (or partial phrase coverage).
 */
export function isRelevant(text: string, niche: string, threshold = 0.34): boolean {
  return scoreRelevance(text, niche) >= threshold;
}
