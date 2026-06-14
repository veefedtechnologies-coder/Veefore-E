import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { AccountData } from './types';

interface PostHeaderProps {
  selectedAccountData?: AccountData;
  selectedAccount?: string;
}

/**
 * PostHeader Component
 * Displays the Instagram post header with profile picture, username, and options
 */
export const PostHeader: React.FC<PostHeaderProps> = ({ 
  selectedAccountData, 
  selectedAccount 
}) => (
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
        <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
          {selectedAccountData?.name || 'your_account'}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">2 hours ago • 📍 Location</div>
      </div>
    </div>
    <MoreHorizontal className="w-6 h-6 text-gray-700 dark:text-gray-300" />
  </div>
);

export default PostHeader;
