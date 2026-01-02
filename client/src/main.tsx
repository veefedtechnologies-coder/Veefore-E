import { Suspense, lazy, memo, Component, ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Simple error boundary for the app
class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('APP ERROR BOUNDARY:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold mb-4 text-red-500">Something went wrong</h1>
            <p className="text-white/60 mb-4">{this.state.error?.message}</p>
            <pre className="text-xs text-left bg-white/10 p-4 rounded overflow-auto max-h-40 mb-4">
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 rounded text-white"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const FullApp = lazy(() => import('./AppWrapper'))

import LoadingSpinner from './components/LoadingSpinner'

const AppLoader = () => <LoadingSpinner type="default" />

// Always render FullApp - let wouter handle all routing internally
// This prevents the dual-routing issue where main.tsx and wouter competed
const Router = memo(() => {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<AppLoader />}>
        <FullApp />
      </Suspense>
    </AppErrorBoundary>
  )
})

Router.displayName = 'Router'

createRoot(document.getElementById('root')!).render(<Router />)
