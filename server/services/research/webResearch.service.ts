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
import { withAIFeature, currentAIContext, recordExternalCostUSD } from '../aiUsageTracker';
import { searchProviderCostUSD } from '../../config/veegpt-search-cost';
import { withProviderRetry } from '../veegpt-retry';
import { vlog } from '../../utils/veegpt-debug-logger';

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v2';
const TAVILY_BASE = 'https://api.tavily.com';

const CACHE_TTL = {
  search: 6 * 60 * 60,   // 6h
  scrape: 24 * 60 * 60,  // 24h
  answer: 60 * 60,       // 1h
};

// Max sources surfaced in the answer's citation list. Raised from 6 → 10 so
// (up to) all of the results we read that the model actually cited are shown,
// instead of silently truncating the citation list. This shrinks the visible
// "read N vs cited M" gap to only the sources the model genuinely didn't use.
const MAX_CITED_SOURCES = 10;

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
  /** Rich live-progress callback — drives the deep-research streaming banner. */
  onProgress?: (event: ResearchProgressEvent) => void;
  /** Aborts research (web + AI calls) when the user cancels the generation. */
  signal?: AbortSignal;
}

/**
 * A single live-progress event emitted during (streaming) deep research. The
 * client accumulates these into the ChatGPT/Claude-style research banner:
 * planning → searching (with queries) → reading (with sources) → writing → done.
 */
export interface ResearchProgressEvent {
  kind: 'planning' | 'searching' | 'reading' | 'subtopic' | 'writing' | 'done';
  /** Short human label, e.g. "Searching the web". */
  label: string;
  /** Optional detail line (e.g. a subtopic or plan summary). */
  detail?: string;
  /** Search queries being executed (WebSearch steps). */
  queries?: string[];
  /** Sources discovered in THIS step (tool_response). */
  newSources?: Array<{ title: string; url: string; domain: string; favicon?: string }>;
  /** Running total of unique sources discovered so far. */
  sourceCount?: number;
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

/**
 * Retry a paid external call, bounded by the CURRENT feature's retry ceiling
 * (spec §37).
 *
 * These calls previously had no retry at all and their errors were swallowed, so
 * a single transient 429 or 503 from Tavily silently degraded a deep-research job
 * to "no sources". Retrying is worth it — but only for failures that can succeed,
 * and only as many times as the feature that started the job permits, so a
 * research retry can never become its own unbounded spend.
 *
 * The feature comes from the ambient AI context rather than a hardcoded name, so
 * the ceiling always belongs to whatever operation is actually paying.
 */
function retryExternal<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const feature = currentAIContext()?.feature || 'other';
  return withProviderRetry(
    { feature, maxRetries: 2, baseDelayMs: 400, maxDelayMs: 4000 },
    fn
  ).then(r => {
    if (r.retry.attempts > 1) {
      vlog('research:retried', { label, attempts: r.retry.attempts, failures: r.retry.failures });
    }
    return r.result;
  });
}

/** An HTTP error carrying its status, so retry classification can read it. */
class ExternalHttpError extends Error {
  constructor(readonly status: number, service: string, readonly headers?: Headers) {
    super(`${service} ${status}`);
    this.name = 'ExternalHttpError';
  }
}

interface RawSearchHit { title: string; url: string; snippet?: string; date?: string; score?: number }

async function tavilySearch(query: string, maxResults: number): Promise<RawSearchHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const resp = await retryExternal('tavily.search', async () => {
    const r = await fetch(`${TAVILY_BASE}/search`, {
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
    // Thrown with its status so the retry layer can tell a 429 (worth another
    // attempt) from a 400 (never worth one).
    if (!r.ok) throw new ExternalHttpError(r.status, 'Tavily', r.headers);
    return r;
  });
  const data: any = await resp.json();
  // §20: record the real Tavily search spend against this operation's VGU.
  recordExternalCostUSD(searchProviderCostUSD('tavily.search'));
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
  const resp = await retryExternal('firecrawl.search', async () => {
    const r = await fetch(`${FIRECRAWL_BASE}/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, limit: maxResults }),
    });
    if (!r.ok) throw new ExternalHttpError(r.status, 'Firecrawl search', r.headers);
    return r;
  });
  const data: any = await resp.json();
  // §20: record the real Firecrawl search spend against this operation's VGU.
  recordExternalCostUSD(searchProviderCostUSD('firecrawl.search'));
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
  const resp = await retryExternal('firecrawl.scrape', async () => {
    const r = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    });
    if (!r.ok) throw new ExternalHttpError(r.status, 'Firecrawl scrape', r.headers);
    return r;
  });
  const data: any = await resp.json();
  // §20: record the real Firecrawl scrape spend against this operation's VGU.
  recordExternalCostUSD(searchProviderCostUSD('firecrawl.scrape'));
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

  // The web search almost always returns the full `maxResults`, so a count here
  // is ~always "10" and reads as fake. We keep the live status count-free; the
  // REAL, varying number (how many sources were actually cited) is surfaced in
  // the card title, which stays on screen.
  onStatus?.('Reading sources…');
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
      answer: '', keyPoints: [], sources: sources.slice(0, MAX_CITED_SOURCES), query,
    };
  }

  const usedIdx: number[] = Array.isArray(parsed?.usedSourceIndexes) ? parsed.usedSourceIndexes : [];
  const usedSources = usedIdx.length
    ? usedIdx.map((i) => sources[i - 1]).filter(Boolean)
    : sources.slice(0, MAX_CITED_SOURCES);

  const result: ResearchResult = {
    answer: typeof parsed?.answer === 'string' ? parsed.answer.trim() : '',
    keyPoints: Array.isArray(parsed?.keyPoints) ? parsed.keyPoints.map((s: any) => String(s)).filter(Boolean).slice(0, 7) : [],
    sources: (usedSources.length ? usedSources : sources).slice(0, MAX_CITED_SOURCES),
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
  /** The full, long-form Markdown report (the real "deep research" body). */
  reportMarkdown?: string;
  executiveSummary: string;
  keyFindings: string[];
  trends: Array<{ topic: string; status: string; note?: string }>;
  opportunities: string[];
  risks: string[];
  sources: ResearchSource[];
}

function normalizeTrends(raw: any): Array<{ topic: string; status: string; note?: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t: any) => t && (t.topic || typeof t === 'string'))
    .map((t: any) => {
      if (typeof t === 'string') return { topic: t, status: 'trending' as const };
      return {
        topic: String(t.topic),
        status: ['emerging', 'rising', 'trending', 'saturated', 'declining'].includes(t.status) ? t.status : 'trending',
        note: t.note ? String(t.note) : undefined,
      };
    })
    .slice(0, 8);
}

function strArray(raw: any, cap: number): string[] {
  return Array.isArray(raw) ? raw.map((s: any) => String(s)).filter(Boolean).slice(0, cap) : [];
}

/**
 * JSON Schema describing the structured deep-research report we want Tavily's
 * research agent to return. When passed as `output_schema`, Tavily returns
 * `content` as an object matching this shape instead of a prose string.
 */
const TAVILY_REPORT_SCHEMA = {
  properties: {
    report: {
      type: 'string',
      description:
        'The FULL, in-depth research report as GitHub-Flavored MARKDOWN (1500-3000+ words), formatted like a professional ' +
        'analyst report (ChatGPT/Claude deep-research quality).\n' +
        'STRICT FORMATTING RULES (must follow exactly):\n' +
        '- Use Markdown heading SYNTAX for every heading: "# " for the report title, "## " for each major section, "### " for sub-sections. ' +
        'NEVER write a heading as a plain sentence or as "Section 1:"/"1.1" plain text — always use #/##/### markers.\n' +
        '- Separate every paragraph with a BLANK line. Keep paragraphs 2-5 sentences.\n' +
        '- Use "- " for bullet lists and "1." for numbered lists (one item per line).\n' +
        '- Use **bold** for key terms, metrics, and figures; use tables (Markdown "| col | col |") where comparing data.\n' +
        '- Use "> " for notable callouts/quotes.\n' +
        'STRUCTURE: a short intro paragraph, then sections such as Executive Summary, then multiple analytical sections ' +
        '(market/overview, detailed analysis per subtopic with concrete data & inline source references, comparisons, ' +
        'implications, opportunities, risks) and a Conclusion. Be comprehensive, specific, and evidence-backed — never terse.',
    },
    executiveSummary: {
      type: 'string',
      description: 'A thorough 2-4 paragraph executive summary of the research findings.',
    },
    keyFindings: {
      type: 'array',
      description: '4-8 concise, specific, well-grounded key findings.',
      items: { type: 'string' },
    },
    trends: {
      type: 'array',
      description: 'Current trends discovered, each classified by momentum.',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The trend / topic name.' },
          status: {
            type: 'string',
            description: 'One of: emerging, rising, trending, saturated, declining.',
          },
          note: { type: 'string', description: 'A short note on why / evidence.' },
        },
      },
    },
    opportunities: {
      type: 'array',
      description: '2-5 concrete opportunities or recommended actions.',
      items: { type: 'string' },
    },
    risks: {
      type: 'array',
      description: '1-4 risks, caveats, or things to watch out for.',
      items: { type: 'string' },
    },
  },
  required: ['report', 'executiveSummary', 'keyFindings'],
} as const;

/**
 * Proper multi-agent deep research via Tavily's Research API.
 * POSTs a research task, polls until completion, and returns a structured
 * report + real cited sources. Emits human-readable progress via `onStatus`.
 * Throws if Tavily isn't configured or the task fails/times out (so the caller
 * can fall back to the Firecrawl fan-out).
 */
async function tavilyDeepResearch(
  query: string,
  opts: {
    model?: 'mini' | 'pro' | 'auto';
    onStatus?: (s: string) => void;
    onProgress?: (e: ResearchProgressEvent) => void;
    signal?: AbortSignal;
  },
): Promise<DeepResearchReport> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('Tavily not configured');
  const { model = 'pro', onStatus, onProgress, signal } = opts;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };

  onStatus?.('Planning the research…');
  signal?.throwIfAborted?.();

  // Open a STREAMING research task — we get live tool_call / tool_response /
  // content events (planning → searching → reading sources → writing) which we
  // relay to the client as a live "deep research" banner (ChatGPT/Claude style).
  const resp = await fetch(`${TAVILY_BASE}/research`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      input: query,
      model,
      stream: true,
      output_schema: TAVILY_REPORT_SCHEMA,
      citation_format: 'numbered',
      output_length: 'long',
      exclude_domains: ['pinterest.com', 'quora.com'],
    }),
  });
  if (!resp.ok || !resp.body) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Tavily research stream ${resp.status} ${body.slice(0, 160)}`);
  }
  vlog('deepResearch:tavily-stream-open', { query: query.slice(0, 60), model });
  // §20/§22: record the real Tavily research-job spend against this operation's
  // VGU. Tavily bills this by internal credits it does not return, so the
  // configured flat baseline stands in for the actual per-job cost.
  recordExternalCostUSD(searchProviderCostUSD('tavily.research'));

  // Accumulators for the final report.
  const sourceMap = new Map<string, ResearchSource>();
  let structured: any = null;
  let prose = '';

  const addSources = (arr: any[]): Array<{ title: string; url: string; domain: string; favicon?: string }> => {
    const added: Array<{ title: string; url: string; domain: string; favicon?: string }> = [];
    for (const s of Array.isArray(arr) ? arr : []) {
      const url = s?.url;
      if (!url || sourceMap.has(url)) continue;
      const src: ResearchSource = { title: s.title || url, url, domain: domainOf(url) };
      sourceMap.set(url, src);
      added.push({ ...src, favicon: s.favicon });
    }
    return added;
  };

  // Parse the SSE stream line-by-line.
  const reader = (resp.body as any).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  const handleData = (payload: any) => {
    if (payload?.object === 'error') {
      throw new Error(String(payload.error || 'Tavily stream error'));
    }
    const delta = payload?.choices?.[0]?.delta;
    if (!delta) return;

    // Tool call / response events (the live activity feed).
    const tc = delta.tool_calls;
    if (tc && typeof tc === 'object') {
      if (tc.type === 'tool_call' && Array.isArray(tc.tool_call)) {
        for (const item of tc.tool_call) {
          const name = String(item?.name || '');
          if (name === 'Planning') {
            onStatus?.('Planning the research…');
            onProgress?.({ kind: 'planning', label: 'Planning the research', detail: item?.arguments });
          } else if (name === 'WebSearch') {
            const queries = Array.isArray(item?.queries) ? item.queries.map((q: any) => String(q)) : undefined;
            onStatus?.('Searching the web…');
            onProgress?.({ kind: 'searching', label: 'Searching the web', queries });
          } else if (name === 'ResearchSubtopic') {
            onStatus?.('Researching a subtopic…');
            onProgress?.({ kind: 'subtopic', label: 'Researching a subtopic', detail: item?.arguments });
          } else if (name === 'Generating') {
            onStatus?.('Writing the report…');
            onProgress?.({ kind: 'writing', label: 'Writing the report' });
          }
        }
      } else if (tc.type === 'tool_response' && Array.isArray(tc.tool_response)) {
        for (const item of tc.tool_response) {
          if (Array.isArray(item?.sources) && item.sources.length) {
            const added = addSources(item.sources);
            if (added.length) {
              onStatus?.('Reading and cross-checking sources…');
              onProgress?.({
                kind: 'reading',
                label: 'Reading sources',
                newSources: added,
                sourceCount: sourceMap.size,
              });
            }
          }
        }
      }
    }

    // Report content — object (structured, via output_schema) or string chunks.
    if (delta.content != null) {
      if (typeof delta.content === 'object') structured = delta.content;
      else if (typeof delta.content === 'string') prose += delta.content;
    }

    // Final consolidated sources event.
    if (Array.isArray(delta.sources) && delta.sources.length) {
      addSources(delta.sources);
    }
  };

  try {
    while (!done) {
      signal?.throwIfAborted?.();
      const { value, done: rDone } = await reader.read();
      if (rDone) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const raw = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!raw) continue;
        if (raw.startsWith('event:')) {
          if (raw.slice(6).trim() === 'done') { done = true; break; }
          continue;
        }
        if (raw.startsWith('data:')) {
          const json = raw.slice(5).trim();
          if (!json || json === '[DONE]') continue;
          try { handleData(JSON.parse(json)); } catch { /* skip malformed line */ }
        }
      }
    }
  } catch (e: any) {
    // User pressed Stop (abort) or the stream errored. Re-throw a real abort so
    // the caller can short-circuit; swallow benign post-abort read errors.
    if (e?.name === 'AbortError' || signal?.aborted) {
      // cancel the body below, then rethrow the abort for the caller to handle
      try { await reader.cancel(); } catch { /* ignore */ }
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    // Non-abort stream error: stop reading and fall through to build whatever
    // partial report we have (better than crashing).
  } finally {
    // reader.cancel() returns a PROMISE — it MUST be awaited/caught here, or an
    // abort-time rejection escapes as an unhandled rejection and (via the
    // graceful-shutdown handler) crashes the whole server.
    try { await reader.cancel(); } catch { /* ignore */ }
  }

  onProgress?.({ kind: 'done', label: 'Research complete', sourceCount: sourceMap.size });

  const sources = Array.from(sourceMap.values());
  const report: DeepResearchReport = {
    query,
    reportMarkdown: structured?.report ? String(structured.report).trim() : (prose.trim() || undefined),
    executiveSummary: structured?.executiveSummary
      ? String(structured.executiveSummary).trim()
      : prose.trim(),
    keyFindings: strArray(structured?.keyFindings, 8),
    trends: normalizeTrends(structured?.trends),
    opportunities: strArray(structured?.opportunities, 5),
    risks: strArray(structured?.risks, 4),
    sources: sources.slice(0, MAX_CITED_SOURCES),
  };
  if (!report.executiveSummary && !report.reportMarkdown && !report.sources.length) {
    throw new Error('Tavily research stream produced no report');
  }
  vlog('deepResearch:tavily-ok', {
    query: query.slice(0, 60),
    hasSummary: !!report.executiveSummary,
    findings: report.keyFindings.length,
    sources: report.sources.length,
  });
  return report;
}

/**
 * Firecrawl fan-out deep research (fallback when Tavily Research isn't
 * available). Generates several research angles, runs a Firecrawl search +
 * markdown scrape per angle, then synthesizes a structured cited report with
 * our own LLM.
 */
async function firecrawlDeepResearch(query: string, opts: ResearchOptions): Promise<DeepResearchReport> {
  const { preferences = {}, userId, workspaceId, onStatus, signal } = opts;
  if (!process.env.FIRECRAWL_API_KEY) throw new Error('Firecrawl not configured');

  onStatus?.('Planning the research…');
  signal?.throwIfAborted?.();

  // 1) Generate 3-4 research angles.
  const angles: string[] = [
    `${query} overview and current state`,
    `${query} latest trends and data`,
    `${query} opportunities and best practices`,
    `${query} risks, challenges and criticism`,
  ];

  // 2) Search + scrape markdown per angle (Firecrawl v2 search with scrapeOptions).
  onStatus?.('Searching across the web…');
  const key = process.env.FIRECRAWL_API_KEY;
  const fcHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
  const seen = new Set<string>();
  const docs: Array<{ source: ResearchSource; content: string }> = [];

  for (let i = 0; i < angles.length; i++) {
    signal?.throwIfAborted?.();
    if (i === 1) onStatus?.('Reading and cross-checking sources…');
    try {
      const resp = await fetch(`${FIRECRAWL_BASE}/search`, {
        method: 'POST',
        headers: fcHeaders,
        signal,
        body: JSON.stringify({
          query: angles[i],
          limit: 4,
          scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
        }),
      });
      if (!resp.ok) continue;
      // §20: each angle is a Firecrawl search-with-scrape call — record its cost.
      recordExternalCostUSD(
        searchProviderCostUSD('firecrawl.search') + searchProviderCostUSD('firecrawl.scrape')
      );
      const data: any = await resp.json();
      const results = data?.data?.web || data?.data || data?.results || [];
      for (const r of Array.isArray(results) ? results : []) {
        const url = r.url || r.metadata?.sourceURL;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        const md = typeof r.markdown === 'string' ? r.markdown : '';
        const content = (md || r.description || r.snippet || '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
          .slice(0, 5000);
        docs.push({
          source: {
            title: r.title || r.metadata?.title || url,
            url,
            domain: domainOf(url),
            date: r.metadata?.publishedDate || undefined,
          },
          content,
        });
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      /* skip this angle */
    }
  }

  if (!docs.length) throw new Error('Firecrawl fan-out returned no sources');

  // 3) Synthesize a structured report with our LLM.
  signal?.throwIfAborted?.();
  onStatus?.('Writing the report…');
  const corpus = docs
    .slice(0, 12)
    .map((d, i) => `[Source ${i + 1}] ${d.source.title} (${d.source.domain})\nURL: ${d.source.url}\n${d.content || ''}`)
    .join('\n\n---\n\n');
  const reportPrompt =
    `You are VeeGPT's senior research analyst. Using ONLY the web sources below, produce a thorough, well-grounded deep-research report for the request: "${query}". ` +
    `Never invent facts or citations.\n\nWeb sources:\n${corpus}\n\n` +
    'Respond with ONLY a JSON object: {"executiveSummary": string (2-4 paragraphs), "keyFindings": string[] (4-8), ' +
    '"trends": [{"topic": string, "status": "emerging"|"rising"|"trending"|"saturated"|"declining", "note": string}], ' +
    '"opportunities": string[] (2-5), "risks": string[] (1-4)}';
  let parsed: any = {};
  try {
    parsed = await withAIFeature('trend.intelligence', { userId, workspaceId }, () =>
      aiServiceManager.generateJSON(reportPrompt, { ...preferences, responseLength: 'long', creativityLevel: 0.3 }, { preferGemini: true, signal }));
  } catch { /* return sources at least */ }

  const allSources: ResearchSource[] = [];
  const srcSeen = new Set<string>();
  for (const d of docs) {
    if (srcSeen.has(d.source.url)) continue;
    srcSeen.add(d.source.url);
    allSources.push(d.source);
  }

  return {
    query,
    executiveSummary: typeof parsed?.executiveSummary === 'string' ? parsed.executiveSummary.trim() : '',
    keyFindings: strArray(parsed?.keyFindings, 8),
    trends: normalizeTrends(parsed?.trends),
    opportunities: strArray(parsed?.opportunities, 5),
    risks: strArray(parsed?.risks, 4),
    sources: allSources.slice(0, MAX_CITED_SOURCES),
  };
}

/**
 * Deep Research entry point. Prefers a proper multi-agent research pass:
 *   1) Tavily Research API (multi-agent, best quality)   — if TAVILY_API_KEY
 *   2) Firecrawl search + scrape fan-out                 — if FIRECRAWL_API_KEY
 *   3) LLM query-expansion multi-pass (legacy fallback)  — always works
 * All paths return the same structured `DeepResearchReport` so the deep_research
 * card renders identically. `onStatus` reports human-readable progress.
 */
export async function deepResearch(query: string, opts: ResearchOptions = {}): Promise<DeepResearchReport> {
  const { userId, workspaceId } = opts;

  // Try Tavily's multi-agent research first (the real "deep research").
  if (process.env.TAVILY_API_KEY) {
    try {
      const report = await tavilyDeepResearch(query, {
        model: 'pro',
        onStatus: opts.onStatus,
        onProgress: opts.onProgress,
        signal: opts.signal,
      });
      if (report.executiveSummary || report.sources.length) {
        void persistResearch(query, 'search', {
          answer: report.executiveSummary, keyPoints: report.keyFindings, sources: report.sources, query, trends: report.trends as any,
        }, { userId, workspaceId, fromCache: false }).catch(() => {});
        return report;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      vlog('deepResearch:tavily-fallback', { query: query.slice(0, 60), error: err?.message });
    }
  }

  // Fall back to a Firecrawl search + scrape fan-out.
  if (process.env.FIRECRAWL_API_KEY) {
    try {
      const report = await firecrawlDeepResearch(query, opts);
      if (report.executiveSummary || report.sources.length) {
        void persistResearch(query, 'search', {
          answer: report.executiveSummary, keyPoints: report.keyFindings, sources: report.sources, query, trends: report.trends as any,
        }, { userId, workspaceId, fromCache: false }).catch(() => {});
        return report;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      vlog('deepResearch:firecrawl-fallback', { query: query.slice(0, 60), error: err?.message });
    }
  }

  // Final fallback: the legacy LLM query-expansion multi-pass approach.
  return legacyDeepResearch(query, opts);
}

/**
 * Legacy Deep Research: expand the query into several sub-queries, research
 * each with the single-pass engine, then synthesize a structured report.
 * Used as the final fallback when neither Tavily Research nor Firecrawl
 * fan-out are available.
 */
async function legacyDeepResearch(query: string, opts: ResearchOptions = {}): Promise<DeepResearchReport> {
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
