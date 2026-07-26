import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'

/** Public (client-safe) shape of a selectable VeeGPT agent/persona. */
export interface VeeGPTAgentOption {
  id: string
  name: string
  description: string
  /** lucide-react icon name (mapped to a component in the UI). */
  icon: string
}

/** Baseline used before the network responds so the dropdown is never empty. */
const DEFAULT_AGENT: VeeGPTAgentOption = {
  id: 'default',
  name: 'VeeGPT',
  description: 'General-purpose social media co-pilot',
  icon: 'Sparkles',
}

/**
 * Fetch the selectable VeeGPT agents (personas) from the server. The list is
 * static per deploy, so it's cached aggressively and never refetched on focus.
 */
export const useVeeGPTAgents = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/chat/agents'],
    queryFn: async () => {
      const res = await apiRequest('/api/chat/agents')
      const agents = Array.isArray(res?.agents) ? (res.agents as VeeGPTAgentOption[]) : []
      return agents.length ? agents : [DEFAULT_AGENT]
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: [DEFAULT_AGENT],
  })

  const agents = data && data.length ? data : [DEFAULT_AGENT]
  return { agents, isLoading }
}
