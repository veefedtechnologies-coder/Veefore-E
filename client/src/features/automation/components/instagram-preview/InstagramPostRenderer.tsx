import React from 'react';
import { Camera } from 'lucide-react';
import { PreviewVideo } from './PreviewVideo';
import { ReelOverlay } from './ReelOverlay';
import { PostData, AccountData } from './types';

interface InstagramPostRendererProps {
  selectedPostData?: PostData | null;
  selectedAccountData?: AccountData;
  videoRef: React.RefObject<HTMLVideoElement>;
  showCommentScreen?: boolean;
  onCommentScreenToggle?: (show: boolean) => void;
  CommentScreenComponent?: React.ComponentType<any>;
  commentScreenProps?: any;
}

/**
 * InstagramPostRenderer Component
 * Renders different post types (regular post, reel, video, carousel)
 */
export const InstagramPostRenderer: React.FC<InstagramPostRendererProps> = ({ 
  selectedPostData, 
  selectedAccountData, 
  videoRef,
  showCommentScreen,
  onCommentScreenToggle,
  CommentScreenComponent,
  commentScreenProps
}) => {
  if (!selectedPostData) {
    return (
      <div className="aspect-square bg-gradient-to-br from-gray-800 to-gray-900 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center border border-gray-600 dark:border-gray-600">
        <div className="text-center">
          <Camera className="w-16 h-16 text-gray-300 dark:text-gray-200 mx-auto mb-2" />
          <p className="text-gray-200 dark:text-gray-100 text-sm">Select a post to preview</p>
        </div>
      </div>
    );
  }

  // Reel/Video Layout
  if (selectedPostData.type === 'reel' || selectedPostData.type === 'video') {
    return (
      <div className="relative bg-black">
        <div className="relative w-full h-[600px] bg-black">
          <PreviewVideo 
            ref={videoRef}
            key={`video-${selectedPostData.id}-${selectedPostData.type}`}
            src={selectedPostData.mediaUrl || selectedPostData.image || selectedPostData.thumbnailUrl || ''} 
            poster={selectedPostData.thumbnailUrl || selectedPostData.image}
            alt={selectedPostData.caption || 'Post'}
            id={selectedPostData.id}
            className="w-full h-full object-cover"
          />
          
          {/* Reel UI Overlay */}
          <ReelOverlay
            selectedPostData={selectedPostData}
            selectedAccountData={selectedAccountData}
            showCommentScreen={showCommentScreen}
            onCommentScreenToggle={onCommentScreenToggle}
          />
          
          {/* Comment Screen Overlay */}
          {CommentScreenComponent && commentScreenProps && (
            <CommentScreenComponent
              isVisible={showCommentScreen}
              onClose={() => onCommentScreenToggle?.(false)}
              {...commentScreenProps}
            />
          )}
        </div>
      </div>
    );
  }

  // Regular Post Layout
  return (
    <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 relative overflow-hidden">
      <img 
        src={selectedPostData.image || selectedPostData.thumbnailUrl || selectedPostData.mediaUrl || ''} 
        alt="Post" 
        className="w-full h-full object-cover"
      />
      
      {/* Multiple image indicator for carousel */}
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
  );
};

export default InstagramPostRenderer;
