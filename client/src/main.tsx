// Import React synchronously
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import TestMinimal from './TestMinimal'
import TestApp from './TestApp'
import SimpleTest from './SimpleTest'
import App from './App'
import './index.css'
import { queryClient } from './lib/queryClient'
import { initializeTheme } from './lib/theme'

// Initialize theme before rendering
initializeTheme()

// Comprehensive React availability check
console.log('React availability check:', {
  React: typeof React,
  createRoot: typeof createRoot,
  useState: typeof React?.useState,
  QueryClientProvider: typeof QueryClientProvider
})

// Ensure React is available before rendering
if (!React || !React.useState || !createRoot) {
  console.error('React or createRoot is not available in main.tsx', { 
    React: typeof React, 
    createRoot: typeof createRoot,
    useState: typeof React?.useState
  })
  document.getElementById('root')!.innerHTML = '<div>Error: React not available</div>'
} else {
  try {
    console.log('Rendering React app...')
    createRoot(document.getElementById('root')!).render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    )
    console.log('React app rendered successfully')
  } catch (error) {
    console.error('Error rendering React app:', error)
    document.getElementById('root')!.innerHTML = '<div>Error: Failed to render React app</div>'
  }
}