import { Skeleton } from '@/components/ui/skeleton'

interface DataStoryProps {
  story: {
    emoji: string
    title: string
    story: string
    insight: string
    color: string
    textColor: string
    isLoading?: boolean
  }
  onClose: () => void
  storyAnimation: number
}

export function DataStory({ story, onClose, storyAnimation }: DataStoryProps) {
  return (
    <div 
      key={storyAnimation}
      className="mx-6 mb-4 relative overflow-hidden rounded-3xl transform-gpu animate-in zoom-in-95 duration-700 shadow-2xl"
      data-testid="data-story"
    >
      <div className={`${story.color} p-6 relative`}>
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-2 right-2 text-4xl animate-bounce">
            {story.emoji}
          </div>
          {/* skeleton-guard-allow: decorative — ambient pulsing background blobs in the
              story illustration, not a loading placeholder */}
          <div className="absolute bottom-2 left-2 w-16 h-16 rounded-full bg-white/20 dark:bg-gray-300/20 animate-pulse"></div>
          <div className="absolute top-1/2 left-1/3 w-8 h-8 rounded-full bg-white/10 dark:bg-gray-300/10 animate-ping"></div>
        </div>

        <div className={`relative z-10 ${story.textColor}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">{story.emoji}</span>
              <h3 className="text-lg font-bold tracking-wide">
                {story.isLoading ? 'Generating insights' : story.title}
              </h3>
              {story.isLoading && (
                <span className="flex items-center space-x-1 text-[10px] font-medium opacity-80">
                  {/* skeleton-guard-allow: action-spinner — tiny inline "AI analyzing" status
                      indicator next to the skeleton text, not a primary page loader */}
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>AI analyzing your data…</span>
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-300/70 dark:text-gray-400/70 hover:text-gray-100 dark:hover:text-gray-200 transition-colors p-1 rounded-full hover:bg-white/20 dark:hover:bg-gray-300/20"
            >
              ✕
            </button>
          </div>

          {story.isLoading ? (
            // While the AI analyses real data, show a neutral shimmer skeleton.
            // We deliberately do NOT render any placeholder numbers or template
            // copy here so the user never sees fabricated/hardcoded stats.
            <div className="space-y-3" data-testid="data-story-loading">
              <div className="space-y-2">
                <Skeleton variant="text" className="h-3.5 w-11/12 rounded-full" />
                <Skeleton variant="text" className="h-3.5 w-2/3 rounded-full" />
              </div>
              <div className="bg-white/15 dark:bg-gray-300/15 rounded-xl p-3 space-y-2">
                <Skeleton variant="text" className="h-3 w-full rounded-full" />
                <Skeleton variant="text" className="h-3 w-4/5 rounded-full" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium leading-relaxed animate-in slide-in-from-left duration-500 delay-200">
                {story.story}
              </p>

              <div className="bg-white/20 dark:bg-gray-300/20 rounded-xl p-3 animate-in slide-in-from-left duration-500 delay-400">
                <p className="text-xs font-semibold opacity-90">
                  💡 {story.insight}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
