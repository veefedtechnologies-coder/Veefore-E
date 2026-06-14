/**
 * useInstagramSimulation Hook
 * 
 * Custom hook for managing Instagram comment simulation state and logic.
 * Handles fetching real Instagram user data, generating timestamps, and creating test comments.
 * 
 * Features:
 * - Fetches real Instagram user profile data from API
 * - Generates stable, realistic timestamps for comments
 * - Creates test comments with replies
 * - Manages relative time display (Instagram-style)
 * 
 * @module useInstagramSimulation
 */

import { useState, useEffect, useMemo } from 'react';
import type { User } from 'firebase/auth';
import type { Comment, CommentReply } from '../components/CommentSimulator';

/**
 * Props for the useInstagramSimulation hook
 */
export interface UseInstagramSimulationProps {
  /** Authenticated user object from Firebase */
  user: User | null;
  /** Whether authentication is loading */
  authLoading: boolean;
  /** Currently selected Instagram account ID */
  selectedAccount: string;
  /** Array of connected Instagram accounts */
  realAccounts: any[];
  /** Array of trigger keywords to simulate */
  triggerKeywords: string[];
  /** Array of reply messages for comment automation */
  commentReplies: string[];
  /** Current keyword being edited */
  newKeyword: string;
  /** Comment input text state */
  commentInputText: string;
}

/**
 * Interface for Instagram user data
 */
interface InstagramUser {
  username: string;
  profilePic: string;
}

/**
 * Interface for comment timestamps
 */
interface CommentTimestamps {
  [key: string]: {
    main: Date;
    reply: Date;
  };
}

/**
 * Default fallback user data
 */
const DEFAULT_INSTAGRAM_USER: InstagramUser = {
  username: 'rahulc1020',
  profilePic: 'https://picsum.photos/40/40?random=rahulc1020'
};

/**
 * Default placeholder profile picture SVG
 */
const DEFAULT_PROFILE_PIC = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNGNUY1RjUiIHN0cm9rZT0iI0Q5RDlEOSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz4KPGNpcmNsZSBjeD0iMjAiIGN5PSIxNiIgcj0iNC41IiBmaWxsPSIjOUNBNEFCIi8+CjxwYXRoIGQ9Ik0yOCAyN0MyOCAyNC4yNjk3IDI0LjQxODMgMjIgMjAgMjJDMTUuNTgxNyAyMiAxMiAyNC4yNjk3IDEyIDI3SDI4WiIgZmlsbD0iIzlDQTRBQiIvPgo8L3N2Zz4K';

/**
 * Fetches real Instagram user profile data from the API
 * 
 * @param user - Authenticated Firebase user
 * @param workspaceId - Workspace ID for the Instagram account
 * @returns Instagram user data or fallback
 */
const fetchRealInstagramUser = async (
  user: User | null,
  workspaceId: string | undefined
): Promise<InstagramUser> => {
  try {
    if (!workspaceId) {
      console.warn('No workspace ID found, using fallback data');
      return DEFAULT_INSTAGRAM_USER;
    }

    if (!user) {
      console.warn('No authenticated user found, using fallback data');
      return DEFAULT_INSTAGRAM_USER;
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
      
      return {
        username: userData.username || DEFAULT_INSTAGRAM_USER.username,
        profilePic: userData.profile_picture_url || DEFAULT_INSTAGRAM_USER.profilePic
      };
    } else {
      const errorText = await response.text();
      console.error('API response not ok:', errorText);
    }
  } catch (error) {
    console.error('Failed to fetch Instagram user data:', error);
  }
  
  // Fallback to default data if API fails
  return DEFAULT_INSTAGRAM_USER;
};

/**
 * Generates realistic timestamps for comments based on their index
 * 
 * @param index - Index of the comment (determines recency)
 * @returns Object with main comment and reply timestamps
 */
const generateCommentTimestamps = (index: number): { main: Date; reply: Date } => {
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
  
  return { main: mainCommentTime, reply: replyTime };
};

/**
 * Calculates relative time like Instagram (e.g., "2m", "5h", "3d")
 * with reduced fluctuation for stable display
 * 
 * @param timestamp - The timestamp to calculate relative time from
 * @returns Relative time string (e.g., "just now", "5m", "2h", "3d")
 */
const getRelativeTime = (timestamp: Date): string => {
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

/**
 * Custom hook for Instagram simulation functionality
 * 
 * @param props - Hook configuration props
 * @returns Simulation state and helper functions
 */
export const useInstagramSimulation = ({
  user,
  authLoading,
  selectedAccount,
  realAccounts,
  triggerKeywords,
  commentReplies,
  newKeyword,
  commentInputText,
}: UseInstagramSimulationProps) => {
  // State for real Instagram user data
  const [realInstagramUser, setRealInstagramUser] = useState<InstagramUser>(DEFAULT_INSTAGRAM_USER);
  
  // State for comment timestamps
  const [commentTimestamps, setCommentTimestamps] = useState<CommentTimestamps>({});

  // Fetch real Instagram user data when component mounts or dependencies change
  useEffect(() => {
    const fetchUser = async () => {
      const selectedAccountData = realAccounts.find((a: any) => a.id === selectedAccount);
      const workspaceId = selectedAccountData?.workspaceId;
      
      const userData = await fetchRealInstagramUser(user, workspaceId);
      setRealInstagramUser(userData);
    };
    
    // Only fetch if user is authenticated and not loading, and we have the required data
    if (!authLoading && user && selectedAccount && realAccounts.length > 0) {
      fetchUser();
    }
  }, [user, authLoading, selectedAccount, realAccounts]);

  // Generate timestamps for new keywords only when they're added
  useEffect(() => {
    const newTimestamps: CommentTimestamps = {};
    
    triggerKeywords.forEach((keyword, index) => {
      if (!commentTimestamps[keyword]) {
        newTimestamps[keyword] = generateCommentTimestamps(index);
      }
    });
    
    if (Object.keys(newTimestamps).length > 0) {
      setCommentTimestamps(prev => ({ ...prev, ...newTimestamps }));
    }
  }, [triggerKeywords, commentTimestamps]);

  // Generate test comments with stable timestamps
  const testComments = useMemo((): Comment[] => {
    if (triggerKeywords.length === 0) {
      return [{
        id: 1,
        username: 'Username',
        profilePic: DEFAULT_PROFILE_PIC,
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
        profilePic: DEFAULT_PROFILE_PIC,
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
  }, [triggerKeywords, commentTimestamps, realInstagramUser, commentReplies]);

  return {
    realInstagramUser,
    commentTimestamps,
    getRelativeTime,
    testComments,
  };
};

export default useInstagramSimulation;
