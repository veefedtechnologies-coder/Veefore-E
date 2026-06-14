import React from 'react';

interface InstagramCommentIconProps {
  className?: string;
  [key: string]: any;
}

/**
 * Instagram Comment Icon Component
 * Authentic rounded speech bubble icon matching Instagram's design
 */
export const InstagramCommentIcon: React.FC<InstagramCommentIconProps> = ({ 
  className = "w-6 h-6", 
  ...props 
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22l-1.344-4.992z" />
  </svg>
);

export default InstagramCommentIcon;
