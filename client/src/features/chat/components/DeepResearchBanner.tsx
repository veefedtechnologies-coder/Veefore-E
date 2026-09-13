/**
 * DeepResearchBanner — a ChatGPT / Claude-style live "deep research" panel.
 *
 * While a `deep_research` tool runs, the server streams `researchProgress`
 * events (planning → searching → reading sources → writing) which the chat hook
 * accumulates into a `ResearchProgressState`. This component renders that state
 * as a prominent, live-updating banner: an activity timeline, the live search
 * queries, and a running count of the sources discovered — so the user can see
 * exactly what the agent is doing and how far along it is.
 */

import React from 'react'
import {
  Loader2, CheckCircle2, Search, BookOpen, PenLine, Compass, Telescope, Globe,
} from 'lucide-react'
import type { ResearchProgressState } from '../types/chat.types'

const kindIcon: Record<string, React.ReactNode> = {
  planning: <Compass className="h-3.5 w-3.5" />,
  searching: <Search className="h-3.5 w-3.5" />,
  reading: <BookOpen className="h-3.5 w-3.5" />,
  subtopic: <Telescope className="h-3.5 w-3.5" />,
  writing: <PenLine className="h-3.5 w-3.5" />,
  done: <CheckCircle2 className="h-3.5 w-3.5" />,
}

function faviconFor(url: string): string | null {
  try {
    const host = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${host}&sz=32`
  } catch {
    return null
  }
}

export const DeepResearchBanner: React.FC<{ state: ResearchProgressState }> = ({ state }) => {
  if (!state || !state.steps.length) return null
  const { active, steps, sources, sourceCount, searchCount } = state

  return (
    <div className="w-full rounded-xl border border-blue-200/70 dark:border-blue-400/20 bg-gradient-to-b from-blue-50/80 to-white dark:from-blue-950/30 dark:to-slate-900/40 shadow-sm p-4 animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {active ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          )}
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {active ? 'Researching' : 'Research complete'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">
          {searchCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Search className="h-3 w-3" /> {searchCount}
            </span>
          )}
          {sourceCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" /> {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
            </span>
          )}
        </div>
      </div>

      {/* Activity timeline */}
      <ol className="space-y-2">
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1
          const isCurrent = active && isLast
          return (
            <li key={i} className="flex flex-col gap-1">
              {/* Icon + label on ONE vertically-centered row so the spinner never
                  sits slightly above the text. */}
              <div className="flex items-center gap-2">
                <span
                  className={`shrink-0 leading-none ${
                    isCurrent
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {isCurrent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : kindIcon[s.kind] || kindIcon.reading}
                </span>
                <span
                  className={`text-xs ${
                    isCurrent
                      ? 'shimmer-text font-medium'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {s.label}
                  {/* Show the source count ONLY on the current/last reading step
                      (it reflects the live running total). Earlier reading steps
                      stay number-free so the timeline doesn't look like a
                      confusing stack of cumulative counts. */}
                  {s.kind === 'reading' && isLast && (s.count || 0) > 0
                    ? ` · ${s.count} ${s.count === 1 ? 'source' : 'sources'}`
                    : ''}
                </span>
              </div>
              {/* Search queries for this step (indented under the label). */}
              {s.queries?.length ? (
                <div className="ml-6 flex flex-wrap gap-1">
                  {s.queries.slice(0, 6).map((q, qi) => (
                    <span
                      key={qi}
                      className="px-1.5 py-0.5 rounded-md bg-white/70 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-[10px] text-gray-600 dark:text-gray-300 truncate max-w-[220px]"
                    >
                      {q}
                    </span>
                  ))}
                </div>
              ) : null}
              {s.detail && !s.queries?.length ? (
                <p className="ml-6 text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">{s.detail}</p>
              ) : null}
            </li>
          )
        })}
      </ol>

      {/* Discovered sources preview */}
      {sources.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sources.slice(0, 10).map((src, i) => {
            const fav = src.favicon || faviconFor(src.url)
            return (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                title={src.title || src.domain}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/70 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-[10px] text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-400/40 transition-colors max-w-[160px]"
              >
                {fav ? (
                  <img src={fav} alt="" className="h-3 w-3 rounded-sm" loading="lazy" />
                ) : (
                  <Globe className="h-3 w-3" />
                )}
                <span className="truncate">{src.domain || src.title}</span>
              </a>
            )
          })}
          {sources.length > 10 ? (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] text-gray-400 dark:text-gray-500">
              +{sources.length - 10} more
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default DeepResearchBanner
