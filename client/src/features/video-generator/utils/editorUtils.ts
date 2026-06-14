/**
 * Editor Utility Functions
 * 
 * Helper functions for the video script editor.
 * Extracted from VideoScriptEditor.tsx for better maintainability.
 * 
 * Requirements: 2.2 (Codebase Refactoring and Optimization)
 * 
 * @module editorUtils
 */

import { GeneratedScript } from '../types';

/**
 * Calculate total character count across all scenes
 */
export const getTotalCharacterCount = (script: GeneratedScript): number => {
  return script.scenes.reduce((count, scene) => {
    return count + (scene.narration?.length || 0) + (scene.description?.length || 0);
  }, 0);
};

/**
 * Calculate estimated word count from character count
 * Uses average of 5 characters per word
 */
export const getEstimatedWordCount = (characterCount: number): number => {
  return Math.ceil(characterCount / 5);
};

/**
 * Format last saved timestamp for display
 */
export const formatLastSaved = (lastSaved: Date | null): string => {
  if (!lastSaved) return 'Never';
  
  const now = new Date();
  const diff = now.getTime() - lastSaved.getTime();
  const seconds = Math.floor(diff / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 120) return '1 minute ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  
  return lastSaved.toLocaleTimeString();
};
