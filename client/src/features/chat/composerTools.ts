/**
 * User-selectable VeeGPT tools for the composer "+" menu.
 *
 * Picking one FORCES VeeGPT to run that specific tool on the next message
 * (the user's message text becomes the tool's input). Selecting a tool is
 * OPTIONAL — when nothing is selected VeeGPT decides on its own, as usual.
 *
 * `id` is the canonical server-side tool name sent as `forcedTool`.
 */
export interface ComposerToolOption {
  id: string
  label: string
  description: string
  /** lucide-react icon name (mapped to a component in the menu). */
  icon: string
}

export const COMPOSER_TOOLS: ComposerToolOption[] = [
  { id: 'search_web', label: 'Web search', description: 'Search the live web with citations', icon: 'Globe' },
  { id: 'research_trends', label: 'Trends', description: 'Research current trends in your niche', icon: 'TrendingUp' },
  { id: 'deep_research', label: 'Deep research', description: 'In-depth multi-source report', icon: 'Telescope' },
  { id: 'get_account_details', label: 'Account analytics', description: 'Pull your live account metrics', icon: 'BarChart3' },
  { id: 'get_analytics_insight', label: 'Performance insight', description: 'Data-backed growth insight', icon: 'Sparkles' },
  { id: 'get_best_posting_time', label: 'Best time to post', description: 'When your audience is most active', icon: 'Clock' },
  { id: 'caption_and_hashtags', label: 'Caption & hashtags', description: 'Write a caption, hashtags, or both', icon: 'PenSquare' },
]

export function getComposerTool(id?: string | null): ComposerToolOption | undefined {
  return id ? COMPOSER_TOOLS.find((t) => t.id === id) : undefined
}
