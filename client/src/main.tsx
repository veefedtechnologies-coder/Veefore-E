import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import { queryClient } from './lib/queryClient'
import { initializeTheme } from './lib/theme'

// Initialize theme before rendering
initializeTheme()

// Ensure React is available globally
if (typeof window !== 'undefined') {
  (window as any).React = React
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
)