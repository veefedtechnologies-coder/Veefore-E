import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  X, 
  Image as ImageIcon, 
  Calendar, 
  AtSign, 
  Hash, 
  Smile, 
  MapPin, 
  Send,
  Heart,
  MessageCircle,
  Bookmark,
  MoreHorizontal,
  Sparkles,
  Plus,
  Settings,
  BarChart3,
  Type,
  ChevronDown,
  Check,
  CircleDashed,
  Film,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { useLocation } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { useToast } from '@/hooks/use-toast'

export function CreatePost() {
  const [, setLocation] = useLocation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { currentWorkspace } = useCurrentWorkspace()
  const { toast } = useToast()
  
  // State management
  const [selectedAccount, setSelectedAccount] = useState('')
  const [postContent, setPostContent] = useState('')
  const [mediaPreview, setMediaPreview] = useState<string[]>([])
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([])
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  // Provide sensible defaults: current date and current time + 1 hour
  const defaultDate = new Date().toISOString().split('T')[0];
  const defaultTimeObj = new Date();
  defaultTimeObj.setHours(defaultTimeObj.getHours() + 1);
  const defaultTime = `${String(defaultTimeObj.getHours()).padStart(2, '0')}:${String(defaultTimeObj.getMinutes()).padStart(2, '0')}`;

  const [scheduledDate, setScheduledDate] = useState(defaultDate)
  const [scheduledTime, setScheduledTime] = useState(defaultTime)
  const [isScheduling, setIsScheduling] = useState(false)
  const [hashtags, setHashtags] = useState<string[]>([])
  const [newHashtag, setNewHashtag] = useState('')
  const [mentions, setMentions] = useState<string[]>([])
  const [newMention, setNewMention] = useState('')
  const [aiEnhancement, setAiEnhancement] = useState(false)
  const [postType, setPostType] = useState<'post' | 'story' | 'reel'>('post')
  const [showPreview, setShowPreview] = useState(true)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Fetch social accounts
  const { data: socialAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['/api/social-accounts', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const response = await apiRequest(`/api/social-accounts?workspaceId=${currentWorkspace.id}`);
      if (Array.isArray(response)) return response;
      if (response && Array.isArray(response.data)) return response.data;
      return [];
    },
    enabled: !!currentWorkspace?.id,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })

  const handleMediaUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[UPLOAD DEBUG] handleMediaUpload triggered');
    console.log('[UPLOAD DEBUG] Files selected:', event.target.files);
    
    const files = Array.from(event.target.files || [])
    if (files.length === 0) {
      console.log('[UPLOAD DEBUG] No files found in event.target.files');
      toast({ title: 'Debug', description: 'No files were selected.', variant: 'destructive' });
      return;
    }
    processFiles(files)
    if (event.target) event.target.value = ''
  }

  const processFiles = async (files: File[]) => {
    console.log('[UPLOAD DEBUG] processFiles started with files:', files);
    if (files.length === 0) {
      console.log('[UPLOAD DEBUG] processFiles aborted: empty array');
      return;
    }
    
    let filesToProcess = files;
    if (postType === 'story' || postType === 'reel') {
       const availableSlots = Math.max(0, 1 - mediaFiles.length);
       if (availableSlots === 0) {
           toast({ title: 'Format Limitation', description: `${postType === 'story' ? 'Stories' : 'Reels'} only support a single media file.`, variant: 'destructive' });
           return;
       }
       if (files.length > availableSlots) {
           toast({ title: 'Format Limitation', description: `Only the first file was added. ${postType === 'story' ? 'Stories' : 'Reels'} only support a single media file.` });
           filesToProcess = files.slice(0, availableSlots);
       }
    }

    toast({
      title: 'Debug: Processing Media',
      description: `Starting upload for ${filesToProcess.length} file(s)...`,
    });

    setMediaFiles(prev => [...prev, ...filesToProcess])
    const newPreviews = filesToProcess.map(file => {
      console.log(`[UPLOAD DEBUG] Creating object URL for ${file.name} (type: ${file.type}, size: ${file.size})`);
      return URL.createObjectURL(file);
    })
    setMediaPreview(prev => [...prev, ...newPreviews])

    // Upload immediately
    setIsUploadingMedia(true)
    let successCount = 0;
    
    for (const file of filesToProcess) {
      console.log(`[UPLOAD DEBUG] Uploading file: ${file.name}`);
      try {
        const formData = new FormData();
        formData.append('image', file);
        
        console.log(`[UPLOAD DEBUG] Sending POST to /api/video/upload-image`);
        const res = await apiRequest('/api/video/upload-image', {
          method: 'POST',
          body: formData,
        });
        console.log(`[UPLOAD DEBUG] API Response:`, res);
        
        if (res && res.success && res.imageUrl) {
          console.log(`[UPLOAD DEBUG] Upload successful! URL: ${res.imageUrl}`);
          setUploadedUrls(prev => [...prev, res.imageUrl]);
          successCount++;
          toast({
            title: 'Upload Successful',
            description: `${file.name} uploaded successfully.`,
          });
        } else {
          console.error(`[UPLOAD DEBUG] Upload failed or missing imageUrl in response:`, res);
          throw new Error('Invalid response from server');
        }
      } catch (error: any) {
        console.error(`[UPLOAD DEBUG] Catch block triggered for ${file.name}:`, error);
        toast({
          title: 'Upload Failed',
          description: error.message || `Failed to upload ${file.name}`,
          variant: 'destructive'
        });
      }
    }
    console.log(`[UPLOAD DEBUG] processFiles finished. Success count: ${successCount}`);
    setIsUploadingMedia(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    console.log('[UPLOAD DEBUG] Drop event triggered');
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length === 0) {
      console.log('[UPLOAD DEBUG] No files found in drop event');
      return;
    }
    processFiles(files)
  }

  const removeMedia = (index: number) => {
    URL.revokeObjectURL(mediaPreview[index]);
    setMediaPreview(prev => prev.filter((_, i) => i !== index))
    setMediaFiles(prev => prev.filter((_, i) => i !== index))
    setCurrentSlide(prev => Math.min(prev, Math.max(0, mediaPreview.length - 2)))
  }

  const addHashtag = () => {
    if (newHashtag.trim() && !hashtags.includes(newHashtag.trim())) {
      setHashtags(prev => [...prev, newHashtag.trim()])
      setNewHashtag('')
    }
  }

  const addMention = () => {
    if (newMention.trim() && !mentions.includes(newMention.trim())) {
      setMentions(prev => [...prev, newMention.trim()])
      setNewMention('')
    }
  }

  const removeHashtag = (hashtag: string) => setHashtags(prev => prev.filter(h => h !== hashtag))
  const removeMention = (mention: string) => setMentions(prev => prev.filter(m => m !== mention))

  const selectedAccountData = socialAccounts?.find((acc: any) => acc.id === selectedAccount || acc._id === selectedAccount)

  const handlePublish = async () => {
    console.log('[DEBUG] handlePublish invoked');
    if (!currentWorkspace?.id) {
      toast({ title: 'Error', description: 'No active workspace selected', variant: 'destructive' });
      return;
    }
    if (!selectedAccount) {
      toast({ title: 'Error', description: 'Please select an account', variant: 'destructive' });
      return;
    }
    
    // Always require media for Instagram
    const isInstagram = selectedAccountData?.platform === 'instagram' || !selectedAccountData?.platform;
    if (isInstagram && uploadedUrls.length === 0) {
      toast({ title: 'Instagram Error', description: 'Instagram requires at least one successfully uploaded image or video.', variant: 'destructive' });
      return;
    }
    
    if (!postContent.trim() && uploadedUrls.length === 0) {
      toast({ title: 'Validation Error', description: 'Please add some content or wait for media to upload.', variant: 'destructive' });
      return;
    }
    if (isScheduling) {
      if (!scheduledDate || !scheduledTime) {
        toast({ title: 'Validation Error', description: 'Please select both date and time.', variant: 'destructive' });
        return;
      }
      
      const dateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (dateTime < fiveMinutesAgo) {
        toast({ title: 'Validation Error', description: 'Scheduled time must be in the future.', variant: 'destructive' });
        return;
      }
    }

    if (isUploadingMedia) {
      toast({ title: 'Error', description: 'Please wait for media to finish uploading', variant: 'destructive' });
      return;
    }

    setIsPublishing(true);
    try {
      // Use the already uploaded URLs!
      const finalMediaUrls = [...uploadedUrls];
      
      // 2. Create Content Record
      const contentRes = await apiRequest(`/api/content/workspace/${currentWorkspace.id}`, {
        method: 'POST',
        body: JSON.stringify({
          type: postType,
          title: postContent.slice(0, 50) || 'New Post',
          description: postContent,
          platform: selectedAccountData?.platform || 'instagram',
          contentData: {
            text: postContent,
            mediaUrls: finalMediaUrls,
            hashtags,
            mentions,
            accountId: selectedAccount,
            style: aiEnhancement ? 'enhanced' : 'standard'
          }
        })
      });

      const contentId = contentRes.data?.id || contentRes.data?._id || contentRes.id || contentRes._id;
      if (!contentId) throw new Error('Failed to retrieve created content ID');

      // 3. Schedule if needed
      if (isScheduling) {
        const dateTime = new Date(`${scheduledDate}T${scheduledTime}`);
        await apiRequest(`/api/content/${contentId}/schedule`, {
          method: 'POST',
          body: JSON.stringify({
            scheduledAt: dateTime.toISOString(),
            platform: selectedAccountData?.platform || 'instagram'
          })
        });
      } else {
        // Publish immediately
        await apiRequest(`/api/content/${contentId}/publish`, {
          method: 'POST'
        });
      }
      
      // Clear the form after success instead of redirecting
      setPostContent('');
      setMediaFiles([]);
      setMediaPreview([]);
      setHashtags([]);
      setMentions([]);
      setUploadedUrls([]);
      
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to publish post', variant: 'destructive' });
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-8 min-h-screen bg-transparent text-gray-900 dark:text-gray-100 font-sans selection:bg-blue-500/30">
      
      {/* Sleek Minimal Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-12 gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">
            <span className="flex h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse"></span>
            Content Studio
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 dark:text-white">
            Create Post
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base max-w-xl">
            Design, schedule, and publish high-converting content across your linked platforms.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            onClick={() => setShowPreview(!showPreview)}
            className="hidden lg:flex items-center gap-2 rounded-full px-5 bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 backdrop-blur-md transition-all text-sm font-medium"
          >
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation('/')}
            className="rounded-full bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-transparent dark:border-white/5 transition-all"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className={`grid gap-12 lg:gap-16 ${showPreview ? 'grid-cols-1 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_440px]' : 'grid-cols-1 max-w-4xl'}`}>
        
        {/* Left Column: Ultra-Sleek Form Editor */}
        <div className="space-y-12">
          
          {/* Section 1: Destination */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
            </h2>
            
            {accountsLoading ? (
              <div className="h-16 w-full bg-gray-100 dark:bg-white/5 rounded-2xl animate-pulse"></div>
            ) : (
              <div className="relative group">
                <select 
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="w-full appearance-none bg-white dark:bg-[#1A1A1A]/80 border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 rounded-2xl px-5 py-4 text-base font-medium text-gray-900 dark:text-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm backdrop-blur-xl"
                >
                  <option value="" className="bg-white dark:bg-gray-900">Select an account to publish to...</option>
                  {socialAccounts?.map((account: any) => (
                    <option key={account.id} value={account.id} className="bg-white dark:bg-gray-900">
                      {account.platform} — @{account.username}
                    </option>
                  ))}
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
                  <ChevronDown className="w-5 h-5" />
                </div>
              </div>
            )}
            
            {selectedAccountData && (
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.05] rounded-2xl mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-rose-500 via-fuchsia-500 to-indigo-500 p-[2px]">
                    <div className="w-full h-full bg-white dark:bg-black rounded-full flex items-center justify-center">
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">@{selectedAccountData.username}</div>
                    <div className="text-xs text-gray-500">{(selectedAccountData.followers || 0).toLocaleString()} followers</div>
                  </div>
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400 border-green-200 dark:border-green-500/20 px-3 py-1 rounded-full font-medium">
                  Connected
                </Badge>
              </div>
            )}
          </section>

          {/* Section 2: Format (Segmented Control) */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
            </h2>
            
            <div className="flex p-1.5 bg-gray-100/80 dark:bg-[#1A1A1A]/80 border border-gray-200 dark:border-white/5 rounded-2xl backdrop-blur-xl">
              {[
                { id: 'post', label: 'Post', icon: <ImageIcon className="w-4 h-4" /> },
                { id: 'story', label: 'Story', icon: <CircleDashed className="w-4 h-4" /> },
                { id: 'reel', label: 'Reel', icon: <Film className="w-4 h-4" /> },
              ].map((type) => (
                <button
                  key={type.id}
                  onClick={() => {
                    setPostType(type.id as any);
                    if ((type.id === 'story' || type.id === 'reel') && mediaPreview.length > 1) {
                      setMediaPreview(prev => {
                        prev.slice(1).forEach(url => URL.revokeObjectURL(url));
                        return prev.slice(0, 1);
                      });
                      setMediaFiles(prev => prev.slice(0, 1));
                      setUploadedUrls(prev => prev.slice(0, 1));
                      setCurrentSlide(0);
                      toast({
                        title: 'Format Updated',
                        description: 'Extra files were removed as Stories and Reels only support a single media file.'
                      });
                    }
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-300 ${
                    postType === type.id
                      ? 'bg-white dark:bg-[#2A2A2A] text-gray-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-white/5'
                  }`}
                >
                  {type.icon}
                  {type.label}
                </button>
              ))}
            </div>
          </section>

          {/* Section 3: Media Upload (Minimalist Drag & Drop) */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Media
            </h2>
            
            <label 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative overflow-hidden border-2 border-dashed rounded-[2rem] p-12 flex flex-col items-center justify-center transition-all duration-300 cursor-pointer group block w-full ${
                isDragging 
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-500/10' 
                  : 'border-gray-300 dark:border-white/20 bg-gray-50/50 dark:bg-[#1A1A1A]/30 hover:bg-gray-100 dark:hover:bg-[#1A1A1A]/60 hover:border-blue-500/50'
              }`}
            >
              <input 
                type="file" 
                multiple={postType === 'post'} 
                accept="image/*,video/*" 
                onChange={handleMediaUpload} 
                className="sr-only" 
              />
              
              <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              
              <div className={`w-16 h-16 mb-6 rounded-2xl shadow-sm ring-1 ring-gray-200 dark:ring-white/10 flex items-center justify-center transition-all duration-300 z-10 ${
                isDragging ? 'bg-blue-100 dark:bg-blue-500/20 scale-110' : 'bg-white dark:bg-[#2A2A2A] group-hover:scale-110 group-hover:shadow-md'
              }`}>
                <Plus className={`w-6 h-6 transition-colors ${isDragging ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 group-hover:text-blue-500'}`} />
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 z-10">
                {isDragging ? 'Drop files now' : 'Click or drag files here'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-xs z-10">
                Support for high-res images and up to 4K videos. Max file size 500MB.
              </p>
            </label>

            {mediaPreview.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                {mediaPreview.map((preview, index) => (
                  <div key={index} className="relative group aspect-square rounded-2xl overflow-hidden shadow-sm ring-1 ring-gray-200 dark:ring-white/10">
                    {mediaFiles[index]?.type.startsWith('video/') ? (
                      <video 
                        src={preview} 
                        className={`w-full h-full object-cover transition-transform duration-700 ${isUploadingMedia ? 'opacity-50 grayscale' : 'group-hover:scale-105'}`}
                        muted
                        loop
                        playsInline
                      />
                    ) : (
                      <img 
                        src={preview} 
                        alt={`Media ${index + 1}`}
                        className={`w-full h-full object-cover transition-transform duration-700 ${isUploadingMedia ? 'opacity-50 grayscale' : 'group-hover:scale-105'}`}
                      />
                    )}
                    
                    {isUploadingMedia && index >= uploadedUrls.length && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                    
                    {!isUploadingMedia && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeMedia(index); }}
                          className="w-10 h-10 bg-white/10 backdrop-blur-md hover:bg-red-500/90 text-white rounded-full flex items-center justify-center transform scale-90 group-hover:scale-100 transition-all duration-300"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 4: Caption & Context */}
          {postType !== 'story' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <Type className="w-4 h-4" /> Caption
                </h2>
                <button 
                  onClick={() => setAiEnhancement(!aiEnhancement)}
                  className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full transition-all duration-300 ${
                    aiEnhancement 
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 ring-1 ring-blue-500/30' 
                      : 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  AI Assist {aiEnhancement ? 'On' : 'Off'}
                </button>
              </div>
              
              <div className="bg-white dark:bg-[#1A1A1A]/50 border border-gray-200 dark:border-white/10 rounded-[2rem] p-6 shadow-sm backdrop-blur-xl focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-transparent transition-all duration-300">
                <textarea
                  placeholder="Write something captivating..."
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  rows={5}
                  className="w-full bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none text-base leading-relaxed"
                />
                
                <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-white/5 mt-2">
                  <div className="flex items-center gap-1">
                    {[AtSign, Hash, Smile, MapPin].map((Icon, idx) => (
                      <button key={idx} className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors">
                        <Icon className="w-5 h-5" />
                      </button>
                    ))}
                  </div>
                  <div className="text-xs font-medium text-gray-400">
                    {postContent.length} / 2200
                  </div>
                </div>
              </div>

              {/* Tags & Mentions Mini Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="bg-white dark:bg-[#1A1A1A]/50 border border-gray-200 dark:border-white/10 rounded-xl p-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-gray-300 dark:focus-within:ring-white/20 transition-all">
                  <Hash className="w-4 h-4 text-gray-400 ml-2" />
                  <input
                    type="text"
                    placeholder="Add hashtags..."
                    value={newHashtag}
                    onChange={(e) => setNewHashtag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addHashtag()}
                    className="bg-transparent flex-1 focus:outline-none text-sm text-gray-900 dark:text-white"
                  />
                </div>
                <div className="bg-white dark:bg-[#1A1A1A]/50 border border-gray-200 dark:border-white/10 rounded-xl p-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-gray-300 dark:focus-within:ring-white/20 transition-all">
                  <AtSign className="w-4 h-4 text-gray-400 ml-2" />
                  <input
                    type="text"
                    placeholder="Mention accounts..."
                    value={newMention}
                    onChange={(e) => setNewMention(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addMention()}
                    className="bg-transparent flex-1 focus:outline-none text-sm text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Rendered Tags */}
              {(hashtags.length > 0 || mentions.length > 0) && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {mentions.map((mention, idx) => (
                    <span key={`m-${idx}`} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 text-sm font-medium">
                      @{mention}
                      <button onClick={() => removeMention(mention)} className="hover:text-blue-900 dark:hover:text-blue-100"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  {hashtags.map((tag, idx) => (
                    <span key={`h-${idx}`} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300 text-sm font-medium">
                      #{tag}
                      <button onClick={() => removeHashtag(tag)} className="hover:text-gray-900 dark:hover:text-white"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Section 4.5: Expected Performance */}
          <section className="space-y-4 relative">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 flex items-center gap-2 pl-2">
              <BarChart3 className="w-3.5 h-3.5" /> Expected Performance
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative overflow-hidden bg-white dark:bg-[#151515] border border-gray-200 dark:border-white/5 rounded-3xl p-5 group transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1 hover:border-blue-500/30 cursor-default">
                <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all duration-500"></div>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform duration-300">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex flex-col">
                    <div className="text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none mb-1">4.2k</div>
                    <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Est. Views</div>
                  </div>
                </div>
              </div>

              <div className="relative overflow-hidden bg-white dark:bg-[#151515] border border-gray-200 dark:border-white/5 rounded-3xl p-5 group transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-1 hover:border-emerald-500/30 cursor-default">
                <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all duration-500"></div>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform duration-300">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex flex-col">
                    <div className="text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none mb-1">Optimal</div>
                    <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Timing Match</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 5: Publishing & Schedule */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setIsScheduling(false)}
                className={`p-5 rounded-2xl flex flex-col items-start gap-3 transition-all duration-300 text-left border ${
                  !isScheduling
                    ? 'bg-white dark:bg-[#1A1A1A] border-gray-900 dark:border-white shadow-sm'
                    : 'bg-gray-50 dark:bg-white/5 border-transparent hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500'
                }`}
              >
                <div className={`p-2 rounded-xl ${!isScheduling ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'bg-gray-200 dark:bg-white/10'}`}>
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <div className={`font-semibold ${!isScheduling ? 'text-gray-900 dark:text-white' : ''}`}>Publish Now</div>
                  <div className="text-xs mt-1 opacity-70">Send to platforms immediately</div>
                </div>
              </button>
              
              <button
                onClick={() => setIsScheduling(true)}
                className={`p-5 rounded-2xl flex flex-col items-start gap-3 transition-all duration-300 text-left border ${
                  isScheduling
                    ? 'bg-white dark:bg-[#1A1A1A] border-blue-500 shadow-sm'
                    : 'bg-gray-50 dark:bg-white/5 border-transparent hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500'
                }`}
              >
                <div className={`p-2 rounded-xl ${isScheduling ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-white/10'}`}>
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className={`font-semibold ${isScheduling ? 'text-gray-900 dark:text-white' : ''}`}>Schedule Later</div>
                  <div className="text-xs mt-1 opacity-70">Pick a specific date and time</div>
                </div>
              </button>
            </div>

            {isScheduling && (
              <div className="grid grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-top-2">
                <div className="bg-white dark:bg-[#1A1A1A]/80 border border-gray-200 dark:border-white/10 rounded-xl p-2 px-4 focus-within:ring-2 focus-within:ring-blue-500/50">
                  <label className="text-[10px] uppercase font-bold text-gray-400">Date</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full bg-transparent focus:outline-none text-gray-900 dark:text-white text-sm py-1"
                  />
                </div>
                <div className="bg-white dark:bg-[#1A1A1A]/80 border border-gray-200 dark:border-white/10 rounded-xl p-2 px-4 focus-within:ring-2 focus-within:ring-blue-500/50">
                  <label className="text-[10px] uppercase font-bold text-gray-400">Time</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full bg-transparent focus:outline-none text-gray-900 dark:text-white text-sm py-1"
                  />
                </div>
              </div>
            )}
          </section>

          {/* Action Footer */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-200 dark:border-white/10">
            <button className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-2">
              <Settings className="w-4 h-4" /> Advanced Settings
            </button>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button className="flex-1 sm:flex-none px-6 py-3 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-white/5 dark:hover:bg-white/10 transition-colors">
                Save Draft
              </button>
              <button 
                onClick={handlePublish}
                disabled={isPublishing}
                className={`flex-1 sm:flex-none px-8 py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 ${isPublishing ? 'opacity-70 cursor-not-allowed' : ''}`}>
                {isPublishing ? 'Processing...' : (isScheduling ? 'Schedule Post' : 'Publish Post')}
                {!isPublishing && <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>

        </div>

        {/* Right Column: Ultra-Realistic Device Preview */}
        {showPreview && (
          <div className="hidden lg:block relative sticky top-12 self-start perspective-[1000px]">
            
            {/* The Phone Hardware Mockup */}
            <div className="relative mx-auto w-[360px] h-[740px] bg-black rounded-[3.5rem] border-[12px] border-[#18181B] dark:border-[#111] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,1)] ring-1 ring-gray-200 dark:ring-white/5 overflow-hidden">
              
              {/* Dynamic Island */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-50 flex items-center justify-between px-2 shadow-inner">
                <div className="w-2.5 h-2.5 bg-[#111] rounded-full ring-1 ring-white/10"></div>
                <div className="w-2.5 h-2.5 bg-green-500/20 rounded-full flex items-center justify-center">
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
                    <div className="px-4 pb-2 pt-1 flex justify-between items-center border-b border-gray-100 dark:border-[#222]">
                      <div className="flex gap-5">
                        <Heart className="w-6 h-6 text-gray-900 dark:text-white" strokeWidth={1.5} />
                        <MessageCircle className="w-6 h-6 text-gray-900 dark:text-white" strokeWidth={1.5} />
                      </div>
                    </div>

                    {/* The Post Wrapper */}
                    <div className="flex-1 overflow-y-auto pb-20 no-scrollbar">
                      {/* Post Header */}
                      <div className="flex justify-between items-center px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-fuchsia-600 p-[2px]">
                            <div className="w-full h-full rounded-full bg-white dark:bg-black flex items-center justify-center overflow-hidden border border-white dark:border-black">
                              {selectedAccountData ? (
                                <span className="text-xs font-bold dark:text-white">{selectedAccountData.username.charAt(0).toUpperCase()}</span>
                              ) : (
                                <div className="w-full h-full bg-gray-200 dark:bg-[#222]"></div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight">
                              {selectedAccountData?.username || 'username'}
                            </span>
                            {selectedAccountData?.location && (
                              <span className="text-[11px] text-gray-500 leading-tight">Location</span>
                            )}
                          </div>
                        </div>
                        <MoreHorizontal className="w-5 h-5 text-gray-900 dark:text-white" />
                      </div>

                      {/* Post Media Area */}
                      <div className="w-full aspect-square bg-gray-100 dark:bg-[#111] relative overflow-hidden flex items-center justify-center group/preview">
                        {mediaPreview.length > 0 ? (
                          <>
                            <div 
                              className="w-full h-full flex transition-transform duration-300 ease-in-out" 
                              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                            >
                              {mediaPreview.map((preview, idx) => (
                                <div key={idx} className="w-full h-full flex-shrink-0">
                                  {mediaFiles[idx]?.type.startsWith('video/') ? (
                                    <video src={preview} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                                  ) : (
                                    <img src={preview} alt={`Post media ${idx + 1}`} className="w-full h-full object-cover" />
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
                                  {mediaPreview.map((_, idx) => (
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
                          <span className="font-semibold mr-1.5">{selectedAccountData?.username || 'username'}</span>
                          {postContent ? postContent : <span className="text-gray-400">Your caption preview will appear here...</span>}
                          
                          {(hashtags.length > 0 || mentions.length > 0) && (
                            <div className="mt-1 text-blue-900 dark:text-blue-400">
                              {mentions.map(m => `@${m} `)}
                              {hashtags.map(h => `#${h} `)}
                            </div>
                          )}
                        </div>
                        
                        <div className="text-[10px] text-gray-500 uppercase mt-2">
                          {isScheduling ? 'Scheduled for later' : 'Just now'}
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
                  <div className="flex-1 w-full h-full relative overflow-hidden bg-gray-900 rounded-[2rem] mx-1 mt-1 mb-1 shadow-2xl">
                    <div className="absolute top-0 inset-x-0 z-50 pt-3 px-3 flex flex-col gap-2 bg-gradient-to-b from-black/50 to-transparent pb-4">
                      <div className="flex gap-1 h-0.5">
                        <div className="flex-1 bg-white rounded-full"></div>
                      </div>
                      <div className="flex justify-between items-center px-1">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full border border-white/50 overflow-hidden flex-shrink-0">
                            {selectedAccountData ? (
                              <span className="text-xs font-bold text-white bg-gray-800 w-full h-full flex items-center justify-center">{selectedAccountData.username.charAt(0).toUpperCase()}</span>
                            ) : (
                              <div className="w-full h-full bg-gray-200"></div>
                            )}
                          </div>
                          <span className="text-[13px] font-semibold text-white drop-shadow-md">{selectedAccountData?.username || 'username'}</span>
                          <span className="text-[11px] text-white/80 drop-shadow-md">2h</span>
                        </div>
                        <X className="w-6 h-6 text-white drop-shadow-md" />
                      </div>
                    </div>
                    
                    {mediaPreview.length > 0 ? (
                      mediaFiles[0]?.type.startsWith('video/') ? (
                        <video src={mediaPreview[0]} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                      ) : (
                        <img src={mediaPreview[0]} alt="Story media" className="w-full h-full object-cover" />
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
                  <div className="flex-1 w-full h-full relative overflow-hidden bg-gray-900 rounded-[2rem] mx-1 mt-1 mb-1 shadow-2xl">
                    <div className="absolute top-0 inset-x-0 z-50 pt-4 px-4 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent pb-6 text-white font-semibold text-[17px]">
                      Reels
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    </div>

                    {mediaPreview.length > 0 ? (
                      mediaFiles[0]?.type.startsWith('video/') ? (
                        <video src={mediaPreview[0]} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                      ) : (
                        <img src={mediaPreview[0]} alt="Reel media" className="w-full h-full object-cover" />
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
                        {selectedAccountData ? (
                          <span className="text-[10px] font-bold text-white bg-gray-800 w-full h-full flex items-center justify-center">{selectedAccountData.username.charAt(0).toUpperCase()}</span>
                        ) : (
                          <div className="w-full h-full bg-gray-800"></div>
                        )}
                      </div>
                    </div>

                    <div className="absolute bottom-20 left-4 right-16 z-50 flex flex-col gap-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 flex-shrink-0">
                          {selectedAccountData ? (
                            <span className="text-xs font-bold text-white bg-gray-800 w-full h-full flex items-center justify-center">{selectedAccountData.username.charAt(0).toUpperCase()}</span>
                          ) : (
                            <div className="w-full h-full bg-gray-200"></div>
                          )}
                        </div>
                        <span className="text-[14px] font-semibold text-white drop-shadow-md">{selectedAccountData?.username || 'username'}</span>
                        <button className="px-2.5 py-1 rounded-md border border-white/60 text-white text-[11px] font-semibold backdrop-blur-sm shadow-sm ml-1">Follow</button>
                      </div>
                      <div className="text-white text-[13px] line-clamp-2 drop-shadow-md leading-tight pr-2">
                        {postContent || 'Your caption preview will appear here...'}
                        {(hashtags.length > 0 || mentions.length > 0) && (
                          <span className="text-white/90 font-medium">
                            {mentions.map(m => ` @${m}`)}
                            {hashtags.map(h => ` #${h}`)}
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
                      <div className="w-[24px] h-[24px] flex flex-col items-center justify-center gap-0.5 border-2 border-white rounded-[4px] p-0.5"><div className="w-full h-full bg-white rounded-[1px]"></div></div>
                      <svg className="w-[22px] h-[22px] text-white/80 hover:text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                      <div className="w-[24px] h-[24px] rounded-full overflow-hidden border border-white/20">
                        {selectedAccountData ? (
                          <span className="text-[10px] font-bold text-white bg-gray-800 w-full h-full flex items-center justify-center">{selectedAccountData.username.charAt(0).toUpperCase()}</span>
                        ) : (
                          <div className="w-full h-full bg-gray-800"></div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Home Indicator */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-gray-900 dark:bg-white rounded-full z-50"></div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}