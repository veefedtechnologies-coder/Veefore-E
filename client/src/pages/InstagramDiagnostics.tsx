import React, { useState } from 'react'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { apiRequest } from '@/lib/queryClient'

export default function InstagramDiagnostics() {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string>('')
  const [useStored, setUseStored] = useState(false)
  const { currentWorkspace } = useCurrentWorkspace()

  const runDiagnostics = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const body: any = { limit: 6 }
      if (useStored) {
        body.useStoredToken = true
        body.workspaceId = currentWorkspace?.id
      } else {
        body.accessToken = token
      }
      const data = await apiRequest('/api/diagnostics/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      setResult(data)
    } catch (e: any) {
      setError(e?.message || 'Diagnostics failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Instagram Diagnostics</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Enter a plain Instagram User access token to inspect which insights metrics are available for your recent media.
      </p>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Access Token</label>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={useStored} onChange={(e)=>setUseStored(e.target.checked)} />
            Use stored token for this workspace
          </label>
        </div>
        <textarea
          className="w-full mt-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm"
          rows={4}
          placeholder="Paste Instagram User access token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={runDiagnostics}
            disabled={(useStored ? !currentWorkspace?.id : !token) || loading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
          >
            {loading ? 'Running…' : 'Run diagnostics'}
          </button>
          {error && <span className="text-red-600 text-sm">{error}</span>}
        </div>
      </div>

      {result && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="mb-2 text-sm">
            <span className="font-semibold">Token valid:</span> {String(result.tokenValid)} | <span className="font-semibold">Media inspected:</span> {result.count} {result.usedStoredToken ? '(stored token)' : ''}
          </div>
          {result.hints?.length > 0 && (
            <div className="mb-3 text-sm text-amber-600">
              {result.hints.map((h: string, i: number) => (<div key={i}>• {h}</div>))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="p-2">ID</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Likes</th>
                  <th className="p-2">Comments</th>
                  <th className="p-2">Shares</th>
                  <th className="p-2">Replies</th>
                  <th className="p-2">Saved</th>
                  <th className="p-2">Reach</th>
                  <th className="p-2">Impressions</th>
                  <th className="p-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {result.diagnostics?.map((row: any) => (
                  <tr key={row.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="p-2 font-mono text-xs">{row.id}</td>
                    <td className="p-2">{row.type}</td>
                    <td className="p-2">{row.like_count ?? '-'}</td>
                    <td className="p-2">{row.comments_count ?? '-'}</td>
                    <td className="p-2">{row.insights?.shares ?? 'N/A'}</td>
                    <td className="p-2">{row.insights?.replies ?? 'N/A'}</td>
                    <td className="p-2">{row.insights?.saved ?? 'N/A'}</td>
                    <td className="p-2">{row.insights?.reach ?? '-'}</td>
                    <td className="p-2">{row.insights?.impressions ?? '-'}</td>
                    <td className="p-2 text-red-600">{row.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}


