import { memo, Component, ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppWrapper from './AppWrapper'
import { Agentation } from 'agentation'

// DEV SAFETY: a previously-installed service worker can keep serving STALE client
// assets in normal (non-incognito) windows, which makes code fixes appear to "not
// work" until the SW is manually cleared. In development, proactively unregister
// any existing service worker and purge its caches on every load so the running
// code is always fresh. (Incognito has no SW, which is why it always worked.)
if ((import.meta as any).env?.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  // Dev-mode parity banner: the SSR app-shell + first-byte bootstrap seeding only
  // run in the production server (serveStatic). In dev (Vite middleware) they are
  // OFF, so first paint shows the client skeleton and no `__VEEFORE_BOOTSTRAP__`.
  // Run `npm run build && npm start` to exercise the real production behavior.
  console.warn('[DEV] SSR bootstrap/seeding is disabled in dev. For production-load behavior run: npm run build && npm start')
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => {
      if (registrations.length > 0) {
        console.warn('[DEV] Unregistering stale service worker(s) to avoid serving cached assets')
      }
      registrations.forEach((registration) => registration.unregister())
    })
    .catch(() => { /* ignore */ })

  if (typeof caches !== 'undefined') {
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => { /* ignore */ })
  }
}

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

const Router = memo(() => {
  return (
    <AppErrorBoundary>
      <AppWrapper />
      {(import.meta.env.DEV || import.meta.env.MODE === 'development') && <Agentation />}
    </AppErrorBoundary>
  )
})

Router.displayName = 'Router'

createRoot(document.getElementById('root')!).render(<Router />)

// Service worker REMOVED. It was caching the JS bundle and could serve a STALE
// build, which masked client-side fixes. We now rely on immutable HTTP caching of
// hashed assets (set in server/vite.ts) for fast loads — no SW needed. This block
// actively unregisters any previously-installed SW and purges its caches so users
// who installed the old one recover automatically on their next load.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => { /* ignore */ })
  if (typeof caches !== 'undefined') {
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .catch(() => { /* ignore */ })
  }
}
