import React from 'react'

export default function AccountNotFoundBanner({ onSignup, onSignOut, onAssociate }: { onSignup: () => void, onSignOut: () => void, onAssociate: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M4.93 4.93l14.14 14.14" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Account Not Found</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">Complete signup to create your account and default workspace.</p>
        <div className="space-y-3">
          <button onClick={onAssociate} className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">Associate My Email</button>
          <button onClick={onSignup} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Complete Signup</button>
          <button onClick={onSignOut} className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Sign Out</button>
        </div>
      </div>
    </div>
  )
}
