/**
 * External search/extraction provider cost (spec §20, §47).
 *
 * Web search and deep research pay real money to NON-LLM providers — Tavily and
 * Firecrawl — whose spend never appears in any token count. §20 requires that
 * cost be recorded and reconciled against actual usage, and §47 requires pricing
 * to live in centralized configuration rather than scattered magic numbers.
 *
 * These are the per-CALL prices in USD, from each provider's published rates, and
 * every one is overridable at runtime via an env var so a price change is a config
 * edit, not a redeploy of code. They are recorded via `recordExternalCostUSD`
 * inside the research service, so the VGU a search-heavy request costs reflects
 * the real API spend on top of the LLM token cost.
 *
 * When a provider does not expose an exact per-request charge (Tavily's research
 * API bills by internal credits it does not return), the value here is the best
 * available flat estimate for that provider — which is exactly the "baseline when
 * actual is unavailable" the spec allows.
 */

/** Keys for every metered external research call. */
export type SearchCostKey =
  | 'tavily.search'
  | 'firecrawl.search'
  | 'firecrawl.scrape'
  | 'tavily.research';

/** Published per-call defaults (USD). Overridable per key via env. */
const DEFAULT_SEARCH_COST_USD: Record<SearchCostKey, number> = {
  // Tavily advanced search — ~$0.008 per search (2 credits at ~$4/1000).
  'tavily.search': 0.008,
  // Firecrawl search — ~$0.002 per search request.
  'firecrawl.search': 0.002,
  // Firecrawl scrape — ~$0.001 per page.
  'firecrawl.scrape': 0.001,
  // Tavily research API (multi-agent, streamed): credit-billed and not returned
  // per request, so this is the flat baseline for one research job.
  'tavily.research': 0.1,
};

/** Turn a cost key into its env override name, e.g. VEEGPT_SEARCH_COST_TAVILY_SEARCH. */
function envNameFor(key: SearchCostKey): string {
  return `VEEGPT_SEARCH_COST_${key.replace(/\./g, '_').toUpperCase()}`;
}

/**
 * The USD cost of one external research call. Reads the env override when present
 * and valid (>= 0), else the published default. Never throws.
 */
export function searchProviderCostUSD(key: SearchCostKey): number {
  const raw = process.env[envNameFor(key)];
  if (raw !== undefined) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return DEFAULT_SEARCH_COST_USD[key];
}
