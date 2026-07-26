# VeeGPT Capabilities Upgrade — Implementation Plan & Context

This document tracks a 10-part upgrade to VeeGPT's capabilities. It is the
source of truth for progress so context survives across sessions. Update the
STATUS of each item as it's completed.

## Ground rules (from the user)
- Production-level, permanent fixes — not symptom suppression.
- Prefer LLM-driven intent (tool-calling) over regex/keywords. The only
  intentional deterministic regex is the explicit "remember X" shortcut.
- Cost-conscious: minimize extra LLM calls; reuse existing services.
- Ask the user to confirm when something is ambiguous.
- After edits: run `getDiagnostics`, confirm server reload via
  `grep "routes:loaded" logs/veegpt-debug.log | tail -1`, and run unit tests.
- `cd` is NOT supported in bash — use `cwd`. Server is `npm run dev` (tsx watch).
- All AI calls must be wrapped in `withAIFeature(feature, usageCtx, fn)` so AI
  usage tracking stays accurate.

## Key files
- Tool defs: `server/routes/veegpt-tools.ts`
- Chat route + tool handlers + streamGeneration: `server/routes/veegpt-chat.routes.ts`
- AI provider manager: `server/services/AIServiceManager.ts`
- Memory logic (pure): `server/routes/veegpt-user-memory.logic.ts`
- Client chat stream hook: `client/src/features/chat/hooks/useChatStream.ts`
- Chat page: `client/src/pages/VeeGPT.tsx`
- Chat UI: `client/src/features/chat/components/ChatInterface.tsx`
- Cards: `client/src/features/chat/components/` (PostListCard, EditConfirmCard, PostDetails, etc.)
- Perplexity service: `server/features/ai/services/perplexity.service.ts`
- Image processing: `server/features/storage/services/image-processing.service.ts`
- Growth recs hook: `client/src/hooks/useGrowthRecommendations.ts`

## Tool-calling architecture (how a new tool is added)
1. Define a `ChatTool` in `veegpt-tools.ts` and add it to the right exported array.
2. Offer it in the chat route where tools are assembled (search `enableTools === true`).
   There are TWO sites: the send-message path (~line 1759) and the
   create-conversation path (~line 1950).
3. Handle the tool call inside `streamGeneration` (search `toolCalls.filter`),
   independently (NOT else-if) so multi-tool turns work.
4. If it produces UI, emit an event (postCard/listCard/editCard pattern) that the
   client writes to cache immediately, and render a card component.
5. Acknowledge in text + the tool-only fallback path.

---

## TASKS

### 1. Caption generation tool — STATUS: pending
`generate_caption` tool: user asks "write me 3 captions for X" → returns caption
options rendered as selectable cards (click to copy / use in a post).
- Reuse existing caption generation service.
- Tool returns N variations + the style used.
- Client: CaptionOptionsCard with copy/use buttons.

### 2. Hashtag generation tool — STATUS: pending
`generate_hashtags` tool: "give me hashtags for a fitness reel" → returns a set
of relevant hashtags as chips (copy all / copy individual).
- Reuse existing hashtag generation service.
- Client: HashtagCard.

### 3. Analytics & insight tool — STATUS: pending
`get_analytics_insight` tool: pulls performance data + lets the model reason
("reels get 3x reach — post more reels"). Reuse server growth recommendations.

### 4. Best-time-to-post tool — STATUS: pending
`get_best_posting_time` tool: returns data-backed best slots; can auto-fill
schedule time. Reuse the best-time feature.

### 5. Bulk / multi-post scheduling — STATUS: pending
Allow scheduling multiple posts in one turn (content calendar). Build on
edit-cards-as-array foundation; show multiple post cards.

### 6. Delete / duplicate post tools — STATUS: pending
`delete_post` (confirm-required) and `duplicate_post` (e.g. repost as reel).

### 7. Web / trend research tool — STATUS: pending
`research_trends` tool using the Perplexity service for live niche trends.

### 8. Image understanding in post flow — STATUS: pending
When an image is attached, analyze it and proactively suggest caption/hashtags
from actual image content.

### 9. Provider fallback resilience — STATUS: pending
Better handling when all providers 429: clearer retry UX / auto-retry / cheaper
tier. (Builds on existing retryable flag.)

### 10. Streaming tool feedback — STATUS: pending
Show "🔍 Checking your scheduled posts…" while a tool runs, so multi-tool turns
feel responsive. Emit a `toolStatus` event per tool.

### Bonus: Memory categories/UI — STATUS: completed
Group facts by topic (using detectTopic) in the settings memory panel.
- Server: GET /api/chat/memory tags each item with `topic` (detectTopic → 'general').
- Client: SettingsTabs memory panel groups "Learned from your chats" by topic
  category with emoji/label headers (MEMORY_TOPIC_LABELS); falls back to a flat
  list when everything is uncategorized.

---

## Progress log
- (init) Plan created. Context gathered on existing services.
- Implemented tool defs in veegpt-tools.ts: generate_caption, generate_hashtags,
  get_analytics_insight, get_best_posting_time, research_trends (VEEGPT_INSIGHT_TOOLS),
  plus delete_post + duplicate_post (added to VEEGPT_EDIT_TOOLS).
- Server: buildInfoCard() reuses generateInstagramCaptions / generateJSON /
  generateGrowthRecommendations / generateAnalyticsInsight / aiBestActiveTime /
  Perplexity. executeEditTool + buildEditCard extended for delete/duplicate.
  Wired infoCalls handling + infoCards persistence + complete event + tool-status
  feedback (#10). generate_caption grounds on attached media analysis (#8).
- Client: InfoCard.tsx (captions/hashtags/insight/recommendations/best_time/trends),
  EditConfirmCard extended for delete/duplicate, useChatStream handles 'infoCard'
  event + persists infoCards, chat.types + ChatMessage model extended, rendered in
  VeeGPT.renderMessageCard.

### STATUS UPDATE
1. Caption tool — DONE
2. Hashtag tool — DONE
3. Analytics insight tool — DONE
4. Best-time tool — DONE
5. Bulk/multi-post — PARTIAL (multi-tool turns render multiple cards; true
   calendar bulk-schedule is a larger follow-up)
6. Delete/duplicate — DONE
7. Trends research tool — DONE + UPGRADED to self-owned research engine
   (Tavily + Firecrawl + our LLM; replaces Perplexity). New search_web tool too.
   Progressive shimmer status while researching. See WebResearch section below.
8. Image understanding in post flow — DONE (caption tool uses analyzeMedia)
9. Provider fallback resilience — EXISTING (retryable + Retry button; tool path
   falls back github→openai→gemini)
10. Streaming tool feedback — DONE (per-tool status events)
Bonus memory categories — DONE (server tags topic; settings panel groups by category)

---

## WebResearch / Trend Intelligence Engine (replaces Perplexity)

Self-owned, provider-agnostic research engine for VeeGPT. NO Perplexity API.

**Service:** `server/services/research/webResearch.service.ts`
- `research(query, { mode, preferences, userId, workspaceId, onStatus })`
  pipeline: search → rank/filter → extract top pages → LLM synthesis → answer
  with citations.
- Search: Tavily (`TAVILY_API_KEY`, preferred) → Firecrawl `/search` fallback.
- Extract: Firecrawl `/scrape` (markdown, onlyMainContent). Graceful snippet
  fallback when a site blocks scraping (e.g. instagram.com → 403).
- Synthesis: `aiServiceManager.generateJSON` (tagged `trend.intelligence`),
  returns `{ answer, keyPoints[], trends[]?, usedSourceIndexes[] }`.
- Redis cache: search 6h, scrape 24h, answer 1h (best-effort, never throws).
- `onStatus` streams progress phases → SSE `status` event → VeeGPT shimmer text
  ("Searching the web…", "Reading N sources…", "Analyzing and summarizing…").

**Tools** (`veegpt-tools.ts`): `research_trends` (mode=trends) and `search_web`
(mode=search|competitors). Both in VEEGPT_INSIGHT_TOOLS.

**Card:** InfoCard `kind: 'research'` renders answer + trend chips (emerging/
rising/trending/saturated/declining) + key points + clickable citations.

**Keys (.env):** `FIRECRAWL_API_KEY` set; `TAVILY_API_KEY` optional (commented).

**Verified:** Firecrawl search 200 (5 results), scrape 200 (27K md on a normal
site), tsc clean, server reloaded. Live LLM synthesis + card render still needs
a browser test (AI providers were rate-limited during dev).

**Built from Websearch.md follow-ups (now DONE):**
- Mongo collections: `server/models/Research/ResearchModels.ts` — SearchHistory,
  ResearchReport, TrendTopic (workspace-scoped, lean). Engine persists every run
  (best-effort) + upserts trend snapshots per niche.
- Deep Research mode: `deepResearch()` in the engine + `deep_research` tool +
  InfoCard `kind:'deep_research'` (executive summary / key findings / trends /
  opportunities / risks / sources). Multi-query expand → research each → report.
- BullMQ refresh: `server/queues/researchQueue.ts` + `server/workers/researchWorker.ts`
  (single-attempt, dedupe window, lazy worker) for background trend/competitor
  refresh.
- HTTP endpoints (veegpt-chat router): GET `/research/history`, GET
  `/research/trends`, POST `/research/refresh` (queue → inline fallback).

**Still NOT split into separate service classes** (SearchService/ResearchService/
etc.) — kept as one cohesive `webResearch.service.ts` with `research()` +
`deepResearch()` exports. This is a deliberate simplicity choice; can be split
later if other features need finer-grained imports.