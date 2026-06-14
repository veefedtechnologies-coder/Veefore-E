import React from 'react';
import { Camera } from 'lucide-react';
import { AccountData, DMButton } from './types';

interface DMPreviewProps {
  selectedAccountData?: AccountData;
  dmMessage?: string;
  dmButtons?: DMButton[];
  currentKeywords?: string[];
  followerGateEnabled?: boolean;
}

/**
 * DMPreview Component
 * Displays Instagram direct message preview with buttons and message formatting
 */
export const DMPreview: React.FC<DMPreviewProps> = ({ 
  selectedAccountData, 
  dmMessage, 
  dmButtons = [], 
  currentKeywords = [], 
  followerGateEnabled 
}) => (
  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-b-3xl shadow-sm max-w-sm mx-auto">
    <div className="p-4">
      {/* Message timestamp */}
      <div className="text-xs text-gray-500 dark:text-gray-400 text-center mb-4">
        JUL 15, 08:31 PM
      </div>
      
      {/* Message bubble with profile picture */}
      <div className="relative mb-4">
        <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-bl-sm p-4 max-w-[280px] ml-6">
          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {(() => {
              let text = dmMessage || "I'm so excited you'd like to see what I've got on offer!";
              text = text.replace(/\{\{username\}\}/g, 'john_smith');
              text = text.replace(/\{\{first_name\}\}/g, 'John');
              text = text.replace(/\{\{keyword\}\}/g, currentKeywords[0] || 'guide');
              text = text.replace(/\{\{link\}\}/g, (dmButtons.length > 0 && dmButtons[0].url) ? dmButtons[0].url : 'https://link...');
              return text;
            })()}
          </div>
          
          {/* Buttons inside message bubble */}
          {dmButtons.filter(b => b.text?.trim()).map((btn: DMButton, idx: number) => (
            <div 
              key={idx} 
              className={`rounded-lg p-3 text-center mt-3 cursor-pointer transition-colors border ${
                btn.type === 'quick_reply' 
                  ? 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:border-indigo-800' 
                  : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className={`text-sm font-medium ${
                btn.type === 'quick_reply' 
                  ? 'text-indigo-700 dark:text-indigo-300' 
                  : 'text-gray-800 dark:text-gray-200'
              }`}>
                {btn.text} {btn.type === 'quick_reply' ? '(Quick Reply)' : btn.type === 'copy_code' ? '(Copy)' : btn.type === 'flow' ? '(Flow)' : ''}
              </div>
            </div>
          ))}
        </div>
        
        {/* Profile picture positioned at bottom-left corner */}
        <img 
          src={selectedAccountData?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face&auto=format'} 
          alt="Profile" 
          className="absolute bottom-0 left-0 w-8 h-8 rounded-full border-2 border-white bg-white ml-[-11px]" 
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
        <div className="flex items-center gap-2 text-gray-500">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path d="M12 14l9-5-9-5-9 5 9 5z"/>
          </svg>
        </div>
      </div>
    </div>
  </div>
);

export default DMPreview;
