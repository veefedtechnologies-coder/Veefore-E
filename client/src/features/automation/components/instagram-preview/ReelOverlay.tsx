import React from 'react';
import { Heart, Send, Bookmark, User } from 'lucide-react';
import { InstagramCommentIcon } from './InstagramCommentIcon';
import { PostData, AccountData } from './types';

interface ReelOverlayProps {
  selectedPostData: PostData;
  selectedAccountData?: AccountData;
  showCommentScreen?: boolean;
  onCommentScreenToggle?: (show: boolean) => void;
}

/**
 * ReelOverlay Component
 * Displays the overlay UI for Instagram reels with profile, caption, and action buttons
 */
export const ReelOverlay: React.FC<ReelOverlayProps> = ({ 
  selectedPostData, 
  selectedAccountData, 
  showCommentScreen, 
  onCommentScreenToggle 
}) => (
  <div className="absolute inset-0 pointer-events-none">
    {/* Bottom Section */}
    <div className="absolute bottom-4 left-4 right-4">
      {/* Username and Follow Button */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden">
          {selectedAccountData?.avatar ? (
            <img 
              src={selectedAccountData.avatar} 
              alt="Profile" 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">
            {selectedAccountData?.name || 'your_account'}
          </span>
          <button className="bg-white/20 backdrop-blur-sm text-white text-xs px-3 py-1 rounded-full border border-white/30 pointer-events-auto hover:bg-white/30 transition-colors">
            Follow
          </button>
        </div>
      </div>
      
      {/* Caption */}
      {selectedPostData.caption && (
        <div className="mb-4">
          <p className="text-white text-sm leading-relaxed">
            {selectedPostData.caption}
          </p>
        </div>
      )}
      
      {/* Audio Source */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center">
          <div className="w-2 h-2 bg-white rounded-full"></div>
        </div>
        <span className="text-white/80 text-xs">
          {selectedAccountData?.name || 'your_account'} • Original audio
        </span>
      </div>
      
      {/* Right Side Action Buttons */}
      <div 
        className={`absolute bottom-4 flex flex-col items-center gap-4 transition-opacity duration-300 ${
          showCommentScreen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        style={{ right: '0' }}
      >
        {/* Like Button */}
        <div className="flex flex-col items-center">
          <button className="w-10 h-10 flex items-center justify-center pointer-events-auto hover:scale-110 transition-transform">
            <Heart className="w-6 h-6 text-white drop-shadow-lg" />
          </button>
          <span className="text-white text-xs mt-1 font-medium drop-shadow-lg">
            {(selectedPostData?.likes || selectedPostData?.engagement?.likes || 0).toLocaleString()}
          </span>
        </div>
        
        {/* Comment Button */}
        <div className="flex flex-col items-center">
          <button 
            className="flex flex-col items-center gap-1 text-white hover:scale-110 transition-transform pointer-events-auto"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCommentScreenToggle?.(!showCommentScreen);
            }}
          >
            <InstagramCommentIcon className="w-6 h-6 text-white" />
            <span className="text-xs font-medium">
              {(selectedPostData?.comments || selectedPostData?.engagement?.comments || 0).toLocaleString()}
            </span>
          </button>
        </div>
        
        {/* Share Button */}
        <button className="w-10 h-10 flex items-center justify-center pointer-events-auto hover:scale-110 transition-transform">
          <Send className="w-6 h-6 text-white drop-shadow-lg" />
        </button>
        
        {/* Save Button */}
        <button className="w-10 h-10 flex items-center justify-center pointer-events-auto hover:scale-110 transition-transform">
          <Bookmark className="w-6 h-6 text-white drop-shadow-lg" />
        </button>
      </div>
    </div>
  </div>
);

export default ReelOverlay;
