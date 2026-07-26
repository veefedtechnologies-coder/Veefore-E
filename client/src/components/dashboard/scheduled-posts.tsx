import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, Eye, Image as ImageIcon, Trash2, Video, RotateCcw } from 'lucide-react'
import { useLocation } from 'wouter'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { format } from 'date-fns'
import { useToast } from '@/hooks/use-toast'
import { PostPreviewDialog } from './PostPreviewDialog'
import useSubscription from '@/hooks/useSubscription'

export const useSocialAccountsMap = (workspaceId: string | undefined) => {
  const { data: accounts } = useQuery({
    queryKey: ['/api/social/workspace', workspaceId],
    queryFn: () => apiRequest(`/api/social/workspace/${workspaceId}`),
    enabled: !!workspaceId,
  })

  return React.useMemo(() => {
    const map = new Map<string, any>()
    // The endpoint may return a bare array OR a { success, data: [...] } envelope.
    // Normalize before iterating so a non-array response can't crash the page
    // (TypeError: forEach is not a function).
    const list = Array.isArray(accounts)
      ? accounts
      : (Array.isArray((accounts as any)?.data) ? (accounts as any).data : [])
    list.forEach((acc: any) => {
      map.set(acc.id, acc)
      if (acc._id) map.set(acc._id, acc)
    })
    return map
  }, [accounts])
}

const isVideoUrl = (url: string) => {
  if (!url) return false
  const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg']
  const cleanUrl = url.split('?')[0].toLowerCase()
  return videoExtensions.some(ext => cleanUrl.endsWith(ext)) || url.includes('/video/')
}

const getPostMediaUrl = (post: any) => {
  if (!post) return ''
  const urls = post.mediaUrls || post.contentData?.mediaUrls
  if (urls && urls.length > 0) return urls[0]
  
  const media = post.media || post.contentData?.media
  if (media && media.length > 0) return media[0]
  
  return post.thumbnailUrl || post.contentData?.thumbnailUrl || 
         post.mediaUrl || post.contentData?.mediaUrl || ''
}

const MediaPreview = ({ url }: { url: string | null }) => {
  if (!url) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <ImageIcon className="w-6 h-6 text-gray-400" />
      </div>
    )
  }

  if (isVideoUrl(url)) {
    return (
      <div className="w-full h-full relative bg-gray-100 dark:bg-gray-800">
        <video 
          src={url} 
          className="w-full h-full object-cover"
          muted 
          playsInline
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Video className="w-6 h-6 text-white" />
        </div>
      </div>
    )
  }

  return (
    <>
      <img 
        src={url} 
        alt="Media preview" 
        className="w-full h-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
          if (e.currentTarget.nextElementSibling) {
            (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex'
          }
        }}
      />
      <div className="hidden w-full h-full items-center justify-center bg-gray-100 dark:bg-gray-800">
        <ImageIcon className="w-6 h-6 text-gray-400" />
      </div>
    </>
  )
}

function ScheduledPostItemSkeleton() {
  return (
    <div className="flex items-center space-x-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
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
  )
}

export function ScheduledPostsSkeleton() {
  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-36 rounded-lg" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3].map((i) => (
          <ScheduledPostItemSkeleton key={i} />
        ))}
      </CardContent>
    </Card>
  )
}

interface ScheduledPostsProps {
  isLoading?: boolean
}

export function ScheduledPosts({ isLoading: externalIsLoading }: ScheduledPostsProps = {}) {
  const [, setLocation] = useLocation()
  const { currentWorkspace } = useCurrentWorkspace()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: scheduledPosts, isLoading: isFetching } = useQuery({
    queryKey: ['/api/content/workspace', currentWorkspace?.id, 'scheduled'],
    queryFn: () => apiRequest(`/api/content/workspace/${currentWorkspace?.id}/scheduled?limit=5`),
    enabled: !!currentWorkspace?.id,
  })

  const accountMap = useSocialAccountsMap(currentWorkspace?.id);
  const isLoading = externalIsLoading || isFetching;
  const posts = scheduledPosts?.data || []
  const displayPosts = posts.slice(0, 2);
  const remainingCount = Math.max(0, posts.length - 2);

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/api/content/${id}`, { method: 'DELETE' })
      toast({ title: 'Post deleted' })
      queryClient.invalidateQueries({ queryKey: ['/api/content/workspace', currentWorkspace?.id] })
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' })
    }
  }

  const handleCancelSchedule = async (id: string) => {
    try {
      await apiRequest(`/api/content/${id}/cancel-schedule`, { method: 'POST' })
      toast({ title: 'Schedule canceled' })
      queryClient.invalidateQueries({ queryKey: ['/api/content/workspace', currentWorkspace?.id] })
    } catch (error: any) {
      toast({ title: 'Action failed', description: error.message, variant: 'destructive' })
    }
  }
  
  if (isLoading) {
    return <ScheduledPostsSkeleton />
  }
  
  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">Scheduled posts</CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Created in VeeFore</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation('/posts/scheduled')}>
          <Eye className="w-4 h-4 mr-2" />
          View all scheduled
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {posts.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">No scheduled posts</p>
            <Button 
              onClick={() => setLocation('/create')}
              className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-700"
            >
              Create a post
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {displayPosts.map((post: any) => {
              const accountId = post.accountId || post.contentData?.accountId;
              const account = accountId ? accountMap.get(accountId) : null;
              const username = account?.username || null;
              const isFailed = post.status === 'failed';
              
              return (
                <div key={post._id || post.id} className="flex flex-col space-y-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className="flex items-start space-x-3 min-w-0">
                    <div className="w-16 h-16 rounded-lg bg-gray-200 dark:bg-gray-600 overflow-hidden flex-shrink-0 relative">
                      <MediaPreview url={getPostMediaUrl(post)} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{post.title || post.contentData?.text || 'Untitled'}</h4>
                      <div className="flex flex-col">
                        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="capitalize">{post.type || 'Post'}</span>
                          <span>•</span>
                          {username && (
                            <>
                              <span className="font-medium truncate max-w-[80px]">@{username}</span>
                              <span>•</span>
                            </>
                          )}
                          <span className="truncate">
                            {post.scheduledAt ? format(new Date(post.scheduledAt), 'MMM d, yyyy h:mm a') : 'Unscheduled'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {isFailed ? (
                    <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                      <Button variant="default" size="sm" onClick={() => setLocation(`/create?editId=${post._id || post.id}`)}>
                        Re-upload
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(post._id || post.id)} className="text-red-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : post.status === 'queued' ? (
                    <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                      <Button variant="outline" size="sm" onClick={() => handleCancelSchedule(post._id || post.id)} className="text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20">
                        Cancel
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setLocation(`/create?editId=${post._id || post.id}`)}>
                        Reschedule
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setLocation(`/create?editId=${post._id || post.id}`)}>
                        Edit
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                      <Button variant="outline" size="sm" onClick={() => setLocation(`/create?editId=${post._id || post.id}`)}>
                        Edit
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
            
            {remainingCount > 0 && (
               <div className="text-center pt-2 pb-1">
                 <p className="text-sm text-gray-500 dark:text-gray-400">
                   {remainingCount} post{remainingCount !== 1 ? 's' : ''} more
                 </p>
               </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function DraftsSkeleton() {
  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-28 rounded-lg" />
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  )
}

interface DraftsProps {
  isLoading?: boolean
}

export function Drafts({ isLoading: externalIsLoading }: DraftsProps = {}) {
  const [, setLocation] = useLocation()
  const { currentWorkspace } = useCurrentWorkspace()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { limits } = useSubscription()
  // Drafts are a Creator+ feature — hide entirely (and skip the fetch) for Free.
  const canUseDrafts = limits?.features?.draftPosts === true

  const { data: drafts, isLoading: isFetching } = useQuery({
    queryKey: ['/api/content/workspace', currentWorkspace?.id, 'drafts'],
    queryFn: () => apiRequest(`/api/content/workspace/${currentWorkspace?.id}/drafts`),
    enabled: !!currentWorkspace?.id && canUseDrafts,
  })

  const accountMap = useSocialAccountsMap(currentWorkspace?.id);
  const isLoading = externalIsLoading || isFetching;
  const posts = drafts?.data || []
  const displayPosts = posts.slice(0, 2);
  const remainingCount = Math.max(0, posts.length - 2);

  const handlePublish = async (id: string) => {
    try {
      await apiRequest(`/api/content/${id}/publish`, { method: 'POST' })
      toast({ title: 'Published successfully' })
      queryClient.invalidateQueries({ queryKey: ['/api/content/workspace', currentWorkspace?.id] })
      // Refresh the best-time recommendation immediately instead of waiting out its
      // staleTime. Predicate covers both the analytics hook's key and the calendar's key.
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/v1/analytics/best-time')
      })
    } catch (error: any) {
      toast({ title: 'Publish failed', description: error.message, variant: 'destructive' })
    }
  }

  if (!canUseDrafts) return null

  if (isLoading) {
    return <DraftsSkeleton />
  }

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">Drafts</CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Created in VeeFore</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation('/posts/drafts')}>
          View all drafts
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {posts.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Start drafting content to edit and publish whenever you'd like.
            </p>
            <div className="flex justify-center space-x-3">
              <Button 
                variant="outline"
                onClick={() => setLocation('/create')}
              >
                Create a draft
              </Button>
              <Button 
                onClick={() => setLocation('/create')}
                className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                Draft post with AI
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {displayPosts.map((post: any) => {
              const account = post.contentData?.accountId ? accountMap.get(post.contentData.accountId) : null;
              const username = account?.username || null;
              
              return (
                <div key={post._id || post.id} className="flex flex-col space-y-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className="flex items-start space-x-3 min-w-0">
                    <div className="w-16 h-16 rounded-lg bg-gray-200 dark:bg-gray-600 overflow-hidden flex-shrink-0 relative">
                      <MediaPreview url={getPostMediaUrl(post)} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{post.title || post.contentData?.text || 'Untitled Draft'}</h4>
                      <div className="flex flex-col">
                        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="capitalize">{post.type || 'Post'}</span>
                          <span>•</span>
                          {username && (
                             <>
                               <span className="font-medium truncate max-w-[80px]">@{username}</span>
                               <span>•</span>
                             </>
                          )}
                          <span className="truncate">Last updated: {post.updatedAt ? format(new Date(post.updatedAt), 'MMM d, yyyy h:mm a') : 'Unknown'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <Button variant="outline" size="sm" onClick={() => setLocation(`/create?editId=${post._id || post.id}`)}>
                      Edit
                    </Button>
                    <Button variant="default" size="sm" onClick={() => handlePublish(post._id || post.id)} className="bg-green-600 hover:bg-green-700 text-white">
                      Publish immediately
                    </Button>
                  </div>
                </div>
              )
            })}
            
            {remainingCount > 0 && (
               <div className="text-center pt-2 pb-1">
                 <p className="text-sm text-gray-500 dark:text-gray-400">
                   {remainingCount} post{remainingCount !== 1 ? 's' : ''} more
                 </p>
               </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function PublishedPostsSkeleton() {
  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-36 rounded-lg" />
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  )
}

interface PublishedPostsProps {
  isLoading?: boolean
}

export function PublishedPosts({ isLoading: externalIsLoading }: PublishedPostsProps = {}) {
  const [, setLocation] = useLocation()
  const { currentWorkspace } = useCurrentWorkspace()
  const [previewPost, setPreviewPost] = React.useState<any>(null)

  const { data: allContent, isLoading: isFetching } = useQuery({
    queryKey: ['/api/content/workspace', currentWorkspace?.id, 'excludeImported'],
    queryFn: () => apiRequest(`/api/content/workspace/${currentWorkspace?.id}?page=1&limit=50&excludeImported=true`),
    enabled: !!currentWorkspace?.id,
  })

  const accountMap = useSocialAccountsMap(currentWorkspace?.id);
  const isLoading = externalIsLoading || isFetching;
  const posts = (allContent?.data || []).filter((post: any) => 
    post.status === 'published' && 
    !post.isImported && 
    !post.contentData?.media_type
  )
  const displayPosts = posts.slice(0, 2);
  const remainingCount = Math.max(0, posts.length - 2);

  if (isLoading) {
    return <PublishedPostsSkeleton />
  }
  
  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">Published posts</CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Created in VeeFore</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation('/posts/published')}>
          <Eye className="w-4 h-4 mr-2" />
          View all published
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {posts.length === 0 ? (
          <div className="text-center py-12">
            <Eye className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">No published posts yet</p>
            <Button 
              onClick={() => setLocation('/create')}
              className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-700"
            >
              Create a post
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {displayPosts.map((post: any) => {
              const accountId = post.accountId || post.contentData?.accountId;
              const account = accountId ? accountMap.get(accountId) : null;
              const username = account?.username || null;
              
              return (
                <div key={post._id || post.id} className="flex flex-col space-y-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className="flex items-start space-x-3 min-w-0">
                    <div className="w-16 h-16 rounded-lg bg-gray-200 dark:bg-gray-600 overflow-hidden flex-shrink-0 relative">
                      <MediaPreview url={getPostMediaUrl(post)} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{post.title || post.contentData?.text || 'Untitled Post'}</h4>
                      <div className="flex flex-col">
                        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="capitalize">{post.type || 'Post'}</span>
                          <span>•</span>
                          {username && (
                             <>
                               <span className="font-medium truncate max-w-[80px]">@{username}</span>
                               <span>•</span>
                             </>
                          )}
                          <span className="truncate">{post.publishedAt ? format(new Date(post.publishedAt), 'MMM d, yyyy h:mm a') : 'Unknown'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <Button variant="outline" size="sm" onClick={() => setLocation('/analytics')}>
                      View Analytics
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPreviewPost(post)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
            
            {remainingCount > 0 && (
               <div className="text-center pt-2 pb-1">
                 <p className="text-sm text-gray-500 dark:text-gray-400">
                   {remainingCount} post{remainingCount !== 1 ? 's' : ''} more
                 </p>
               </div>
            )}
          </div>
        )}
      </CardContent>
      {previewPost && (
        <PostPreviewDialog
          post={previewPost}
          account={previewPost.contentData?.accountId ? accountMap.get(previewPost.contentData.accountId) : null}
          isOpen={!!previewPost}
          onClose={() => setPreviewPost(null)}
        />
      )}
    </Card>
  )
}