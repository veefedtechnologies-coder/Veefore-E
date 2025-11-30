import { apiRequest } from './queryClient'

export type Platform = 'instagram' | 'youtube' | 'facebook' | 'twitter' | 'linkedin' | 'tiktok'

export interface SimpleAccount {
  id: string
  platform: Platform
  username?: string
  tokenStatus?: 'valid' | 'expired' | 'invalid' | 'missing'
  hasAccessToken?: boolean
}

export function detectInvalidAccounts(accounts: SimpleAccount[] = []) {
  const invalid = (accounts || []).filter(a => a && a.tokenStatus && a.tokenStatus !== 'valid')
  const count = invalid.length
  const platforms = invalid.map(a => a.platform)
  return { invalid, count, platforms }
}

export function getReconnectCopy(accounts: SimpleAccount[] = []) {
  const { invalid, count } = detectInvalidAccounts(accounts)
  if (count === 0) return { title: '', description: '' }
  if (count === 1) {
    const p = invalid[0].platform
    const name = p.charAt(0).toUpperCase() + p.slice(1)
    return {
      title: `Reconnect Your ${name} Account`,
      description: 'Your access token is missing or expired. Reconnect to resume analytics and posting.'
    }
  }
  return {
    title: 'Reconnect Your Social Account',
    description: 'One or more access tokens are missing or expired. Reconnect from Integrations.'
  }
}

export async function startReconnectFlow(accounts: SimpleAccount[] = [], workspaceId?: string) {
  const { invalid, count } = detectInvalidAccounts(accounts)
  if (count === 0) return
  const ws = workspaceId || (typeof window !== 'undefined' ? (localStorage.getItem('currentWorkspaceId') || undefined) : undefined)
  if (count === 1) {
    const p = invalid[0].platform
    if (p === 'instagram') {
      const data = await apiRequest('/api/instagram/reconnect/start', { method: 'POST', body: JSON.stringify({ workspaceId: ws }) })
      const url = (data as any)?.url
      if (url && typeof window !== 'undefined') window.location.href = url
      return { type: 'oauth', platform: 'instagram' as Platform }
    }
    if (p === 'youtube') {
      if (!ws) return { type: 'integrations' }
      const data = await apiRequest(`/api/youtube/auth?workspaceId=${ws}`)
      const url = (data as any)?.authUrl
      if (url && typeof window !== 'undefined') window.location.href = url
      return { type: 'oauth', platform: 'youtube' as Platform }
    }
    return { type: 'integrations' }
  }
  return { type: 'integrations' }
}
