import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Clock, TrendingUp, Sparkles, Activity, Search, Target, ShieldCheck, ArrowRight, CalendarDays, BarChart4 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocation } from 'wouter'
import { useSocialAccounts } from '@/hooks/useSocialAccounts'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'

export default function BestTimeDetail() {
  const [, setLocation] = useLocation()
  const { currentWorkspace } = useCurrentWorkspace()
  const { validAccounts, isLoading } = useSocialAccounts(currentWorkspace?.id)

  if (isLoading) {
    return (
      <div className="w-full space-y-6">
        <Skeleton className="h-10 w-64 mb-2" />
        <Skeleton className="h-4 w-96 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  const accountWithTime = validAccounts.find((acc: any) => acc?.aiBestActiveTime)
  const bestTimeData = accountWithTime?.aiBestActiveTime

  if (!bestTimeData) {
    return (
      <div className="p-8 max-w-4xl mx-auto h-[60vh] flex flex-col items-center justify-center text-center">
        <div className="w-24 h-24 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mb-6">
          <Activity className="w-12 h-12 text-purple-500" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">Analyzing Your Audience</h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-xl mb-8">
          We are currently gathering engagement signals from your posts to determine the exact optimal posting times for your unique audience. Keep posting consistently to speed up the process!
        </p>
        <Button onClick={() => setLocation('/')} variant="outline" className="rounded-xl">
          Return to Dashboard
        </Button>
      </div>
    )
  }

  const { 
    best_hour_label, 
    best_window_label,
    billboard_day, 
    status, 
    usable_posts,
    scanned_posts,
    confidence,
    z_score,
    dominant_weekday,
    daily_best_hours
  } = bestTimeData

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-200 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              AI Recommendation Engine
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
            Best Time to Post
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg">
            Calculated based on your audience's unique engagement patterns.
          </p>
        </div>
        <Button 
          onClick={() => setLocation('/create')}
          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg px-6 h-12"
        >
          Schedule a Post
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Primary Billboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        <div className="lg:col-span-8">
          <Card className="h-full border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-xl transition-all duration-300 border-0 relative overflow-hidden group">
            {/* Background Decorator */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-purple-500/10 to-blue-500/10 dark:from-purple-500/5 dark:to-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none transition-transform duration-700 group-hover:scale-110" />
            
            <CardContent className="p-8 md:p-10 relative z-10 h-full flex flex-col justify-center">
              <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-6 font-medium text-sm tracking-wide uppercase">
                <Target className="w-4 h-4" />
                Peak Engagement Window
              </div>
              <div className="flex flex-col md:flex-row md:items-center gap-8 md:gap-12">
                <div className="flex-shrink-0">
                  <div className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 tracking-tighter drop-shadow-sm">
                    {best_hour_label}
                  </div>
                  <div className="text-xl md:text-2xl font-bold text-gray-700 dark:text-gray-300 mt-2">
                    {billboard_day}
                  </div>
                </div>
                <div className="hidden md:block w-px h-24 bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1">
                  <h3 className="text-lg md:text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 leading-snug">
                    {status || `Posting during the ${best_window_label} window on ${billboard_day} yields the highest engagement based on your audience history.`}
                  </h3>
                  <div className="inline-flex items-center gap-2 bg-purple-50 dark:bg-purple-900/20 px-4 py-2 rounded-xl text-purple-700 dark:text-purple-300 font-semibold border border-purple-100 dark:border-purple-800/50 shadow-sm">
                    <TrendingUp className="w-4 h-4 text-purple-500" />
                    Optimal window: {best_window_label}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-4">
          <Card className="border-gray-200/50 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm shadow-md">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Search className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Posts Analyzed</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{scanned_posts}</h4>
                  <span className="text-xs text-gray-400">total</span>
                </div>
                <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-1">
                  {usable_posts} strong signals
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-gray-200/50 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm shadow-md">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                <ShieldCheck className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">AI Confidence</p>
                <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {Math.round(confidence * 100)}%
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  z-score: {z_score}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Daily Breakdown */}
      <Card className="border-0 shadow-xl bg-white dark:bg-gray-800 overflow-hidden">
        <CardHeader className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700/50">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-blue-500" />
            Daily Breakdown
          </CardTitle>
          <CardDescription>
            The single best hour to post for each day of the week, ranked by expected engagement.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {daily_best_hours?.map((day: any, idx: number) => {
              const displayHour = day.best_hour % 12 || 12;
              const ampm = day.best_hour >= 12 ? 'PM' : 'AM';
              const label = `${displayHour} ${ampm}`;
              const barWidth = Math.max(10, day.score * 100);
              
              return (
                <div 
                  key={idx} 
                  className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 md:p-6 transition-colors ${
                    day.is_peak ? 'bg-purple-50/50 dark:bg-purple-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <div className="w-32 flex-shrink-0 flex items-center gap-2">
                    <span className={`font-semibold ${day.is_peak ? 'text-purple-700 dark:text-purple-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      {day.day_name}
                    </span>
                    {day.is_peak && (
                      <span className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        Peak
                      </span>
                    )}
                  </div>
                  
                  <div className="w-24 flex-shrink-0">
                    <div className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                      <Clock className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{label}</span>
                    </div>
                  </div>
                  
                  <div className="flex-1 flex items-center gap-4">
                    <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${
                          day.is_peak 
                            ? 'bg-gradient-to-r from-purple-500 to-blue-500' 
                            : 'bg-gradient-to-r from-blue-400 to-blue-300 dark:from-blue-600 dark:to-blue-500'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-12 text-right">
                      {Math.round(day.score * 100)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
