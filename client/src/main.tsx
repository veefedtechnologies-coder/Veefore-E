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

const AppLoader = () => (
  <div className="min-h-screen bg-[#030303] flex items-center justify-center">
    <style dangerouslySetInnerHTML={{
      __html: `
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes spin-reverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
      @keyframes pulse-glow {
        0%, 100% { opacity: 0.3; filter: blur(15px); }
        50% { opacity: 0.6; filter: blur(20px); }
      }
      @keyframes logo-pulse {
        0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.4)); }
        50% { transform: scale(1.03); filter: drop-shadow(0 0 20px rgba(59, 130, 246, 0.6)); }
      }
      @keyframes dot-pulse {
        0%, 100% { opacity: 0.3; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1); }
      }
      @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    `}} />

    <div className="flex flex-col items-center">
      {/* Logo with orbital rings */}
      <div className="relative w-24 h-24 flex items-center justify-center">
        {/* Glow backdrop */}
        <div
          className="absolute w-16 h-16 rounded-full bg-blue-500/25"
          style={{ animation: 'pulse-glow 3s ease-in-out infinite' }}
        />

        {/* Outer ring - blue only */}
        <div
          className="absolute w-24 h-24 rounded-full"
          style={{
            border: '2px solid transparent',
            borderTopColor: '#3b82f6',
            borderRightColor: 'rgba(59, 130, 246, 0.25)',
            animation: 'spin 2s linear infinite'
          }}
        />

        {/* Inner ring - lighter blue */}
        <div
          className="absolute w-16 h-16 rounded-full"
          style={{
            border: '2px solid transparent',
            borderBottomColor: '#60a5fa',
            borderLeftColor: 'rgba(96, 165, 250, 0.25)',
            animation: 'spin-reverse 1.5s linear infinite'
          }}
        />

        {/* VeeFore Logo */}
        <img
          src="/veefore.svg"
          alt="VeeFore"
          className="w-8 h-8 relative z-10"
          style={{ animation: 'logo-pulse 2s ease-in-out infinite' }}
        />
      </div>
    </div>
  </div>
)

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
