/**
 * Video Generator Feature Module
 * 
 * Exports all components, hooks, and types for the video generator feature.
 * Part of the refactoring initiative to decompose VideoGeneratorAdvanced.tsx (3,125 lines)
 * into smaller, focused modules.
 */

// Components
export { VideoPromptStep } from './components/VideoPromptStep';
export { VideoSettingsStep } from './components/VideoSettingsStep';
export { VideoScriptEditor } from './components/VideoScriptEditor';
export { VideoPreview } from './components/VideoPreview';

// Hooks
export { useVideoGeneration } from './hooks/useVideoGeneration';

// Types
export type {
  ScriptScene,
  GeneratedScript,
  VideoSettings,
  VideoJob,
  VideoProject,
  CurrentStep
} from './types';
