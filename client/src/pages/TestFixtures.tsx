import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RefreshCw, Trash2, Plus } from 'lucide-react'
import { detectInvalidAccounts } from '@/lib/reconnect'

export default function TestFixtures() {
  const { currentWorkspace } = useCurrentWorkspace()
  const lsWorkspaceId = (typeof window !== 'undefined') ? localStorage.getItem('currentWorkspaceId') : undefined
  const { data: workspaces } = useQuery({
    queryKey: ['/api/workspaces'],
    queryFn: () => apiRequest('/api/workspaces'),
    staleTime: 10 * 60 * 1000,
    retry: false
  })
  const workspaceId = ((): string | undefined => {
    const candidate = lsWorkspaceId || currentWorkspace?.id
    if (candidate && candidate.length === 24) return candidate
    const ws = Array.isArray(workspaces) ? workspaces : []
    const first = ws.find((w: any) => typeof w.id === 'string' && w.id.length === 24) || ws[0]
    return first?.id
  })()

  const { data: accounts, refetch, isFetching } = useQuery({
    queryKey: ['/api/social-accounts', workspaceId],
    queryFn: () => workspaceId ? apiRequest(`/api/social-accounts?workspaceId=${workspaceId}`) : Promise.resolve([]),
    enabled: !!workspaceId
  })

  const addFixtures = async () => {
    try {
      await apiRequest('/api/social-accounts/test-fixtures', { method: 'POST', body: JSON.stringify({ workspaceId }) })
      await refetch()
    } catch (e: any) {
      console.error('Add fixtures failed', e)
      alert(e?.message || 'Failed to add fixtures. Ensure ENABLE_TEST_FIXTURES=true on server.')
    }
  }

  const removeFixtures = async () => {
    try {
      await apiRequest('/api/social-accounts/test-fixtures', { method: 'DELETE', body: JSON.stringify({ workspaceId }) })
      await refetch()
    } catch (e: any) {
      console.error('Remove fixtures failed', e)
      alert(e?.message || 'Failed to remove fixtures. Ensure ENABLE_TEST_FIXTURES=true on server.')
    }
  }

  const issues = detectInvalidAccounts(accounts || [])
  const all = Array.isArray(accounts) ? accounts : []
  const setStatus = async (id: string, status: 'valid' | 'invalid' | 'missing' | 'expired') => {
    try {
      const accId = id
      const body = { workspaceId, accountId: accId, status }
      const res = await apiRequest('/api/social-accounts/test-token-status', { method: 'POST', body: JSON.stringify(body), headers: { 'X-Test-Fixtures': '1' } })
      if ((res as any)?.error) throw new Error((res as any).error)
      await refetch()
    } catch (e: any) {
      alert(e?.message || 'Failed to update token status. Ensure ENABLE_TEST_FIXTURES=true and you are logged in.')
    }
  }

  return (
    <Card className="bg-white dark:bg-gray-800 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
      <CardHeader>
        <CardTitle>Test Fixtures</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-3 mb-4">
          <Button onClick={addFixtures} className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="w-4 h-4 mr-2" /> Add YouTube & TikTok test accounts
          </Button>
          <Button onClick={removeFixtures} variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20">
            <Trash2 className="w-4 h-4 mr-2" /> Remove test accounts
          </Button>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Workspace: {currentWorkspace?.name || 'Unknown'} ({workspaceId || 'N/A'})
        </div>
        <div className="text-sm mb-4">
          Invalid accounts detected: {issues.count}
        </div>
        <div className="space-y-2">
          {all.map((a: any) => (
            <div key={a.id} className="p-3 border rounded-md dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">@{a.username}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{a.platform} · {a.workspaceId}</div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs">{a.tokenStatus || 'unknown'}</span>
                  <select
                    className="text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
                    value={a.tokenStatus || 'missing'}
                    onChange={(e) => setStatus((a.id || a._id), e.target.value as any)}
                  >
                    <option value="valid">valid</option>
                    <option value="invalid">invalid</option>
                    <option value="expired">expired</option>
                    <option value="missing">missing</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
          {all.length === 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400">No accounts found.</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
