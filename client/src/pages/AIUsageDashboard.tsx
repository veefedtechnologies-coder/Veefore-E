/**
 * AI Token Usage Dashboard
 *
 * Shows token usage + estimated cost for EVERY AI feature in the app (not just
 * VeeGPT) so we can price the product accurately. Data comes from the
 * server-side usage tracker that records every provider call.
 */

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { RefreshCw, Cpu, Coins, Hash, ChevronDown, ChevronRight, RotateCcw, Database, Zap, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'

type ModelAgg = {
  provider: string
  model: string
  calls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
  cost: number
}
type FeatureAgg = {
  feature: string
  calls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
  estimatedCalls: number
  cost: number
  byModel: ModelAgg[]
}
type UsageResponse = {
  scope: string
  totals: { calls: number; promptTokens: number; completionTokens: number; totalTokens: number; cachedTokens: number; estimatedCalls: number; cost: number }
  features: FeatureAgg[]
  eventCount: number
  batchStats?: {
    pending: number
    completed: number
    failed: number
    recentCompleted: Array<{ niche: string; postsAnalyzed: number; submittedAt: string; completedAt: string | null; turnaroundMinutes: number | null }>
  }
  cacheStats?: {
    cachedAnalyses: number
    totalCacheHits: number
    avgHitsPerEntry: number
    estimatedTokensSaved: number
  }
}

// Friendly labels + groups for features.
const FEATURE_META: Record<string, { label: string; group: string }> = {
  'veegpt.chat': { label: 'VeeGPT — Chat reply', group: 'VeeGPT' },
  'veegpt.title': { label: 'VeeGPT — Conversation title', group: 'VeeGPT' },
  'veegpt.memory_detect': { label: 'VeeGPT — Memory detect/save', group: 'VeeGPT' },
  'veegpt.memory_summary': { label: 'VeeGPT — Memory summary', group: 'VeeGPT' },
  'veegpt.memory_update': { label: 'VeeGPT — Memory mining', group: 'VeeGPT' },
  'veegpt.post_agent': { label: 'VeeGPT — Scheduling/Post agent', group: 'VeeGPT' },
  'veegpt.post_caption': { label: 'VeeGPT — Post caption', group: 'VeeGPT' },
  'veegpt.post_hashtags': { label: 'VeeGPT — Post hashtags', group: 'VeeGPT' },
  'veegpt.media_analysis': { label: 'VeeGPT — Media (vision) analysis', group: 'VeeGPT' },
  'veegpt.parse_intent': { label: 'VeeGPT — Legacy intent parse', group: 'VeeGPT' },
  'veegpt.triage': { label: 'VeeGPT — Legacy triage', group: 'VeeGPT' },
  'caption.generation': { label: 'Caption Generator', group: 'Content' },
  'caption.regenerate': { label: 'Caption Regenerate', group: 'Content' },
  'hashtag.generation': { label: 'Hashtag Generator', group: 'Content' },
  'content.brief': { label: 'Creative Brief', group: 'Content' },
  'content.repurpose': { label: 'Content Repurpose', group: 'Content' },
  'image.generation': { label: 'AI Image / Banner', group: 'Content' },
  'thumbnail.generation': { label: 'Thumbnail Generator', group: 'Content' },
  'video.generation': { label: 'Video Generator', group: 'Content' },
  'video.script': { label: 'Video Script', group: 'Content' },
  'growth.recommendations': { label: 'Growth Recommendations', group: 'Growth' },
  'growth.insight': { label: 'Performance Insight (AI Banner)', group: 'Growth' },
  'trend.intelligence': { label: 'Trend Intelligence', group: 'Growth' },
  'competitor.analysis': { label: 'Competitor Analysis', group: 'Growth' },
  'social_listening.extract': { label: 'Social Listening — Extraction (sync)', group: 'Listening' },
  'social_listening.batch_submitted': { label: 'Social Listening — Batch submitted (async)', group: 'Listening' },
  'social_listening.batch_finalized': { label: 'Social Listening — Batch finalized (async, est.)', group: 'Listening' },
  'other': { label: 'Other / Untagged', group: 'Other' },
}

const fmt = (n: number) => n.toLocaleString()
const usd = (n: number) => `$${n.toFixed(n < 0.01 ? 6 : 4)}`

export default function AIUsageDashboard() {
  const [scope, setScope] = useState<'me' | 'all'>('me')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const queryClient = useQueryClient()

  const { data, isLoading, refetch, isFetching } = useQuery<UsageResponse>({
    queryKey: ['/api/chat/usage', scope],
    queryFn: () => apiRequest(`/api/chat/usage?scope=${scope}`),
  }) as any

  const resetMutation = useMutation({
    mutationFn: () => apiRequest('/api/chat/usage/reset', { method: 'POST', body: JSON.stringify({ scope }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/usage'] })
      refetch()
    },
  })

  const onReset = () => {
    const who = scope === 'all' ? 'ALL users' : 'your'
    if (window.confirm(`Reset ${who} AI usage counters to zero? This permanently deletes the recorded usage history and cannot be undone.`)) {
      resetMutation.mutate()
    }
  }

  const totals = data?.totals
  const features: FeatureAgg[] = data?.features || []
  const batchStats = data?.batchStats
  const cacheStats = data?.cacheStats

  // Group features for organised display.
  const groups: Record<string, FeatureAgg[]> = {}
  for (const f of features) {
    const g = FEATURE_META[f.feature]?.group || 'Other'
    if (!groups[g]) groups[g] = []
    groups[g].push(f)
  }
  const groupOrder = ['VeeGPT', 'Content', 'Growth', 'Listening', 'Other']
  const orderedGroups = Object.keys(groups).sort((a, b) => {
    const ia = groupOrder.indexOf(a); const ib = groupOrder.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">AI Token Usage</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Every AI feature's input/output tokens and estimated cost — for pricing.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-white/10">
            <button onClick={() => setScope('me')} className={`px-3 py-1.5 text-sm ${scope === 'me' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300'}`}>My usage</button>
            <button onClick={() => setScope('all')} className={`px-3 py-1.5 text-sm ${scope === 'all' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300'}`}>All users</button>
          </div>
          <button onClick={() => refetch()} className="p-2 rounded-lg border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onReset} disabled={resetMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 text-sm" title="Reset usage counters to zero">
            <RotateCcw className={`w-4 h-4 ${resetMutation.isPending ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<Hash className="w-4 h-4" />} label="Total tokens" value={totals ? fmt(totals.totalTokens) : '—'} />
        <StatCard icon={<ChevronRight className="w-4 h-4" />} label="Input tokens" value={totals ? fmt(totals.promptTokens) : '—'} />
        <StatCard icon={<ChevronDown className="w-4 h-4" />} label="Output tokens" value={totals ? fmt(totals.completionTokens) : '—'} />
        <StatCard icon={<Coins className="w-4 h-4" />} label="Est. cost" value={totals ? usd(totals.cost) : '—'} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard icon={<Cpu className="w-4 h-4" />} label="Total AI calls" value={totals ? fmt(totals.calls) : '—'} />
        <StatCard icon={<Cpu className="w-4 h-4" />} label="Estimated-count calls" value={totals ? fmt(totals.estimatedCalls) : '—'} sub="character-estimated (no provider usage)" />
        <StatCard icon={<Hash className="w-4 h-4" />} label="Cached input tokens" value={totals ? fmt(totals.cachedTokens) : '—'} sub="served from prompt cache (~10% cost)" />
        <StatCard
          icon={<Coins className="w-4 h-4" />}
          label="Cache hit rate"
          value={totals && totals.promptTokens > 0 ? `${Math.round((totals.cachedTokens / totals.promptTokens) * 100)}%` : '—'}
          sub="of input tokens served from cache"
        />
      </div>

      {isLoading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading usage…</div>}
      {!isLoading && features.length === 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-200 dark:border-white/10 rounded-xl p-8 text-center">
          No AI usage recorded yet. Send a message or run any AI feature, then refresh.
        </div>
      )}

      {orderedGroups.map((group) => (
        <div key={group} className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">{group}</h2>
          <div className="space-y-2">
            {groups[group].map((f) => {
              const isOpen = !!expanded[f.feature]
              return (
                <div key={f.feature} className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800/60 overflow-hidden">
                  <button onClick={() => setExpanded((p) => ({ ...p, [f.feature]: !p[f.feature] }))} className="w-full flex items-center justify-between px-4 py-3 text-left">
                    <div className="flex items-center gap-2 min-w-0">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{FEATURE_META[f.feature]?.label || f.feature}</span>
                      {f.estimatedCalls > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300">{f.estimatedCalls} est.</span>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                      <span>{fmt(f.calls)} calls</span>
                      {f.promptTokens > 0 && (
                        <span
                          className={`px-1.5 py-0.5 rounded ${f.cachedTokens > 0 ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-white/5 text-gray-400'}`}
                          title="Share of this feature's input tokens served from the prompt cache"
                        >
                          {Math.round((f.cachedTokens / f.promptTokens) * 100)}% cached
                        </span>
                      )}
                      <span className="text-gray-900 dark:text-gray-100 font-medium">{fmt(f.totalTokens)} tok</span>
                      <span className="text-green-600 dark:text-green-400 font-medium">{usd(f.cost)}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3 border-t border-gray-100 dark:border-white/5">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-3 text-xs">
                        <div><span className="text-gray-400">Input</span><div className="font-medium text-gray-900 dark:text-gray-100">{fmt(f.promptTokens)}</div></div>
                        <div><span className="text-gray-400">Output</span><div className="font-medium text-gray-900 dark:text-gray-100">{fmt(f.completionTokens)}</div></div>
                        <div><span className="text-gray-400">Cached input</span><div className="font-medium text-gray-900 dark:text-gray-100">{fmt(f.cachedTokens)}{f.promptTokens ? ` (${Math.round((f.cachedTokens / f.promptTokens) * 100)}%)` : ''}</div></div>
                        <div><span className="text-gray-400">Avg / call</span><div className="font-medium text-gray-900 dark:text-gray-100">{f.calls ? fmt(Math.round(f.totalTokens / f.calls)) : 0} tok</div></div>
                      </div>
                      <div className="space-y-1">
                        {f.byModel.map((m) => (
                          <div key={`${m.provider}:${m.model}`} className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 py-1">
                            <span className="truncate">{m.provider} · {m.model}</span>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span>{fmt(m.calls)}×</span>
                              <span>in {fmt(m.promptTokens)} / out {fmt(m.completionTokens)}</span>
                              {m.cachedTokens > 0 && <span className="text-blue-600 dark:text-blue-400">cached {fmt(m.cachedTokens)}</span>}
                              <span className="text-green-600 dark:text-green-400">{usd(m.cost)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
        Token counts are provider-reported where available. Calls marked "est." are character-estimated (~4 chars/token) because that provider/stream did not return usage. Costs use the pricing table in the server (edit to match your contracts).
      </p>

      {/* Social Listening Batching Panel */}
      {(batchStats || cacheStats) && (
        <div className="mt-8 rounded-xl border border-blue-200 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5 overflow-hidden">
          <div className="px-5 py-3 border-b border-blue-200 dark:border-blue-500/20 flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Social Listening — Batch API & Cache</h2>
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-medium">50% discount on batch jobs</span>
          </div>

          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
            {batchStats && <>
              <StatCard icon={<Clock className="w-4 h-4" />} label="Pending batches" value={String(batchStats.pending)} sub="waiting for OpenAI" />
              <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Completed batches" value={String(batchStats.completed)} sub="results collected" />
              <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Failed / superseded" value={String(batchStats.failed)} sub="fell back to sync" />
              <StatCard icon={<Cpu className="w-4 h-4" />} label="Batch mode" value={batchStats.completed > 0 || batchStats.pending > 0 ? '✓ Active' : 'No jobs yet'} sub="background daily refresh" />
            </>}
            {cacheStats && <>
              <StatCard icon={<Database className="w-4 h-4" />} label="Cached analyses" value={fmt(cacheStats.cachedAnalyses)} sub="14-day TTL" />
              <StatCard icon={<Hash className="w-4 h-4" />} label="Cache hits (all time)" value={fmt(cacheStats.totalCacheHits)} sub="reused without AI call" />
              <StatCard icon={<Coins className="w-4 h-4" />} label="Tokens saved (est.)" value={fmt(cacheStats.estimatedTokensSaved)} sub="~500 tok per cache hit" />
              <StatCard icon={<RefreshCw className="w-4 h-4" />} label="Avg reuses / entry" value={String(cacheStats.avgHitsPerEntry)} sub="higher = more savings" />
            </>}
          </div>

          {batchStats && batchStats.recentCompleted.length > 0 && (
            <div className="px-5 pb-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Recent completed batches</p>
              <div className="space-y-1.5">
                {batchStats.recentCompleted.map((j, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-white dark:bg-slate-800/60 rounded-lg px-3 py-2 border border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      <span className="font-medium text-gray-800 dark:text-gray-200 capitalize">{j.niche}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500">{j.postsAnalyzed} posts</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-400">
                      {j.turnaroundMinutes != null && (
                        <span className={`font-medium ${j.turnaroundMinutes < 60 ? 'text-green-600 dark:text-green-400' : j.turnaroundMinutes < 180 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500'}`}>
                          {j.turnaroundMinutes < 60 ? `${j.turnaroundMinutes}m` : `${(j.turnaroundMinutes / 60).toFixed(1)}h`} turnaround
                        </span>
                      )}
                      <span>{j.completedAt ? new Date(j.completedAt).toLocaleString() : '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
                Turnaround = time from batch submission to OpenAI completion. Green &lt;1h, amber 1-3h, gray 3h+.
                Token counts for batch jobs are character-estimated (marked "est.") since OpenAI Batch API doesn't expose per-item usage.
              </p>
            </div>
          )}

          {(!batchStats || (batchStats.pending === 0 && batchStats.completed === 0)) && (
            <div className="px-5 pb-5 text-sm text-gray-500 dark:text-gray-400">
              No batch jobs yet. The daily background refresh (runs every 20h) will submit the first batch automatically.
              You can also trigger a manual "Sync Live Data" from the Social Listening page.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800/60 px-4 py-3">
      <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 text-xs mb-1">{icon}{label}</div>
      <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}
