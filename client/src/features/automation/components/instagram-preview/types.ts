/**
 * Type definitions for Instagram Preview components
 */

export interface PostData {
  id: string;
  type?: 'post' | 'reel' | 'video' | 'carousel' | 'story';
  image?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  likes?: number;
  comments?: number;
  engagement?: {
    likes?: number;
    comments?: number;
  };
}

export interface AccountData {
  id: string;
  name: string;
  avatar?: string;
  platform?: string;
}

export interface DMButton {
  text: string;
  type: 'quick_reply' | 'web_url' | 'flow' | 'copy_code' | 'postback';
  url?: string;
}
