/**
 * CommentSimulator Component
 * 
 * Provides a realistic Instagram comment interface for testing automation workflows.
 * Simulates how the automation will respond to trigger keywords in real-time.
 * 
 * Features:
 * - Real-time Instagram comment simulation
 * - Dynamic timestamp generation
 * - Fetches actual Instagram user profile data
 * - Supports different automation types (comment_dm, dm_only, comment_only)
 * - Interactive comment input with keyword addition
 * 
 * @module CommentSimulator
 */

import React, { useState, useEffect, useMemo } from 'react';
import { MessageCircle, MessageSquare, Heart, Hash } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useInstagramSimulation } from '../hooks/useInstagramSimulation';

/**
 * Interface for comment reply data structure
 */
export interface CommentReply {
  id: number;
  username: string;
  profilePic: string;
  content: string;
  timestamp: Date;
  likes: number;
}

/**
 * Interface for comment data structure
 */
export interface Comment {
  id: number;
  username: string;
  profilePic: string;
  content: string;
  timestamp: Date;
  likes: number;
  replies: CommentReply[];
}

/**
 * Props for the CommentSimulator component
 */
export interface CommentSimulatorProps {
  /** Controls visibility of the comment screen */
  isVisible: boolean;
  /** Callback when closing the comment screen */
  onClose: () => void;
  /** Array of trigger keywords to simulate comments */
  triggerKeywords: string[];
  /** Type of automation (comment_dm, dm_only, comment_only) */
  automationType: string;
  /** Array of reply messages for comment automation */
  commentReplies: string[];
  /** Direct message content for DM automation */
  dmMessage: string;
  /** Currently selected Instagram account ID */
  selectedAccount: string;
  /** Array of connected Instagram accounts */
  realAccounts: any[];
  /** Current keyword being edited */
  newKeyword: string;
  /** Comment input text state */
  commentInputText: string;
  /** Setter for comment input text */
  setCommentInputText: (text: string) => void;
  /** Function to get current keywords based on automation type */
  getCurrentKeywords: () => string[];
  /** Setter for selected keywords */
  setSelectedKeywords: (keywords: string[]) => void;
  /** Ref to track update source */
  updateSourceRef: React.MutableRefObject<'trigger' | 'comment' | null>;
  /** Current time reference */
  currentTime: Date;
  /** Keywords for comment_dm automation */
  keywords: string[];
  /** Setter for comment_dm keywords */
  setKeywords: (keywords: string[]) => void;
  /** Keywords for dm_only automation */
  dmKeywords: string[];
  /** Setter for dm_only keywords */
  setDmKeywords: (keywords: string[]) => void;
  /** Keywords for comment_only automation */
  commentKeywords: string[];
  /** Setter for comment_only keywords */
  setCommentKeywords: (keywords: string[]) => void;
}

/**
 * CommentSimulator Component
 * 
 * Renders an Instagram-style comment interface that simulates how automation
 * will respond to trigger keywords. Provides real-time preview of bot behavior.
 */
export const CommentSimulator: React.FC<CommentSimulatorProps> = ({
  isVisible,
  onClose,
  triggerKeywords,
  automationType,
  commentReplies,
  dmMessage,
  selectedAccount,
  realAccounts,
  newKeyword,
  commentInputText,
  setCommentInputText,
  getCurrentKeywords,
  setSelectedKeywords,
  updateSourceRef,
  currentTime,
  keywords,
  setKeywords,
  dmKeywords,
  setDmKeywords,
  commentKeywords,
  setCommentKeywords,
}) => {
  const [commentText, setCommentText] = useState('');
  const { user, loading: authLoading } = useAuth();
  
  const {
    realInstagramUser,
    commentTimestamps,
    getRelativeTime,
    testComments,
  } = useInstagramSimulation({
    user,
    authLoading,
    selectedAccount,
    realAccounts,
    triggerKeywords,
    commentReplies,
    newKeyword,
    commentInputText,
  });

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

  /**
   * Handles the post button click to add a new keyword
   */
  const handlePostComment = () => {
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
  };

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
                onClick={handlePostComment}
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

export default CommentSimulator;
