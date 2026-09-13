/**
 * Video Editor Feature Module (client)
 *
 * Frontend surface for the Veefore AI Video Editor, delivered inside the VeeGPT
 * experience. Mirrors `client/src/features/video-generator/` and reuses the
 * existing design system, `useChatStream` NDJSON transport, and signed-URL
 * previews.
 *
 * Structure:
 *   components/ — editor surface, job/progress + version panels
 *   hooks/      — data + conversational-editing hooks
 *   types/      — shared frontend types
 *   constants/  — client-side constants
 *   utils/      — helpers
 *
 * Components, hooks, and types are re-exported here as they are implemented.
 */

export {
  VideoEditorPage,
  ConversationalEditBox,
  JobProgressPanel,
  VersionPanel,
  VideoPreview,
} from './components';

export {
  useVideoEditorContext,
  useVideoEditorProject,
  useVideoEditorConverse,
  useVideoEditorVersions,
  useVideoEditorJob,
  useSignedArtifactUrl,
} from './hooks';

export type {
  VideoEditorBrandProfile,
  VideoEditorAttachedSource,
  VideoEditorWorkspaceContext,
  VideoEditorGateStatus,
  VideoEditorGate,
  VideoEditorContextValue,
  VideoEditorProject,
  VideoEditorVersion,
  VideoEditorVersionsResponse,
} from './types';
