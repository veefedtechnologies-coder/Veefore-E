import React, { useState, useRef, useEffect, useMemo } from 'react'
import { SEO, seoConfig, generateStructuredData } from '@/lib/seo-optimization'
import { 
  Instagram, 
  Bot, 
  MessageCircle, 
  User, 
  Heart, 
  Send, 
  Bookmark, 
  Camera, 
  MoreHorizontal, 
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Plus,
  X,
  Eye,
  Hash,
  Facebook,
  Twitter,
  Linkedin,
  Youtube,
  UserPlus,
  Share2,
  PlayCircle,
  Target,
  Clock,
  Brain,
  Shield,
  BarChart3,
  Globe,
  FileText,
  MessageSquare,
  Settings,
  ChevronDown,
  Search,
  Check,
  Play,
  Pause,
  Trash2,
  Reply
} from 'lucide-react'

// Instagram Comment Icon Component - Authentic rounded speech bubble
const InstagramCommentIcon = ({ className = "w-6 h-6", ...props }: { className?: string; [key: string]: any }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22l-1.344-4.992z" />
  </svg>
)

// Debug component to track when the component mounts/unmounts
const RefreshDetector = () => {
  const mountTime = useRef(Date.now())
  const renderCount = useRef(0)
  
  renderCount.current++
  
  // Log every render
  console.log(`🔍 AUTOMATION PAGE RENDER #${renderCount.current} at ${new Date().toISOString()}`)
  
  // Check if this is a new mount (component was destroyed and recreated)
  const currentTime = Date.now()
  if (currentTime - mountTime.current < 100) {
    console.log(`🚨 AUTOMATION PAGE MOUNTED at ${new Date().toISOString()}`)
    console.trace('Mount stack trace:')
  }
  
  return (
    <div className="fixed top-4 right-4 bg-red-500 text-white px-3 py-1 rounded text-xs z-50">
      Renders: {renderCount.current} | Mount: {new Date(mountTime.current).toLocaleTimeString()}
    </div>
  )
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useToast } from '@/hooks/use-toast'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { useAuth } from '@/hooks/useAuth'
import { saveAutomationState, loadAutomationState, clearAutomationCache, clearUserAutomationCache } from '@/lib/cache'

// AutomationListManager component
const AutomationListManager = ({ 
  automationRules, 
  rulesLoading, 
  updateAutomationMutation, 
  deleteAutomationMutation 
}: {
  automationRules: any[]
  rulesLoading: boolean
  updateAutomationMutation: any
  deleteAutomationMutation: any
}) => {
  const { toast } = useToast()

  const handleToggleActive = async (ruleId: string, isActive: boolean) => {
    try {
      await updateAutomationMutation.mutateAsync({
        ruleId,
        updates: { isActive: !isActive }
      })
      toast({
        title: isActive ? "Automation Paused" : "Automation Resumed",
        description: isActive ? "Your automation has been paused" : "Your automation is now active",
        variant: "default",
      })
    } catch (error) {
      console.error('Error toggling automation:', error)
      toast({
        title: "Error",
        description: "Failed to update automation status",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (ruleId: string) => {
    if (window.confirm('Are you sure you want to delete this automation rule?')) {
      try {
        await deleteAutomationMutation.mutateAsync(ruleId)
        toast({
          title: "Automation Deleted",
          description: "Your automation rule has been successfully deleted",
          variant: "default",
        })
      } catch (error) {
        console.error('Error deleting automation:', error)
        toast({
          title: "Error",
          description: "Failed to delete automation rule",
          variant: "destructive",
        })
      }
    }
  }

  if (rulesLoading) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-64 mb-2 animate-pulse"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-96 animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-6 animate-pulse border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
                  <div>
                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                  </div>
                </div>
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16"></div>
              </div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              Automation Rules
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              Manage and monitor your active automation rules
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {automationRules?.length || 0}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Total Rules
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">
                {automationRules?.filter(rule => rule.isActive).length || 0}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Active
              </div>
            </div>
          </div>
        </div>
      </div>

      {automationRules?.length === 0 ? (
        <div className="text-center py-16">
          <div className="relative">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Bot className="w-12 h-12 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">!</span>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            No automation rules yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
            Create your first automation rule to start engaging with your audience automatically
          </p>
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105">
            <Bot className="w-5 h-5" />
            Create Your First Rule
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {automationRules?.map((rule) => (
            <div key={rule.id} className="group relative bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
              {/* Status Indicator */}
              <div className="absolute top-4 right-4">
                <div className={`w-3 h-3 rounded-full ${
                  rule.isActive 
                    ? 'bg-green-500 animate-pulse' 
                    : 'bg-gray-400'
                }`}></div>
              </div>

              {/* Header */}
              <div className="flex items-start gap-4 mb-6">
                <div className={`p-3 rounded-2xl ${
                  rule.isActive 
                    ? 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30' 
                    : 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800'
                }`}>
                  <Bot className={`w-6 h-6 ${
                    rule.isActive 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-gray-500 dark:text-gray-400'
                  }`} />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    {rule.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 capitalize mb-3">
                    {rule.type} automation
                  </p>
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
                    rule.isActive 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      rule.isActive ? 'bg-green-500' : 'bg-gray-400'
                    }`}></div>
                    {rule.isActive ? 'Active' : 'Paused'}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {rule.keywords?.length || 0}
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    Keywords
                  </div>
                </div>
                <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                  <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                    {rule.targetMediaIds?.length || 0}
                  </div>
                  <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                    Target Posts
                  </div>
                </div>
                <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                  <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                    {(rule.responses?.length || 0) + (rule.dmResponses?.length || 0)}
                  </div>
                  <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                    Responses
                  </div>
                </div>
              </div>

              {/* Keywords Preview */}
              {rule.keywords?.length > 0 && (
                <div className="mb-6">
                  <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Trigger Keywords:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rule.keywords.slice(0, 4).map((keyword: string, index: number) => (
                      <span key={index} className="px-3 py-1 bg-gradient-to-r from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-medium">
                        {keyword}
                      </span>
                    ))}
                    {rule.keywords.length > 4 && (
                      <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-medium">
                        +{rule.keywords.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Created {new Date(rule.createdAt).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(rule.id, rule.isActive)}
                    disabled={updateAutomationMutation.isPending}
                    className={`p-2 rounded-xl transition-all duration-200 ${
                      rule.isActive 
                        ? 'bg-gradient-to-r from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30 text-yellow-600 dark:text-yellow-400 hover:from-yellow-200 hover:to-orange-200 dark:hover:from-yellow-900/50 dark:hover:to-orange-900/50' 
                        : 'bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 text-green-600 dark:text-green-400 hover:from-green-200 hover:to-emerald-200 dark:hover:from-green-900/50 dark:hover:to-emerald-900/50'
                    }`}
                    title={rule.isActive ? 'Pause automation' : 'Resume automation'}
                  >
                    {rule.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => handleDelete(rule.id)}
                    disabled={deleteAutomationMutation.isPending}
                    className="p-2 bg-gradient-to-r from-red-100 to-pink-100 dark:from-red-900/30 dark:to-pink-900/30 text-red-600 dark:text-red-400 rounded-xl hover:from-red-200 hover:to-pink-200 dark:hover:from-red-900/50 dark:hover:to-pink-900/50 transition-all duration-200"
                    title="Delete automation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Add this component after the existing components but before the main AutomationStepByStep component
// Define interfaces for comment structure
interface CommentReply {
  id: number;
  username: string;
  profilePic: string;
  timestamp: string;
  content: string;
  likes: number;
}

interface Comment {
  id: number;
  username: string;
  profilePic: string;
  timestamp: string;
  isAuthor: boolean;
  content: string;
  likes: number;
  replies: CommentReply[];
}

const CommentScreen = ({ isVisible, onClose, triggerKeywords, automationType, commentReplies, dmMessage, selectedAccount, realAccounts, newKeyword, commentInputText, setCommentInputText, getCurrentKeywords, setSelectedKeywords, updateSourceRef, currentTime }: {
  isVisible: boolean;
  onClose: () => void;
  triggerKeywords: string[]
  automationType: string
  commentReplies: string[]
  dmMessage: string
  selectedAccount: string
  realAccounts: any[]
  newKeyword: string
  commentInputText: string
  setCommentInputText: (text: string) => void
  getCurrentKeywords: () => string[]
  setSelectedKeywords: (keywords: string[]) => void
  updateSourceRef: React.MutableRefObject<'trigger' | 'comment' | null>
  currentTime: Date
}) => {
  const [commentText, setCommentText] = useState('');
  const { user, loading: authLoading } = useAuth();

  // Custom CSS to completely remove focus styles
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .comment-input-no-focus:focus {
        outline: none !important;
        border: none !important;
        box-shadow: none !important;
        border-width: 0 !important;
        border-style: none !important;
        border-color: transparent !important;
      }
      .comment-input-no-focus:focus-visible {
        outline: none !important;
        border: none !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Bidirectional synchronization between newKeyword and commentText
  useEffect(() => {
    // Only sync from newKeyword to commentText when newKeyword changes from external source
    if (newKeyword !== commentText && newKeyword !== commentInputText) {
      setCommentText(newKeyword);
      setCommentInputText(newKeyword);
    }
  }, [newKeyword]);

  // Synchronize commentText changes back to parent component only when user types in comment input
  useEffect(() => {
    if (commentText !== commentInputText) {
      // Set the source to indicate this update came from the comment input
      updateSourceRef.current = 'comment';
      setCommentInputText(commentText);
      // Reset the source after a short delay
      setTimeout(() => updateSourceRef.current = null, 100);
    }
  }, [commentText]);

  // Generate realistic timestamps
  const generateTimestamp = () => {
    const now = new Date();
    const hoursAgo = Math.floor(Math.random() * 24) + 1;
    const timeAgo = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    
    if (hoursAgo === 1) return '1h';
    if (hoursAgo < 24) return `${hoursAgo}h`;
    
    const daysAgo = Math.floor(hoursAgo / 24);
    if (daysAgo === 1) return '1d';
    return `${daysAgo}d`;
  };
  
  // Function to fetch real Instagram user data
  const fetchRealInstagramUser = async () => {
    try {
      // Get the current workspace ID from the selected account
      const selectedAccountData = realAccounts.find((a: any) => a.id === selectedAccount);
      const workspaceId = selectedAccountData?.workspaceId;
      
      if (!workspaceId) {
        console.warn('No workspace ID found, using fallback data');
        return {
          username: 'rahulc1020',
          profilePic: 'https://picsum.photos/40/40?random=rahulc1020'
        };
      }

      // Fetch real Instagram user data from the API
      try {
        // Get the user's authentication token
        if (!user) {
          console.warn('No authenticated user found, using fallback data');
          return {
            username: 'rahulc1020',
            profilePic: 'https://picsum.photos/40/40?random=rahulc1020'
          };
        }
        
        const token = await user.getIdToken();
        
        const response = await fetch(`/api/instagram/user-profile?workspaceId=${workspaceId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include',
          mode: 'cors'
        });
        
        if (response.ok) {
          const userData = await response.json();
          
          const result = {
            username: userData.username || 'rahulc1020',
            profilePic: userData.profile_picture_url || 'https://picsum.photos/40/40?random=rahulc1020'
          };
          return result;
        } else {
          const errorText = await response.text();
          console.error('API response not ok:', errorText);
        }
      } catch (fetchError) {
        console.error('Fetch error:', fetchError);
        throw fetchError;
      }
    } catch (error) {
      console.error('Failed to fetch Instagram user data:', error);
    }
    
    // Fallback to default data if API fails
    return {
      username: 'rahulc1020',
      profilePic: 'https://picsum.photos/40/40?random=rahulc1020'
    };
  };

  // State for real Instagram user data
  const [realInstagramUser, setRealInstagramUser] = useState({
    username: 'rahulc1020',
    profilePic: 'https://picsum.photos/40/40?random=rahulc1020'
  });

  // Fetch real Instagram user data when component mounts or dependencies change
  useEffect(() => {
    const fetchUser = async () => {
      const userData = await fetchRealInstagramUser();
      setRealInstagramUser(userData);
    };
    
    // Only fetch if user is authenticated and not loading, and we have the required data
    if (!authLoading && user && selectedAccount && realAccounts.length > 0) {
      fetchUser();
    }
  }, [user, authLoading, selectedAccount, realAccounts]); // Dependencies for re-fetching

  const [commentTimestamps, setCommentTimestamps] = useState<{ [key: string]: { main: Date; reply: Date } }>({});

  // Generate timestamps for new keywords only when they're added
  useEffect(() => {
    const newTimestamps: { [key: string]: { main: Date; reply: Date } } = {};
    
    triggerKeywords.forEach((keyword, index) => {
      if (!commentTimestamps[keyword]) {
        const now = new Date();
        let mainCommentTime: Date;
        let replyTime: Date;
        
        if (index === 0) {
          // First keyword: very recent (just now or few seconds ago)
          mainCommentTime = new Date(now.getTime() - (Math.random() * 30 + 5) * 1000); // 5-35 seconds ago
          replyTime = new Date(now.getTime() - (Math.random() * 20 + 2) * 1000); // 2-22 seconds ago
        } else if (index === 1) {
          // Second keyword: few minutes ago
          mainCommentTime = new Date(now.getTime() - (Math.random() * 10 + 1) * 60 * 1000); // 1-11 minutes ago
          replyTime = new Date(now.getTime() - (Math.random() * 5 + 1) * 60 * 1000); // 1-6 minutes ago
        } else if (index === 2) {
          // Third keyword: few minutes ago
          mainCommentTime = new Date(now.getTime() - (Math.random() * 15 + 2) * 60 * 1000); // 2-17 minutes ago
          replyTime = new Date(now.getTime() - (Math.random() * 10 + 1) * 60 * 1000); // 1-11 minutes ago
        } else {
          // Other keywords: still recent, under 30 minutes
          mainCommentTime = new Date(now.getTime() - (Math.random() * 20 + 5) * 60 * 1000); // 5-25 minutes ago
          replyTime = new Date(now.getTime() - (Math.random() * 15 + 2) * 60 * 1000); // 2-17 minutes ago
        }
        
        newTimestamps[keyword] = { main: mainCommentTime, reply: replyTime };
      }
    });
    
    if (Object.keys(newTimestamps).length > 0) {
      setCommentTimestamps(prev => ({ ...prev, ...newTimestamps }));
    }
  }, [triggerKeywords, commentTimestamps]);

  // Function to calculate relative time like Instagram with reduced fluctuation
  const getRelativeTime = (timestamp: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - timestamp.getTime()) / 1000);
    
    if (diffInSeconds < 60) {
      if (diffInSeconds < 10) return 'just now';
      // Round to nearest 5 seconds for recent timestamps to reduce fluctuation
      const roundedSeconds = Math.floor(diffInSeconds / 5) * 5;
      return `${roundedSeconds}s`;
    }
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      // Round to nearest minute for recent timestamps
      if (diffInMinutes < 5) return `${diffInMinutes}m`;
      return `${diffInMinutes}m`;
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours}h`;
    }
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
      return `${diffInDays}d`;
    }
    
    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) {
      return `${diffInWeeks}w`;
    }
    
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
      return `${diffInMonths}mo`;
    }
    
    const diffInYears = Math.floor(diffInDays / 365);
    return `${diffInYears}y`;
  };

  // Generate test comments with stable timestamps
  const testComments = useMemo(() => {
    if (triggerKeywords.length === 0) {
      return [{
        id: 1,
        username: 'Username',
        profilePic: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNGNUY1RjUiIHN0cm9rZT0iI0Q5RDlEOSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz4KPGNpcmNsZSBjeD0iMjAiIGN5PSIxNiIgcj0iNC41IiBmaWxsPSIjOUNBNEFCIi8+CjxwYXRoIGQ9Ik0yOCAyN0MyOCAyNC4yNjk3IDI0LjQxODMgMjIgMjAgMjJDMTUuNTgxNyAyMiAxMiAyNC4yNjk3IDEyIDI3SDI4WiIgZmlsbD0iIzlDQTRBQiIvPgo8L3N2Zz4K',
        content: 'Please add trigger keywords to see how the automation will work.',
        timestamp: new Date(new Date().getTime() - 5 * 60 * 1000), // 5 minutes ago
        likes: 0,
        replies: []
      }];
    }

    return triggerKeywords.map((keyword, index) => {
      // Use stable timestamps from commentTimestamps state
      const timestamps = commentTimestamps[keyword];
      const mainCommentTime = timestamps?.main || new Date();
      const replyTime = timestamps?.reply || new Date();
      
      return {
        id: index + 1,
        username: `Username_${index + 1}`,
        profilePic: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIxNiIgcj0iNC41IiBmaWxsPSIjOUNBNEFCIi8+CjxwYXRoIGQ9Ik0yOCAyN0MyOCAyNC4yNjk3IDI0LjQxODMgMjIgMjAgMjJDMTUuNTgxNyAyMiAxMiAyNC4yNjk3IDEyIDI3SDI4WiIgZmlsbD0iIzlDQTRBQiIvPgo8L3N2Zz4K',
        content: keyword,
        timestamp: mainCommentTime,
        likes: 0,
        replies: [
          {
            id: index + 1,
            username: realInstagramUser.username,
            profilePic: realInstagramUser.profilePic,
            content: commentReplies[index % commentReplies.length] || 'Message sent!',
            timestamp: replyTime,
            likes: 0
          }
        ]
      };
    });
  }, [triggerKeywords, commentTimestamps, realInstagramUser]);

  return (
    <div 
      className={`absolute inset-0 bg-black/50 z-40 transition-all duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onClose}
    >
      <div 
        className={`absolute left-0 right-0 bg-white dark:bg-gray-800 rounded-t-3xl transition-transform duration-300 ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
        onClick={(e) => e.stopPropagation()}
        style={{ 
          height: '80%',
          bottom: '0',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Handle Bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-gray-300 rounded-full"></div>
        </div>
        
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 transition-colors duration-300">
          <div className="flex items-center justify-center">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-xl">Comments</h3>
          </div>
        </div>
        
        {/* Comments List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Show message when automation type is not properly configured */}
          {(!automationType || automationType === 'comment_only' || automationType === '') && (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="text-center max-w-sm mx-auto">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-base leading-relaxed">
                  Please configure your automation type first to see comment previews
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
                  Go back and select an automation type to continue
                </p>
              </div>
            </div>
          )}
          
          {/* Show keyword guidance message when no trigger keywords */}
          {automationType && automationType !== 'comment_only' && automationType !== '' && triggerKeywords.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="text-center max-w-sm mx-auto">
                {automationType === 'comment_dm' && (
                  <>
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-100 to-indigo-200 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-full flex items-center justify-center">
                      <Hash className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">🚀 Ready to Automate!</h4>
                    <p className="text-blue-700 dark:text-blue-300 text-sm leading-relaxed">
                      Add trigger keywords to see how your automation will work. When someone comments with these words, 
                      your bot will automatically respond with your configured message!
                    </p>
                  </>
                )}
                {automationType === 'dm_only' && (
                  <>
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-purple-100 to-pink-200 dark:from-purple-900/30 dark:to-pink-900/30 rounded-full flex items-center justify-center">
                      <MessageSquare className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-purple-900 dark:text-purple-100 mb-2">💬 Start the Conversation!</h4>
                    <p className="text-purple-700 dark:text-purple-300 text-sm leading-relaxed">
                      Add trigger keywords to see how your automation will work. When someone comments with these words, 
                      your bot will automatically send them a direct message!
                    </p>
                  </>
                )}
                {automationType === 'comment_only' && (
                  <>
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-green-100 to-emerald-200 dark:from-green-900/30 dark:to-emerald-900/30 rounded-full flex items-center justify-center">
                      <MessageCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                    </div>
                    <h4 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-2">✨ Engage Your Audience!</h4>
                    <p className="text-green-700 dark:text-green-300 text-sm leading-relaxed">
                      Add trigger keywords to see how your automation will work. When someone comments with these words, 
                      your bot will automatically respond with your configured comment!
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
          
          {/* Show comments when automation type is properly selected and keywords exist */}
          {automationType && automationType !== 'comment_only' && automationType !== '' && triggerKeywords.length > 0 && testComments.map((comment) => (
            <div key={comment.id} className="mb-6 pb-0">
              {/* Main Comment */}
              <div className="flex gap-3">
                {/* Profile Picture - Left side */}
                <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 flex items-start">
                  <img 
                    src={comment.profilePic} 
                    alt={comment.username}
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Comment Content Block - Right side */}
                <div className="flex-1 min-w-0">
                  {/* Username, Timestamp, Comment Text, and Like Button */}
                  <div className="flex items-start justify-between mb-3">
                    {/* Left side - Username, Timestamp, and Comment Text */}
                    <div className="flex-1 min-w-0">
                      {/* Username and Timestamp on first line */}
                      <div className="flex items-baseline gap-2 mb-1">
                                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-none">{comment.username}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 leading-none">{getRelativeTime(comment.timestamp)}</span>
                      </div>
                      {/* Comment text on second line */}
                      <span className="text-sm text-gray-900 dark:text-gray-100 leading-none block">{comment.content}</span>
                    </div>
                    
                    {/* Right side - Like Button and Count - Aligned with username */}
                    <div className="flex flex-col items-center gap-0.5 ml-3">
                      <button className="flex items-center justify-center hover:opacity-80 transition-opacity p-0 focus:outline-none focus:ring-0 focus:border-0">
                        <Heart className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                      <span className="text-xs text-gray-500 font-normal leading-none">{comment.likes}</span>
                    </div>
                  </div>
                  
                  {/* Actions Row - Below comment text */}
                  <div className="flex items-center gap-4">
                    <button className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors leading-none focus:outline-none focus:ring-0 focus:border-0">Reply</button>
                    <button className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors leading-none focus:outline-none focus:ring-0 focus:border-0">See translation</button>
                  </div>
                  
                  {/* Replies - Only show one reply per comment */}
                  {comment.replies.length > 0 && (
                                         <div className="mt-6 ml-0">
                      {comment.replies.map((reply) => (
                        <div key={reply.id} className="flex gap-3 mb-0 pb-0">
                          {/* Reply Profile Picture - Left side */}
                          <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0 flex items-start">
                            <img 
                              src={reply.profilePic} 
                              alt={reply.username}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          
                          {/* Reply Content Block - Right side */}
                          <div className="flex-1 min-w-0">
                            {/* Reply Username, Timestamp, Reply Text, and Like Button */}
                            <div className="flex items-start justify-between mb-2">
                              {/* Left side - Username, Timestamp, and Reply Text */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start gap-1.5 mb-1">
                                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 leading-none">{reply.username}</span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 leading-none">{getRelativeTime(reply.timestamp)}</span>
                                </div>
                                <span className="text-sm text-gray-900 dark:text-gray-100 leading-none block">{reply.content}</span>
                              </div>
                              
                              {/* Right side - Like Button and Count - Aligned with username */}
                              <div className="flex flex-col items-center gap-0.5 ml-3">
                                <button className="flex items-center justify-center hover:opacity-80 transition-opacity p-0 focus:outline-none focus:ring-0 focus:border-0">
                                  <Heart className="w-3.5 h-3.5 text-gray-400" />
                                </button>
                                <span className="text-xs text-gray-500 font-normal leading-none">{reply.likes}</span>
                              </div>
                            </div>
                            
                            {/* Reply Actions Row - Below reply text */}
                            <div className="flex items-center gap-4">
                              <button className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors leading-none focus:outline-none focus:ring-0 focus:border-0">Reply</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Comment Input */}
        <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 mt-auto transition-colors duration-300">
          <div className="flex gap-3">
            {/* User Avatar - Left side */}
            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center">
              <img 
                src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNGNUY1RjUiIHN0cm9rZT0iI0Q5RDlEOSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz4KPGNpcmNsZSBjeD0iMjAiIGN5PSIxNiIgcj0iNC41IiBmaWxsPSIjOUNBNEFCIi8+CjxwYXRoIGQ9Ik0yOCAyN0MyOCAyNC4yNzk3IDI0LjQxODMgMjIgMjAgMjJDMTUuNTgxNyAyMiAxMiAyNC4yNzk3IDEyIDI3SDI4WiIgZmlsbD0iIzlDQTRBQiIvPgo8L3N2Zz4K" 
                alt="Your profile"
                className="w-full h-full object-cover"
              />
            </div>
            
                        {/* Input Field and Actions Block - Right side */}
            <div className="flex-1 flex items-center justify-center gap-3">
              {/* Input Field */}
              <div className="w-3/4 bg-gray-50 dark:bg-gray-700 rounded-full px-4 py-2 min-h-[36px] flex items-center relative">
                <input
                  type="text"
                  placeholder="Add a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none resize-none pr-12 leading-none focus:outline-none focus:ring-0 focus:border-0 focus:border-transparent focus:shadow-none focus:appearance-none focus:border-none comment-input-no-focus"
                  style={{ 
                    minHeight: '16px',
                    border: 'none !important',
                    outline: 'none !important',
                    boxShadow: 'none !important',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    borderWidth: '0 !important',
                    borderStyle: 'none !important',
                    borderColor: 'transparent !important'
                  }}
                />
              </div>
              
              {/* Post Button - Always visible, disabled when no text */}
              <button 
                className={`w-10 h-10 flex items-center justify-center transition-colors focus:outline-none focus:ring-0 focus:border-0 ${
                  commentText.trim() 
                    ? 'text-blue-500 hover:text-blue-600' 
                    : 'text-gray-400 cursor-not-allowed'
                }`}
                onClick={() => {
                  if (commentText.trim()) {
                    // Add the comment text as a keyword based on automation type
                    if (automationType === 'comment_dm') {
                      if (!keywords.includes(commentText.trim())) {
                        const updatedKeywords = [...keywords, commentText.trim()];
                        setKeywords(updatedKeywords);
                      setSelectedKeywords(updatedKeywords);
                      }
                    } else if (automationType === 'dm_only') {
                      if (!dmKeywords.includes(commentText.trim())) {
                        const updatedKeywords = [...dmKeywords, commentText.trim()];
                        setDmKeywords(updatedKeywords);
                        setSelectedKeywords(updatedKeywords);
                      }
                    } else if (automationType === 'comment_only') {
                      if (!commentKeywords.includes(commentText.trim())) {
                        const updatedKeywords = [...commentKeywords, commentText.trim()];
                        setCommentKeywords(updatedKeywords);
                        setSelectedKeywords(updatedKeywords);
                      }
                    }
                    // Clear both input fields
                    setCommentText('');
                    setCommentInputText('');
                  }
                }}
                disabled={!commentText.trim()}
              >
                <svg 
                  className="w-5 h-5" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" 
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function AutomationStepByStep() {
  console.log('AutomationStepByStep component loaded successfully')
  
  return (
    <>
      <SEO 
        {...seoConfig.automation}
        structuredData={generateStructuredData.softwareApplication()}
      />
      <AutomationStepByStepContent />
    </>
  )
}

function AutomationStepByStepContent() {
  
  // Cache is now persistent and won't interfere with auth
  
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  // Step flow state
  const [currentStep, setCurrentStep] = useState(1)
  const [selectedPlatform, setSelectedPlatform] = useState('')
  const [selectedAccount, setSelectedAccount] = useState('')
  const [contentType, setContentType] = useState('')
  const [automationType, setAutomationType] = useState('')
  const [selectedAutomationType, setSelectedAutomationType] = useState<string>('')
  const [selectedPost, setSelectedPost] = useState<any>(null)
  
  // Get current workspace and user
  const { currentWorkspace } = useCurrentWorkspace()
  const { user, loading: authLoading } = useAuth()



  // Fetch real Instagram accounts for current workspace - seamless loading
  // Using completely unique query key to avoid global webhook invalidations
  const { data: socialAccountsData, isLoading: accountsLoading, isFetching: accountsFetching } = useQuery({
    queryKey: ['automation-social-accounts', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return []
      const response = await apiRequest(`/api/social-accounts?workspaceId=${currentWorkspace.id}`)
      return response
    },
    enabled: !!currentWorkspace?.id,
    staleTime: Infinity, // Never consider data stale - only fetch when explicitly invalidated
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: false, // Don't refetch on component mount if data exists
    placeholderData: (previousData) => previousData, // Keep showing old data while new data loads
    notifyOnChangeProps: ['data'], // Only notify when data changes, not loading states
    // Hide loading states completely and prevent UI disruption
    keepPreviousData: true,
    retry: false, // Don't retry on failure to avoid loading states
    refetchOnReconnect: false, // Don't refetch on reconnect
    // Silent background updates
    refetchInterval: false, // Disable automatic polling (we handle it manually)
    refetchIntervalInBackground: false // Don't refetch when tab is not active
  })

  // Transform real account data with proper null/undefined checks
  const realAccounts = socialAccountsData && Array.isArray(socialAccountsData) ? socialAccountsData.map((account: any) => ({
    id: account.id,
    name: `@${account.username}`,
    followers: `${account.followers} followers`,
    platform: account.platform,
    avatar: account.profilePictureUrl || `https://picsum.photos/40/40?random=${account.id}`,
    workspaceId: account.workspaceId
  })) : []
  
  // Get selected account data for workspace ID
  const selectedAccountData = realAccounts.find((acc: any) => acc.id === selectedAccount)
  
  // Fetch real Instagram posts when account is selected - seamless loading
  // Using completely unique query key to avoid global webhook invalidations
  const { data: postsData, isLoading: postsLoading, isFetching: postsFetching } = useQuery({
    queryKey: ['automation-instagram-content', selectedAccountData?.workspaceId],
    queryFn: async () => {
      if (!selectedAccount || !selectedAccountData?.workspaceId) return []
      
      const response = await apiRequest(`/api/instagram-content?workspaceId=${selectedAccountData.workspaceId}`)
      return response
    },
    enabled: !!selectedAccount && !!socialAccountsData,
    staleTime: Infinity, // Never consider data stale - only fetch when explicitly invalidated
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: false, // Don't refetch on component mount if data exists
    placeholderData: (previousData) => previousData, // Keep showing old data while new data loads
    notifyOnChangeProps: ['data'], // Only notify when data changes, not loading states
    // Hide loading states completely and prevent UI disruption
    keepPreviousData: true,
    retry: false, // Don't retry on failure to avoid loading states
    refetchOnReconnect: false, // Don't refetch on reconnect
    // Silent background updates
    refetchInterval: false, // Disable automatic polling (we handle it manually)
    refetchIntervalInBackground: false // Don't refetch when tab is not active
  })
  
  // Note: Removed real-time metrics query to eliminate WebSocket usage in automation page
  
  // Store video state to prevent restarting during data updates
  const videoStateRef = useRef<{ currentTime: number; isPlaying: boolean; isPaused: boolean } | null>(null);
  const [isUpdatingData, setIsUpdatingData] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Note: Removed automatic selectedPost updates to prevent page refreshes
  // selectedPost will remain static to avoid any refresh triggers

  // Note: Removed video state restoration to prevent refresh triggers

  // Note: Removed automatic polling to prevent page refreshes
  // Data will only update when explicitly triggered by user actions or webhook events
  
  // Create automation rule mutation
  const createAutomationMutation = useMutation({
    mutationFn: async (automationData: any) => {
      return await apiRequest('/api/automation/rules', {
        method: 'POST',
        body: JSON.stringify(automationData)
      })
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Automation rule created successfully",
      })
      // Refetch the rules to show the new rule
      refetchRules()
      // Reset form or redirect
      setCurrentStep(1)
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create automation rule",
        variant: "destructive",
      })
    }
  })
  
  // Automation-specific states
  const [keywords, setKeywords] = useState<string[]>([])
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([])
  const [newKeyword, setNewKeyword] = useState('')
  const [commentReply, setCommentReply] = useState('')
  const [dmMessage, setDmMessage] = useState('')
  const [showAutomationList, setShowAutomationList] = useState(false)

  // Fetch existing automation rules
  // Using completely unique query key to avoid global webhook invalidations
  const { data: automationRules, isLoading: rulesLoading, refetch: refetchRules } = useQuery({
    queryKey: ['automation-rules', realAccounts?.[0]?.workspaceId],
    queryFn: async () => {
      const workspaceId = realAccounts?.[0]?.workspaceId
      if (!workspaceId) return []
      const response = await apiRequest(`/api/automation/rules?workspaceId=${workspaceId}`)
      return response.rules || []
    },
    enabled: !!realAccounts?.[0]?.workspaceId,
    staleTime: Infinity, // Never consider data stale - only fetch when explicitly invalidated
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: false, // Don't refetch on component mount if data exists
    placeholderData: (previousData) => previousData, // Keep showing old data while new data loads
    notifyOnChangeProps: ['data'], // Only notify when data changes, not loading states
    // Hide loading states completely and prevent UI disruption
    keepPreviousData: true,
    retry: false, // Don't retry on failure to avoid loading states
    refetchOnReconnect: false, // Don't refetch on reconnect
    // Silent background updates
    refetchInterval: false, // Disable automatic polling (we handle it manually)
    refetchIntervalInBackground: false // Don't refetch when tab is not active
  })

  // Mutation for updating automation rules
  const updateAutomationMutation = useMutation({
    mutationFn: async ({ ruleId, updates }: { ruleId: string, updates: any }) => {
      return await apiRequest(`/api/automation/rules/${ruleId}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      })
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Automation rule updated successfully",
      })
      refetchRules()
    }
  })

  // Mutation for deleting automation rules
  const deleteAutomationMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      return await apiRequest(`/api/automation/rules/${ruleId}`, {
        method: 'DELETE'
      })
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Automation rule deleted successfully",
      })
      refetchRules()
    }
  })
  
  // Function to create automation rule
  const createAutomationRule = async () => {
    if (!selectedAccount || !selectedPost || !automationType) {
      toast({
        title: "Error",
        description: "Please complete all required fields",
        variant: "destructive",
      })
      return
    }

    // Get the workspace ID from selected account data
    const selectedAccountData = realAccounts.find((acc: any) => acc.id === selectedAccount)
    const workspaceId = selectedAccountData?.workspaceId
    if (!workspaceId) {
      toast({
        title: "Error",
        description: "No workspace found for selected account.",
        variant: "destructive",
      })
      return
    }

    // Get current keywords and responses based on automation type
    const currentKeywords = getCurrentKeywords()
    const currentResponses = getCurrentResponses()
    
    // NEW SYSTEM FORMAT - matches what the new-automation-system.ts expects
    const ruleData = {
      name: `${automationType === 'comment_only' ? 'Comment' : automationType === 'dm_only' ? 'DM' : 'Comment to DM'} Automation`,
      workspaceId: workspaceId,
      type: automationType, // Use exact automation type (comment_dm, dm_only, comment_only)
      keywords: currentKeywords,
             targetMediaIds: selectedPost ? [selectedPost.id] : [],
      responses: currentResponses,
      isActive: true
    }

    try {
      console.log('Creating automation rule with data:', ruleData)
      await createAutomationMutation.mutateAsync(ruleData)
    } catch (error: any) {
      console.error('Error creating automation rule:', error)
      console.error('Error details:', error.response?.data || error)
    }
  }
  const [previewComment, setPreviewComment] = useState('Amazing content! info please!')
  
  // Multiple comment replies and delay settings
  const [commentReplies, setCommentReplies] = useState(['Message sent!', 'Found it? 😊', 'Sent just now! ⏰'])
  const [commentDelay, setCommentDelay] = useState(15)
  const [commentDelayUnit, setCommentDelayUnit] = useState('minutes')
  
  // DM configuration fields
  const [dmButtonText, setDmButtonText] = useState('See products')
  const [dmWebsiteUrl, setDmWebsiteUrl] = useState('')
  
  // DM-only automation
  const [dmKeywords, setDmKeywords] = useState<string[]>([])
  const [dmAutoReply, setDmAutoReply] = useState('')
  
  // Comment-only automation
  const [commentKeywords, setCommentKeywords] = useState<string[]>([])
  const [publicReply, setPublicReply] = useState('')
  
  // New state for comment input synchronization
  const [commentInputText, setCommentInputText] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const updateSourceRef = useRef<'trigger' | 'comment' | null>(null);
  
  // Note: Removed automatic timestamp updates to prevent page refreshes
  // Timestamps will be static to avoid any refresh triggers
  
  // Remove focus outlines from all buttons globally
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      button:focus {
        outline: none !important;
        box-shadow: none !important;
        border: none !important;
      }
      button:focus-visible {
        outline: none !important;
        box-shadow: none !important;
        border: none !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  
  // Synchronize commentInputText changes back to newKeyword
  useEffect(() => {
    // Only update newKeyword when commentInputText changes from CommentScreen
    // Don't update if it's the same value to prevent feedback loop
    if (commentInputText !== newKeyword && commentInputText !== '' && updateSourceRef.current === 'comment') {
      setNewKeyword(commentInputText);
    }
  }, [commentInputText]);
  
  // Additional state variables for automation settings
  const [aiPersonality, setAiPersonality] = useState('friendly')
  const [maxRepliesPerDay, setMaxRepliesPerDay] = useState(10)
  const [cooldownPeriod, setCooldownPeriod] = useState(30) // in minutes
  const [activeHours, setActiveHours] = useState({ start: '09:00', end: '17:00' })
  const [activeDays, setActiveDays] = useState([true, true, true, true, true, false, false])
  
  // UI state for dropdowns
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const [contentTypeDropdownOpen, setContentTypeDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Refs for dropdown click outside handling
  const accountDropdownRef = useRef<HTMLDivElement>(null)
  const contentTypeDropdownRef = useRef<HTMLDivElement>(null)
  
  // Helper function to get current keywords based on automation type
  const getCurrentKeywords = () => {
    switch (automationType) {
      case 'comment_dm':
        return keywords
      case 'dm_only':
        return dmKeywords
      case 'comment_only':
        return commentKeywords
      default:
        return keywords
    }
  }

  // Helper function to get current responses based on automation type
  const getCurrentResponses = () => {
    switch (automationType) {
      case 'comment_dm':
        return {
          responses: commentReplies.filter(reply => reply.trim().length > 0),
          dmResponses: dmMessage ? [dmMessage] : []
        }
      case 'dm_only':
        return {
          responses: [],
          dmResponses: dmAutoReply ? [dmAutoReply] : []
        }
      case 'comment_only':
        return {
          responses: publicReply ? [publicReply] : [],
          dmResponses: []
        }
      default:
        return {
          responses: [],
          dmResponses: []
        }
    }
  }
  

  
  // Modern dropdown states
  const [automationTypeDropdownOpen, setAutomationTypeDropdownOpen] = useState(false)
  
  // Refs for dropdown management
  const automationTypeDropdownRef = useRef<HTMLDivElement>(null)
  
  // Load cached state on component mount - with validation
  useEffect(() => {
    if (!user?.uid) return; // Wait for user to be available
    
    const cachedState = loadAutomationState(user.uid)
    if (cachedState) {
      console.log('Loading cached automation state for user:', user.uid, cachedState)
      
      // Validate cached account against current user's accounts
      if (cachedState.selectedAccount && realAccounts.length > 0) {
        const isValidAccount = realAccounts.some((account: any) => account.id === cachedState.selectedAccount)
        if (isValidAccount) {
          setSelectedAccount(cachedState.selectedAccount)
        } else {
          console.log('Cached account is no longer valid, clearing cache')
          clearUserAutomationCache(user.uid)
        }
      } else if (cachedState.selectedAccount && realAccounts.length === 0) {
        console.log('No social accounts found, clearing cache')
        clearUserAutomationCache(user.uid)
      }
      
      // Always restore content type if valid
      if (cachedState.contentType) setContentType(cachedState.contentType)
    } else {
      console.log('No cached automation state found for user:', user.uid)
    }
  }, [user?.uid]) // Only depend on user ID to prevent refreshes

  // Save state to cache whenever important values change
  useEffect(() => {
    if (!user?.uid) return; // Wait for user to be available
    
    // Only save to cache if we have meaningful data
    if (selectedAccount || contentType) {
      const stateToCache = {
        selectedAccount,
        contentType
      }
      
      saveAutomationState(stateToCache, user.uid)
      console.log('Automation state saved to cache for user:', user.uid, stateToCache)
    }
  }, [
    user?.uid,
    selectedAccount,
    contentType
  ])

  // Cache is now persistent - no monitoring needed
  
  // Handle click outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(event.target as Node)) {
        setAccountDropdownOpen(false)
      }
      if (contentTypeDropdownRef.current && !contentTypeDropdownRef.current.contains(event.target as Node)) {
        setContentTypeDropdownOpen(false)
      }
      if (automationTypeDropdownRef.current && !automationTypeDropdownRef.current.contains(event.target as Node)) {
        setAutomationTypeDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])
  
  const platforms = [
    { id: 'instagram', name: 'Instagram', icon: <Instagram className="w-5 h-5" />, color: 'bg-pink-500' },
    { id: 'youtube', name: 'YouTube', icon: <Youtube className="w-5 h-5" />, color: 'bg-red-600' },
    { id: 'tiktok', name: 'TikTok', icon: <PlayCircle className="w-5 h-5" />, color: 'bg-black' },
    { id: 'twitter', name: 'Twitter', icon: <Twitter className="w-5 h-5" />, color: 'bg-blue-400' },
    { id: 'facebook', name: 'Facebook', icon: <Facebook className="w-5 h-5" />, color: 'bg-blue-600' },
    { id: 'linkedin', name: 'LinkedIn', icon: <Linkedin className="w-5 h-5" />, color: 'bg-blue-700' }
  ]

  const getContentTypesByPlatform = (platform: any) => {
    switch (platform) {
      case 'instagram':
        return [
          { id: 'post', name: 'Post', icon: <Camera className="w-5 h-5" />, description: 'Regular Instagram posts', color: 'bg-blue-500' },
          { id: 'reel', name: 'Reel', icon: <PlayCircle className="w-5 h-5" />, description: 'Instagram Reels', color: 'bg-purple-500' },
          { id: 'story', name: 'Story', icon: <Eye className="w-5 h-5" />, description: 'Instagram Stories', color: 'bg-green-500' }
        ]
      case 'youtube':
        return [
          { id: 'video', name: 'Video', icon: <PlayCircle className="w-5 h-5" />, description: 'YouTube Videos', color: 'bg-red-500' },
          { id: 'short', name: 'Short', icon: <Camera className="w-5 h-5" />, description: 'YouTube Shorts', color: 'bg-orange-500' },
          { id: 'live', name: 'Live Stream', icon: <Eye className="w-5 h-5" />, description: 'YouTube Live Streams', color: 'bg-red-600' }
        ]
      case 'tiktok':
        return [
          { id: 'video', name: 'Video', icon: <PlayCircle className="w-5 h-5" />, description: 'TikTok Videos', color: 'bg-gray-800' },
          { id: 'live', name: 'Live', icon: <Eye className="w-5 h-5" />, description: 'TikTok Live', color: 'bg-gray-600' }
        ]
      case 'twitter':
        return [
          { id: 'tweet', name: 'Tweet', icon: <MessageCircle className="w-5 h-5" />, description: 'Twitter Posts', color: 'bg-blue-400' },
          { id: 'thread', name: 'Thread', icon: <MessageSquare className="w-5 h-5" />, description: 'Twitter Threads', color: 'bg-blue-500' }
        ]
      case 'facebook':
        return [
          { id: 'post', name: 'Post', icon: <Camera className="w-5 h-5" />, description: 'Facebook Posts', color: 'bg-blue-600' },
          { id: 'story', name: 'Story', icon: <Eye className="w-5 h-5" />, description: 'Facebook Stories', color: 'bg-blue-500' },
          { id: 'reel', name: 'Reel', icon: <PlayCircle className="w-5 h-5" />, description: 'Facebook Reels', color: 'bg-blue-700' }
        ]
      case 'linkedin':
        return [
          { id: 'post', name: 'Post', icon: <Camera className="w-5 h-5" />, description: 'LinkedIn Posts', color: 'bg-blue-700' },
          { id: 'article', name: 'Article', icon: <FileText className="w-5 h-5" />, description: 'LinkedIn Articles', color: 'bg-blue-600' }
        ]
      default:
        return []
    }
  }

  const automationTypes = [
    { 
      id: 'comment_dm', 
      name: 'Comment → DM', 
      icon: <MessageCircle className="w-5 h-5" />, 
      description: 'Reply to comments publicly, then send private DM',
      color: 'bg-blue-500'
    },
    { 
      id: 'dm_only', 
      name: 'DM Only', 
      icon: <Send className="w-5 h-5" />, 
      description: 'Send direct messages only (no public replies)',
      color: 'bg-purple-500'
    },
    { 
      id: 'comment_only', 
      name: 'Comment Only', 
      icon: <MessageCircle className="w-5 h-5" />, 
      description: 'Reply to comments publicly only',
      color: 'bg-green-500'
    }
  ]

  // Test if video URL is accessible
  const testVideoUrl = async (url: string, postId: string) => {
    if (!url) return false;
    try {
      console.log(`🔍 Testing video URL accessibility for post ${postId}:`, url);
      const response = await fetch(url, { method: 'HEAD' });
      console.log(`✅ Video URL test result for post ${postId}:`, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });
      return response.ok;
    } catch (error) {
      console.log(`❌ Video URL test failed for post ${postId}:`, error);
      return false;
    }
  };

  // Note: Removed real-time metrics debugging to eliminate WebSocket usage in automation page

  // Note: Removed debug useEffect to prevent refresh triggers

  // Note: Removed debug useEffect to prevent refresh triggers

  // Transform real posts data with real-time metrics integration and proper null/undefined checks
  const realPosts = postsData && Array.isArray(postsData) ? postsData.map((post: any) => {
    console.log('Processing post data:', post); // Debug log
    
    // Map Instagram content types properly
    let mappedType = 'post';
    if (post.type === 'reel' || post.type === 'video') {
      mappedType = 'reel'; // Both reels and videos should show as reels for automation
    } else if (post.type === 'carousel') {
      mappedType = 'post'; // Carousels are treated as posts
    } else if (post.type === 'story') {
      mappedType = 'story';
    }
    
    // Use actual post data (no real-time metrics to avoid WebSocket usage)
    const realtimeLikes = post.likes || post.engagement?.likes || 0;
    const realtimeComments = post.comments || post.engagement?.comments || 0;
    
    return {
      id: post.id,
      title: post.caption ? post.caption.substring(0, 30) + '...' : 'Instagram Post',
      type: mappedType,
      image: post.mediaUrl || post.thumbnailUrl || 'https://picsum.photos/300/300?random=1',
      mediaUrl: post.mediaUrl,
      thumbnailUrl: post.thumbnailUrl,
      likes: realtimeLikes,
      comments: realtimeComments,
      caption: post.caption || 'Instagram post content'
    };
  }) : []

  // Dynamic steps based on automation type
  const getSteps = () => {
    const baseSteps = [
      { id: 1, title: 'Select Setup', description: 'Account, content & post' },
      { id: 2, title: 'Automation Config', description: 'Choose & configure automation' }
    ]
    
    // For comment to DM, add separate comment and DM steps
    if (automationType === 'comment_dm') {
      return [
        ...baseSteps,
        { id: 3, title: 'DM Configuration', description: 'Setup private message' },
        { id: 4, title: 'Advanced Settings', description: 'Fine-tune timing' },
        { id: 5, title: 'Review & Activate', description: 'Review and activate' }
      ]
    }
    
    // For other types, keep original flow
    return [
      ...baseSteps,
      { id: 3, title: 'Advanced Settings', description: 'Fine-tune timing' },
      { id: 4, title: 'Review & Activate', description: 'Review and activate' }
    ]
  }
  
  const steps = getSteps()

  // Function to get content types based on selected platform/account
  const getContentTypesForPlatform = (accountId) => {
    const account = realAccounts.find(acc => acc.id === accountId)
    if (!account) return []
    
    switch (account.platform.toLowerCase()) {
      case 'instagram':
        return [
          { 
            id: 'post', 
            name: 'Post', 
            description: 'Regular feed posts', 
            icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                <polyline points="21,15 16,10 5,21" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
            )
          },
          { 
            id: 'reel', 
            name: 'Reel', 
            description: 'Short video content', 
            icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                <polygon points="10,8 16,12 10,16" fill="currentColor"/>
                <circle cx="12" cy="12" r="1" fill="currentColor"/>
              </svg>
            )
          },
          { 
            id: 'story', 
            name: 'Story', 
            description: '24h disappearing content', 
            icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                <circle cx="12" cy="12" r="2" fill="currentColor"/>
              </svg>
            )
          }
        ]
      case 'youtube':
        return [
          { 
            id: 'video', 
            name: 'Video', 
            description: 'Long-form videos', 
            icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                <polygon points="10,8 16,12 10,16" fill="currentColor"/>
              </svg>
            )
          },
          { 
            id: 'short', 
            name: 'Short', 
            description: 'Vertical short videos', 
            icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="2" width="18" height="20" rx="2" ry="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                <polygon points="8,6 14,12 8,18" fill="currentColor"/>
              </svg>
            )
          }
        ]
      case 'linkedin':
        return [
          { 
            id: 'post', 
            name: 'Post', 
            description: 'Professional updates', 
            icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M9 9h6v6H9z" fill="currentColor"/>
                <path d="M21 15l-3-3-3 3" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
            )
          },
          { 
            id: 'article', 
            name: 'Article', 
            description: 'Long-form content', 
            icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" fill="none"/>
                <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" fill="none"/>
                <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2"/>
                <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2"/>
                <polyline points="10,9 9,9 8,9" stroke="currentColor" strokeWidth="2"/>
              </svg>
            )
          }
        ]
      case 'twitter':
        return [
          { 
            id: 'tweet', 
            name: 'Tweet', 
            description: 'Short messages', 
            icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
            )
          },
          { 
            id: 'thread', 
            name: 'Thread', 
            description: 'Connected tweets', 
            icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M13 8H7" stroke="currentColor" strokeWidth="2"/>
                <path d="M17 12H7" stroke="currentColor" strokeWidth="2"/>
              </svg>
            )
          }
        ]
      default:
        return [
          { 
            id: 'post', 
            name: 'Post', 
            description: 'General content', 
            icon: (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" fill="none"/>
                <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" fill="none"/>
                <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2"/>
                <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2"/>
                <polyline points="10,9 9,9 8,9" stroke="currentColor" strokeWidth="2"/>
              </svg>
            )
          }
        ]
    }
  }

  const addKeyword = () => {
    if (newKeyword.trim()) {
      if (!keywords.includes(newKeyword.trim())) {
        const updatedKeywords = [...keywords, newKeyword.trim()]
        setKeywords(updatedKeywords)
        setSelectedKeywords(updatedKeywords) // Update selected keywords for comment screen
        setNewKeyword('')
        setCommentInputText('') // Clear comment input text as well
        
        // Show comment screen for comment_dm automation when keywords are added AND automation type is selected
        if (automationType && automationType === 'comment_dm' && updatedKeywords.length === 1) {
          setShowCommentScreen(true)
        }
      }
    }
  }

  const removeKeyword = (index) => {
    const updatedKeywords = keywords.filter((_, i) => i !== index)
    setKeywords(updatedKeywords)
    setSelectedKeywords(updatedKeywords) // Update selected keywords for comment screen
  }

  const addDmKeyword = () => {
    if (newKeyword.trim()) {
      if (!dmKeywords.includes(newKeyword.trim())) {
        const updatedKeywords = [...dmKeywords, newKeyword.trim()]
        setDmKeywords(updatedKeywords)
        setSelectedKeywords(updatedKeywords) // Update selected keywords for comment screen
        setNewKeyword('')
        setCommentInputText('') // Clear comment input text as well
        
        // Show comment screen for dm_only automation when keywords are added
        if (automationType === 'dm_only' && updatedKeywords.length === 1) {
          setShowCommentScreen(true)
        }
      }
    }
  }

  const removeDmKeyword = (index) => {
    const updatedKeywords = dmKeywords.filter((_, i) => i !== index)
    setDmKeywords(updatedKeywords)
    setSelectedKeywords(updatedKeywords) // Update selected keywords for comment screen
  }

  const addCommentKeyword = () => {
    if (newKeyword.trim()) {
      if (!commentKeywords.includes(newKeyword.trim())) {
        const updatedKeywords = [...commentKeywords, newKeyword.trim()]
        setCommentKeywords(updatedKeywords)
        setSelectedKeywords(updatedKeywords) // Update selected keywords for comment screen
        setNewKeyword('')
        setCommentInputText('') // Clear comment input text as well
        
        // Show comment screen for comment_only automation when keywords are added
        if (automationType === 'comment_only' && updatedKeywords.length === 1) {
          setShowCommentScreen(true)
        }
      }
    }
  }

  const removeCommentKeyword = (index) => {
    const updatedKeywords = commentKeywords.filter((_, i) => i !== index)
    setCommentKeywords(updatedKeywords)
    setSelectedKeywords(updatedKeywords) // Update selected keywords for comment screen
  }





  const canProceedToNext = () => {
    switch (currentStep) {
      case 1:
        return selectedAccount && contentType && selectedPost !== null
      case 2:
        // For comment_dm automation, require keywords and at least one comment reply
        if (automationType === 'comment_dm') {
          return automationType && getCurrentKeywords().length > 0 && commentReplies.some(reply => reply.trim().length > 0)
        }
        return automationType && getCurrentKeywords().length > 0 // Automation type and keywords required for configuration
      case 3:
        // For comment_dm automation, step 3 is DM configuration - require DM message and button text
        if (automationType === 'comment_dm') {
          return dmMessage.trim().length > 0 && dmButtonText.trim().length > 0
        }
        // For other automation types, step 3 is Advanced settings - optional
        return true
      case 4:
        // For comment_dm automation, step 4 is Advanced settings - optional
        // For other automation types, step 4 is Review step - always allow
        return true
      case 5:
        // Step 5 is only for comment_dm automation - Review step - always allow
        return true
      default:
        return false
    }
  }

  const handleNext = () => {
    if (canProceedToNext() && currentStep < steps.length) {
      // Reset content type when account changes and auto-set platform
      if (currentStep === 1) {
        setContentType('')
        // Auto-set platform based on selected account
        const selectedAccountData = realAccounts.find(a => a.id === selectedAccount)
        if (selectedAccountData) {
          setSelectedPlatform(selectedAccountData.platform.toLowerCase())
        }
      }
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleFinish = async () => {
    // Create the automation rule with real API call
    await createAutomationRule()
    
    // Clear the cache after successful automation creation
    clearAutomationCache()
    console.log('Automation cache cleared after successful creation')
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-8">
            {/* Step 1: Select Account */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                <div className="p-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg shadow-md dark:shadow-blue-500/30">
                  <User className="w-4 h-4 text-white" />
                </div>
                Select Account
              </h3>
              <div className="relative" ref={accountDropdownRef}>
                <button
                  onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                  className="w-full p-4 border-2 border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-400 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-all duration-200 text-gray-800 dark:text-gray-200 font-medium text-left flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-3">
                    {selectedAccount && !accountsLoading && !accountsFetching && (() => {
                      const selectedAcc = realAccounts.find(acc => acc.id === selectedAccount);
                      return selectedAcc ? (
                        <>
                          <img 
                            src={selectedAcc.avatar} 
                            alt={selectedAcc.name}
                            className="w-6 h-6 rounded-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none'
                              const fallback = e.currentTarget.nextElementSibling
                              if (fallback) (fallback as HTMLElement).style.display = 'flex'
                            }}
                          />
                          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500" style={{display: 'none'}}>
                            <span className="text-white text-xs font-bold">
                              {selectedAcc.name?.charAt(1).toUpperCase()}
                            </span>
                          </div>
                        </>
                      ) : null;
                    })()}
                    <span className={selectedAccount ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}>
                      {selectedAccount 
                        ? (() => {
                            const selectedAcc = realAccounts.find((acc: any) => acc.id === selectedAccount);
                            return selectedAcc ? `${selectedAcc.name} • ${selectedAcc.followers} • ${selectedAcc.platform}` : 'Account not found';
                          })()
                        : 'Choose your social media account...'
                      }
                    </span>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${accountDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {accountDropdownOpen && (
                  <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl max-h-60 overflow-y-auto dropdown-enter">
                    <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search accounts..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>
                    <div className="py-1">
                      {realAccounts
                        .filter((account: any) => 
                          account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          account.platform.toLowerCase().includes(searchTerm.toLowerCase())
                        )
                        .map((account: any) => (
                          <button
                            key={account.id}
                            onClick={() => {
                              setSelectedAccount(account.id)
                              setAccountDropdownOpen(false)
                              setSearchTerm('')
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 flex items-center justify-between group"
                          >
                            <div className="flex items-center space-x-3">
                              <img 
                                src={account.avatar} 
                                alt={account.name}
                                className="w-8 h-8 rounded-full object-cover"
                                onError={(e) => {
                                  (e.currentTarget as HTMLElement).style.display = 'none'
                                  const fallback = e.currentTarget.nextElementSibling
                                  if (fallback) (fallback as HTMLElement).style.display = 'flex'
                                }}
                              />
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${account.platform === 'instagram' ? 'bg-gradient-to-r from-purple-500 to-pink-500' : account.platform === 'youtube' ? 'bg-red-500' : 'bg-blue-500'}`} style={{display: 'none'}}>
                                <span className="text-white text-xs font-bold">
                                  {account.name.charAt(1).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <div className="font-medium text-gray-900 dark:text-gray-100">{account.name}</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">{account.followers} • {account.platform}</div>
                              </div>
                            </div>
                            {selectedAccount === account.id && (
                              <Check className="w-4 h-4 text-blue-600" />
                            )}
                          </button>
                        ))
                      }
                      {realAccounts.filter((account: any) => 
                        account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        account.platform.toLowerCase().includes(searchTerm.toLowerCase())
                      ).length === 0 && (
                        <div className="px-4 py-3 text-gray-500 text-sm">No accounts found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Select Content Type (only shown when account is selected) */}
            {selectedAccount && (
              <div className="animate-fadeIn">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                  <div className="p-1.5 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg shadow-md dark:shadow-purple-500/30">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  Select Content Type
                </h3>
                <div className="relative" ref={contentTypeDropdownRef}>
                  <button
                    onClick={() => setContentTypeDropdownOpen(!contentTypeDropdownOpen)}
                    className="w-full p-4 border-2 border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 hover:border-purple-300 dark:hover:border-purple-400 focus:border-purple-500 dark:focus:border-purple-400 focus:outline-none transition-all duration-200 text-gray-800 dark:text-gray-200 font-medium text-left flex items-center justify-between group"
                    disabled={!selectedAccount}
                  >
                    <span className={contentType ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}>
                      {contentType 
                        ? getContentTypesForPlatform(selectedAccount).find(type => type.id === contentType)?.name + ' - ' + getContentTypesForPlatform(selectedAccount).find(type => type.id === contentType)?.description
                        : 'Choose content type for your automation...'
                      }
                    </span>
                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${contentTypeDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {contentTypeDropdownOpen && selectedAccount && (
                    <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl max-h-60 overflow-y-auto dropdown-enter">
                      <div className="py-1">
                        {getContentTypesForPlatform(selectedAccount).map(type => (
                          <button
                            key={type.id}
                            onClick={() => {
                              setContentType(type.id)
                              setContentTypeDropdownOpen(false)
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 flex items-center justify-between group"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white">
                                {type.icon}
                              </div>
                              <div>
                                <div className="font-medium text-gray-900 dark:text-gray-100">{type.name}</div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">{type.description}</div>
                              </div>
                            </div>
                            {contentType === type.id && (
                              <Check className="w-4 h-4 text-purple-600" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Select Post (only shown when content type is selected) */}
            {selectedAccount && contentType && (
              <div className="animate-fadeIn">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                  <div className="p-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg shadow-md dark:shadow-emerald-500/30">
                    <Eye className="w-4 h-4 text-white" />
                  </div>
                  Select Post
                </h3>
                

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {/* Debug info */}


                  {realPosts.filter((post: any) => post.type === contentType).map((post: any) => (
                    <div
                      key={post.id}
                      className={`cursor-pointer rounded-lg border-2 transition-all hover:shadow-md ${
                        selectedPost?.id === post.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                      onClick={() => setSelectedPost(post)}
                    >
                      <div className="p-3">
                      <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-lg mb-2 overflow-hidden">
                          {post.type === 'reel' && post.image ? (
                            // Video player for reels
                            <div className="relative w-full h-full group">
                              {/* Test video URL accessibility */}
                              {(() => {
                                const videoUrl = post.image || post.mediaUrl || post.thumbnailUrl;
                                if (videoUrl) {
                                  testVideoUrl(videoUrl, post.id);
                                }
                                return null;
                              })()}
                              <video
                                src={post.image || post.mediaUrl || post.thumbnailUrl} 
                                className="w-full h-full object-cover"
                                autoPlay
                                muted
                                loop
                                playsInline
                                preload="metadata"
                                poster={post.thumbnailUrl || post.image}
                                onError={(e) => {
                                  console.log('Live preview video error for post:', post.id, e);
                                  console.log('Live preview video error details:', {
                                    error: e.currentTarget.error,
                                    networkState: e.currentTarget.networkState,
                                    readyState: e.currentTarget.readyState,
                                    src: e.currentTarget.src
                                  });
                                  // Fallback to image if video fails
                                  const video = e.currentTarget;
                                  const img = document.createElement('img');
                                  img.src = post.thumbnailUrl || post.image || post.mediaUrl;
                                  img.className = 'w-full h-full object-cover';
                                  img.alt = post.caption || post.title;
                                  video.parentNode?.replaceChild(img, video);
                                }}
                                onLoadStart={() => console.log('Live preview video loading started for post:', post.id)}
                                onCanPlay={() => console.log('Live preview video can play for post:', post.id)}
                                onLoadedMetadata={() => console.log('Live preview video metadata loaded for post:', post.id)}
                                onLoadedData={() => console.log('Live preview video data loaded for post:', post.id)}
                                onProgress={() => console.log('Live preview video progress for post:', post.id)}
                                onStalled={() => console.log('Live preview video stalled for post:', post.id)}
                                onSuspend={() => console.log('Live preview video suspended for post:', post.id)}
                              />
                              
                              {/* Mute/Unmute button - only visible on hover */}
                              <button
                                className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const video = e.currentTarget.parentElement?.querySelector('video');
                                  if (video) {
                                    video.muted = !video.muted;
                                    // Update button icon
                                    const icon = e.currentTarget.querySelector('svg');
                                    if (icon) {
                                      if (video.muted) {
                                        icon.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
                                      } else {
                                        icon.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><line x1="1" y1="1" x2="23" y2="23"/>';
                                      }
                                    }
                                  }
                                }}
                                title="Toggle mute"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                                  <line x1="1" y1="1" x2="23" y2="23"/>
                                </svg>
                              </button>
                              
                              <div className="absolute top-3 left-3 bg-black/50 text-white px-2 py-1 rounded-full text-xs font-medium">
                                🎬 Reel
                              </div>
                            </div>
                          ) : post.image ? (
                          <img 
                            src={post.image} 
                            alt={post.caption || post.title} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to placeholder if image fails
                              e.currentTarget.src = 'https://picsum.photos/300/300?random=1';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Camera className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{post.title}</h4>
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                            <span className="capitalize flex items-center gap-1">
                              {post.type === 'reel' && <PlayCircle className="w-3 h-3 text-purple-500" />}
                              {post.type}
                            </span>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1">
                              <Heart className="w-3 h-3 text-red-500" />
                              <span className="font-medium">{post.likes || 0}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <InstagramCommentIcon className="w-3 h-3 text-blue-500" />
                              <span className="font-medium">{post.comments || 0}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                        </div>
                    </div>
                  ))}
                </div>

                {realPosts.filter((post: any) => post.type === contentType).length === 0 && (
                    <div className="col-span-full text-center py-8 text-gray-500">
                      No {contentType}s found for this account
                    <div className="text-sm text-gray-400 mt-2">
                      Available content: {[...new Set(realPosts.map((p: any) => p.type))].join(', ')}
                    </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        )

      case 2:
        return (
          <div className="space-y-8">
            {/* Step 1: Choose Automation Type */}
            <div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-6 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl shadow-lg dark:shadow-emerald-500/30">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                Choose Automation Type
              </h3>
              <div className="relative" ref={automationTypeDropdownRef}>
                <button
                  onClick={() => setAutomationTypeDropdownOpen(!automationTypeDropdownOpen)}
                  className="w-full p-4 border-2 border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 hover:border-emerald-300 dark:hover:border-emerald-400 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none transition-all duration-200 text-gray-800 dark:text-gray-200 font-medium text-left flex items-center justify-between group"
                >
                  <span className={automationType ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}>
                    {automationType 
                      ? automationTypes.find(type => type.id === automationType)?.name + ' - ' + automationTypes.find(type => type.id === automationType)?.description
                      : 'Select automation type...'
                    }
                  </span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${automationTypeDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {automationTypeDropdownOpen && (
                  <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl max-h-60 overflow-y-auto dropdown-enter">
                    <div className="py-1">
                      {automationTypes.map(type => (
                        <button
                          key={type.id}
                          onClick={() => {
                            setAutomationType(type.id)
                            setSelectedAutomationType(type.id)
                            setAutomationTypeDropdownOpen(false)
                            // Don't show comment screen immediately - wait for keywords to be added
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 flex items-center justify-between group"
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`w-8 h-8 rounded-lg ${type.color} flex items-center justify-center text-white`}>
                              {type.icon}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-gray-100">{type.name}</div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">{type.description}</div>
                            </div>
                          </div>
                          {automationType === type.id && (
                            <Check className="w-4 h-4 text-emerald-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Configuration (appears after automation type selection) */}
            {automationType && (
              <div className="animate-fadeIn">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-6 border border-blue-200 dark:border-blue-600">
                  <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                    <div className="p-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg shadow-md dark:shadow-blue-500/30">
                      <Settings className="w-4 h-4 text-white" />
                    </div>
                    Configuration
                  </h4>
                  {renderAutomationSpecificConfig()}
                </div>
              </div>
            )}
          </div>
        )

      case 3:
        // For comment_dm automation, step 3 is DM configuration
        if (automationType === 'comment_dm') {
          return (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Write a direct message</h3>
                <p className="text-sm text-gray-600 mb-6">Write the DM you want sent when users include your keyword when they comment on your post.</p>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Direct message</label>
                    <p className="text-sm text-gray-600 mb-3">We'll send this DM to the user who included your keyword in their comment.</p>
                    <textarea
                      value={dmMessage}
                      onChange={(e) => setDmMessage(e.target.value)}
                      placeholder="Enter your DM text here"
                      className="w-full p-3 border border-gray-300 rounded-lg"
                      rows={4}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Button text</label>
                    <input
                      type="text"
                      value={dmButtonText}
                      onChange={(e) => setDmButtonText(e.target.value)}
                      placeholder="Choose a short and clear button text"
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Website URL</label>
                    <input
                      type="text"
                      value={dmWebsiteUrl}
                      onChange={(e) => setDmWebsiteUrl(e.target.value)}
                      placeholder="Enter the destination URL for your button"
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        }

        // For other automation types, step 3 is Advanced Settings
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-6 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl shadow-lg dark:shadow-purple-500/30">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                Advanced Settings
              </h3>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Replies per Day</label>
                  <input
                    type="number"
                    value={maxRepliesPerDay}
                    onChange={(e) => setMaxRepliesPerDay(Number(e.target.value))}
                    className="w-full p-3 border border-gray-300 rounded-lg"
                    min="1"
                    max="500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cooldown Period (minutes)</label>
                  <input
                    type="number"
                    value={cooldownPeriod}
                    onChange={(e) => setCooldownPeriod(Number(e.target.value))}
                    className="w-full p-3 border border-gray-300 rounded-lg"
                    min="1"
                    max="1440"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">AI Personality</label>
                <select
                  value={aiPersonality}
                  onChange={(e) => setAiPersonality(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                >
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="casual">Casual</option>
                  <option value="enthusiastic">Enthusiastic</option>
                  <option value="witty">Witty</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Active Start Time</label>
                  <input
                    type="time"
                    value={activeHours.start}
                    onChange={(e) => setActiveHours({...activeHours, start: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Active End Time</label>
                  <input
                    type="time"
                    value={activeHours.end}
                    onChange={(e) => setActiveHours({...activeHours, end: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">Active Days</label>
                <div className="grid grid-cols-7 gap-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => (
                    <button
                      key={day}
                      onClick={() => {
                        const newActiveDays = [...activeDays]
                        newActiveDays[index] = !newActiveDays[index]
                        setActiveDays(newActiveDays)
                      }}
                      className={`p-2 rounded-lg text-sm font-medium transition-all ${
                        activeDays[index]
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )

      case 4:
        // For comment_dm automation, step 4 is Advanced Settings
        if (automationType === 'comment_dm') {
          return (
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-6 flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl shadow-lg dark:shadow-purple-500/30">
                    <Settings className="w-6 h-6 text-white" />
                  </div>
                  Advanced Settings
                </h3>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Max Replies per Day</label>
                    <input
                      type="number"
                      value={maxRepliesPerDay}
                      onChange={(e) => setMaxRepliesPerDay(Number(e.target.value))}
                      className="w-full p-3 border border-gray-300 rounded-lg"
                      min="1"
                      max="500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Cooldown Period (minutes)</label>
                    <input
                      type="number"
                      value={cooldownPeriod}
                      onChange={(e) => setCooldownPeriod(Number(e.target.value))}
                      className="w-full p-3 border border-gray-300 rounded-lg"
                      min="1"
                      max="1440"
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">AI Personality</label>
                  <select
                    value={aiPersonality}
                    onChange={(e) => setAiPersonality(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg"
                  >
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="casual">Casual</option>
                    <option value="enthusiastic">Enthusiastic</option>
                    <option value="witty">Witty</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Active Start Time</label>
                    <input
                      type="time"
                      value={activeHours.start}
                      onChange={(e) => setActiveHours({...activeHours, start: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Active End Time</label>
                    <input
                      type="time"
                      value={activeHours.end}
                      onChange={(e) => setActiveHours({...activeHours, end: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Active Days</label>
                  <div className="grid grid-cols-7 gap-2">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => (
                      <button
                        key={day}
                        onClick={() => {
                          const newActiveDays = [...activeDays]
                          newActiveDays[index] = !newActiveDays[index]
                          setActiveDays(newActiveDays)
                        }}
                        className={`p-2 rounded-lg text-sm font-medium transition-all ${
                          activeDays[index]
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        }
        
        // For other automation types, step 4 is Review & Activate
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-6 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl shadow-lg dark:shadow-amber-500/30">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                Review & Activate
              </h3>
              
              <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-2xl p-6 border border-gray-200">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <span className="text-sm font-medium text-gray-600">Account:</span>
                    <div className="text-lg font-semibold text-gray-900">{realAccounts.find((a: any) => a.id === selectedAccount)?.name || 'Not selected'}</div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Selected Post:</span>
                    <div className="text-lg font-semibold text-gray-900">
                      {selectedPost ? (
                        <span>{selectedPost.type || 'Post'} - {selectedPost.caption ? selectedPost.caption.substring(0, 30) + '...' : 'No caption'}</span>
                      ) : (
                        'Not selected'
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Automation Type:</span>
                    <div className="text-lg font-semibold text-gray-900">{automationTypes.find((t: any) => t.id === automationType)?.name || 'Not selected'}</div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Keywords:</span>
                    <div className="text-lg font-semibold text-gray-900">{getCurrentKeywords().length} keywords</div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Daily Limit:</span>
                    <div className="text-lg font-semibold text-gray-900">{maxRepliesPerDay} replies</div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">AI Personality:</span>
                    <div className="text-lg font-semibold text-gray-900 capitalize">{aiPersonality}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      case 5:
        // Step 5 is only for comment_dm automation - Review & Activate
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-6 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl shadow-lg dark:shadow-amber-500/30">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                Review & Activate
              </h3>
              
              <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-2xl p-6 border border-gray-200">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <span className="text-sm font-medium text-gray-600">Account:</span>
                    <div className="text-lg font-semibold text-gray-900">{realAccounts.find((a: any) => a.id === selectedAccount)?.name || 'Not selected'}</div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Selected Post:</span>
                    <div className="text-lg font-semibold text-gray-900">
                      {selectedPost ? (
                        <span>{selectedPost.type || 'Post'} - {selectedPost.caption ? selectedPost.caption.substring(0, 30) + '...' : 'No caption'}</span>
                      ) : (
                        'Not selected'
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Automation Type:</span>
                    <div className="text-lg font-semibold text-gray-900">{automationTypes.find((t: any) => t.id === automationType)?.name || 'Not selected'}</div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Keywords:</span>
                    <div className="text-lg font-semibold text-gray-900">{getCurrentKeywords().length} keywords</div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Daily Limit:</span>
                    <div className="text-lg font-semibold text-gray-900">{maxRepliesPerDay} replies</div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">AI Personality:</span>
                    <div className="text-lg font-semibold text-gray-900 capitalize">{aiPersonality}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )





      default:
        return null
    }
  }

  const renderAutomationSpecificConfig = () => {
    const currentKeywords = getCurrentKeywords()
    
    switch (automationType) {
      case 'comment_dm':
        return (
          <>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Comment Reply Configuration</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Configure the public comment that will be posted when keywords are detected. DM settings will be configured in the next step.</p>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Trigger Keywords</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="Enter keyword"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={addKeyword}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((keyword, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-2"
                    >
                      {keyword}
                    <button
                        onClick={() => removeKeyword(index)}
                        className="text-blue-600 hover:text-blue-800"
                    >
                        ×
                    </button>
                    </span>
                  ))}
                  </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Comment replies</label>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Write a few different possible responses, and we'll cycle through them so your responses seem more genuine and varied.</p>
                
                <div className="space-y-3 mb-4">
                  {commentReplies.map((reply, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
                      <input
                        type="text"
                        value={reply}
                        onChange={(e) => {
                          const newReplies = [...commentReplies]
                          newReplies[index] = e.target.value
                          setCommentReplies(newReplies)
                        }}
                        placeholder="Enter comment reply..."
                        className="flex-1 p-2 border-0 focus:outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                      <button
                        onClick={() => {
                          const newReplies = commentReplies.filter((_, i) => i !== index)
                          setCommentReplies(newReplies)
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                
                <button
                  onClick={() => setCommentReplies([...commentReplies, ''])}
                  className="w-full p-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add another reply
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Delay before comment</label>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Adding a short delay before responding to comments helps your replies seem more thoughtful and authentic.</p>
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={commentDelay}
                      onChange={(e) => setCommentDelay(Number(e.target.value))}
                      min="1"
                      max="60"
                      className="w-20 p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    <X className="w-4 h-4 text-gray-400" />
                  </div>
                  
                  <select
                    value={commentDelayUnit}
                    onChange={(e) => setCommentDelayUnit(e.target.value)}
                    className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="seconds">Seconds</option>
                    <option value="hours">Hours</option>
                  </select>
                  <X className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
          </>
        )

      case 'dm_only':
        return (
          <>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">DM Only Configuration</h3>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Trigger Keywords</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="Enter keyword"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={addDmKeyword}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {dmKeywords.map((keyword, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm flex items-center gap-2"
                    >
                      {keyword}
                    <button
                        onClick={() => removeDmKeyword(index)}
                        className="text-purple-600 hover:text-purple-800"
                    >
                        ×
                    </button>
                    </span>
                  ))}
                  </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Auto DM Message</label>
                <textarea
                  value={dmAutoReply}
                  onChange={(e) => setDmAutoReply(e.target.value)}
                  placeholder="Thanks for your comment! Here's the information you requested..."
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  rows={4}
                />
              </div>
            </div>
          </>
        )

      case 'comment_only':
        return (
          <>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Comment Only Configuration</h3>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Trigger Keywords</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="Enter keyword"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    onClick={addCommentKeyword}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {commentKeywords.map((keyword, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm flex items-center gap-2"
                    >
                      {keyword}
                    <button
                        onClick={() => removeCommentKeyword(index)}
                        className="text-green-600 hover:text-green-800"
                    >
                        ×
                    </button>
                    </span>
                  ))}
                  </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Public Reply Message</label>
                <textarea
                  value={publicReply}
                  onChange={(e) => setPublicReply(e.target.value)}
                  placeholder="Thanks for your interest! Here's the info you requested..."
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  rows={4}
                />
              </div>
            </div>
          </>
        )



      default:
        return (
          <div className="text-center py-8">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
                <Bot className="w-8 h-8 text-gray-400" />
              </div>
              <h4 className="text-lg font-semibold text-gray-700 mb-2">Choose Your Automation</h4>
              <p className="text-gray-500 text-sm leading-relaxed">
                Select an automation type above to get started with configuring your social media automation strategy.
              </p>
            </div>
          </div>
        )
    }
  }

  const renderInstagramPreview = () => {
    const selectedAccountData = realAccounts.find((a: any) => a.id === selectedAccount)
    // Use the most up-to-date post data from postsData if available, otherwise fall back to selectedPost
    const selectedPostData = postsData && Array.isArray(postsData) && selectedPost 
      ? postsData.find((post: any) => post.id === selectedPost.id) || selectedPost
      : selectedPost
    const currentKeywords = getCurrentKeywords()
    const platformName = selectedAccountData?.platform || 'Social Media'
    
    // Debug: Log the post type to see what's being detected
    console.log('🎬 LIVE PREVIEW DEBUG:', {
      selectedPostData,
      postType: selectedPostData?.type,
      isReel: selectedPostData?.type === 'reel',
      isVideo: selectedPostData?.type === 'video'
    });
    

    
    // For comment_dm automation in step 3 (DM configuration), show only DM preview
    if (automationType === 'comment_dm' && currentStep === 3) {
      return (
        <div className="sticky top-4">
          {/* Preview Header */}
          <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 p-4 rounded-t-3xl">
            <div className="flex items-center gap-3 text-white">
              <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <Send className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold">DM Preview</h3>
                <p className="text-sm opacity-90">Instagram direct message interface</p>
              </div>
              <div className="ml-auto">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
          
          {/* Instagram DM Preview - Exact match to reference image */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-b-3xl shadow-sm max-w-sm mx-auto">
            <div className="p-4">
              {/* Message timestamp */}
              <div className="text-xs text-gray-500 dark:text-gray-400 text-center mb-4">
                JUL 15, 08:31 PM
              </div>
              
              {/* Message bubble with profile picture at bottom-left corner */}
              <div className="relative mb-4">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-bl-sm p-4 max-w-[280px] ml-6">
                  <div className="text-sm text-gray-400 dark:text-gray-300">
                    {dmMessage || "I'm so excited you'd like to see what I've got on offer!"}
                  </div>
                  
                  {/* Button inside message bubble - white background */}
                  {dmButtonText && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center mt-3">
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {dmButtonText}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Profile picture positioned at bottom-left corner overlapping the message bubble */}
                <img 
                  src={selectedAccountData?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face&auto=format'} 
                  alt="Profile" 
                  className="absolute bottom-0 left-0 w-8 h-8 rounded-full border-2 border-white bg-white ml-[-11px] mr-[-11px] pl-[0px] pr-[0px] mt-[1px] mb-[1px]" 
                />
              </div>
              
              {/* Message input area */}
              <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <Camera className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 text-sm text-gray-500 bg-gray-100 rounded-full px-4 py-2">
                  Message...
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 text-gray-500">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                      <path d="M12 14l9-5-9-5-9 5 9 5z"/>
                      <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>
                    </svg>
                  </div>
                  <div className="w-6 h-6 text-gray-500">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                  </div>
                  <div className="w-6 h-6 text-gray-500">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  </div>
                  <div className="w-6 h-6 text-gray-500">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }
    
    // Get current automation message based on type - for PUBLIC comment reply
    const getCurrentMessage = () => {
      switch (automationType) {
        case 'comment_dm':
          return commentReplies[0] || 'Thanks for your comment! Check your DMs 📩'
        case 'dm_only':
          return '' // No public comment for DM-only
        case 'comment_only':
          return commentReplies[0] || 'Thanks for your interest! Here\'s what you\'re looking for ✨'
        default:
          return 'Your automated response will appear here...'
      }
    }
    
    // Get DM message for DM preview
    const getDMMessage = () => {
      switch (automationType) {
        case 'comment_dm':
          return dmMessage || 'Here\'s the detailed info you requested! 💫'
        case 'dm_only':
          return dmAutoReply || 'Thanks for reaching out! Here\'s the info you need 💫'
        default:
          return ''
      }
    }
    
    return (
      <div className="sticky top-4">
        {/* Preview Header */}
        <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 p-4 rounded-t-3xl">
          <div className="flex items-center gap-3 text-white">
            <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold">Live Preview</h3>
              <p className="text-sm opacity-90">Automation preview</p>
            </div>
          </div>
        </div>
        


        {/* Instagram Post Interface - Exact replica */}
        <div className="bg-white dark:bg-gray-800 border-l border-r border-gray-200 dark:border-gray-700 shadow-2xl dark:shadow-gray-900/50">
          {/* Post Header - Only show for non-reel posts */}
          {selectedPostData && selectedPostData.type !== 'reel' && selectedPostData.type !== 'video' && (
          <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img 
                  src={selectedAccountData?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face&auto=format'} 
                  alt="Profile" 
                  className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-600" 
                />
                {selectedAccount && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                  </div>
                )}
              </div>
              <div>
                <div className="font-semibold text-sm text-gray-900">
                  {selectedAccountData?.name || 'your_account'}
                </div>
                <div className="text-xs text-gray-500">2 hours ago • 📍 Location</div>
              </div>
            </div>
            <MoreHorizontal className="w-6 h-6 text-gray-700" />
          </div>
          )}
          
          {/* Instagram Reel Style Preview */}
          <div className="relative bg-black">
            {selectedPostData ? (
              (selectedPostData.type === 'reel' || selectedPostData.type === 'video') ? (
                // Instagram Reel Layout - Full Screen Vertical Video
                <div className="relative w-full h-[600px] bg-black">
                  {/* Video Player - Full Screen */}
                  <video 
                    ref={videoRef}
                    key={`video-${selectedPostData.id}-${selectedPostData.type}`} // Stable key to prevent recreation
                    src={selectedPostData.image || selectedPostData.mediaUrl || selectedPostData.thumbnailUrl} 
                    className="w-full h-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    poster={selectedPostData.thumbnailUrl || selectedPostData.image}
                    onPlay={(e) => {
                      // Video started playing - show pause icon and hide button after delay
                      const video = e.currentTarget;
                      const button = video.parentElement?.querySelector('.play-pause-button') as HTMLElement;
                      const playIcon = button?.querySelector('svg:first-child');
                      const pauseIcon = button?.querySelector('svg:last-child');
                      
                      if (button && playIcon && pauseIcon) {
                        // Show pause icon
                        (playIcon as HTMLElement).style.display = 'none';
                        (pauseIcon as HTMLElement).style.display = 'block';
                        
                        // Show button briefly then hide it
                        button.style.opacity = '1';
                        button.style.transform = 'scale(1)';
                        
                        setTimeout(() => {
                          button.style.opacity = '0';
                          button.style.transform = 'scale(0.8)';
                        }, 2000);
                      }
                    }}
                    onPause={(e) => {
                      // Video paused - show play icon and keep button visible
                      const video = e.currentTarget;
                      const button = video.parentElement?.querySelector('.play-pause-button') as HTMLElement;
                      const playIcon = button?.querySelector('svg:first-child');
                      const pauseIcon = button?.querySelector('svg:last-child');
                      
                      if (button && playIcon && pauseIcon) {
                        // Show play icon
                        (pauseIcon as HTMLElement).style.display = 'none';
                        (playIcon as HTMLElement).style.display = 'block';
                        
                        // Keep button visible when paused
                        button.style.opacity = '1';
                        button.style.transform = 'scale(1)';
                      }
                    }}
                    onError={(e) => {
                      console.log('Live preview video error for post:', selectedPostData.id, e);
                      // Fallback to image if video fails
                      const video = e.currentTarget;
                      const img = document.createElement('img');
                      img.src = selectedPostData.thumbnailUrl || selectedPostData.image || selectedPostData.mediaUrl;
                      img.className = 'w-full h-full object-cover';
                      img.alt = selectedPostData.caption || 'Post';
                      video.parentNode?.replaceChild(img, video);
                    }}
                  />
                  
                  {/* Click Zone for Video Control - Covers video area but excludes bottom automation bar and right sidebar */}
                  <div 
                    className="absolute cursor-pointer pointer-events-auto"
                    style={{ 
                      top: '0', 
                      left: '0', 
                      right: '50px', // Exclude only the exact action buttons width (cut to cut)
                      bottom: '120px' // Exclude the bottom automation bar area
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const video = e.currentTarget.parentElement?.querySelector('video');
                      const button = e.currentTarget.parentElement?.querySelector('.play-pause-button') as HTMLElement;
                      
                      if (video) {
                        if (video.paused) {
                          video.play();
                        } else {
                          video.pause();
                        }
                      }
                      
                      // Show the button when user clicks
                      if (button) {
                        button.style.opacity = '1';
                        button.style.transform = 'scale(1)';
                        
                        // Hide button after 2 seconds
                        setTimeout(() => {
                          if (video && !video.paused) {
                            button.style.opacity = '0';
                            button.style.transform = 'scale(0.8)';
                          }
                        }, 2000);
                      }
                    }}
                  />
                  
                  {/* Play/Pause Button Overlay - Center of the clickable video area */}
                  <div 
                    className="absolute pointer-events-none flex items-center justify-center"
                    style={{ 
                      top: '0', 
                      left: '0', 
                      right: '50px', // Match the click zone exactly (cut to cut)
                      bottom: '120px' // Exclude only the bottom automation bar area
                    }}
                  >
                    <button
                      className="w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center pointer-events-auto transition-all duration-300 play-pause-button focus:outline-none focus:ring-0 focus:border-0"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const video = e.currentTarget.parentElement?.parentElement?.querySelector('video');
                        if (video) {
                          if (video.paused) {
                            video.play();
                          } else {
                            video.pause();
                          }
                        }
                        
                        // Hide button after click
                        const button = e.currentTarget as HTMLElement;
                        setTimeout(() => {
                          if (video && !video.paused) {
                            button.style.opacity = '0';
                            button.style.transform = 'scale(0.8)';
                          }
                        }, 2000);
                      }}
                      style={{
                        opacity: '0',
                        transform: 'scale(0.8)',
                        transition: 'all 0.3s ease-in-out',
                        zIndex: 100
                      }}

                    >
                      {/* Play Icon - Show when video is paused */}
                      <svg 
                        width="32" 
                        height="32" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        className="text-white transition-all duration-300"
                        style={{ display: 'block' }}
                      >
                        <polygon points="5,3 19,12 5,21"/>
                      </svg>
                      
                      {/* Pause Icon - Show when video is playing */}
                      <svg 
                        width="32" 
                        height="32" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        className="text-white transition-all duration-300"
                        style={{ display: 'none' }}
                      >
                        <line x1="6" y1="4" x2="6" y2="20"/>
                        <line x1="18" y1="4" x2="18" y2="20"/>
                      </svg>
                    </button>
                  </div>
                  
                  {/* Instagram Reel UI Overlay */}
                  <div className="absolute inset-0 pointer-events-none">
                    {/* Top Section - Only Mute Button */}
                    <div className="absolute top-4 right-4">
                      {/* Mute/Unmute Button */}
                      <button
                        className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center pointer-events-auto hover:bg-black/50 transition-colors focus:outline-none focus:ring-0 focus:border-0"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const video = e.currentTarget.parentElement?.parentElement?.parentElement?.querySelector('video');
                          if (video) {
                            video.muted = !video.muted;
                            const icon = e.currentTarget.querySelector('svg');
                            if (icon) {
                              if (video.muted) {
                                icon.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
                              } else {
                                icon.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><line x1="1" y1="1" x2="23" y2="23"/>';
                              }
                            }
                          }
                        }}
                        title="Toggle mute"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      </button>
                    </div>
                    
                    {/* Bottom Section - Caption, Username, and Actions */}
                    <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
                      {/* Username and Follow Button Section - Above Caption */}
                      <div className="flex items-center gap-3 mb-4">
                        {/* Profile Picture - Left side - Use real avatar */}
                        <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden">
                          {selectedAccountData?.avatar ? (
                            <img 
                              src={selectedAccountData.avatar} 
                              alt="Profile" 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Fallback to gradient if avatar fails to load
                                const target = e.currentTarget as HTMLImageElement;
                                target.style.display = 'none';
                                const fallback = target.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          {/* Fallback gradient avatar */}
                          <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center" style={{ display: selectedAccountData?.avatar ? 'none' : 'flex' }}>
                            <User className="w-6 h-6 text-white" />
                          </div>
                        </div>
                        {/* Username and Follow Button - Right side - Use real username */}
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold text-sm">
                            {selectedAccountData?.name || 'wanderwithsky'}
                          </span>
                          <button className="bg-white/20 backdrop-blur-sm text-white text-xs px-3 py-1 rounded-full border border-white/30 pointer-events-auto hover:bg-white/30 transition-colors focus:outline-none focus:ring-0 focus:border-0">
                            Follow
                          </button>
                        </div>
                      </div>
                      
                      {/* Caption */}
                      <div className="mb-4">
                        <p className="text-white text-sm leading-relaxed">
                          {selectedPostData.caption || 'Instagram reel content...'}
                        </p>
                      </div>
                      
                      {/* Audio Source - Use real username */}
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        </div>
                        <span className="text-white/80 text-xs">
                          {selectedAccountData?.name || 'wanderwithsky'} • Original audio
                        </span>
                      </div>
                      
                      {/* Right Side Action Buttons */}
                      <div 
                        className={`absolute bottom-4 flex flex-col items-center gap-4 transition-opacity duration-300 ${
                          showCommentScreen ? 'opacity-0 pointer-events-none' : 'opacity-100'
                        }`}
                        style={{ zIndex: 50, right: '0', marginRight: 0, paddingRight: 0 }}
                      >
                        {/* Like Button - Use real likes count with real-time indicator */}
                        <div className="flex flex-col items-center">
                          <button className="w-10 h-10 flex items-center justify-center pointer-events-auto hover:scale-110 transition-transform focus:outline-none focus:ring-0 focus:border-0">
                            <Heart className="w-6 h-6 text-white drop-shadow-lg" />
                          </button>
                          <span className="text-white text-xs mt-1 font-medium drop-shadow-lg">
                            {(selectedPostData?.likes || selectedPostData?.engagement?.likes || 0).toLocaleString()}
                          </span>
                        </div>
                        
                        {/* Comment Button - Use real comments count */}
                        <div className="flex flex-col items-center">
                          <button 
                            className="flex flex-col items-center gap-1 text-white hover:scale-110 transition-transform duration-200 pointer-events-auto focus:outline-none focus:ring-0 focus:border-0"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowCommentScreen(!showCommentScreen);
                            }}
                            style={{ zIndex: 50 }}
                          >
                            <InstagramCommentIcon className="w-6 h-6 text-white" />
                            <span className="text-xs font-medium">
                              {(selectedPostData?.comments || selectedPostData?.engagement?.comments || 0).toLocaleString()}
                            </span>
                          </button>
                        </div>
                        
                        {/* Share Button */}
                        <div className="flex flex-col items-center">
                          <button className="w-10 h-10 flex items-center justify-center pointer-events-auto hover:scale-110 transition-transform focus:outline-none focus:ring-0 focus:border-0">
                            <Send className="w-6 h-6 text-white drop-shadow-lg" />
                          </button>
                        </div>
                        
                        {/* Save Button */}
                        <div className="flex flex-col items-center">
                          <button className="w-10 h-10 flex items-center justify-center pointer-events-auto hover:scale-110 transition-transform focus:outline-none focus:ring-0 focus:border-0">
                            <Bookmark className="w-6 h-6 text-white drop-shadow-lg" />
                          </button>
                        </div>
                        
                        {/* More Options */}
                        <div className="flex flex-col items-center">
                          <button className="w-10 h-10 flex items-center justify-center pointer-events-auto hover:scale-110 transition-transform focus:outline-none focus:ring-0 focus:border-0">
                            <MoreHorizontal className="w-6 h-6 text-white drop-shadow-lg" />
                          </button>
                        </div>
                        
                        {/* Music Icon - Replaces profile picture */}
                        <div className="w-10 h-10 flex items-center justify-center">
                          <svg 
                            width="24" 
                            height="24" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                            className="text-white drop-shadow-lg"
                          >
                            <path d="M9 18V5l12-2v13"/>
                            <circle cx="6" cy="18" r="3"/>
                            <circle cx="18" cy="16" r="3"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Comment Screen Overlay - Positioned within the reel layout */}
                  <CommentScreen 
                    isVisible={showCommentScreen} 
                    onClose={() => setShowCommentScreen(false)}
                    triggerKeywords={selectedKeywords || []}
                    automationType={automationType || 'comment_only'}
                    commentReplies={commentReplies || ['Message sent!']}
                    dmMessage={dmMessage || ''}
                    selectedAccount={selectedAccount || ''}
                    realAccounts={realAccounts || []}
                    newKeyword={newKeyword || ''}
                    commentInputText={commentInputText || ''}
                    setCommentInputText={setCommentInputText}
                    getCurrentKeywords={getCurrentKeywords}
                    setSelectedKeywords={setSelectedKeywords}
                    updateSourceRef={updateSourceRef}
                    currentTime={currentTime}
                  />
                </div>
              ) : (
                // Regular Post Layout
                <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 relative overflow-hidden">
              <img 
                src={selectedPostData.image || selectedPostData.thumbnailUrl || selectedPostData.mediaUrl} 
                alt="Post" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to other image sources if primary fails
                  if (selectedPostData.mediaUrl && e.currentTarget.src !== selectedPostData.mediaUrl) {
                    e.currentTarget.src = selectedPostData.mediaUrl;
                  } else if (selectedPostData.thumbnailUrl && e.currentTarget.src !== selectedPostData.thumbnailUrl) {
                    e.currentTarget.src = selectedPostData.thumbnailUrl;
                  }
                }}
              />
            
            {/* Multiple image indicator */}
                  {selectedPostData.type === 'carousel' && (
              <div className="absolute top-3 right-3">
                <div className="bg-black/20 backdrop-blur-sm rounded-full p-1">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <div className="w-2 h-2 bg-white/50 rounded-full"></div>
                    <div className="w-2 h-2 bg-white/30 rounded-full"></div>
                  </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="aspect-square bg-gradient-to-br from-gray-800 to-gray-900 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center border border-gray-600 dark:border-gray-600">
                <div className="text-center">
                  <Camera className="w-16 h-16 text-gray-300 dark:text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-200 dark:text-gray-100 text-sm">Select a post to preview</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Post Actions - Only show for non-reel posts */}
          {selectedPostData && selectedPostData.type !== 'reel' && selectedPostData.type !== 'video' && (
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <Heart className="w-6 h-6 text-gray-700 hover:text-red-500 transition-colors cursor-pointer" />
                <InstagramCommentIcon className="w-6 h-6 text-gray-700 hover:text-gray-900 transition-colors cursor-pointer" />
                <Send className="w-6 h-6 text-gray-700 hover:text-gray-900 transition-colors cursor-pointer" />
              </div>
              <Bookmark className="w-6 h-6 text-gray-700 hover:text-gray-900 transition-colors cursor-pointer" />
            </div>
            
            {/* Likes count */}
            <div className="text-sm font-semibold text-gray-900 mb-2">
              {selectedPostData ? `${(selectedPostData?.likes || selectedPostData?.engagement?.likes || 0).toLocaleString()} likes` : '1,247 likes'}
            </div>
            
            {/* Caption */}
              {selectedPostData?.caption && (
                <div className="text-sm text-gray-900 mb-2">
                  <span className="font-semibold mr-2">wanderwithsky</span>
                  {selectedPostData.caption}
                </div>
              )}
              
              {/* Comments */}
              <div className="text-sm text-gray-500">
                View all {(selectedPostData?.comments || selectedPostData?.engagement?.comments || 0).toLocaleString()} comments
              </div>
                </div>
              )}
        </div>
        
        {/* DM Preview Section - Only show for comment to DM automation in steps 4 and 5 */}
        {automationType === 'comment_dm' && (currentStep === 4 || currentStep === 5) && (
          <div className="sticky top-4 mt-4">
            {/* Preview Header */}
            <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 p-4 rounded-t-3xl">
              <div className="flex items-center gap-3 text-white">
                <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold">DM Preview</h3>
                  <p className="text-sm opacity-90">Instagram direct message interface</p>
                </div>
                <div className="ml-auto">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                </div>
              </div>
            </div>
            
            {/* Instagram DM Preview - Exact match to reference image */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-b-3xl shadow-sm max-w-sm mx-auto">
              <div className="p-4">
                {/* Message timestamp */}
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center mb-4">
                  JUL 15, 08:31 PM
                </div>
                
                {/* Message bubble with profile picture at bottom-left corner */}
                <div className="relative mb-4">
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-bl-sm p-4 max-w-[280px] ml-6">
                    <div className="text-sm text-gray-400 dark:text-gray-300">
                      {dmMessage || "I'm so excited you'd like to see what I've got on offer!"}
                    </div>
                    
                    {/* Button inside message bubble - white background */}
                    {dmButtonText && (
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center mt-3">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          {dmButtonText}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Profile picture positioned at bottom-left corner overlapping the message bubble */}
                  <img 
                    src={selectedAccountData?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face&auto=format'} 
                    alt="Profile" 
                    className="absolute bottom-0 left-0 w-8 h-8 rounded-full border-2 border-white bg-white ml-[-11px] mr-[-11px] pl-[0px] pr-[0px] mt-[1px] mb-[1px]" 
                  />
                </div>
                
                {/* Message input area */}
                <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <Camera className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-full px-4 py-2">
                    Message...
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 text-gray-500">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path d="M12 14l9-5-9-5-9 5 9 5z"/>
                        <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>
                      </svg>
                    </div>
                    <div className="w-6 h-6 text-gray-500">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                    </div>
                    <div className="w-6 h-6 text-gray-500">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                    </div>
                    <div className="w-6 h-6 text-gray-500">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Automation Status Indicator */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-4 rounded-b-3xl">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              <span className="text-sm font-medium">
                {automationType ? `${automationTypes.find(t => t.id === automationType)?.name} Active` : 'Select Automation Type'}
              </span>
            </div>
            {currentKeywords.length > 0 && (
              <div className="flex items-center gap-1">
                <Hash className="w-3 h-3" />
                <span className="text-xs">{currentKeywords.length} triggers</span>
              </div>
            )}
          </div>
          {automationType && (
            <div className="mt-2 text-xs text-emerald-100">
              Monitoring: {currentKeywords.join(', ') || 'All comments'}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Add this state in the main component
  const [showCommentScreen, setShowCommentScreen] = useState(false);

  // Add this function in the main component
  const handleAutomationTypeSelect = (type: string) => {
    setSelectedAutomationType(type);
    // Don't show comment screen immediately - wait for keywords to be added
    // Continue to next step logic here
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 min-h-full transition-colors duration-300">
      {/* Debug Component - Remove after testing */}
      <RefreshDetector />
      
      {/* Sleek Management Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 w-full shadow-sm transition-colors duration-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Automation Studio
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">Smart social media automation</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Cache Status Indicator */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>Auto-saved (persistent)</span>
        </div>
            
            <button
              onClick={() => setShowAutomationList(!showAutomationList)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Manage Automations
            </button>
            <button
              onClick={() => {
                setCurrentStep(1)
                setShowAutomationList(false)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all shadow-md dark:shadow-blue-500/30"
            >
              <Plus className="w-4 h-4" />
              New Automation
            </button>
          </div>
        </div>
      </div>

      {/* Show automation list or step-by-step flow */}
      {showAutomationList ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl dark:shadow-gray-900/50 overflow-hidden transition-colors duration-300">
          <AutomationListManager 
            automationRules={automationRules}
            rulesLoading={rulesLoading}
            updateAutomationMutation={updateAutomationMutation}
            deleteAutomationMutation={deleteAutomationMutation}
          />
        </div>
      ) : (
        <div className="max-w-7xl mx-auto p-6 pb-20">

          {/* Progress Steps */}
          <div className="mb-12">
            <div className="flex items-center justify-between max-w-5xl mx-auto">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center group">
                    <div className={`flex items-center justify-center w-14 h-14 rounded-full border-3 transition-all duration-300 shadow-lg ${
                      currentStep >= step.id 
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-600 border-blue-500 text-white transform scale-110 shadow-blue-200 dark:shadow-blue-500/30' 
                        : currentStep === step.id
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-600 border-blue-500 text-white transform scale-110 shadow-blue-200 dark:shadow-blue-500/30'
                        : 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 hover:shadow-md'
                    }`}>
                      {currentStep > step.id ? (
                        <CheckCircle className="w-7 h-7" />
                      ) : (
                        <span className="text-sm font-bold">{step.id}</span>
                      )}
                    </div>
                    <div className="mt-3 text-center transition-all duration-300">
                      <div className={`text-sm font-semibold ${
                        currentStep >= step.id ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
                      }`}>{step.title}</div>
                      <div className={`text-xs mt-1 ${
                        currentStep >= step.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                      }`}>{step.description}</div>
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-1 mx-6 mt-[-25px] rounded-full transition-all duration-500 ${
                      currentStep > step.id 
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-600 shadow-sm' 
                        : 'bg-gray-200 dark:bg-gray-600'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Section */}
          <div className="lg:col-span-2">
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl dark:shadow-gray-900/50 border border-white/20 dark:border-gray-700/20 p-8 hover:shadow-2xl dark:hover:shadow-gray-900/70 transition-all duration-300">
              {renderStepContent()}
              
              {/* Navigation Buttons */}
              <div className="flex justify-between items-center mt-10 pt-8 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handlePrevious}
                  disabled={currentStep === 1}
                  className="flex items-center gap-2 px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Previous
                </button>
                
                <div className="px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 text-blue-700 dark:text-blue-300 rounded-full text-sm font-semibold border border-blue-200 dark:border-blue-600">
                  Step {currentStep} of {steps.length}
                </div>
                
                {currentStep < steps.length ? (
                  <button
                    onClick={handleNext}
                    disabled={!canProceedToNext()}
                    className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg dark:shadow-blue-500/30 hover:shadow-xl dark:hover:shadow-blue-500/40 transition-all duration-300 transform hover:scale-105"
                  >
                    Next
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleFinish}
                    disabled={createAutomationMutation.isPending}
                    className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 font-semibold shadow-lg dark:shadow-green-500/30 hover:shadow-xl dark:hover:shadow-green-500/40 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {createAutomationMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Creating...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Activate Automation
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Preview Section */}
          <div className="lg:col-span-1">
            {renderInstagramPreview()}
          </div>
        </div>
      </div>
      )}



    </div>
  )
}