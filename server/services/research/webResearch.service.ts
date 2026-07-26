/**
 * VeeGPT Web Research & Trend Intelligence Engine
 * ------------------------------------------------
 * A self-owned, provider-agnostic "Perplexity-like" research engine for VeeGPT.
 * It does NOT use the Perplexity API. Instead it composes:
 *   - Tavily        → web search (with a Firecrawl /search fallback)
 *   - Firecrawl     → clean content extraction (scrape → markdown)
 *   - our own LLMs  → reasoning, synthesis, trend scoring (via AIServiceManager)
 *
 * Pipeline: query → (expand) → search → rank/filter → extract → synthesize →
 * structured answer with citations. Results are cached in Redis to avoid
 * duplicate API calls. A `onStatus` callback streams human progress phases so
 * the VeeGPT shimmer text can say what's actually happening.
 *
 * Keys (all optional — the engine degrades gracefully):
 *   TAVILY_API_KEY    — enables Tavily search (preferred)
 *   FIRECRAWL_API_KEY — enables Firecrawl scrape + keyless-fallback search
 */

import { aiServiceManager, type UserAIPreferences } from '../AIServiceManager';
import { withAIFeature } from '../aiUsageTracker';
import { vlog } from '../../utils/veegpt-debug-logger';

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v2';
const TAVILY_BASE = 'https://api.tavily.com';

const CACHE_TTL = {
  search: 6 * 60 * 60,   // 6h
  scrape: 24 * 60 * 60,  // 24h
  answer: 60 * 60,       // 1h
};

export interface ResearchSource {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  date?: string;
}

export interface ResearchResult {
  answer: string;
  /** Structured key findings/bullets the LLM extracted. */
  keyPoints: string[];
  sources: ResearchSource[];
  query: string;
  /** Optional trend classification when mode = 'trends'. */
  trends?: Array<{ topic: string; status: 'emerging' | 'rising' | 'trending' | 'saturated' | 'declining'; note?: string }>;
}

export type ResearchMode = 'search' | 'trends' | 'competitors';

export interface ResearchOptions {
  mode?: ResearchMode;
  maxResults?: number;
  /** Number of top pages to fully extract with Firecrawl. */
  extractCount?: number;
  preferences?: UserAIPreferences;
  userId?: string;
  workspaceId?: string;
  /** Progress callback — fed to the VeeGPT shimmer text. */
  onStatus?: (status: string) => void;
  /** Aborts research (web + AI calls) when the user cancels the generation. */
  signal?: AbortSignal;
}

// ─── Redis cache (best-effort, never throws) ────────────────────────────────

let redisRef: any = null;
async function getRedis(): Promise<any | null> {
  try {
    if (redisRef) return redisRef;
    const { getSharedRedisConnection } = await import('../../lib/redis');
    redisRef = getSharedRedisConnection();
    return redisRef;
  } catch {
    return null;
  }
}

async function cacheGet(key: string): Promise<any | null> {
  try {
    const r = await getRedis();
    if (!r) return null;
    const raw = await r.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, value: any, ttlSeconds: number): Promise<void> {
  try {
    const r = await getRedis();
    if (!r) return;
    await r.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    /* ignore */
  }
}

function hashKey(parts: string[]): string {
  // Simple stable key (no crypto dependency needed — inputs are short).
  return parts.join('|').toLowerCase().replace(/\s+/g, '_').slice(0, 220);
}

// ─── Provider availability ──────────────────────────────────────────────────

export function isResearchConfigured(): boolean {
  return !!(process.env.TAVILY_API_KEY || process.env.FIRECRAWL_API_KEY);
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Low-authority / noisy domains we de-prioritize.
const DEPRIORITIZE = /(pinterest\.|quora\.com|\.blogspot\.|tumblr\.com|slideshare\.)/i;

// ─── Search layer (Tavily preferred, Firecrawl fallback) ────────────────────

interface RawSearchHit { title: string; url: string; snippet?: string; date?: string; score?: number }

async function tavilySearch(query: string, maxResults: number): Promise<RawSearchHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const resp = await fetch(`${TAVILY_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: 'advanced',
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!resp.ok) throw new Error(`Tavily ${resp.status}`);
  const data: any = await resp.json();
  return (data?.results || []).map((r: any) => ({
    title: r.title || r.url,
    url: r.url,
    snippet: r.content || r.snippet || '',
    date: r.published_date || undefined,
    score: typeof r.score === 'number' ? r.score : undefined,
  }));
}

async function firecrawlSearch(query: string, maxResults: number): Promise<RawSearchHit[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  const resp = await fetch(`${FIRECRAWL_BASE}/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, limit: maxResults }),
  });
  if (!resp.ok) throw new Error(`Firecrawl search ${resp.status}`);
  const data: any = await resp.json();
  const results = data?.data?.web || data?.data || data?.results || [];
  return (Array.isArray(results) ? results : []).map((r: any) => ({
    title: r.title || r.metadata?.title || r.url,
    url: r.url || r.metadata?.sourceURL,
    snippet: r.description || r.snippet || (typeof r.markdown === 'string' ? r.markdown.slice(0, 240) : ''),
    date: r.metadata?.publishedDate || undefined,
  })).filter((r: RawSearchHit) => r.url);
}

/** Search the web. Tries Tavily first, falls back to Firecrawl search. */
async function searchWeb(query: string, maxResults: number): Promise<RawSearchHit[]> {
  const cacheKey = `research:search:${hashKey([query, String(maxResults)])}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  let hits: RawSearchHit[] = [];
  try {
    hits = await tavilySearch(query, maxResults);
  } catch { /* fall back */ }
  if (!hits.length) {
    try {
      hits = await firecrawlSearch(query, maxResults);
    } catch { /* none */ }
  }

  // Rank: dedupe by domain-ish, push deprioritized domains down, keep score order.
  const seen = new Set<string>();
  const ranked = hits
    .filter((h) => {
      const d = domainOf(h.url);
      if (!d) return false;
      const k = d + (h.url.split('?')[0]);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => {
      const ad = DEPRIORITIZE.test(a.url) ? 1 : 0;
      const bd = DEPRIORITIZE.test(b.url) ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return (b.score || 0) - (a.score || 0);
    });

  if (ranked.length) await cacheSet(cacheKey, ranked, CACHE_TTL.search);
  return ranked;
}

// ─── Extraction layer (Firecrawl scrape) ────────────────────────────────────

async function firecrawlScrape(url: string): Promise<string> {
  const key = process.env.FIRECRAWL_API_KEY;
  const cacheKey = `research:scrape:${hashKey([url])}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached.markdown || '';

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  const resp = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
  });
  if (!resp.ok) throw new Error(`Firecrawl scrape ${resp.status}`);
  const data: any = await resp.json();
  const markdown: string = data?.data?.markdown || data?.markdown || '';
  // Trim boilerplate-ish whitespace and cap size for the LLM.
  const clean = markdown.replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);
  if (clean) await cacheSet(cacheKey, { markdown: clean }, CACHE_TTL.scrape);
  return clean;
}

// ─── LLM synthesis ──────────────────────────────────────────────────────────

function buildSynthesisPrompt(query: string, mode: ResearchMode, docs: Array<{ source: ResearchSource; content: string }>): string {
  const corpus = docs
    .map((d, i) => `[Source ${i + 1}] ${d.source.title} (${d.source.domain})${d.source.date ? ` — ${d.source.date}` : ''}\nURL: ${d.source.url}\n${d.content || d.source.snippet || ''}`)
    .join('\n\n---\n\n');

  const modeGuide =
    mode === 'trends'
      ? 'Focus on identifying CURRENT TRENDS. For each distinct trend, classify it as one of: emerging, rising, trending, saturated, declining. Note recency and momentum.'
      : mode === 'competitors'
      ? 'Focus on identifying real COMPETITORS / similar brands or products, what they do, and how they differ.'
      : 'Answer the question accurately and concisely using only the sources.';

  return (
    'You are VeeGPT\'s web-research analyst. Using ONLY the web sources below, answer the user\'s request with accurate, current, well-grounded information. ' +
    'NEVER invent facts or citations — if the sources don\'t cover something, say so.\n\n' +
    `${modeGuide}\n\n` +
    `User request: "${query}"\n\n` +
    `Web sources:\n${corpus}\n\n` +
    'Respond with ONLY a JSON object of this exact shape:\n' +
    '{"answer": string (2-5 short paragraphs, markdown allowed), ' +
    '"keyPoints": string[] (3-7 concise bullet takeaways), ' +
    (mode === 'trends' ? '"trends": [{"topic": string, "status": "emerging"|"rising"|"trending"|"saturated"|"declining", "note": string}], ' : '') +
    '"usedSourceIndexes": number[] (1-based indexes of the sources you actually used)}'
  );
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run a full research pass: search → extract top pages → synthesize an answer
 * with citations. Caches the final answer. `onStatus` reports progress phases.
 */
export async function research(query: string, opts: ResearchOptions = {}): Promise<ResearchResult> {
  const {
    mode = 'search',
    maxResults = 10,
    extractCount = 4,
    preferences = {},
    userId,
    workspaceId,
    onStatus,
    signal,
  } = opts;

  const cacheKey = `research:answer:${hashKey([mode, query])}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    onStatus?.('Found cached research');
    void persistResearch(query, mode, cached, { userId, workspaceId, fromCache: true }).catch(() => {});
    return cached;
  }

  signal?.throwIfAborted?.();
  onStatus?.('Searching the web…');
  const hits = await searchWeb(query, maxResults);
  if (!hits.length) {
    return { answer: '', keyPoints: [], sources: [], query };
  }

  const sources: ResearchSource[] = hits.map((h) => ({
    title: h.title, url: h.url, domain: domainOf(h.url), snippet: h.snippet, date: h.date,
  }));

  // Extract the top N pages for full content; the rest contribute their snippet.
  onStatus?.(`Reading ${Math.min(extractCount, sources.length)} sources…`);
  const toExtract = sources.slice(0, extractCount);
  const extracted = await Promise.all(
    toExtract.map(async (s) => {
      try {
        const content = await firecrawlScrape(s.url);
        return { source: s, content };
      } catch {
        return { source: s, content: s.snippet || '' };
      }
    }),
  );
  const docs = [
    ...extracted,
    ...sources.slice(extractCount).map((s) => ({ source: s, content: s.snippet || '' })),
  ].filter((d) => d.content || d.source.snippet);

  signal?.throwIfAborted?.();
  onStatus?.('Analyzing and summarizing…');
  const prompt = buildSynthesisPrompt(query, mode, docs);
  vlog('research:synthesis-start', { query: query.slice(0, 60), mode, docCount: docs.length, promptLen: prompt.length });
  let parsed: any = {};
  try {
    parsed = await withAIFeature('trend.intelligence', { userId, workspaceId }, () =>
      aiServiceManager.generateJSON(prompt, { ...preferences, responseLength: 'medium', creativityLevel: 0.3 }, { preferGemini: true, signal }));
    vlog('research:synthesis-ok', { query: query.slice(0, 60), hasAnswer: !!parsed?.answer, answerLen: (parsed?.answer || '').length, keys: Object.keys(parsed || {}) });
  } catch (err: any) {
    // LLM failed — still return sources so the user gets something useful.
    vlog('research:synthesis-failed', { query: query.slice(0, 60), error: err?.message });
    return {
      answer: '', keyPoints: [], sources: sources.slice(0, 6), query,
    };
  }

  const usedIdx: number[] = Array.isArray(parsed?.usedSourceIndexes) ? parsed.usedSourceIndexes : [];
  const usedSources = usedIdx.length
    ? usedIdx.map((i) => sources[i - 1]).filter(Boolean)
    : sources.slice(0, 6);

  const result: ResearchResult = {
    answer: typeof parsed?.answer === 'string' ? parsed.answer.trim() : '',
    keyPoints: Array.isArray(parsed?.keyPoints) ? parsed.keyPoints.map((s: any) => String(s)).filter(Boolean).slice(0, 7) : [],
    sources: (usedSources.length ? usedSources : sources).slice(0, 6),
    query,
    trends: Array.isArray(parsed?.trends)
      ? parsed.trends
          .filter((t: any) => t && t.topic)
          .map((t: any) => ({
            topic: String(t.topic),
            status: ['emerging', 'rising', 'trending', 'saturated', 'declining'].includes(t.status) ? t.status : 'trending',
            note: t.note ? String(t.note) : undefined,
          }))
          .slice(0, 8)
      : undefined,
  };

  if (result.answer || result.sources.length) await cacheSet(cacheKey, result, CACHE_TTL.answer);

  // Durable persistence (best-effort; never blocks the response).
  void persistResearch(query, mode, result, { userId, workspaceId, fromCache: false }).catch(() => {});

  return result;
}

// ─── Persistence (durable record reused by other features) ──────────────────

async function persistResearch(
  query: string,
  mode: ResearchMode,
  result: ResearchResult,
  meta: { userId?: string; workspaceId?: string; fromCache: boolean },
): Promise<void> {
  if (!meta.userId || !meta.workspaceId) return;
  try {
    const { SearchHistory, ResearchReport, TrendTopic } = await import('../../models/Research/ResearchModels');
    await SearchHistory.create({
      userId: meta.userId, workspaceId: meta.workspaceId, query, mode,
      resultCount: result.sources.length, fromCache: meta.fromCache,
    });
    if (result.answer || result.sources.length) {
      await ResearchReport.create({
        userId: meta.userId, workspaceId: meta.workspaceId, query, mode,
        answer: result.answer, keyPoints: result.keyPoints,
        trends: result.trends, sources: result.sources,
      });
    }
    if (mode === 'trends' && result.trends?.length) {
      // Upsert the latest trend snapshot for this niche (query acts as niche key).
      const niche = query.toLowerCase().trim().slice(0, 80);
      await TrendTopic.updateOne(
        { workspaceId: meta.workspaceId, niche },
        {
          $set: { trends: result.trends, sources: result.sources, updatedAt: new Date() },
          $setOnInsert: { userId: meta.userId, workspaceId: meta.workspaceId, niche, createdAt: new Date() },
        },
        { upsert: true },
      );
    }
  } catch {
    /* persistence is best-effort */
  }
}

// ─── Deep Research (multi-query report) ─────────────────────────────────────

export interface DeepResearchReport {
  query: string;
  executiveSummary: string;
  keyFindings: string[];
  trends: Array<{ topic: string; status: string; note?: string }>;
  opportunities: string[];
  risks: string[];
  sources: ResearchSource[];
}

/**
 * Deep Research: expand the query into several sub-queries, research each,
 * then synthesize a structured report (exec summary / findings / trends /
 * opportunities / risks / sources). Heavier + multi-pass; use for explicit
 * "deep research" / "create a report" requests.
 */
export async function deepResearch(query: string, opts: ResearchOptions = {}): Promise<DeepResearchReport> {
  const { preferences = {}, userId, workspaceId, onStatus, signal } = opts;

  signal?.throwIfAborted?.();
  onStatus?.('Planning the research…');
  // 1) Expand into sub-queries with the LLM (cheap, one call).
  let subQueries: string[] = [];
  try {
    const expandPrompt =
      `Break this research request into 3-4 specific web-search sub-queries that together cover it comprehensively. ` +
      `Request: "${query}". Respond with ONLY a JSON array of short query strings.`;
    const expanded = await withAIFeature('trend.intelligence', { userId, workspaceId }, () =>
      aiServiceManager.generateJSON(expandPrompt, { ...preferences, responseLength: 'short', creativityLevel: 0.3 }, { preferGemini: true, signal }));
    if (Array.isArray(expanded)) subQueries = expanded.map((q: any) => String(q)).filter(Boolean).slice(0, 4);
  } catch { /* fall back to single query */ }
  if (!subQueries.length) subQueries = [query];

  // 2) Research each sub-query (reuses the cached single-pass engine).
  const subResults: ResearchResult[] = [];
  for (let i = 0; i < subQueries.length; i++) {
    signal?.throwIfAborted?.();
    onStatus?.(`Researching ${i + 1}/${subQueries.length}: ${subQueries[i].slice(0, 50)}…`);
    const r = await research(subQueries[i], { mode: 'search', preferences, userId, workspaceId, extractCount: 3, signal });
    subResults.push(r);
  }

  // 3) Merge sources (dedup by url) and synthesize the final report.
  const allSources: ResearchSource[] = [];
  const seen = new Set<string>();
  for (const r of subResults) {
    for (const s of r.sources) {
      if (seen.has(s.url)) continue;
      seen.add(s.url);
      allSources.push(s);
    }
  }
  signal?.throwIfAborted?.();
  onStatus?.('Writing the report…');
  const corpus = subResults
    .map((r, i) => `## ${subQueries[i]}\n${r.answer}\nKey points: ${r.keyPoints.join('; ')}`)
    .join('\n\n');
  const reportPrompt =
    `You are VeeGPT's senior research analyst. Synthesize the findings below into a structured report for the request: "${query}".\n\n` +
    `Findings:\n${corpus}\n\n` +
    'Respond with ONLY a JSON object: {"executiveSummary": string, "keyFindings": string[] (4-8), ' +
    '"trends": [{"topic": string, "status": "emerging"|"rising"|"trending"|"saturated"|"declining", "note": string}], ' +
    '"opportunities": string[] (2-5), "risks": string[] (1-4)}';
  let parsed: any = {};
  try {
    parsed = await withAIFeature('trend.intelligence', { userId, workspaceId }, () =>
      aiServiceManager.generateJSON(reportPrompt, { ...preferences, responseLength: 'long', creativityLevel: 0.3 }, { preferGemini: true, signal }));
  } catch { /* return what we have */ }

  const report: DeepResearchReport = {
    query,
    executiveSummary: typeof parsed?.executiveSummary === 'string' ? parsed.executiveSummary.trim() : (subResults[0]?.answer || ''),
    keyFindings: Array.isArray(parsed?.keyFindings) ? parsed.keyFindings.map((s: any) => String(s)).filter(Boolean).slice(0, 8) : [],
    trends: Array.isArray(parsed?.trends) ? parsed.trends.filter((t: any) => t?.topic).map((t: any) => ({
      topic: String(t.topic),
      status: ['emerging', 'rising', 'trending', 'saturated', 'declining'].includes(t.status) ? t.status : 'trending',
      note: t.note ? String(t.note) : undefined,
    })).slice(0, 8) : [],
    opportunities: Array.isArray(parsed?.opportunities) ? parsed.opportunities.map((s: any) => String(s)).filter(Boolean).slice(0, 5) : [],
    risks: Array.isArray(parsed?.risks) ? parsed.risks.map((s: any) => String(s)).filter(Boolean).slice(0, 4) : [],
    sources: allSources.slice(0, 10),
  };

  // Persist as a research report.
  void persistResearch(query, 'search', {
    answer: report.executiveSummary, keyPoints: report.keyFindings, sources: report.sources, query, trends: report.trends as any,
  }, { userId, workspaceId, fromCache: false }).catch(() => {});

  return report;
}
