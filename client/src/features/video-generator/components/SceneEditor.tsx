/**
 * SceneEditor Component
 * 
 * Individual scene editing interface for video scripts.
 * Extracted from VideoScriptEditor.tsx for better maintainability.
 * 
 * Requirements: 2.2 (Codebase Refactoring and Optimization)
 * 
 * @module SceneEditor
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Clock,
  Eye,
  Sparkles,
} from 'lucide-react';
import { ScriptScene } from '../types';

export interface SceneEditorProps {
  /** The scene to edit */
  scene: ScriptScene;
  /** Scene index (1-based) */
  index: number;
  /** Whether this scene is currently being edited */
  isEditing: boolean;
  /** Whether the editor is in read-only mode */
  readOnly?: boolean;
  /** Callback when scene is updated */
  onSceneUpdate: (updatedScene: ScriptScene) => void;
  /** Callback when scene receives focus */
  onFocus: () => void;
  /** Callback when scene loses focus */
  onBlur: () => void;
}

/**
 * SceneEditor Component
 * 
 * Provides editing interface for individual video script scenes with:
 * - Visual description editing
 * - Visual elements configuration
 * - Narration/voiceover editing
 * - Scene duration control
 */
export const SceneEditor: React.FC<SceneEditorProps> = ({
  scene,
  index,
  isEditing,
  readOnly = false,
  onSceneUpdate,
  onFocus,
  onBlur,
}) => {
  return (
    <Card
      className={`bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 transition-all duration-200 ${
        isEditing ? 'ring-2 ring-purple-500' : ''
      }`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">{index}</span>
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Scene {index}
              </CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {scene.duration}s duration
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {scene.duration}s
            </Badge>
            {scene.narration && (
              <Badge variant="outline" className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {scene.narration.length} chars
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Scene Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Sparkles className="w-4 h-4 inline mr-1" />
            Visual Description
          </label>
          <Textarea
            value={scene.description}
            onChange={(e) => {
              if (!readOnly) {
                onSceneUpdate({ ...scene, description: e.target.value });
              }
            }}
            onFocus={onFocus}
            onBlur={onBlur}
            disabled={readOnly}
            className="w-full min-h-[80px] px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 resize-none"
            placeholder="Describe what viewers will see in this scene..."
          />
        </div>
        
        {/* Visual Elements */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Eye className="w-4 h-4 inline mr-1" />
            Visual Elements
          </label>
          <input
            type="text"
            value={scene.visualElements || ''}
            onChange={(e) => {
              if (!readOnly) {
                onSceneUpdate({ ...scene, visualElements: e.target.value });
              }
            }}
            onFocus={onFocus}
            onBlur={onBlur}
            disabled={readOnly}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
            placeholder="Camera angles, lighting, composition..."
          />
        </div>
        
        {/* Narration */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <FileText className="w-4 h-4 inline mr-1" />
            Voiceover / Narration
          </label>
          <Textarea
            value={scene.narration || ''}
            onChange={(e) => {
              if (!readOnly) {
                onSceneUpdate({ ...scene, narration: e.target.value });
              }
            }}
            onFocus={onFocus}
            onBlur={onBlur}
            disabled={readOnly}
            className="w-full min-h-[100px] px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 resize-none italic"
            placeholder="What the narrator will say during this scene..."
          />
        </div>
        
        {/* Scene Duration */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Clock className="w-4 h-4 inline mr-1" />
            Scene Duration (seconds)
          </label>
          <input
            type="number"
            min="1"
            max="60"
            value={scene.duration}
            onChange={(e) => {
              if (!readOnly) {
                const newDuration = parseInt(e.target.value) || 1;
                onSceneUpdate({ ...scene, duration: newDuration });
              }
            }}
            onFocus={onFocus}
            onBlur={onBlur}
            disabled={readOnly}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default SceneEditor;
