/**
 * VideoScriptEditor Component
 * 
 * A rich text editor for video script editing with the following features:
 * - Syntax highlighting for video script format (scenes, narration, visual elements)
 * - Auto-save functionality with debouncing (500ms delay)
 * - Undo/redo support
 * - Scene-based editing with visual indicators
 * - Real-time character and duration tracking
 * 
 * Refactored to reduce file size by extracting components and utilities.
 * 
 * Requirements: 2.2, 2.4 (Codebase Refactoring and Optimization)
 * 
 * @module VideoScriptEditor
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings } from 'lucide-react';
import { GeneratedScript, ScriptScene } from '../types';
import { EditorHeader } from './EditorHeader';
import { ScriptOverview } from './ScriptOverview';
import { SceneEditor } from './SceneEditor';
import { 
  getTotalCharacterCount, 
  getEstimatedWordCount, 
  formatLastSaved 
} from '../utils/editorUtils';

export interface VideoScriptEditorProps {
  /** The generated script to edit */
  script: GeneratedScript;
  /** Callback when script is updated */
  onScriptUpdate?: (script: GeneratedScript) => void;
  /** Callback when a scene is updated */
  onSceneUpdate?: (sceneId: string, updatedScene: ScriptScene) => void;
  /** Whether the editor is in read-only mode */
  readOnly?: boolean;
  /** Auto-save delay in milliseconds (default: 500ms) */
  autoSaveDelay?: number;
  /** Callback when auto-save occurs */
  onAutoSave?: (script: GeneratedScript) => void;
  /** Class name for custom styling */
  className?: string;
}

interface EditorHistory {
  script: GeneratedScript;
  timestamp: number;
}

/**
 * VideoScriptEditor Component
 * 
 * Provides a comprehensive editing interface for video scripts with:
 * - Scene-by-scene editing
 * - Auto-save with debouncing
 * - Undo/redo functionality
 * - Syntax highlighting for script elements
 * - Duration and character count tracking
 */
export const VideoScriptEditor: React.FC<VideoScriptEditorProps> = ({
  script: initialScript,
  onScriptUpdate,
  onSceneUpdate,
  readOnly = false,
  autoSaveDelay = 500,
  onAutoSave,
  className = '',
}) => {
  // State management
  const [script, setScript] = useState<GeneratedScript>(initialScript);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  
  // History for undo/redo
  const [history, setHistory] = useState<EditorHistory[]>([
    { script: initialScript, timestamp: Date.now() }
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  // Refs
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scriptRef = useRef<GeneratedScript>(initialScript);

  /**
   * Update script reference when script changes
   */
  useEffect(() => {
    scriptRef.current = script;
  }, [script]);

  /**
   * Auto-save functionality with debouncing
   * Triggers save after specified delay of inactivity
   */
  useEffect(() => {
    if (!hasUnsavedChanges || readOnly) return;

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Set new timer for auto-save
    autoSaveTimerRef.current = setTimeout(() => {
      handleAutoSave();
    }, autoSaveDelay);

    // Cleanup on unmount
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [script, hasUnsavedChanges, autoSaveDelay, readOnly]);

  /**
   * Handle auto-save operation
   */
  const handleAutoSave = useCallback(async () => {
    setIsSaving(true);
    
    try {
      // Call the onAutoSave callback if provided
      if (onAutoSave) {
        await onAutoSave(scriptRef.current);
      }
      
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      console.log('[VideoScriptEditor] Auto-save completed');
    } catch (error) {
      console.error('[VideoScriptEditor] Auto-save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [onAutoSave]);

  /**
   * Update script and add to history
   */
  const updateScript = useCallback((updatedScript: GeneratedScript) => {
    setScript(updatedScript);
    setHasUnsavedChanges(true);
    
    // Add to history (remove any future history if we're not at the end)
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ script: updatedScript, timestamp: Date.now() });
    
    // Limit history to 50 entries
    if (newHistory.length > 50) {
      newHistory.shift();
    } else {
      setHistoryIndex(historyIndex + 1);
    }
    
    setHistory(newHistory);
    
    // Notify parent component
    if (onScriptUpdate) {
      onScriptUpdate(updatedScript);
    }
  }, [history, historyIndex, onScriptUpdate]);

  /**
   * Update a specific scene
   */
  const updateScene = useCallback((sceneId: string, updatedScene: ScriptScene) => {
    const updatedScenes = script.scenes.map(scene =>
      scene.id === sceneId ? updatedScene : scene
    );
    
    const updatedScript = {
      ...script,
      scenes: updatedScenes,
      totalDuration: updatedScenes.reduce((sum, scene) => sum + scene.duration, 0),
    };
    
    updateScript(updatedScript);
    
    if (onSceneUpdate) {
      onSceneUpdate(sceneId, updatedScene);
    }
  }, [script, updateScript, onSceneUpdate]);

  /**
   * Undo last change
   */
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setScript(history[newIndex].script);
      setHasUnsavedChanges(true);
    }
  }, [history, historyIndex]);

  /**
   * Redo last undone change
   */
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setScript(history[newIndex].script);
      setHasUnsavedChanges(true);
    }
  }, [history, historyIndex]);

  /**
   * Manual save
   */
  const handleManualSave = useCallback(async () => {
    await handleAutoSave();
  }, [handleAutoSave]);

  /**
   * Calculate script statistics
   */
  const totalCharacters = getTotalCharacterCount(script);
  const estimatedWords = getEstimatedWordCount(totalCharacters);
  const lastSavedText = formatLastSaved(lastSaved);

  return (
    <div className={`video-script-editor ${className}`}>
      {/* Editor Header */}
      <EditorHeader
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        lastSavedText={lastSavedText}
        readOnly={readOnly}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleManualSave}
      />

      {/* Script Overview */}
      <ScriptOverview
        script={script}
        totalCharacters={totalCharacters}
        estimatedWords={estimatedWords}
        readOnly={readOnly}
        onTitleUpdate={(title) => updateScript({ ...script, title })}
      />

      {/* Scene Editor */}
      <div className="space-y-4">
        {script.scenes.map((scene, index) => (
          <SceneEditor
            key={scene.id}
            scene={scene}
            index={index + 1}
            isEditing={editingSceneId === scene.id}
            readOnly={readOnly}
            onSceneUpdate={(updatedScene) => updateScene(scene.id, updatedScene)}
            onFocus={() => setEditingSceneId(scene.id)}
            onBlur={() => setEditingSceneId(null)}
          />
        ))}
      </div>

      {/* Editor Footer */}
      {!readOnly && (
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                Auto-save Enabled
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Your changes are automatically saved after {autoSaveDelay}ms of inactivity.
                You can also save manually using the Save button.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoScriptEditor;
