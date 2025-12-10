import { ReactNode } from 'react'

interface PlatformCardProps {
  platform: {
    id: string
    name: string
    logo: ReactNode
    followers: number
    engagement: string
  }
  formatNumber: (num: number) => string
}

export function PlatformCard({ platform, formatNumber }: PlatformCardProps) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 text-center hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-200">
      <div className="w-10 h-10 rounded-full bg-white dark:bg-gray-700 mx-auto mb-3 flex items-center justify-center text-lg shadow-sm">
        {platform.logo}
      </div>
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{platform.name}</div>
      <div className="space-y-1">
        <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatNumber(platform.followers)}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">Followers</div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">{platform.engagement}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">Engagement</div>
      </div>
    </div>
  )
}
