import React, { useEffect, useRef, useState } from 'react'
import {
  Sparkles,
  TrendingUp,
  PenSquare,
  BarChart3,
  Search,
  ChevronDown,
  Check,
  AtSign,
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
  Users,
} from 'lucide-react'
import type { VeeGPTAgentOption } from '../hooks/useVeeGPTAgents'

/** Map an agent's icon name (from the server) to a lucide component. */
const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  TrendingUp,
  PenSquare,
  BarChart3,
  Search,
}

/** Map a social platform to a lucide component (fallback: AtSign). */
const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  youtube: Youtube,
}

export interface SocialAccountOption {
  id: string
  username?: string
  platform?: string
  profilePictureUrl?: string
}

interface VeeGPTSelectorsProps {
  agents: VeeGPTAgentOption[]
  selectedAgentId: string
  onSelectAgent: (id: string) => void
  accounts: SocialAccountOption[]
  selectedAccountId: string | null
  onSelectAccount: (id: string | null) => void
  /** Slightly smaller controls for the in-chat composer toolbar. */
  compact?: boolean
}

/** Extract a stable id from a raw social-account object. */
export function accountOptionId(a: any): string {
  return String(a?.id || a?._id || a?.accountId || '')
}

/** A small pill dropdown with a click-outside-to-close panel. */
function Dropdown({
  label,
  title,
  icon,
  active,
  compact,
  children,
}: {
  label: string
  title: string
  icon: React.ReactNode
  active?: boolean
  compact?: boolean
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title}
        className={`flex items-center gap-1.5 rounded-full border transition-colors ${
          compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]'
        } ${
          active
            ? 'border-blue-300 dark:border-blue-400/40 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
            : 'border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800/60 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700/70'
        }`}
      >
        {icon}
        <span className="max-w-[130px] truncate font-medium">{label}</span>
        <ChevronDown className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} opacity-70`} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-64 max-h-72 overflow-y-auto rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 shadow-lg py-1">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/**
 * Composer controls that let the user pick which VeeGPT agent (persona) answers
 * and which connected social account VeeGPT focuses on. Both are optional — the
 * defaults are "VeeGPT" (general) and "All accounts" (no forced account scope).
 */
export function VeeGPTSelectors({
  agents,
  selectedAgentId,
  onSelectAgent,
  accounts,
  selectedAccountId,
  onSelectAccount,
  compact,
}: VeeGPTSelectorsProps) {
  const activeAgent = agents.find((a) => a.id === selectedAgentId) || agents[0]
  const AgentIcon = (activeAgent && AGENT_ICONS[activeAgent.icon]) || Sparkles

  const activeAccount = selectedAccountId
    ? accounts.find((a) => accountOptionId(a) === selectedAccountId)
    : null
  const iconSize = compact ? 'w-3.5 h-3.5' : 'w-4 h-4'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Agent / persona selector */}
      <Dropdown
        compact={compact}
        title="Choose the VeeGPT agent (persona)"
        active={!!selectedAgentId && selectedAgentId !== 'default'}
        icon={<AgentIcon className={iconSize} />}
        label={activeAgent?.name || 'VeeGPT'}
      >
        {(close) => (
          <>
            {agents.map((agent) => {
              const Icon = AGENT_ICONS[agent.icon] || Sparkles
              const selected = agent.id === (selectedAgentId || 'default')
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => { onSelectAgent(agent.id); close() }}
                  className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-700/70 transition-colors"
                >
                  <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500 dark:text-blue-400" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-gray-900 dark:text-gray-100">{agent.name}</span>
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{agent.description}</span>
                  </span>
                  {selected && <Check className="w-4 h-4 flex-shrink-0 text-blue-500 dark:text-blue-400" />}
                </button>
              )
            })}
          </>
        )}
      </Dropdown>

      {/* Social account selector (only when the workspace has accounts) */}
      {accounts.length > 0 && (
        <Dropdown
          compact={compact}
          title="Focus VeeGPT on a connected social account"
          active={!!selectedAccountId}
          icon={
            activeAccount
              ? (() => {
                  const PIcon = PLATFORM_ICONS[(activeAccount.platform || '').toLowerCase()] || AtSign
                  return <PIcon className={iconSize} />
                })()
              : <Users className={iconSize} />
          }
          label={activeAccount ? `@${activeAccount.username || 'account'}` : 'All accounts'}
        >
          {(close) => (
            <>
              <button
                type="button"
                onClick={() => { onSelectAccount(null); close() }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-700/70 transition-colors"
              >
                <Users className="w-4 h-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium text-gray-900 dark:text-gray-100">All accounts</span>
                  <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug">Don't focus on a specific account</span>
                </span>
                {!selectedAccountId && <Check className="w-4 h-4 flex-shrink-0 text-blue-500 dark:text-blue-400" />}
              </button>
              {accounts.map((a) => {
                const id = accountOptionId(a)
                const PIcon = PLATFORM_ICONS[(a.platform || '').toLowerCase()] || AtSign
                const selected = id === selectedAccountId
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { onSelectAccount(id); close() }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-700/70 transition-colors"
                  >
                    {a.profilePictureUrl ? (
                      <img src={a.profilePictureUrl} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <PIcon className="w-4 h-4 flex-shrink-0 text-blue-500 dark:text-blue-400" />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">@{a.username || 'account'}</span>
                      <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug capitalize">{a.platform || 'social'}</span>
                    </span>
                    {selected && <Check className="w-4 h-4 flex-shrink-0 text-blue-500 dark:text-blue-400" />}
                  </button>
                )
              })}
            </>
          )}
        </Dropdown>
      )}
    </div>
  )
}
