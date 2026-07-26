import React, { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, ImageIcon, Video, ChevronDown, ChevronUp, Clock, AlertCircle } from 'lucide-react'
import { useLocation } from 'wouter'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { format, isToday, isTomorrow, isThisWeek } from 'date-fns'
import { useToast } from '@/hooks/use-toast'

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatScheduledTime(dateStr: string): string {
  const d = new Date(dateStr)
  if (isToday(d)) return `Today at ${format(d, 'h:mm a')}`
  if (isTomorrow(d)) return `Tomorrow at ${format(d, 'h:mm a')}`
  if (isThisWeek(d)) return format(d, "EEEE 'at' h:mm a")
  return format(d, "MMM d 'at' h:mm a")
}

function statusBadge(status: string) {
  if (status === 'failed') return <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Failed</Badge>
  if (status === 'queued') return <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Queued</Badge>
  return <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Scheduled</Badge>
}

function typeIcon(type: string) {
  if (['reel', 'video'].includes(type)) return <Video className="w-3 h-3" />
  return <ImageIcon className="w-3 h-3" />
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function PostRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <Skeleton className="w-11 h-11 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-6 w-14 rounded-md" />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const PREVIEW_COUNT = 5 // How many posts to show without expanding

export function ScheduledPostsSection() {
  const [, setLocation] = useLocation()
  const { currentWorkspace } = useCurrentWorkspace()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const { data: resp, isLoading } = useQuery({
    queryKey: ['/api/v1/content/workspace/scheduled', currentWorkspace?.id],
    queryFn: () => apiRequest(`/api/v1/content/workspace/${currentWorkspace?.id}/scheduled`),
    enabled: !!currentWorkspace?.id,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  const handleCancel = async (id: string) => {
    try {
      await apiRequest(`/api/v1/content/${id}/cancel-schedule`, { method: 'POST' })
      toast({ title: 'Schedule cancelled' })
      queryClient.invalidateQueries({ queryKey: ['/api/v1/content/workspace/scheduled', currentWorkspace?.id] })
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' })
    }
  }

  // Real data from API; fall back to mock when no workspace or API returns empty
  const apiPosts: any[] = resp?.data ?? []
  const posts = apiPosts

  const visiblePosts = expanded ? posts : posts.slice(0, PREVIEW_COUNT)
  const hiddenCount = posts.length - PREVIEW_COUNT

  return (
    <Card data-testid="scheduled-posts" className="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Scheduled posts
              {posts.length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">({posts.length})</span>
              )}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Created in VeeFore</p>
          </div>
          <Button
            variant="outline" size="sm"
            className="text-xs text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:text-blue-600"
            onClick={() => setLocation('/posts/scheduled')}
          >
            View all
          </Button>
        </div>

        {/* Loading */}
        {isLoading ? (
          <div className="space-y-0">
            {[1, 2, 3].map(i => <PostRowSkeleton key={i} />)}
          </div>
        ) : posts.length === 0 ? (
          /* Empty state */
          <div className="text-center py-10">
            <Calendar className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">No scheduled posts</p>
            <Button
              size="sm"
              onClick={() => setLocation('/create')}
              className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-700 text-white"
            >
              Create a post
            </Button>
          </div>
        ) : (
          /* Post list */
          <div>
            <div className={`divide-y divide-gray-100 dark:divide-gray-700/50 ${expanded ? 'max-h-[480px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700' : ''}`}>
              {visiblePosts.map((post: any) => {
                const id = post._id || post.id
                const title = post.title || post.contentData?.text || 'Untitled'
                const isFailed = post.status === 'failed'

                return (
                  <div key={id} className="flex items-start gap-3 py-3">
                    {/* Thumbnail / type icon */}
                    <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 flex items-center justify-center flex-shrink-0 border border-blue-100 dark:border-blue-900/30">
                      {isFailed
                        ? <AlertCircle className="w-5 h-5 text-red-400" />
                        : <span className="text-blue-500 dark:text-blue-400">{typeIcon(post.type || 'image')}</span>
                      }
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate leading-tight">{title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {statusBadge(post.status)}
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {post.scheduledAt ? formatScheduledTime(post.scheduledAt) : 'Unscheduled'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isFailed ? (
                        <Button variant="outline" size="sm" className="h-7 text-xs px-2.5 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => setLocation(`/create?editId=${id}`)}>
                          Re-upload
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 text-xs px-2.5 text-gray-500 hover:text-gray-700"
                          onClick={() => setLocation(`/create?editId=${id}`)}>
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Show more / less */}
            {hiddenCount > 0 && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="w-full mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                {expanded ? (
                  <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                ) : (
                  <><ChevronDown className="w-3.5 h-3.5" /> {hiddenCount} more post{hiddenCount !== 1 ? 's' : ''}</>
                )}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
