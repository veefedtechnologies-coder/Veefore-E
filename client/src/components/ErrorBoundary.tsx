import React from 'react'

type Props = { children: React.ReactNode }
type State = { hasError: boolean }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: any) {
    console.error('[ErrorBoundary] Caught render error:', error)
  }

  render() {
    if (this.state.hasError) {
      return <div className="p-6 text-center text-sm text-gray-500">An error occurred while rendering this section.</div>
    }
    return this.props.children
  }
}

