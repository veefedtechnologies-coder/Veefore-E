/**
 * EditorHeader Component
 * 
 * Header section for the video script editor with save status and controls.
 * Extracted from VideoScriptEditor.tsx for better maintainability.
 * 
 * Requirements: 2.2 (Codebase Refactoring and Optimization)
 * 
 * @module EditorHeader
 */

import React from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Save,
  Undo,
  Redo,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';

export interface EditorHeaderProps {
  /** Whether the editor is currently saving */
  isSaving: boolean;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
  /** Formatted last saved time string */
  lastSavedText: string;
  /** Whether the editor is in read-only mode */
  readOnly?: boolean;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Callback when undo is clicked */
  onUndo: () => void;
  /** Callback when redo is clicked */
  onRedo: () => void;
  /** Callback when manual save is clicked */
  onSave: () => void;
}

/**
 * EditorHeader Component
 * 
 * Displays editor status and provides undo/redo/save controls.
 */
export const EditorHeader: React.FC<EditorHeaderProps> = ({
  isSaving,
  hasUnsavedChanges,
  lastSavedText,
  readOnly = false,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
}) => {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Script Editor
              </CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Edit your video script and scenes
              </p>
            </div>
          </div>
          
          {/* Editor Actions */}
          <div className="flex items-center gap-2">
            {/* Save Status */}
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mr-4">
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : hasUnsavedChanges ? (
                <>
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  <span>Unsaved changes</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Saved {lastSavedText}</span>
                </>
              )}
            </div>
            
            {/* Undo/Redo */}
            {!readOnly && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onUndo}
                  disabled={!canUndo}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRedo}
                  disabled={!canRedo}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo className="w-4 h-4" />
                </Button>
                
                {/* Manual Save */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSave}
                  disabled={!hasUnsavedChanges || isSaving}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
};

export default EditorHeader;
