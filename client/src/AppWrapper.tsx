import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { queryClient } from './lib/queryClient'
import { initializeTheme } from './lib/theme'
import { initSentryBrowser, addBasicBreadcrumbs } from './lib/sentry'

initializeTheme()
try {
  const dsn = (import.meta as any).env?.VITE_SENTRY_DSN
  if (dsn) { initSentryBrowser(dsn); addBasicBreadcrumbs() }
} catch {}

const AppWrapper = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  )
}

export default AppWrapper
