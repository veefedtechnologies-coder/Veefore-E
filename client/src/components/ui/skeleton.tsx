import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-md bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 bg-[length:200%_100%]",
        className
      )}
      style={{
        animation: 'shimmer 1.5s ease-in-out infinite'
      }}
      {...props}
    />
  )
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4", className)}>
      <div className="flex items-center space-x-4">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
      <div className="flex space-x-2">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    </div>
  )
}

function SkeletonWorkspaceCard() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4 hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <Skeleton className="w-12 h-12 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

function SkeletonIntegrationCard() {
  return (
    <div className="rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Skeleton className="p-3 rounded-xl w-12 h-12" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <div className="flex items-center space-x-2">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
        <Skeleton className="h-5 w-5 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center space-x-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center space-x-2">
            <Skeleton className="w-3 h-3 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="flex space-x-2">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
    </div>
  )
}

function SkeletonAutomationCard() {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 p-6 space-y-4 shadow-lg">
      <div className="absolute top-4 right-4">
        <Skeleton className="w-3 h-3 rounded-full" />
      </div>
      <div className="flex items-start gap-4">
        <Skeleton className="p-3 rounded-2xl w-12 h-12" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="text-center p-3 rounded-xl bg-gray-100 dark:bg-gray-800">
            <Skeleton className="h-5 w-8 mx-auto mb-1" />
            <Skeleton className="h-3 w-14 mx-auto" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <Skeleton className="h-3 w-24" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-xl" />
          <Skeleton className="h-8 w-8 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

function SkeletonDashboardStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-20" />
          <div className="flex items-center space-x-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-6 py-3">
        <div className="flex items-center space-x-4">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 last:border-0">
          <div className="flex items-center space-x-4">
            <Skeleton className="h-4 w-8" />
            <div className="flex items-center space-x-3 flex-1">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

function SkeletonPageHeader() {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-32 rounded-lg" />
    </div>
  )
}

function SkeletonProfileCard() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-6">
      <div className="flex items-center space-x-4">
        <Skeleton className="w-20 h-20 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <Skeleton className="h-6 w-12 mx-auto mb-2" />
            <Skeleton className="h-3 w-16 mx-auto" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </div>
  )
}

function SkeletonPageLoader({ type = 'default' }: { type?: 'automation' | 'integration' | 'workspaces' | 'profile' | 'dashboard' | 'veegpt' | 'video' | 'default' }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6">
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      
      {type === 'automation' && (
        <>
          <div className="mb-8">
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonAutomationCard key={i} />
            ))}
          </div>
        </>
      )}
      
      {type === 'integration' && (
        <>
          <SkeletonPageHeader />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonIntegrationCard key={i} />
            ))}
          </div>
        </>
      )}
      
      {type === 'workspaces' && (
        <>
          <SkeletonPageHeader />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <SkeletonWorkspaceCard key={i} />
            ))}
          </div>
        </>
      )}
      
      {type === 'profile' && (
        <>
          <SkeletonPageHeader />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <SkeletonProfileCard />
            </div>
            <div className="lg:col-span-2 space-y-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        </>
      )}
      
      {type === 'dashboard' && (
        <>
          <SkeletonPageHeader />
          <SkeletonDashboardStats />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonTable rows={5} />
        </>
      )}
      
      {type === 'veegpt' && (
        <div className="flex flex-col h-[calc(100vh-100px)]">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
          <div className="flex-1 space-y-4 overflow-hidden">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      )}
      
      {type === 'video' && (
        <>
          <SkeletonPageHeader />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Skeleton className="h-64 w-full rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-48 w-full rounded-xl" />
              <SkeletonCard />
            </div>
          </div>
        </>
      )}
      
      {type === 'default' && (
        <>
          <SkeletonPageHeader />
          <SkeletonDashboardStats />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </>
      )}
    </div>
  )
}

function SkeletonSidebarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden">
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      
      {/* Sidebar Skeleton */}
      <div className="w-24 h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 space-y-6">
        <Skeleton className="h-12 w-12 rounded-xl mx-auto" />
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-10 w-10 rounded-lg mx-auto" />
          ))}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header Skeleton */}
        <div className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex items-center space-x-4">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </div>
        
        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

function SkeletonAnalyticsChart({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <div className="flex items-center space-x-3">
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
      <div className="flex items-center justify-between pt-2">
        <div className="flex space-x-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-3 w-10" />
          ))}
        </div>
        <div className="flex flex-col items-end space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-3 w-8" />
          ))}
        </div>
      </div>
    </div>
  )
}

function SkeletonSettingsSection({ className, rows = 4 }: { className?: string; rows?: number }) {
  return (
    <div className={cn("rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-6", className)}>
      <div className="space-y-1">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            {i % 2 === 0 ? (
              <Skeleton className="h-6 w-12 rounded-full" />
            ) : (
              <Skeleton className="h-10 w-48 rounded-lg" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SkeletonContentCard({ className, aspectRatio = '16:9' }: { className?: string; aspectRatio?: '16:9' | '1:1' }) {
  return (
    <div className={cn("rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden", className)}>
      <Skeleton className={cn("w-full", aspectRatio === '16:9' ? 'aspect-video' : 'aspect-square')} />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
        <div className="flex items-center space-x-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-5 w-14 rounded-full" />
          ))}
        </div>
        <div className="flex items-center justify-between pt-2">
          <div className="flex space-x-2">
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

function SkeletonMetricCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="h-10 w-28" />
      <div className="flex items-center space-x-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  )
}

function SkeletonChatMessage({ className, isUser = false }: { className?: string; isUser?: boolean }) {
  return (
    <div className={cn("flex gap-3", isUser ? 'flex-row-reverse' : '', className)}>
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className={cn("flex-1 max-w-[80%] space-y-2", isUser ? 'items-end' : '')}>
        <div className={cn(
          "rounded-2xl p-4 space-y-2",
          isUser 
            ? "bg-blue-50 dark:bg-blue-900/20 rounded-br-sm" 
            : "bg-gray-100 dark:bg-gray-800 rounded-bl-sm"
        )}>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
        <Skeleton className={cn("h-3 w-16", isUser ? 'ml-auto' : '')} />
      </div>
    </div>
  )
}

function SkeletonNavTabs({ className, tabs = 4 }: { className?: string; tabs?: number }) {
  return (
    <div className={cn("flex items-center space-x-1 border-b border-gray-200 dark:border-gray-700 pb-1", className)}>
      {Array.from({ length: tabs }).map((_, i) => (
        <Skeleton 
          key={i} 
          className={cn(
            "h-10 rounded-lg",
            i === 0 ? "w-24" : "w-20"
          )} 
        />
      ))}
    </div>
  )
}

function SkeletonFormSection({ className, fields = 3 }: { className?: string; fields?: number }) {
  return (
    <div className={cn("rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-6", className)}>
      <div className="space-y-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <div className="flex justify-end space-x-3 pt-4">
        <Skeleton className="h-10 w-24 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  )
}

export { 
  Skeleton, 
  SkeletonCard, 
  SkeletonWorkspaceCard, 
  SkeletonIntegrationCard, 
  SkeletonAutomationCard,
  SkeletonDashboardStats,
  SkeletonTable,
  SkeletonPageHeader,
  SkeletonProfileCard,
  SkeletonPageLoader,
  SkeletonSidebarLayout,
  SkeletonAnalyticsChart,
  SkeletonSettingsSection,
  SkeletonContentCard,
  SkeletonMetricCard,
  SkeletonChatMessage,
  SkeletonNavTabs,
  SkeletonFormSection
}
