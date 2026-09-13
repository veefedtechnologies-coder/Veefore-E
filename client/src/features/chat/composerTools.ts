/**
 * User-selectable VeeGPT tools for the composer "+" menu.
 *
 * Picking one FORCES VeeGPT to run that specific tool on the next message
 * (the user's message text becomes the tool's input). Selecting a tool is
 * OPTIONAL — when nothing is selected VeeGPT decides on its own, as usual.
 *
 * `id` is the canonical server-side tool name sent as `forcedTool`.
 */
/** VeeGPT tier a tool requires. Mirrors server/config/veegpt-tiers.ts. */
export type VeeGPTTier = 'basic' | 'full' | 'advanced'

export interface ComposerToolOption {
  id: string
  label: string
  description: string
  /** lucide-react icon name (mapped to a component in the menu). */
  icon: string
  /** Minimum VeeGPT tier required to use this tool. */
  minTier: VeeGPTTier
}

export const COMPOSER_TOOLS: ComposerToolOption[] = [
  { id: 'search_web', label: 'Web search', description: 'Search the live web with citations', icon: 'Globe', minTier: 'full' },
  { id: 'research_trends', label: 'Trends', description: 'Research current trends in your niche', icon: 'TrendingUp', minTier: 'full' },
  // Deep research is available on every plan; Free/Creator get a small monthly
  // preview (≈1 and ≈2 jobs), Pro/Business a full allowance. The server enforces
  // the per-plan cap, so it's shown to everyone rather than locked.
  { id: 'deep_research', label: 'Deep research', description: 'In-depth multi-source report', icon: 'Telescope', minTier: 'basic' },
  { id: 'get_account_details', label: 'Account analytics', description: 'Pull your live account metrics', icon: 'BarChart3', minTier: 'full' },
  { id: 'get_analytics_insight', label: 'Performance insight', description: 'Data-backed growth insight', icon: 'Sparkles', minTier: 'full' },
  { id: 'get_best_posting_time', label: 'Best time to post', description: 'When your audience is most active', icon: 'Clock', minTier: 'basic' },
  { id: 'caption_and_hashtags', label: 'Caption & hashtags', description: 'Write a caption, hashtags, or both', icon: 'PenSquare', minTier: 'basic' },
]

export function getComposerTool(id?: string | null): ComposerToolOption | undefined {
  return id ? COMPOSER_TOOLS.find((t) => t.id === id) : undefined
}

const TIER_ORDER: Record<VeeGPTTier, number> = { basic: 0, full: 1, advanced: 2 }

/** Minimum plan name that unlocks a tier — for upgrade prompts. */
export const TIER_MIN_PLAN: Record<VeeGPTTier, string> = {
  basic: 'Free',
  full: 'Creator',
  advanced: 'Pro',
}

/**
 * Whether a tool is usable at the given tier. While the tier is still loading
 * (`undefined`), default to `true` so paying users don't see a flash of locks;
 * the server remains authoritative.
 */
export function canUseComposerTool(tool: ComposerToolOption, tier: VeeGPTTier | undefined): boolean {
  if (!tier) return true
  return TIER_ORDER[tier] >= TIER_ORDER[tool.minTier]
}
