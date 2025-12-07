import React, { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { 
  X, 
  Image, 
  Calendar, 
  AtSign, 
  Hash, 
  Smile, 
  MapPin, 
  Clock,
  Eye,
  Instagram,
  Send,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  MoreHorizontal,
  Sparkles,
  Brain,
  Target,
  Plus,
  Settings,
  BarChart3,
  PlayCircle,
  Type,
  Camera,
  FileText,
  Layers
} from 'lucide-react'
import { useLocation } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'

export function CreatePost() {
  const [, setLocation] = useLocation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { currentWorkspace } = useCurrentWorkspace()
  
  // State management
  const [selectedAccount, setSelectedAccount] = useState('')
  const [postContent, setPostContent] = useState('')
  const [mediaPreview, setMediaPreview] = useState<string[]>([])
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [isScheduling, setIsScheduling] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [hashtags, setHashtags] = useState<string[]>([])
  const [newHashtag, setNewHashtag] = useState('')
  const [mentions, setMentions] = useState<string[]>([])
  const [newMention, setNewMention] = useState('')
  const [aiEnhancement, setAiEnhancement] = useState(false)
  const [postType, setPostType] = useState<'post' | 'story' | 'reel'>('post')
  const [showPreview, setShowPreview] = useState(true)

  // Fetch social accounts - HYBRID: Webhooks + Smart Polling
  const { data: socialAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['/api/social-accounts', currentWorkspace?.id],
    queryFn: () => currentWorkspace?.id ? apiRequest(`/api/social-accounts?workspaceId=${currentWorkspace.id}`) : Promise.resolve([]),
    enabled: !!currentWorkspace?.id,
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes - webhooks provide immediate updates for comments/mentions
    refetchInterval: 10 * 60 * 1000, // Smart polling every 10 minutes for likes/followers/engagement (Meta-friendly)
    refetchIntervalInBackground: false, // Don't poll when tab is not active to save API calls
    refetchOnWindowFocus: true, // Refresh when user returns to tab
    refetchOnReconnect: true, // Refresh when network reconnects
  })

  // Handle media upload
  const handleMediaUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => {
        setMediaPreview(prev => [...prev, e.target?.result as string])
      }
      reader.readAsDataURL(file)
    })
  }

  // Remove media
  const removeMedia = (index: number) => {
    setMediaPreview(prev => prev.filter((_, i) => i !== index))
  }

  // Add hashtag
  const addHashtag = () => {
    if (newHashtag.trim() && !hashtags.includes(newHashtag.trim())) {
      setHashtags(prev => [...prev, newHashtag.trim()])
      setNewHashtag('')
    }
  }

  // Add mention
  const addMention = () => {
    if (newMention.trim() && !mentions.includes(newMention.trim())) {
      setMentions(prev => [...prev, newMention.trim()])
      setNewMention('')
    }
  }

  // Remove hashtag
  const removeHashtag = (hashtag: string) => {
    setHashtags(prev => prev.filter(h => h !== hashtag))
  }

  // Remove mention
  const removeMention = (mention: string) => {
    setMentions(prev => prev.filter(m => m !== mention))
  }

  // Get selected account data
  const selectedAccountData = socialAccounts?.find((acc: any) => acc.id === selectedAccount)

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Create Amazing Content
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Craft and schedule your posts with real-time preview
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button 
            variant="outline" 
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center space-x-2"
          >
            <Eye className="w-4 h-4" />
            <span>{showPreview ? 'Hide' : 'Show'} Preview</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setLocation('/')}>
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className={`grid gap-8 ${showPreview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Left Panel - Post Creation */}
        <div className="space-y-6">
          {/* Account Selection */}
          <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                <Target className="w-5 h-5 text-blue-600" />
                <span>Select Account</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {accountsLoading ? (
              <div className="space-y-3">
                  <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
                </div>
              ) : (
                <div className="space-y-4">
                                     <select 
                     value={selectedAccount}
                     onChange={(e) => setSelectedAccount(e.target.value)}
                     className="w-full p-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-all duration-200 text-gray-800 dark:text-gray-200 font-medium"
                   >
                    <option value="">Choose your social account</option>
                    {socialAccounts?.map((account: any) => (
                      <option key={account.id} value={account.id}>
                        {account.platform} - @{account.username}
                      </option>
                    ))}
                </select>
                
                  {selectedAccountData && (
                    <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-600 rounded-xl">
                      <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-purple-600 rounded-xl flex items-center justify-center">
                        <Instagram className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                          @{selectedAccountData.username}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {selectedAccountData.followers} followers • {selectedAccountData.platform}
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Connected
                      </Badge>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Post Type Selection */}
          <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                <Layers className="w-5 h-5 text-purple-600" />
                <span>Post Type</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'post', label: 'Post', icon: <Image className="w-5 h-5" />, desc: 'Feed post' },
                  { id: 'story', label: 'Story', icon: <Camera className="w-5 h-5" />, desc: '24h story' },
                  { id: 'reel', label: 'Reel', icon: <PlayCircle className="w-5 h-5" />, desc: 'Video reel' }
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setPostType(type.id as any)}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                      postType === type.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="flex flex-col items-center space-y-2">
                      {type.icon}
                      <span className="font-medium">{type.label}</span>
                      <span className="text-xs opacity-75">{type.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Media Upload */}
          <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                <Image className="w-5 h-5 text-green-600" />
                <span>Media Content</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Upload Area */}
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  <div className="space-y-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto">
                      <Plus className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
                        Add photos or videos
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Drag and drop or click to browse
                      </p>
                  </div>
                </div>
                </div>

                {/* Media Preview */}
                {mediaPreview.length > 0 && (
                  <div className="grid grid-cols-2 gap-4">
                    {mediaPreview.map((preview, index) => (
                      <div key={index} className="relative group">
                        <img 
                          src={preview} 
                          alt={`Media ${index + 1}`}
                          className="w-full h-32 object-cover rounded-lg"
                        />
                        <button
                          onClick={() => removeMedia(index)}
                          className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleMediaUpload}
                  className="hidden"
                />
              </div>
            </CardContent>
          </Card>

          {/* Content Creation */}
          <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                  <Type className="w-5 h-5 text-orange-600" />
                  <span>Your Content</span>
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setAiEnhancement(!aiEnhancement)}
                  className={`flex items-center space-x-2 ${aiEnhancement ? 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>AI Enhance</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
              <textarea
                  placeholder="What's on your mind? Share your thoughts, ideas, or experiences..."
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                rows={6}
                  className="w-full p-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 transition-all duration-200"
                />
                
                {/* Content Tools */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="icon" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                    <AtSign className="w-5 h-5" />
                  </Button>
                    <Button variant="ghost" size="icon" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                    <Hash className="w-5 h-5" />
                  </Button>
                    <Button variant="ghost" size="icon" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                    <Smile className="w-5 h-5" />
                  </Button>
                    <Button variant="ghost" size="icon" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                    <MapPin className="w-5 h-5" />
                  </Button>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">{postContent.length}/2200</span>
                    {aiEnhancement && (
                      <div className="w-6 h-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                        <Brain className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Hashtags */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Hashtags</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {hashtags.map((hashtag, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center space-x-1">
                        <span>#{hashtag}</span>
                        <button onClick={() => removeHashtag(hashtag)}>
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="Add hashtag"
                      value={newHashtag}
                      onChange={(e) => setNewHashtag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addHashtag()}
                      className="flex-1 p-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 dark:text-gray-100 transition-all duration-200"
                    />
                    <Button onClick={addHashtag} size="sm">Add</Button>
                  </div>
                </div>

                {/* Mentions */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Mentions</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {mentions.map((mention, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center space-x-1">
                        <span>@{mention}</span>
                        <button onClick={() => removeMention(mention)}>
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="Add mention"
                      value={newMention}
                      onChange={(e) => setNewMention(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addMention()}
                      className="flex-1 p-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 dark:text-gray-100 transition-all duration-200"
                    />
                    <Button onClick={addMention} size="sm">Add</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scheduling */}
          <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <span>Publishing Options</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setIsScheduling(false)}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                      !isScheduling
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <Send className="w-5 h-5" />
                      <span className="font-medium">Post Now</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setIsScheduling(true)}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                      isScheduling
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <Calendar className="w-5 h-5" />
                      <span className="font-medium">Schedule</span>
                    </div>
                  </button>
                  <button
                    className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-all duration-200"
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <FileText className="w-5 h-5" />
                      <span className="font-medium">Save Draft</span>
                    </div>
                  </button>
                </div>

                {isScheduling && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date</label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 dark:text-gray-100 transition-all duration-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Time</label>
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 dark:text-gray-100 transition-all duration-200"
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4">
            <Button 
              variant="outline" 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center space-x-2"
            >
              <Settings className="w-4 h-4" />
              <span>Advanced Options</span>
            </Button>
            
            <div className="flex items-center space-x-3">
              <Button variant="outline" size="lg">
                Save as Draft
              </Button>
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8"
              >
                {isScheduling ? 'Schedule Post' : 'Post Now'}
                <Send className="w-4 h-4 ml-2" />
            </Button>
            </div>
          </div>
        </div>

        {/* Right Panel - Live Preview */}
        {showPreview && (
        <div className="space-y-6">
            {/* Preview Header */}
            <Card className="border-gray-200 dark:border-gray-700 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 text-white">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                    <Eye className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Live Preview</h3>
                    <p className="text-sm opacity-90">Real-time post preview</p>
                  </div>
                  <div className="ml-auto">
                    <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Instagram Post Preview */}
            <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
              <CardContent className="p-0">
                {/* Post Header */}
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-600 text-white font-bold">
                          {selectedAccountData?.username?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                          {selectedAccountData?.username || 'your_account'}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {isScheduling ? 'Scheduled' : 'Now'}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
                
                {/* Post Content */}
                <div className="p-4">
                  {postContent && (
                    <div className="text-gray-900 dark:text-gray-100 mb-4 whitespace-pre-wrap">
                      {postContent}
                    </div>
                  )}

                  {/* Hashtags and Mentions */}
                  {(hashtags.length > 0 || mentions.length > 0) && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {mentions.map((mention, index) => (
                        <span key={index} className="text-blue-600 dark:text-blue-400 font-medium">
                          @{mention}
                        </span>
                      ))}
                      {hashtags.map((hashtag, index) => (
                        <span key={index} className="text-blue-600 dark:text-blue-400 font-medium">
                          #{hashtag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Media Preview */}
                  {mediaPreview.length > 0 ? (
                    <div className={`grid gap-2 mb-4 ${
                      mediaPreview.length === 1 ? 'grid-cols-1' : 
                      mediaPreview.length === 2 ? 'grid-cols-2' : 
                      'grid-cols-2'
                    }`}>
                      {mediaPreview.slice(0, 4).map((preview, index) => (
                        <div key={index} className="relative">
                          <img 
                            src={preview} 
                            alt={`Media ${index + 1}`}
                            className="w-full h-48 object-cover rounded-lg"
                          />
                          {mediaPreview.length > 4 && index === 3 && (
                            <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                              <span className="text-white font-bold text-lg">
                                +{mediaPreview.length - 4}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full h-64 bg-gray-100 dark:bg-gray-700 rounded-lg mb-4 flex items-center justify-center">
                      <div className="text-center text-gray-400 dark:text-gray-500">
                    <Image className="w-12 h-12 mx-auto mb-2" />
                        <p className="text-sm">No media added</p>
                  </div>
                </div>
                  )}
                
                {/* Engagement Icons */}
                  <div className="flex items-center justify-between py-3">
                  <div className="flex items-center space-x-4">
                      <Button variant="ghost" size="icon" className="p-0 hover:bg-transparent">
                        <Heart className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                    </Button>
                      <Button variant="ghost" size="icon" className="p-0 hover:bg-transparent">
                        <MessageCircle className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                    </Button>
                      <Button variant="ghost" size="icon" className="p-0 hover:bg-transparent">
                        <Share2 className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                    </Button>
                  </div>
                    <Button variant="ghost" size="icon" className="p-0 hover:bg-transparent">
                      <Bookmark className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                  </Button>
                </div>
                
                  {/* Post Stats */}
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-semibold">0</span> likes
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Post Analytics Preview */}
            <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                  <BarChart3 className="w-5 h-5 text-green-600" />
                  <span>Expected Performance</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {Math.floor(Math.random() * 100) + 50}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Expected Likes</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {Math.floor(Math.random() * 20) + 5}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Expected Comments</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        )}
      </div>
    </div>
  )
}