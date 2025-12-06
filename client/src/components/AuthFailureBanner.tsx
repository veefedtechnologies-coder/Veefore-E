import React from 'react'

export default function AuthFailureBanner({
  title = 'Sign-in failed',
  message,
  onRetry,
  onUseEmail,
  onSignOut,
  onSupport
}: {
  title?: string
  message: string
  onRetry: () => void
  onUseEmail?: () => void
  onSignOut?: () => void
  onSupport?: () => void
}) {
  return (
    <div className="mb-4">
      <div className="relative overflow-hidden rounded-2xl border border-red-300/60 dark:border-red-700/50 bg-gradient-to-br from-red-50 to-rose-100 dark:from-red-900/30 dark:to-rose-900/20 shadow-lg">
        <div className="px-5 py-4">
          <div className="flex items-start">
            <div className="mr-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-800/40 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600 dark:text-red-300" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 4h.01M9.74 3.51l-6.23 10.8a2 2 0 0 0 1.76 3h12.46a2 2 0 0 0 1.76-3l-6.23-10.8a2 2 0 0 0-3.52 0z"/></svg>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">{title}</h3>
              <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">{message}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={onRetry} className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700">Retry Sign-in</button>
                {onUseEmail && (
                  <button onClick={onUseEmail} className="px-3 py-2 rounded-lg bg-white text-red-700 border border-red-300 hover:bg-red-50 dark:bg-transparent dark:text-red-200 dark:border-red-700">Use Email</button>
                )}
                {onSignOut && (
                  <button onClick={onSignOut} className="px-3 py-2 rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 dark:bg-transparent dark:text-gray-200 dark:border-gray-600">Sign Out</button>
                )}
                {onSupport && (
                  <button onClick={onSupport} className="px-3 py-2 rounded-lg bg-white text-blue-700 border border-blue-300 hover:bg-blue-50 dark:bg-transparent dark:text-blue-300 dark:border-blue-700">Contact Support</button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
