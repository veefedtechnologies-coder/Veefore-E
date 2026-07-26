import React, { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { MoreHorizontal, ChevronLeft, ChevronRight, Heart, MessageCircle, Send, Bookmark, Film, CircleDashed, X, Image as ImageIcon } from 'lucide-react'

interface PostPreviewDialogProps {
  post: any
  account: any
  isOpen: boolean
  onClose: () => void
}

export function PostPreviewDialog({ post, account, isOpen, onClose }: PostPreviewDialogProps) {
  const [currentSlide, setCurrentSlide] = useState(0)

  if (!post) return null

  const rawType = (post.type || 'post').toLowerCase()
  const postType = ['story', 'reel'].includes(rawType) ? rawType : 'post'
  const postContent = post.contentData?.text || post.title || ''
  const mediaPreview = post.contentData?.mediaUrls?.length > 0 ? post.contentData.mediaUrls :
                       post.contentData?.media?.length > 0 ? post.contentData.media :
                       (post.contentData?.thumbnailUrl ? [post.contentData.thumbnailUrl] :
                       (post.contentData?.mediaUrl ? [post.contentData.mediaUrl] : []));
  const mediaFiles = mediaPreview.map((url: string) => ({ type: url.match(/\.(mp4|mov|webm|ogg)$/i) || url.includes('/video/upload') || url.includes('/video/') ? 'video/mp4' : 'image/jpeg' }))
  const hashtags = post.contentData?.hashtags || []
  const mentions = post.contentData?.mentions || []
  
  const selectedAccountData = {
    // Priority: snapshotted values in contentData (set at publish time) > account from DB
    username: post.contentData?.username || account?.username || account?.name || 'username',
    profilePictureUrl: post.contentData?.profilePictureUrl || account?.profilePictureUrl || account?.profileImageUrl || account?.profile_picture_url || null
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="max-w-[400px] p-0 bg-transparent border-none shadow-none overflow-visible focus:outline-none focus-visible:outline-none sm:focus:outline-none [&>button]:hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
        style={{ outline: 'none' }}
      >
        <div className="relative mx-auto w-[360px] h-[740px] bg-black rounded-[3.5rem] border-[12px] border-[#18181B] dark:border-[#111] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,1)] ring-1 ring-gray-200 dark:ring-white/5 overflow-hidden focus:outline-none">
              
          {/* Dynamic Island */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-50 flex items-center justify-between px-2 shadow-inner">
            <div className="w-2.5 h-2.5 bg-[#111] rounded-full ring-1 ring-white/10"></div>
            <div className="w-2.5 h-2.5 bg-green-500/20 rounded-full flex items-center justify-center">
              {/* skeleton-guard-allow: status-dot — decorative device "live" status indicator in phone mockup, not a loading placeholder */}
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
            </div>
          </div>

          {/* iOS Status Bar Mock */}
          <div className="absolute top-0 inset-x-0 h-12 flex items-center justify-between px-6 z-40 text-white text-[11px] font-medium pt-2">
            <span>9:41</span>
            <div className="flex gap-1.5 items-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M2 22h20V2L2 22zm18-2H6.83L20 6.83V20z"/></svg>
              <div className="w-5 h-3 border border-white/80 rounded-[3px] p-[1px] relative">
                <div className="bg-white w-full h-full rounded-[1px]"></div>
                <div className="absolute -right-1 top-1 w-[2px] h-1 bg-white/80 rounded-r-[1px]"></div>
              </div>
            </div>
          </div>

          <div className="w-full h-full bg-white dark:bg-black pt-12 flex flex-col font-sans">
            
            {postType === 'post' && (
              <>
                {/* IG Top Navigation */}
                <div className="px-4 pb-2 pt-1 flex justify-center items-center border-b border-gray-100 dark:border-[#222]">
                  <span className="text-[22px] font-bold text-gray-900 dark:text-white" style={{fontFamily: 'Billabong, cursive, serif'}}>Instagram</span>
                </div>

                {/* The Post Wrapper */}
                <div className="flex-1 overflow-y-auto pb-20 no-scrollbar">
                  {/* Post Header */}
                  <div className="flex justify-between items-center px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-fuchsia-600 p-[2px]">
                        <div className="w-full h-full rounded-full bg-white dark:bg-black flex items-center justify-center overflow-hidden border border-white dark:border-black">
                          {selectedAccountData.profilePictureUrl ? (
                            <img src={selectedAccountData.profilePictureUrl} alt={selectedAccountData.username} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold dark:text-white">{selectedAccountData.username.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight">
                          {selectedAccountData.username}
                        </span>
                      </div>
                    </div>
                    <MoreHorizontal className="w-5 h-5 text-gray-900 dark:text-white" />
                  </div>

                  {/* Post Media Area */}
                  <div className="w-full aspect-[4/5] bg-gray-100 dark:bg-[#111] relative overflow-hidden flex items-center justify-center group/preview">
                    {mediaPreview.length > 0 ? (
                      <>
                        <div 
                          className="w-full h-full flex transition-transform duration-300 ease-in-out" 
                          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                        >
                          {mediaPreview.map((preview: string, idx: number) => (
                            <div key={idx} className="w-full h-full flex-shrink-0">
                              {mediaFiles[idx]?.type.startsWith('video/') ? (
                                <video src={preview} className="w-full h-full object-contain bg-black" autoPlay loop muted playsInline />
                              ) : (
                                <img src={preview} alt={`Post media ${idx + 1}`} className="w-full h-full object-contain bg-black" />
                              )}
                            </div>
                          ))}
                        </div>
                        
                        {mediaPreview.length > 1 && (
                          <>
                            {currentSlide > 0 && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setCurrentSlide(s => s - 1); }}
                                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity backdrop-blur-sm z-10"
                              >
                                <ChevronLeft className="w-5 h-5" />
                              </button>
                            )}
                            {currentSlide < mediaPreview.length - 1 && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setCurrentSlide(s => s + 1); }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity backdrop-blur-sm z-10"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </button>
                            )}
                            
                            <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md rounded-full px-2 py-0.5 text-white text-[10px] font-medium z-10">
                              {currentSlide + 1}/{mediaPreview.length}
                            </div>
                            
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
                              {mediaPreview.map((_: any, idx: number) => (
                                <div 
                                  key={idx} 
                                  className={`w-1.5 h-1.5 rounded-full transition-colors ${currentSlide === idx ? 'bg-blue-500' : 'bg-white/50'}`}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                        <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
                        <span className="text-xs font-medium">Media Preview</span>
                      </div>
                    )}
                  </div>

                  {/* Post Actions & Caption */}
                  <div className="px-3 pt-3 pb-4">
                    <div className="flex justify-between items-center mb-2.5">
                      <div className="flex gap-4">
                        <Heart className="w-[22px] h-[22px] text-gray-900 dark:text-white" strokeWidth={1.5} />
                        <MessageCircle className="w-[22px] h-[22px] text-gray-900 dark:text-white" strokeWidth={1.5} />
                        <Send className="w-[22px] h-[22px] text-gray-900 dark:text-white" strokeWidth={1.5} />
                      </div>
                      <Bookmark className="w-[22px] h-[22px] text-gray-900 dark:text-white" strokeWidth={1.5} />
                    </div>
                    
                    <div className="text-[13px] font-semibold text-gray-900 dark:text-white mb-1">
                      {Math.floor(Math.random() * 800) + 200} likes
                    </div>
                    
                    <div className="text-[13px] text-gray-900 dark:text-white leading-tight">
                      <span className="font-semibold mr-1.5">{selectedAccountData.username}</span>
                      {postContent ? postContent : <span className="text-gray-400">Your caption preview will appear here...</span>}
                      
                      {(hashtags.length > 0 || mentions.length > 0) && (
                        <div className="mt-1 text-blue-900 dark:text-blue-400">
                          {mentions.map((m: string) => {
                            const isCollab = m.startsWith('collab:');
                            const displayM = isCollab ? m.replace('collab:', '') : m;
                            return isCollab ? <span key={m} className="font-bold text-yellow-600 dark:text-yellow-500 mr-1">COLLAB @{displayM}</span> : <span key={m} className="mr-1">@{displayM}</span>;
                          })}
                          {hashtags.map((h: string) => <span key={h} className="mr-1">#{h}</span>)}
                        </div>
                      )}
                    </div>
                    
                    <div className="text-[10px] text-gray-500 uppercase mt-2">
                      Just now
                    </div>
                  </div>
                </div>

                {/* IG Bottom Navigation Mock */}
                <div className="absolute bottom-0 inset-x-0 h-16 bg-white dark:bg-black border-t border-gray-100 dark:border-[#222] flex justify-between items-center px-6 pb-2">
                  <svg className="w-6 h-6 text-gray-900 dark:text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.1l9 6.8v11c0 1.1-.9 2-2 2h-4v-7H9v7H5c-1.1 0-2-.9-2-2v-11l9-6.8zm0-2.1L.8 9.3l1.2 1.6L4 9.4V20c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4V9.4l2 1.5 1.2-1.6L12 0z"/></svg>
                  <svg className="w-6 h-6 text-gray-400 dark:text-[#555]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  <svg className="w-6 h-6 text-gray-400 dark:text-[#555]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2v20M2 12h20"/></svg>
                  <svg className="w-6 h-6 text-gray-400 dark:text-[#555]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                  <div className="w-6 h-6 rounded-full border border-gray-300 dark:border-[#555]"></div>
                </div>
              </>
            )}

            {postType === 'story' && (
              <div className="absolute inset-0 overflow-hidden bg-[#111]">
                <div className="absolute top-12 inset-x-0 z-50 px-3 pt-2 flex flex-col gap-2 bg-gradient-to-b from-black/50 to-transparent pb-4">
                  <div className="flex gap-1 h-0.5">
                    <div className="flex-1 bg-white rounded-full"></div>
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full border border-white/50 overflow-hidden flex-shrink-0">
                        {selectedAccountData.profilePictureUrl ? (
                          <img src={selectedAccountData.profilePictureUrl} alt={selectedAccountData.username} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-white bg-gray-800 w-full h-full flex items-center justify-center">{selectedAccountData.username.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <span className="text-[13px] font-semibold text-white drop-shadow-md">{selectedAccountData.username}</span>
                      <span className="text-[11px] text-white/80 drop-shadow-md">2h</span>
                    </div>
                    <X className="w-6 h-6 text-white drop-shadow-md" onClick={onClose} />
                  </div>
                </div>
                
                {mediaPreview.length > 0 ? (
                  mediaFiles[0]?.type.startsWith('video/') ? (
                    <video src={mediaPreview[0]} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                  ) : (
                    <div className="w-full h-full relative flex items-center justify-center bg-black">
                      <div 
                        className="absolute inset-0 bg-cover bg-center blur-2xl opacity-60 scale-110" 
                        style={{ backgroundImage: `url(${mediaPreview[0]})` }}
                      />
                      <img src={mediaPreview[0]} alt="Story media" className="w-full h-full object-contain relative z-10 shadow-2xl" />
                    </div>
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-white/50 bg-[#111]">
                    <CircleDashed className="w-12 h-12 mb-4 opacity-50" />
                    <span className="text-sm font-medium">Story Preview</span>
                  </div>
                )}

                <div className="absolute bottom-6 inset-x-4 z-50 flex items-center gap-3">
                  <div className="flex-1 h-[42px] rounded-full border border-white/50 px-4 flex items-center text-white/90 text-[13px] backdrop-blur-md bg-black/20">
                    Send message
                  </div>
                  <Heart className="w-7 h-7 text-white drop-shadow-md" />
                  <Send className="w-7 h-7 text-white drop-shadow-md" />
                </div>
              </div>
            )}

            {postType === 'reel' && (
              <div className="absolute inset-0 overflow-hidden bg-[#111]">
                <div className="absolute top-12 inset-x-0 z-50 pt-2 px-4 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent pb-6 text-white font-semibold text-[17px]">
                  Reels
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </div>

                {mediaPreview.length > 0 ? (
                  mediaFiles[0]?.type.startsWith('video/') ? (
                    <video src={mediaPreview[0]} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                  ) : (
                    <div className="w-full h-full relative flex items-center justify-center bg-black">
                      <div 
                        className="absolute inset-0 bg-cover bg-center blur-2xl opacity-60 scale-110" 
                        style={{ backgroundImage: `url(${mediaPreview[0]})` }}
                      />
                      <img src={mediaPreview[0]} alt="Reel media" className="w-full h-full object-contain relative z-10 shadow-2xl" />
                    </div>
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-white/50 bg-[#111]">
                    <Film className="w-12 h-12 mb-4 opacity-50" />
                    <span className="text-sm font-medium">Reel Preview</span>
                  </div>
                )}

                <div className="absolute bottom-20 right-3 z-50 flex flex-col items-center gap-5">
                  <div className="flex flex-col items-center gap-1">
                    <Heart className="w-7 h-7 text-white drop-shadow-md" fill="none" />
                    <span className="text-white text-[11px] font-medium drop-shadow-md">12.4k</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <MessageCircle className="w-7 h-7 text-white drop-shadow-md" />
                    <span className="text-white text-[11px] font-medium drop-shadow-md">342</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Send className="w-7 h-7 text-white drop-shadow-md" />
                    <span className="text-white text-[11px] font-medium drop-shadow-md">Share</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <MoreHorizontal className="w-6 h-6 text-white drop-shadow-md" />
                  </div>
                  <div className="w-7 h-7 rounded-md border-2 border-white overflow-hidden mt-1 shadow-md">
                    {selectedAccountData.profilePictureUrl ? (
                      <img src={selectedAccountData.profilePictureUrl} alt={selectedAccountData.username} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-bold text-white bg-gray-800 w-full h-full flex items-center justify-center">{selectedAccountData.username.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                </div>

                <div className="absolute bottom-20 left-4 right-16 z-50 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 flex-shrink-0">
                      {selectedAccountData.profilePictureUrl ? (
                        <img src={selectedAccountData.profilePictureUrl} alt={selectedAccountData.username} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-white bg-gray-800 w-full h-full flex items-center justify-center">{selectedAccountData.username.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <span className="text-[14px] font-semibold text-white drop-shadow-md">{selectedAccountData.username}</span>
                    <button className="px-2.5 py-1 rounded-md border border-white/60 text-white text-[11px] font-semibold backdrop-blur-sm shadow-sm ml-1">Follow</button>
                  </div>
                  <div className="text-white text-[13px] line-clamp-2 drop-shadow-md leading-tight pr-2">
                    {postContent || 'Your caption preview will appear here...'}
                    {(hashtags.length > 0 || mentions.length > 0) && (
                      <span className="text-white/90 font-medium">
                        {mentions.map((m: string) => {
                          const isCollab = m.startsWith('collab:');
                          const displayM = isCollab ? m.replace('collab:', '') : m;
                          return isCollab ? <span key={m} className="font-bold text-yellow-400 mr-1">COLLAB @{displayM}</span> : <span key={m} className="mr-1">@{displayM}</span>;
                        })}
                        {hashtags.map((h: string) => <span key={h} className="mr-1">#{h}</span>)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-white text-[12px] font-medium drop-shadow-md mt-0.5 bg-black/20 self-start px-2 py-1 rounded-full backdrop-blur-sm">
                    <Film className="w-3.5 h-3.5" />
                    <span>Original Audio</span>
                  </div>
                </div>

                {/* Reels Bottom Nav */}
                <div className="absolute bottom-0 inset-x-0 h-[60px] bg-black/80 backdrop-blur-md border-t border-white/10 flex justify-between items-center px-6">
                  <svg className="w-[22px] h-[22px] text-white/80 hover:text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                  <svg className="w-[22px] h-[22px] text-white/80 hover:text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  <svg className="w-[26px] h-[26px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><line x1="3" y1="8" x2="21" y2="8" /><line x1="7" y1="3" x2="11" y2="8" /><line x1="13" y1="3" x2="17" y2="8" /><polygon points="10 12 10 17 15 14.5" fill="currentColor" stroke="none" /></svg>
                  <svg className="w-[22px] h-[22px] text-white/80 hover:text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                  <div className="w-[24px] h-[24px] rounded-full overflow-hidden border border-white/20">
                    {selectedAccountData.profilePictureUrl ? (
                      <img src={selectedAccountData.profilePictureUrl} alt={selectedAccountData.username} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-bold text-white bg-gray-800 w-full h-full flex items-center justify-center">{selectedAccountData.username.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Home Indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-gray-900 dark:bg-white rounded-full z-50"></div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
