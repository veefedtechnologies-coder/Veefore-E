import React from 'react'

export default function WorkspaceCreationOverlay({ error, onRetry, onSignOut }: { error?: string, onRetry: () => void, onSignOut?: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 text-center">
        <div className="flex items-center justify-center mb-4">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
        {!error ? (
          <>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Creating your workspace</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Setting up a default workspace required to use the app.</p>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-red-600">Workspace creation failed</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{error}</p>
            <button onClick={onRetry} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Retry Workspace Creation</button>
            {onSignOut && (
              <button onClick={onSignOut} className="mt-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600">Sign Out</button>
            )}
            <div className="mt-2 text-xs text-gray-500">If this persists, check your network and try signing out and in again.</div>
          </>
        )}
      </div>
    </div>
  )
}
