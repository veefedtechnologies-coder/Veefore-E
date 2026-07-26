import React, { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PenLine, ImageIcon, Video, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { useLocation } from 'wouter'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { formatDistanceToNow } from 'date-fns'
import { useToast } from '@/hooks/use-toast'
import useSubscription from '@/hooks/useSubscription'

// ── Helpers ──────────────────────────────────────────────────────────────────
function typeIcon(type: string) {
  if (['reel', 'video'].includes(type)) return <Video className="w-4 h-4" />
  return <ImageIcon className="w-4 h-4" />
}

function typeLabel(type: string): string {
  if (type === 'reel') return 'Reel'
  if (type === 'carousel') return 'Carousel'
  if (type === 'video') return 'Video'
  return 'Post'
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function DraftRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <Skeleton className="w-11 h-11 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-6 w-10 rounded-md" />
        <Skeleton className="h-6 w-14 rounded-md" />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const PREVIEW_COUNT = 5

export function DraftsSection() {
  const [, setLocation] = useLocation()
  const { currentWorkspace } = useCurrentWorkspace()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const { limits } = useSubscription()
  // Drafts are a Creator+ feature — hide this whole section (and skip its fetch)
  // on plans that don't include it.
  const canUseDrafts = limits?.features?.draftPosts === true

  const { data: resp, isLoading } = useQuery({
    queryKey: ['/api/v1/content/workspace/drafts', currentWorkspace?.id],
    queryFn: () => apiRequest(`/api/v1/content/workspace/${currentWorkspace?.id}/drafts?limit=50`),
    enabled: !!currentWorkspace?.id && canUseDrafts,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  if (!canUseDrafts) return null

  const handlePublish = async (id: string) => {
    try {
      await apiRequest(`/api/v1/content/${id}/publish`, { method: 'POST' })
      toast({ title: 'Published successfully' })
      queryClient.invalidateQueries({ queryKey: ['/api/v1/content/workspace/drafts', currentWorkspace?.id] })
    } catch (e: any) {
      toast({ title: 'Publish failed', description: e.message, variant: 'destructive' })
    }
  }

  const apiDrafts: any[] = resp?.data ?? []
  const posts = apiDrafts

  const visiblePosts = expanded ? posts : posts.slice(0, PREVIEW_COUNT)
  const hiddenCount = posts.length - PREVIEW_COUNT

  return (
    <Card className="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Drafts
              {posts.length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">({posts.length})</span>
              )}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Created in VeeFore</p>
          </div>
          <Button
            variant="outline" size="sm"
            className="text-xs text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:text-purple-600"
            onClick={() => setLocation('/posts/drafts')}
          >
            View all drafts
          </Button>
        </div>

        {/* Loading */}
        {isLoading ? (
          <div className="space-y-0">
            {[1, 2, 3].map(i => <DraftRowSkeleton key={i} />)}
          </div>
        ) : posts.length === 0 ? (
          /* Empty state */
          <div className="text-center py-8">
            <PenLine className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Start drafting content to edit and publish whenever you'd like.
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setLocation('/create')}>
                Create a draft
              </Button>
              <Button size="sm" onClick={() => setLocation('/create')}
                className="bg-blue-600 hover:bg-blue-700 text-white">
                Draft post with AI
              </Button>
            </div>
          </div>
        ) : (
          /* Draft list */
          <div>
            <div className={`divide-y divide-gray-100 dark:divide-gray-700/50 ${expanded ? 'max-h-[480px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700' : ''}`}>
              {visiblePosts.map((post: any) => {
                const id = post._id || post.id
                const title = post.title || post.contentData?.text || 'Untitled Draft'
                const updatedAt = post.updatedAt
                  ? formatDistanceToNow(new Date(post.updatedAt), { addSuffix: true })
                  : null

                return (
                  <div key={id} className="flex items-start gap-3 py-3">
                    {/* Thumbnail / type icon */}
                    <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-900/20 dark:to-orange-900/20 flex items-center justify-center flex-shrink-0 border border-amber-100 dark:border-amber-900/30">
                      <span className="text-amber-500 dark:text-amber-400">{typeIcon(post.type || 'image')}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate leading-tight">{title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                          {typeLabel(post.type || 'image')}
                        </span>
                        {updatedAt && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {updatedAt}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 text-xs px-2.5 text-gray-500 hover:text-gray-700"
                        onClick={() => setLocation(`/create?editId=${id}`)}>
                        Edit
                      </Button>
                      <Button size="sm" className="h-7 text-xs px-2.5 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handlePublish(id)}>
                        Publish
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Show more / less */}
            {hiddenCount > 0 && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="w-full mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 py-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
              >
                {expanded ? (
                  <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                ) : (
                  <><ChevronDown className="w-3.5 h-3.5" /> {hiddenCount} more draft{hiddenCount !== 1 ? 's' : ''}</>
                )}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
