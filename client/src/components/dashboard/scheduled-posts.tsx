import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, Eye, Image as ImageIcon, Trash2, Video, RotateCcw, Layers, CircleDot } from 'lucide-react'
import { cn } from '@/lib/utils'
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

export const isVideoUrl = (url: string) => {
  if (!url) return false
  const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg']
  const cleanUrl = url.split('?')[0].toLowerCase()
  return videoExtensions.some(ext => cleanUrl.endsWith(ext)) || url.includes('/video/')
}

export const getPostMediaUrl = (post: any) => {
  if (!post) return ''
  const cd = post.contentData || {}
  const firstOf = (v: any) => (Array.isArray(v) && v.length > 0 ? v[0] : null)

  return (
    firstOf(post.mediaUrls) || firstOf(cd.mediaUrls) ||
    firstOf(post.media) || firstOf(cd.media) ||
    post.thumbnailUrl || cd.thumbnailUrl ||
    post.mediaUrl || cd.mediaUrl ||
    post.thumbnail || cd.thumbnail ||
    post.imageUrl || cd.imageUrl ||
    // snake_case variants used by some published/imported records
    post.thumbnail_url || cd.thumbnail_url ||
    post.media_url || cd.media_url ||
    post.image_url || cd.image_url ||
    ''
  )
}

// ── Post type (Post / Reel / Story / Carousel) ─────────────────────────────

export type PostKind = 'post' | 'reel' | 'story' | 'carousel'

/** Normalize a post's media type into one of the four Instagram kinds. */
export const getPostKind = (post: any): PostKind => {
  const t = String(post?.type || post?.contentData?.type || post?.mediaType || 'post').toLowerCase()
  if (t === 'reel' || t === 'reels' || t === 'video') return 'reel'
  if (t === 'story' || t === 'stories') return 'story'
  if (t === 'carousel' || t === 'album') return 'carousel'
  return 'post'
}

/** Human label for a post's kind. */
export const getPostTypeLabel = (post: any): string => {
  const kind = getPostKind(post)
  return kind === 'reel' ? 'Reel' : kind === 'story' ? 'Story' : kind === 'carousel' ? 'Carousel' : 'Post'
}

// Titles auto-generated at create time when there's no caption (e.g. Stories,
// which don't support captions). We never want to surface these to the user.
const GENERIC_TITLES = new Set(['', 'new post', 'new draft', 'untitled', 'untitled post', 'untitled draft'])

/**
 * Best display title for a post card. Prefers the real caption text; when a
 * post has no meaningful caption (Stories, or an empty draft) it falls back to
 * a type-based label like "Instagram Story" instead of the stored "New Post".
 */
export const getPostDisplayTitle = (post: any): string => {
  const cd = post?.contentData || {}
  const raw = String(cd.text || cd.caption || post?.title || post?.description || '').trim()
  if (raw && !GENERIC_TITLES.has(raw.toLowerCase())) return raw
  return `Instagram ${getPostTypeLabel(post)}`
}

const POST_KIND_STYLE: Record<PostKind, { label: string; Icon: any; cls: string }> = {
  post:     { label: 'Post',     Icon: ImageIcon, cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  reel:     { label: 'Reel',     Icon: Video,     cls: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  story:    { label: 'Story',    Icon: CircleDot, cls: 'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' },
  carousel: { label: 'Carousel', Icon: Layers,    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
}

/** Small pill showing the media type (Post / Reel / Story / Carousel). */
export const PostTypeBadge = ({ post, className }: { post: any; className?: string }) => {
  const kind = getPostKind(post)
  const { label, Icon, cls } = POST_KIND_STYLE[kind]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', cls, className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

// Instagram / Facebook CDN hosts hand out short-lived signed URLs that expire
// and then 403 for everyone. When a post's media points at one of these, we
// route it through our server proxy which serves a permanent cached copy (and
// transparently re-fetches a fresh URL from the Graph API when needed).
const META_CDN_RE = /cdninstagram|fbcdn|lookaside|fbsbx|scontent/i

/** The proxy URL that serves a durable, self-healing copy of a post's media. */
export const getPostProxyMediaUrl = (post: any): string | null => {
  const id = post?._id || post?.id
  return id ? `/api/image-proxy/post-media?contentId=${id}` : null
}

/**
 * Resilient media thumbnail for a post. Renders image or video, routes expiring
 * Meta CDN URLs through the durable caching proxy, and self-heals: if the
 * direct URL fails to load it retries via the proxy before showing a placeholder.
 */
export const PostMedia = ({ post }: { post: any }) => {
  const raw = getPostMediaUrl(post)
  const proxyUrl = getPostProxyMediaUrl(post)
  const kind = getPostKind(post)
  const rawIsVideo = !!raw && isVideoUrl(raw)
  // Instagram media id present ⇒ this is a synced/published post whose stored
  // URL (if any) is an expiring Meta CDN link — serve it through the proxy.
  const hasIgMediaId = !!post?.contentData?.id
  const startOnProxy = !!(proxyUrl && ((raw && META_CDN_RE.test(raw)) || (!raw && hasIgMediaId)))
  // Meta CDN media (and video posters) are served as images by the proxy.
  const initialSrc = startOnProxy ? proxyUrl! : raw

  const [src, setSrc] = React.useState<string>(initialSrc)
  const [failed, setFailed] = React.useState(false)
  const usedProxy = React.useRef<boolean>(startOnProxy)

  React.useEffect(() => {
    setSrc(initialSrc)
    setFailed(false)
    usedProxy.current = startOnProxy
  }, [initialSrc, startOnProxy])

  const Placeholder = (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
      <ImageIcon className="w-6 h-6 text-gray-400" />
    </div>
  )

  if (!src || failed) return Placeholder

  const overlay = (
    <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
      <Video className="w-6 h-6 text-white" />
    </div>
  )

  // Direct (our own) video URLs render as <video>; proxied media is always an image.
  if (rawIsVideo && src === raw) {
    return (
      <div className="w-full h-full relative bg-gray-100 dark:bg-gray-800">
        <video src={src} className="w-full h-full object-cover" muted playsInline
          onError={() => {
            if (proxyUrl && !usedProxy.current) { usedProxy.current = true; setSrc(proxyUrl) }
            else setFailed(true)
          }}
        />
        {overlay}
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover"
        onError={() => {
          if (proxyUrl && !usedProxy.current) { usedProxy.current = true; setSrc(proxyUrl) }
          else setFailed(true)
        }}
      />
      {kind === 'reel' && overlay}
    </div>
  )
}

export const MediaPreview = ({ url }: { url: string | null }) => {
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