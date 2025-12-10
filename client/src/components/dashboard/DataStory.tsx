interface DataStoryProps {
  story: {
    emoji: string
    title: string
    story: string
    insight: string
    color: string
    textColor: string
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
          <div className="absolute bottom-2 left-2 w-16 h-16 rounded-full bg-white/20 dark:bg-gray-300/20 animate-pulse"></div>
          <div className="absolute top-1/2 left-1/3 w-8 h-8 rounded-full bg-white/10 dark:bg-gray-300/10 animate-ping"></div>
        </div>

        <div className={`relative z-10 ${story.textColor}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">{story.emoji}</span>
              <h3 className="text-lg font-bold tracking-wide">{story.title}</h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-300/70 dark:text-gray-400/70 hover:text-gray-100 dark:hover:text-gray-200 transition-colors p-1 rounded-full hover:bg-white/20 dark:hover:bg-gray-300/20"
            >
              ✕
            </button>
          </div>
          
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
        </div>
      </div>
    </div>
  )
}
