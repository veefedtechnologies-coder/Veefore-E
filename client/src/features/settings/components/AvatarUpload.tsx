/**
 * Avatar Upload Component
 * 
 * Handles avatar image upload with preview and validation.
 * Supports file selection, upload, and removal.
 */

import { useRef } from 'react';
import { User, Upload, Trash2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AvatarUploadState } from '../types/profile.types';

interface AvatarUploadProps {
  currentAvatar?: string;
  avatarState: AvatarUploadState;
  onAvatarSelect: (file: File) => void;
  onAvatarUpload: () => void;
  onAvatarRemove: () => void;
  onAvatarCancel: () => void;
  isUploading: boolean;
  isRemoving: boolean;
}

export function AvatarUpload({
  currentAvatar,
  avatarState,
  onAvatarSelect,
  onAvatarUpload,
  onAvatarRemove,
  onAvatarCancel,
  isUploading,
  isRemoving,
}: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAvatarSelect(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const displayAvatar = avatarState.preview || currentAvatar;
  const hasNewAvatar = !!avatarState.preview;

  return (
    <div className="flex items-center gap-6 pb-6 border-b border-gray-100 dark:border-gray-700/50">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Avatar Preview */}
      <div className="relative">
        <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center border-4 border-white dark:border-gray-800 shadow-sm relative overflow-hidden group">
          {displayAvatar ? (
            <img
              src={displayAvatar}
              alt="Profile Avatar"
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-10 h-10 text-blue-600 dark:text-blue-400" />
          )}

          {/* Hover Overlay */}
          <div
            onClick={handleUploadClick}
            className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white text-xs font-medium cursor-pointer transition-all"
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Upload'}
          </div>
        </div>

        {/* New Avatar Indicator */}
        {hasNewAvatar && !isUploading && (
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800">
            <span className="text-white text-xs font-bold">!</span>
          </div>
        )}
      </div>

      {/* Avatar Actions */}
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
          Profile Picture
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          PNG, JPG up to 5MB
        </p>
        <div className="flex gap-3 flex-wrap">
          {hasNewAvatar ? (
            <>
              <Button
                type="button"
                onClick={onAvatarUpload}
                disabled={isUploading}
                className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm font-medium rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors flex items-center gap-2 disabled:opacity-70"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {isUploading ? 'Uploading...' : 'Save Avatar'}
              </Button>
              <Button
                type="button"
                onClick={onAvatarCancel}
                disabled={isUploading}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                onClick={handleUploadClick}
                disabled={isUploading || isRemoving}
                className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-medium rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-70"
              >
                Upload New
              </Button>
              {currentAvatar && (
                <Button
                  type="button"
                  onClick={onAvatarRemove}
                  disabled={isUploading || isRemoving}
                  className="px-4 py-2 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-70"
                >
                  {isRemoving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {isRemoving ? 'Removing...' : 'Remove'}
                </Button>
              )}
            </>
          )}
        </div>

        {/* Error Message */}
        {avatarState.error && (
          <p className="text-sm text-red-600 dark:text-red-400 mt-2">
            {avatarState.error}
          </p>
        )}
      </div>
    </div>
  );
}
