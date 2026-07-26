import React, { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PublishedPostsSkeleton } from '@/components/skeletons/pages'
import { Eye, ArrowLeft, Video, Image as ImageIcon, Sparkles, CheckCircle2 } from 'lucide-react'
import { useLocation } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { format } from 'date-fns'
import { useSocialAccountsMap } from '@/components/dashboard/scheduled-posts'
import { PostPreviewDialog } from '@/components/dashboard/PostPreviewDialog'

const isVideoUrl = (url: string) => {
  if (!url) return false
  const lowerUrl = url.toLowerCase()
  const urlWithoutQuery = lowerUrl.split('?')[0]
  if (urlWithoutQuery.match(/\.(jpeg|jpg|png|gif|webp)$/i)) return false
  return urlWithoutQuery.match(/\.(mp4|mov|webm|ogg)$/i) || lowerUrl.includes('/video/upload')
}

const getPostMediaUrl = (post: any) => {
  if (!post) return ''
  return post.mediaUrls?.[0] || post.contentData?.mediaUrls?.[0] || 
         post.media?.[0] || post.contentData?.media?.[0] ||
         post.mediaUrl || post.contentData?.mediaUrl || 
         post.thumbnailUrl || post.contentData?.thumbnailUrl || 
         ''
}

const MediaPreview = ({ url }: { url: string }) => {
  const [hasError, setHasError] = React.useState(false)

  if (!url || hasError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400">
        <ImageIcon className="w-8 h-8 opacity-50" />
      </div>
    )
  }

  if (isVideoUrl(url)) {
    return (
      <div className="w-full h-full relative group bg-black">
        <video 
          src={url} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
          muted 
          playsInline 
          onError={() => setHasError(true)}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
          <Video className="w-8 h-8 text-white opacity-90" />
        </div>
      </div>
    )
  }

  return (
    <img 
      src={url} 
      alt="Post media" 
      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
      onError={() => setHasError(true)}
    />
  )
}

export default function PublishedPostsPage() {
  const [, setLocation] = useLocation()
  const { currentWorkspace } = useCurrentWorkspace()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<'all' | 'post' | 'reel' | 'story'>('all')
  const [previewPost, setPreviewPost] = useState<any>(null)
  const limit = 12

  const { data: allContent, isLoading } = useQuery({
    queryKey: ['/api/content/workspace', currentWorkspace?.id, 'all', 'excludeImported'],
    queryFn: () => apiRequest(`/api/content/workspace/${currentWorkspace?.id}?page=1&limit=100&excludeImported=true`), 
    enabled: !!currentWorkspace?.id,
  })

  const accountMap = useSocialAccountsMap(currentWorkspace?.id)
  
  // Local filtering since we don't have a dedicated published endpoint in the backend schema
  const allPosts = allContent?.data || []
  let posts = allPosts.filter((post: any) => 
    post.status === 'published' && 
    !post.isImported && 
    !post.contentData?.media_type // Legacy synced posts have media_type from Instagram API
  )
  
  if (filter !== 'all') {
    posts = posts.filter((post: any) => {
      if (filter === 'reel') return post.type === 'reel' || post.type === 'video'
      if (filter === 'story') return post.type === 'story'
      return post.type === 'post' || post.type === 'image' || (!post.type && !post.contentData?.mediaUrls?.length)
    })
  }

  const totalPages = Math.ceil(posts.length / limit) || 1
  const displayPosts = posts.slice((page - 1) * limit, page * limit)

  return (
    <div className="min-h-full pb-16">
      {/* Premium Header */}
      <div className="relative mb-8 pb-8 border-b border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-50/50 via-teal-50/50 to-transparent dark:from-emerald-900/10 dark:via-teal-900/10 opacity-50 -z-10 blur-3xl"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-2 pt-6">
            <Button variant="ghost" onClick={() => setLocation('/plan')} className="p-2 -ml-2 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
                  Published
                </h1>
                <span className="px-3 py-1 text-xs font-semibold tracking-wide bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-full shadow-sm flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {posts.length} Live
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
            {['All', 'Post', 'Reel', 'Story'].map((type) => (
              <button
                key={type}
                onClick={() => {
                  setFilter(type.toLowerCase() as any)
                  setPage(1)
                }}
                className={`flex-1 px-8 py-3 rounded-full text-sm font-semibold transition-all duration-300 ${
                  filter === type.toLowerCase() 
                    ? 'bg-white/90 dark:bg-gray-800 text-gray-900 dark:text-white shadow-md ring-1 ring-gray-900/5 dark:ring-white/10' 
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-gray-800/50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <PublishedPostsSkeleton />
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
            <div className="w-24 h-24 mb-6 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center ring-8 ring-white dark:ring-gray-900 shadow-xl">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">No History Yet</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-8">
              You haven't published anything through Veefore yet. Start your journey today!
            </p>
            <Button onClick={() => setLocation('/create')} size="lg" className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25 border-0">
              <Sparkles className="w-4 h-4 mr-2" />
              Create First Post
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {displayPosts.map((post: any) => {
                const accountId = post.accountId || post.contentData?.accountId;
              const account = accountId ? accountMap.get(accountId) : null;
                const username = account?.username || null;
                
                return (
                  <div 
                    key={post._id || post.id} 
                    className="group relative flex flex-col bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 shadow-sm hover:shadow-xl dark:hover:shadow-black/40 hover:-translate-y-1 transition-all duration-300 overflow-hidden backdrop-blur-xl"
                  >
                    {/* Media Header */}
                    <div className="relative aspect-[4/5] overflow-hidden bg-gray-100 dark:bg-gray-900 w-full border-b border-gray-100 dark:border-gray-800">
                      <MediaPreview url={getPostMediaUrl(post)} />
                      <div className="absolute top-3 left-3 flex gap-2">
                        <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/90 text-white rounded-md backdrop-blur-md shadow-sm">
                          PUBLISHED
                        </span>
                        <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-white/90 dark:bg-black/70 text-gray-900 dark:text-white rounded-md backdrop-blur-md shadow-sm">
                          {post.type || 'POST'}
                        </span>
                      </div>
                    </div>

                    {/* Content Body */}
                    <div className="p-5 flex flex-col flex-1">
                      <h4 className="font-semibold text-gray-900 dark:text-white text-base leading-tight mb-2 line-clamp-2">
                        {post.title || post.contentData?.text || 'Untitled'}
                      </h4>
                      
                      <div className="mt-auto space-y-3 pt-4">
                        {username && (
                          <div className="flex items-center text-sm font-medium text-blue-600 dark:text-blue-400">
                            @{username}
                          </div>
                        )}
                        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 opacity-70 text-emerald-500" />
                          {post.publishedAt ? format(new Date(post.publishedAt), 'MMM d, yyyy h:mm a') : (post.updatedAt ? format(new Date(post.updatedAt), 'MMM d, yyyy h:mm a') : 'Unknown')}
                        </div>
                      </div>
                    </div>

                    {/* Action Dock */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
                      <Button variant="outline" size="sm" onClick={() => setLocation(`/analytics/post/${post._id || post.id}`)} className="flex-1 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                        View Analytics
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setPreviewPost(post)} className="px-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700" title="View Post">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-12 flex justify-center">
                <div className="inline-flex items-center space-x-2 bg-white dark:bg-gray-800/80 p-2 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm backdrop-blur-xl">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="rounded-xl px-4 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Previous
                  </Button>
                  <div className="px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                    <span className="text-gray-900 dark:text-white">{page}</span> / {totalPages}
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    disabled={page === totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="rounded-xl px-4 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {previewPost && (
        <PostPreviewDialog
          post={previewPost}
          account={previewPost.contentData?.accountId ? accountMap.get(previewPost.contentData.accountId) : null}
          isOpen={!!previewPost}
          onClose={() => setPreviewPost(null)}
        />
      )}
    </div>
  )
}
