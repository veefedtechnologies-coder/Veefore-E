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
    <div className="min-h-screen bg-[#030303] flex items-center justify-center">
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes spin-reverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.3; filter: blur(15px); }
          50% { opacity: 0.6; filter: blur(20px); }
        }
        @keyframes logo-pulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.4)); }
          50% { transform: scale(1.03); filter: drop-shadow(0 0 20px rgba(59, 130, 246, 0.6)); }
        }
      `}} />

      <div className="flex flex-col items-center">
        {/* Logo with orbital rings - compact */}
        <div className="relative w-24 h-24 flex items-center justify-center">
          {/* Glow backdrop */}
          <div
            className="absolute w-16 h-16 rounded-full bg-blue-500/25"
            style={{ animation: 'pulse-glow 3s ease-in-out infinite' }}
          />

          {/* Outer ring - blue only */}
          <div
            className="absolute w-24 h-24 rounded-full"
            style={{
              border: '2px solid transparent',
              borderTopColor: '#3b82f6',
              borderRightColor: 'rgba(59, 130, 246, 0.25)',
              animation: 'spin 2s linear infinite'
            }}
          />

          {/* Inner ring - lighter blue */}
          <div
            className="absolute w-16 h-16 rounded-full"
            style={{
              border: '2px solid transparent',
              borderBottomColor: '#60a5fa',
              borderLeftColor: 'rgba(96, 165, 250, 0.25)',
              animation: 'spin-reverse 1.5s linear infinite'
            }}
          />

          {/* VeeFore Logo */}
          <img
            src="/veefore.svg"
            alt="VeeFore"
            className="w-8 h-8 relative z-10"
            style={{ animation: 'logo-pulse 2s ease-in-out infinite' }}
          />
        </div>
      </div>
    </div>
  )
}

export { Skeleton }
export default LoadingSpinner
