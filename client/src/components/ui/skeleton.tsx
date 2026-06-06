import { cn } from "@/lib/utils"
import { ArrowLeft, CheckCircle2, Calendar, PenBox } from "lucide-react"
import { Button } from "@/components/ui/button"

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

function SkeletonPageLoader({ type = 'default' }: { type?: 'automation' | 'integration' | 'workspaces' | 'profile' | 'dashboard' | 'veegpt' | 'video' | 'settings' | 'plan' | 'posts' | 'analytics' | 'default' | 'scheduled-page' | 'drafts-page' | 'published-page' }) {
  return (
    <div className="w-full h-full animate-in fade-in duration-300">
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
      
      {type === 'plan' && (
        <div className="w-full">
          {/* Calendar Container */}
          
          {/* Calendar Container */}
          <div className="bg-white dark:bg-gray-900 min-h-screen w-full">
            {/* Header Controls */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                   <Skeleton className="h-9 w-9 rounded-md bg-gray-100 dark:bg-gray-800" />
                   <Skeleton className="h-7 w-16" />
                   <Skeleton className="h-9 w-9 rounded-md bg-gray-100 dark:bg-gray-800" />
                </div>
                <Skeleton className="h-5 w-40" />
              </div>
              <div className="flex items-center space-x-2">
                 <Skeleton className="h-9 w-9 rounded-md" />
                 <Skeleton className="h-9 w-9 rounded-md" />
                 <Skeleton className="h-9 w-24 rounded-md" />
                 <Skeleton className="h-9 w-28 rounded-md" />
              </div>
            </div>

            {/* Calendar Header */}
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              {[1,2,3,4,5,6,7].map(i => (
                 <div key={i} className="p-4 text-center border-r border-gray-200 dark:border-gray-700 last:border-r-0">
                   <Skeleton className="h-4 w-10 mx-auto mb-2 opacity-60" />
                   <Skeleton className="h-10 w-10 mx-auto rounded-full" />
                 </div>
              ))}
            </div>
            
            {/* Calendar Body */}
            <div className="grid grid-cols-7 min-h-[600px]">
              {[1,2,3,4,5,6,7].map(i => (
                 <div key={i} className="p-4 space-y-3 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 last:border-r-0">
                   {i === 1 || i === 3 || i === 4 || i === 7 ? (
                      <Skeleton className="h-[72px] w-full rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50" />
                   ) : null}
                   {i === 6 && (
                      <Skeleton className="h-6 w-full rounded-md bg-blue-600 dark:bg-blue-600" />
                   )}
                 </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {type === 'posts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Scheduled Posts Skeleton */}
            <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl">
              <div className="flex flex-row items-center justify-between p-6 pb-4">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-36 rounded-lg" />
              </div>
              <div className="p-6 pt-0 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center space-x-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <Skeleton className="w-16 h-16 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <div className="flex items-center space-x-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-20 rounded-lg" />
                  </div>
                ))}
              </div>
            </div>

            {/* Drafts Skeleton */}
            <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl mt-0">
              <div className="flex flex-row items-center justify-between p-6 pb-4">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-28 rounded-lg" />
              </div>
              <div className="p-6 pt-0 space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center space-x-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <Skeleton className="w-14 h-14 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-8 w-16 rounded-lg" />
                  </div>
                ))}
              </div>
            </div>

            {/* Published Posts Skeleton */}
            <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl mt-0">
              <div className="flex flex-row items-center justify-between p-6 pb-4">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-36 rounded-lg" />
              </div>
              <div className="p-6 pt-0 space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center space-x-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <Skeleton className="w-16 h-16 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <div className="flex items-center space-x-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-20 rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {type === 'analytics' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center mb-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <Skeleton className="h-4 w-24 mb-4" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 h-96">
               <Skeleton className="h-6 w-48 mb-6" />
               <Skeleton className="h-[280px] w-full rounded-md" />
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 h-96">
               <Skeleton className="h-6 w-48 mb-6" />
               <Skeleton className="h-[280px] w-full rounded-md" />
            </div>
          </div>
        </div>
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
        <div className="w-full">
          <div className="mb-16">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 px-3 sm:px-4 lg:px-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-transparent hover:bg-gray-50/50 dark:hover:bg-gray-800/50 p-8 rounded-2xl min-h-[200px] flex flex-col items-center justify-center animate-pulse">
                  <Skeleton className="w-24 h-24 rounded-2xl mb-8" />
                  <Skeleton className="h-6 w-32 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
            <div className="space-y-6">
              {/* Performance Score */}
              <div className="border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl transition-all duration-300 border-0 rounded-3xl overflow-hidden mb-6">
                <div className="flex flex-row items-center justify-between space-y-0 p-6 pb-6">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="h-6 w-48" />
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trending-up w-4 h-4 text-blue-600 dark:text-blue-400"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                      <Skeleton className="h-8 w-16 rounded-md mx-1" />
                      <Skeleton className="h-8 w-20 rounded-md mx-1" />
                      <Skeleton className="h-8 w-24 rounded-md mx-1" />
                    </div>
                    <Skeleton className="h-9 w-28 rounded-xl" />
                  </div>
                </div>
                <div className="space-y-8 px-6 pb-6">
                  <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center space-x-3">
                          <Skeleton className="w-10 h-10 rounded-lg bg-white/20" />
                          <Skeleton className="h-6 w-32 bg-white/20" />
                        </div>
                        <Skeleton className="h-4 w-full max-w-md bg-white/20" />
                        <Skeleton className="h-4 w-3/4 bg-white/20" />
                        <Skeleton className="h-3 w-2/3 bg-white/20" />
                      </div>
                      <Skeleton className="w-6 h-6 rounded-full bg-white/20" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <Skeleton className="h-6 w-40" />
                      <div className="flex items-center space-x-2">
                        {[1, 2, 3].map((i) => (
                          <Skeleton key={i} className="w-8 h-8 rounded-full" />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Skeleton className="w-2 h-2 rounded-full" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {[1, 2].map((i) => (
                      <div key={i} className="bg-white dark:bg-slate-900/50 rounded-xl p-6 border border-gray-100 dark:border-gray-800/60 relative overflow-hidden">
                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <Skeleton className="h-3 w-24 mb-3 rounded" />
                              <Skeleton className="h-8 w-20 rounded-lg" />
                            </div>
                            <Skeleton className="w-10 h-10 rounded-lg" />
                          </div>
                          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800/50 flex justify-between">
                              <Skeleton className="h-3 w-28 rounded" />
                              <Skeleton className="h-3 w-12 rounded" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              </div>
              
              {/* Get Started */}
              <div className="bg-white/90 dark:bg-gray-800/90 rounded-3xl p-6 shadow-xl border-0">
                <Skeleton className="h-6 w-64 mb-6" />
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-start space-x-4 p-4 rounded-2xl bg-gray-50 dark:bg-gray-700/50">
                      <Skeleton className="w-12 h-12 rounded-2xl flex-shrink-0" />
                      <div className="flex-1 space-y-2 mt-1">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-4 w-64" />
                      </div>
                    </div>
                  ))}
                  <Skeleton className="h-32 rounded-3xl w-full mt-8" />
                </div>
              </div>
              
              {/* Scheduled Posts & Drafts */}
              {[1, 2].map((section) => (
                <div key={section} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <Skeleton className="h-6 w-40 mb-2" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="h-8 w-32 rounded-md" />
                  </div>
                  <div className="flex flex-col items-center justify-center py-12 space-y-6">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-10 w-32 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
            
            <div className="space-y-6">
              {/* Best Time Widget */}
              <div className="relative overflow-hidden border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300 border-0 rounded-3xl group mb-6">
                <div className="flex flex-col space-y-1.5 p-6 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="text-base font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
                      <Skeleton className="w-4 h-4 rounded-full" />
                      Optimal Posting Time
                    </div>
                    <Skeleton className="h-6 w-16 rounded-md" />
                  </div>
                </div>

                <div className="p-6 pt-2 space-y-6">
                  {/* Main Stat Skeleton */}
                  <div className="flex items-end justify-between">
                    <div>
                      <Skeleton className="h-4 w-28 mb-2" />
                      <Skeleton className="h-10 md:h-12 w-32 mb-3" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>

                  {/* Mini Stats Grid Skeleton */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                       <Skeleton className="h-3 w-20 mb-2" />
                       <Skeleton className="h-6 w-12 mb-2" />
                       <Skeleton className="h-2 w-16 mt-1" />
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                       <Skeleton className="h-3 w-16 mb-2" />
                       <Skeleton className="h-6 w-16 mb-2" />
                       <Skeleton className="h-2 w-20 mt-1" />
                    </div>
                  </div>

                  {/* Action Button Skeleton */}
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              </div>
              
              {/* Recommendations */}
              <div className="bg-white/90 dark:bg-gray-800/90 rounded-3xl p-6 shadow-xl border-0">
                <Skeleton className="h-6 w-48 mb-6" />
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex space-x-4 p-4 rounded-2xl bg-gray-50 dark:bg-gray-700/50">
                      <Skeleton className="h-10 w-10 rounded-xl flex-shrink-0" />
                      <div className="space-y-2 flex-1 mt-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Social Accounts */}
              <div className="bg-white/90 dark:bg-gray-800/90 rounded-3xl p-6 shadow-xl border-0">
                <div className="flex justify-between items-center mb-6">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center space-x-3 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Listening */}
              <div className="bg-white/90 dark:bg-gray-800/90 rounded-3xl p-6 shadow-xl border-0">
                <Skeleton className="h-6 w-40 mb-6" />
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-32 rounded-2xl w-full" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
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

      {type === 'settings' && (
        <div className="max-w-[1400px] mx-auto w-full -m-6 p-4 sm:p-6 sm:py-8 bg-gray-50 dark:bg-gray-900">
          <div className="mb-8 flex items-center gap-4">
            <Skeleton className="w-12 h-12 rounded-xl" />
            <div>
              <Skeleton className="h-8 w-40 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-3">
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="space-y-6">
                  <div>
                    <Skeleton className="h-3 w-16 mb-4 px-3" />
                    <div className="space-y-1">
                      {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
                    </div>
                  </div>
                  <div>
                    <Skeleton className="h-3 w-16 mb-4 px-3" />
                    <div className="space-y-1">
                      {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-9">
              <div className="space-y-8">
                <div>
                  <Skeleton className="h-8 w-64 mb-2" />
                  <Skeleton className="h-4 w-96" />
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 animate-pulse">
                        <div className="flex items-center gap-5">
                          <Skeleton className="w-14 h-14 rounded-xl flex-shrink-0" />
                          <div className="space-y-2.5">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-4 w-48" />
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-10 w-32 rounded-xl hidden sm:block" />
                          <Skeleton className="h-10 w-24 rounded-xl" />
                          <Skeleton className="h-10 w-10 rounded-xl" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {type === 'published-page' && (
        <div className="min-h-full pb-16">
          <div className="relative mb-8 pb-8 border-b border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-50/50 via-teal-50/50 to-transparent dark:from-emerald-900/10 dark:via-teal-900/10 opacity-50 -z-10 blur-3xl"></div>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center space-x-2 pt-6">
                <Button variant="ghost" disabled className="p-2 -ml-2 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <div className="flex items-center space-x-3">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
                      Published
                    </h1>
                    <span className="px-3 py-1 text-xs font-semibold tracking-wide bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-full shadow-sm flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <Skeleton className="w-8 h-4 bg-emerald-200/50" /> Live
                    </span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
                    Your past successes. Review everything that has been sent out to the world.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-center mb-10">
              <div className="inline-flex items-center p-2 space-x-2 bg-white/30 dark:bg-gray-900/30 backdrop-blur-xl border border-white/40 dark:border-gray-700/50 rounded-full shadow-lg shadow-gray-200/50 dark:shadow-none min-w-[400px] justify-between">
                {['All', 'Post', 'Reel', 'Story'].map((tab) => (
                  <button key={tab} disabled className={`flex-1 px-8 py-3 rounded-full text-sm font-semibold transition-all duration-300 ${tab === 'All' ? 'bg-white/90 dark:bg-gray-800 text-gray-900 dark:text-white shadow-md ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-600 dark:text-gray-300'}`}>{tab}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="border border-gray-100 dark:border-gray-800 overflow-hidden bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm rounded-xl">
                  <div className="aspect-[4/5] bg-gray-100 dark:bg-gray-800 animate-pulse" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {type === 'scheduled-page' && (
        <div className="min-h-full pb-16">
          <div className="relative mb-8 pb-8 border-b border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-purple-50/50 to-transparent dark:from-blue-900/10 dark:via-purple-900/10 opacity-50 -z-10 blur-3xl"></div>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center space-x-2 pt-6">
                <Button variant="ghost" disabled className="p-2 -ml-2 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <div className="flex items-center space-x-3">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
                      Scheduled Content
                    </h1>
                    <span className="px-3 py-1 text-xs font-semibold tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-full shadow-sm">
                      <Skeleton className="w-8 h-4 bg-blue-200/50 inline-block align-middle mr-1" /> Posts
                    </span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
                    Your pipeline. Review, edit, or cancel upcoming posts.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="border border-gray-100 dark:border-gray-800 overflow-hidden bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm rounded-xl">
                  <div className="aspect-[4/5] bg-gray-100 dark:bg-gray-800 animate-pulse" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {type === 'drafts-page' && (
        <div className="min-h-full pb-16">
          <div className="relative mb-8 pb-8 border-b border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-purple-50/50 to-transparent dark:from-blue-900/10 dark:via-purple-900/10 opacity-50 -z-10 blur-3xl"></div>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center space-x-2 pt-6">
                <Button variant="ghost" disabled className="p-2 -ml-2 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <div className="flex items-center space-x-3">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
                      Drafts
                    </h1>
                    <span className="px-3 py-1 text-xs font-semibold tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-full shadow-sm">
                      <Skeleton className="w-8 h-4 bg-blue-200/50 inline-block align-middle mr-1" /> Saved
                    </span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
                    Unfinished masterpieces. Perfect them and publish when ready.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="border border-gray-100 dark:border-gray-800 overflow-hidden bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm rounded-xl">
                  <div className="aspect-[4/5] bg-gray-100 dark:bg-gray-800 animate-pulse" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
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
