import React from 'react'

const quickActions = [
  {
    title: 'Create from scratch',
    icon: (
      <div className="w-24 h-24 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center relative">
        {/* Document/Paper base */}
        <div className="w-14 h-16 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg shadow-sm relative">
          {/* Header bar */}
          <div className="w-full h-3 bg-red-500 rounded-t-md"></div>
          {/* Content lines */}
          <div className="p-2 space-y-1">
            <div className="w-8 h-1 bg-gray-300 dark:bg-gray-500 rounded"></div>
            <div className="w-6 h-1 bg-gray-300 dark:bg-gray-500 rounded"></div>
            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-500 rounded"></div>
          </div>
        </div>
        {/* Pencil/Edit overlay */}
        <div className="absolute bottom-2 right-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center transform rotate-45">
          <div className="w-1 h-3 bg-white rounded"></div>
        </div>
      </div>
    )
  },
  {
    title: 'Post across networks',
    icon: (
      <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center relative">
        {/* Main content area */}
        <div className="w-14 h-10 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg shadow-sm relative">
          {/* Content representation */}
          <div className="p-1.5">
            <div className="w-8 h-1 bg-blue-400 rounded mb-1"></div>
            <div className="w-6 h-1 bg-gray-300 dark:bg-gray-500 rounded"></div>
          </div>
        </div>
        {/* Social network icons overlay */}
        <div className="absolute top-3 right-3 w-6 h-6 bg-slate-800 rounded-md flex items-center justify-center">
          <div className="w-2 h-2 bg-white rounded-full"></div>
        </div>
        <div className="absolute bottom-3 left-3 w-4 h-4 bg-pink-500 rounded-md"></div>
      </div>
    )
  },
  {
    title: 'Post about a trend',
    icon: (
      <div className="w-24 h-24 bg-pink-100 dark:bg-pink-900/30 rounded-2xl flex items-center justify-center relative">
        {/* Chart/Graph container */}
        <div className="w-14 h-12 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg shadow-sm relative p-2">
          {/* Trending line chart */}
          <div className="w-full h-full relative">
            <div className="absolute bottom-0 left-1 w-6 h-4 bg-red-400 rounded-sm transform skew-x-12"></div>
            <div className="absolute top-1 right-1 w-3 h-2 bg-red-500 rounded-full"></div>
          </div>
        </div>
        {/* Trending arrow */}
        <div className="absolute bottom-2 right-2 w-4 h-4 relative">
          <div className="w-3 h-0.5 bg-green-500 absolute bottom-1 left-0 transform rotate-45"></div>
          <div className="w-1 h-1 bg-green-500 absolute bottom-0 right-0"></div>
        </div>
      </div>
    )
  },
  {
    title: 'Start with AI',
    icon: (
      <div className="w-24 h-24 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center relative">
        {/* Computer/Device */}
        <div className="w-14 h-10 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg shadow-sm relative">
          {/* Screen content */}
          <div className="w-full h-6 bg-gradient-to-r from-purple-200 to-pink-200 dark:from-purple-300 dark:to-pink-300 rounded-t-md"></div>
          <div className="p-1">
            <div className="w-8 h-1 bg-gray-300 dark:bg-gray-500 rounded"></div>
          </div>
        </div>
        {/* AI Sparkle/Magic overlay */}
        <div className="absolute top-2 right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
          <div className="text-white text-xs">✨</div>
        </div>
        {/* Chat bubble */}
        <div className="absolute bottom-2 left-2 w-4 h-3 bg-pink-400 rounded-lg"></div>
      </div>
    )
  }
]

export function QuickActions() {
  return (
    <div className="mb-16" data-testid="quick-actions">
      {/* Quick Actions Grid - Large Hootsuite Style */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-10 px-3 sm:px-4 lg:px-6">
        {quickActions.map((action, index) => (
          <button 
            key={index} 
            className="group cursor-pointer bg-transparent hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-all duration-200 p-8 rounded-2xl min-h-[200px] flex flex-col items-center justify-center"
          >
            {/* Icon */}
            <div className="mb-8 flex justify-center">
              {action.icon}
            </div>

            {/* Title */}
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 leading-tight">
                {action.title}
              </h3>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}