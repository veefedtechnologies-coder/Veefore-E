import React from 'react'

type Props = { children: React.ReactNode }
type State = { error: any }

export default class ChunkBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: any) {
    return { error }
  }
  handleReload = () => {
    try { localStorage.setItem('app_reload', String(Date.now())) } catch {}
    window.location.reload()
  }
  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.message || '')
      const isChunk = /Loading chunk|chunk|Failed to fetch|script/i.test(msg)
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center space-y-3">
            <div className="text-red-600 font-medium">Failed to load application assets</div>
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {isChunk ? 'Please hard refresh to fetch latest files.' : 'An unexpected error occurred.'}
            </div>
            <button onClick={this.handleReload} className="px-4 py-2 bg-blue-600 text-white rounded">Reload</button>
          </div>
        </div>
      )
    }
    return this.props.children as any
  }
}
