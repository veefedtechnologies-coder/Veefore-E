/**
 * ScriptOverview Component
 * 
 * Overview section displaying script statistics and title editor.
 * Extracted from VideoScriptEditor.tsx for better maintainability.
 * 
 * Requirements: 2.2 (Codebase Refactoring and Optimization)
 * 
 * @module ScriptOverview
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { GeneratedScript } from '../types';

export interface ScriptOverviewProps {
  /** The script being edited */
  script: GeneratedScript;
  /** Total character count across all scenes */
  totalCharacters: number;
  /** Estimated word count */
  estimatedWords: number;
  /** Whether the editor is in read-only mode */
  readOnly?: boolean;
  /** Callback when script title is updated */
  onTitleUpdate: (title: string) => void;
}

/**
 * ScriptOverview Component
 * 
 * Displays script statistics and provides title editing.
 */
export const ScriptOverview: React.FC<ScriptOverviewProps> = ({
  script,
  totalCharacters,
  estimatedWords,
  readOnly = false,
  onTitleUpdate,
}) => {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 mb-6">
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {script.scenes.length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Scenes</div>
          </div>
          
          <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {script.totalDuration}s
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Duration</div>
          </div>
          
          <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {totalCharacters}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Characters</div>
          </div>
          
          <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {estimatedWords}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Est. Words</div>
          </div>
        </div>
        
        {/* Script Title */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Video Title
          </label>
          <input
            type="text"
            value={script.title}
            onChange={(e) => {
              if (!readOnly) {
                onTitleUpdate(e.target.value);
              }
            }}
            disabled={readOnly}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
            placeholder="Enter video title..."
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default ScriptOverview;
