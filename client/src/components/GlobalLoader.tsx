import React from 'react'

export default function GlobalLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center space-x-3">
        <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-700 dark:text-gray-300">Loading…</span>
      </div>
    </div>
  )
}
