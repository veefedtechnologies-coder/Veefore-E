import React from 'react';
import { Heart, Send, Bookmark } from 'lucide-react';
import { InstagramCommentIcon } from './InstagramCommentIcon';
import { PostData, AccountData } from './types';

interface PostActionsProps {
  selectedPostData: PostData;
  selectedAccountData?: AccountData;
}

/**
 * PostActions Component
 * Displays Instagram post action buttons and engagement stats
 */
export const PostActions: React.FC<PostActionsProps> = ({ 
  selectedPostData, 
  selectedAccountData 
}) => (
  <div className="p-3">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-4">
        <Heart className="w-6 h-6 text-gray-700 dark:text-gray-300 hover:text-red-500 transition-colors cursor-pointer" />
        <InstagramCommentIcon className="w-6 h-6 text-gray-700 dark:text-gray-300 hover:text-gray-900 transition-colors cursor-pointer" />
        <Send className="w-6 h-6 text-gray-700 dark:text-gray-300 hover:text-gray-900 transition-colors cursor-pointer" />
      </div>
      <Bookmark className="w-6 h-6 text-gray-700 dark:text-gray-300 hover:text-gray-900 transition-colors cursor-pointer" />
    </div>
    
    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
      {(selectedPostData?.likes || selectedPostData?.engagement?.likes || 0).toLocaleString()} likes
    </div>
    
    {selectedPostData?.caption && (
      <div className="text-sm text-gray-900 dark:text-gray-100 mb-2">
        <span className="font-semibold mr-2">{selectedAccountData?.name?.replace('@', '') || 'your_account'}</span>
        {selectedPostData.caption}
      </div>
    )}
    
    <div className="text-sm text-gray-500 dark:text-gray-400">
      View all {(selectedPostData?.comments || selectedPostData?.engagement?.comments || 0).toLocaleString()} comments
    </div>
  </div>
);

export default PostActions;
