/**
 * Video Editor (client) — hooks.
 *
 * Data-fetching and conversational-editing hooks for the editor surface.
 */

export { useVideoEditorContext } from './useVideoEditorContext';
export { useVideoEditorProject, videoEditorProjectsKey } from './useVideoEditorProject';
export type { UseVideoEditorProjectResult } from './useVideoEditorProject';
export { useVideoEditorSource } from './useVideoEditorSource';
export type { UseVideoEditorSourceResult } from './useVideoEditorSource';
export { useVideoEditorConverse } from './useVideoEditorConverse';
export type {
  ConverseTurn,
  SendTurnOptions,
  UseVideoEditorConverseResult,
} from './useVideoEditorConverse';
export { useVideoEditorVersions, videoEditorVersionsKey } from './useVideoEditorVersions';
export type { UseVideoEditorVersionsResult } from './useVideoEditorVersions';
export { useVideoEditorJob } from './useVideoEditorJob';
export type { UseVideoEditorJobResult } from './useVideoEditorJob';
export { useSignedArtifactUrl } from './useSignedArtifactUrl';
export type { UseSignedArtifactUrlResult } from './useSignedArtifactUrl';
