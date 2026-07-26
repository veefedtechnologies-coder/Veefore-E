import React, { useRef } from 'react';
import { Eye, Send } from 'lucide-react';
import {
  PostHeader,
  PostActions,
  InstagramPostRenderer,
  DMPreview,
  AutomationStatusIndicator,
  type PostData,
  type AccountData,
  type DMButton,
} from './instagram-preview';

interface InstagramPreviewProps {
  // Post data
  selectedPost?: PostData | null;
  postsData?: PostData[];
  
  // Account data
  selectedAccount?: string;
  realAccounts?: AccountData[];
  
  // Automation configuration
  automationType?: 'comment_dm' | 'dm_only' | 'comment_only' | '';
  currentStep?: number;
  
  // Keywords and replies
  currentKeywords?: string[];
  commentReplies?: string[];
  dmMessage?: string;
  
  // DM configuration
  dmButtons?: DMButton[];
  followerGateEnabled?: boolean;
  followerGateMessage?: string;
  followerGateVisitLabel?: string;
  followerGateConfirmLabel?: string;
  
  // Additional props
  showCommentScreen?: boolean;
  onCommentScreenToggle?: (show: boolean) => void;
  CommentScreenComponent?: React.ComponentType<any>;
  commentScreenProps?: any;
}

/**
 * InstagramPreview Component
 * 
 * Displays Instagram post/story/reel preview with automation indicators
 * Supports multiple preview modes: post, reel, story, and DM preview
 * 
 * @component
 */
export const InstagramPreview: React.FC<InstagramPreviewProps> = ({
  selectedPost,
  postsData,
  selectedAccount,
  realAccounts = [],
  automationType = '',
  currentStep = 1,
  currentKeywords = [],
  commentReplies = [],
  dmMessage = '',
  dmButtons = [],
  followerGateEnabled = false,
  followerGateMessage = '',
  followerGateVisitLabel = '',
  followerGateConfirmLabel = '',
  showCommentScreen = false,
  onCommentScreenToggle,
  CommentScreenComponent,
  commentScreenProps,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Get account data
  const selectedAccountData = realAccounts.find((a: AccountData) => a.id === selectedAccount);
  
  // Use the most up-to-date post data from postsData if available
  const selectedPostData = postsData && Array.isArray(postsData) && selectedPost 
    ? postsData.find((post: PostData) => post.id === selectedPost.id) || selectedPost
    : selectedPost;
  
  const platformName = selectedAccountData?.platform || 'Social Media';

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
              {/* skeleton-guard-allow: status-dot — live preview status indicator dot, not a loading placeholder */}
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
        
        {/* Instagram DM Preview */}
        <DMPreview
          selectedAccountData={selectedAccountData}
          dmMessage={followerGateEnabled ? followerGateMessage : dmMessage}
          dmButtons={followerGateEnabled 
            ? [
                ...(followerGateVisitLabel ? [{ text: followerGateVisitLabel, type: 'web_url' as const }] : []),
                { text: followerGateConfirmLabel || "I'm Following ✅", type: 'postback' as const }
              ]
            : dmButtons}
          currentKeywords={currentKeywords}
          followerGateEnabled={followerGateEnabled}
        />
      </div>
    );
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

      {/* Instagram Post Interface */}
      <div className="bg-white dark:bg-gray-800 border-l border-r border-gray-200 dark:border-gray-700 shadow-2xl dark:shadow-gray-900/50">
        {/* Post Header - Only show for non-reel posts */}
        {selectedPostData && selectedPostData.type !== 'reel' && selectedPostData.type !== 'video' && (
          <PostHeader selectedAccountData={selectedAccountData} selectedAccount={selectedAccount} />
        )}
        
        {/* Instagram Post Renderer */}
        <InstagramPostRenderer
          selectedPostData={selectedPostData}
          selectedAccountData={selectedAccountData}
          videoRef={videoRef}
          showCommentScreen={showCommentScreen}
          onCommentScreenToggle={onCommentScreenToggle}
          CommentScreenComponent={CommentScreenComponent}
          commentScreenProps={commentScreenProps}
        />
        
        {/* Post Actions - Only show for non-reel posts */}
        {selectedPostData && selectedPostData.type !== 'reel' && selectedPostData.type !== 'video' && (
          <PostActions selectedPostData={selectedPostData} selectedAccountData={selectedAccountData} />
        )}
      </div>
      
      {/* DM Preview Section - Only show for comment to DM automation in steps 4 and 5 */}
      {automationType === 'comment_dm' && (currentStep === 4 || currentStep === 5) && (
        <div className="mt-4">
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
                {/* skeleton-guard-allow: status-dot — live preview status indicator dot, not a loading placeholder */}
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
          
          <DMPreview
            selectedAccountData={selectedAccountData}
            dmMessage={dmMessage}
            dmButtons={dmButtons}
            currentKeywords={currentKeywords}
          />
        </div>
      )}

      {/* Automation Status Indicator */}
      <AutomationStatusIndicator
        currentStep={currentStep}
        automationType={automationType}
        currentKeywords={currentKeywords}
      />
    </div>
  );
};

export default InstagramPreview;
