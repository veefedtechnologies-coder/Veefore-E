import { cn } from "@/lib/utils"

interface SkeletonProps {
  className?: string
}

const Skeleton = ({ className }: SkeletonProps) => (
  <div
    className={cn(
      "rounded-md bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 bg-[length:200%_100%]",
      className
    )}
    style={{
      animation: 'shimmer 1.5s ease-in-out infinite'
    }}
  />
)

const LoadingSpinner = ({ type = 'default' }: { type?: 'automation' | 'integration' | 'workspaces' | 'profile' | 'dashboard' | 'veegpt' | 'video' | 'settings' | 'security' | 'admin' | 'default' | 'minimal' }) => {
  return (
    <div className="min-h-[200px] flex items-center justify-center">
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div className="flex flex-col items-center gap-3">
        <div 
          className="w-8 h-8 border-gray-200 dark:border-gray-700 border-t-blue-500 dark:border-t-blue-400 rounded-full"
          style={{ animation: 'spin 0.8s linear infinite', borderWidth: '3px' }}
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
      </div>
    </div>
  )
}

export { Skeleton }
export default LoadingSpinner
