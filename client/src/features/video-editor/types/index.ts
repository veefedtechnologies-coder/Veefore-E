/**
 * Video Editor (client) — shared types.
 *
 * Frontend-facing types for the editor surface. Preset/threshold values remain
 * server-authoritative (`server/features/video-editor/config/`); the client only
 * models the context it needs to gate credit-consuming actions and render state.
 */

/**
 * The active workspace's brand profile, as surfaced to the editor. Derived from
 * the workspace record loaded by the existing workspace service (Req 1.4). Kept
 * intentionally small — only what the editor needs to apply brand-aware defaults.
 */
export interface VideoEditorBrandProfile {
  /** Workspace id the brand belongs to. */
  workspaceId: string;
  /** Human-readable workspace/brand name. */
  name: string;
  /** Visual theme key (drives brand-aware defaults). */
  theme?: string;
  /** AI persona/personality configured for the workspace. */
  aiPersonality?: string;
}

/**
 * A single video attached to the VeeGPT conversation that opened the editor.
 * When present, the editor reuses it as an input source without a re-upload
 * (Req 1.7). The conversational source panel (task 23.4) consumes this.
 */
export interface VideoEditorAttachedSource {
  /** Video_Source id, when the attachment resolved to a stored source. */
  id?: string;
  /** Direct URL to the attached video, when passed by reference. */
  url?: string;
}

/**
 * The `data` payload returned by `POST /api/video-editor/projects/:id/sources`
 * once an uploaded/linked video has been validated, stored, and probed. A
 * `durationMs > 0` means the source is analyzable and the editor can plan
 * against it (this is the gate the `/converse` route enforces).
 */
export interface VideoEditorIngestedSource {
  projectId: string;
  sourceId: string;
  storageKey: string;
  container: string;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  status: 'ready';
  /** Whether background analysis was successfully enqueued (best-effort). */
  analysisQueued: boolean;
}

/**
 * Resolved workspace context for the editor — subscription tier, credit balance,
 * and brand profile pulled from the existing subscription and workspace services
 * (Req 1.4).
 */
export interface VideoEditorWorkspaceContext {
  /** Active workspace id, or null when none is associated with the session. */
  workspaceId: string | null;
  /** Active workspace name, when available. */
  workspaceName: string | null;
  /** Subscription tier / plan id (e.g. 'free', 'creator', 'pro'). */
  subscriptionTier: string | null;
  /** Current remaining AI credit balance for the workspace. */
  creditBalance: number | null;
  /** Active workspace brand profile, when retrievable. */
  brandProfile: VideoEditorBrandProfile | null;
}

/**
 * Discriminated gate status for the editor surface.
 *  - `loading`      — workspace context is still resolving.
 *  - `no-workspace` — no active workspace; the editor MUST NOT open (Req 1.6).
 *  - `ready`        — a workspace is active; the editor opens. `contextAvailable`
 *                     reflects whether tier/credits/brand were retrievable
 *                     (Req 1.4/1.5) and `canConsumeCredits` gates paid actions.
 */
export type VideoEditorGateStatus = 'loading' | 'no-workspace' | 'ready';

export interface VideoEditorGate {
  status: VideoEditorGateStatus;
  /** True while the subscription/credit/brand context is still resolving. */
  contextResolving: boolean;
  /**
   * True when subscription tier, credit balance, and brand profile were all
   * retrieved. When false (and not resolving) the editor shows an error
   * indication and blocks credit-consuming actions (Req 1.5).
   */
  contextAvailable: boolean;
  /**
   * Whether credit-consuming edit actions are permitted. Only true when the
   * workspace context is fully available (Req 1.5). The credit-estimate
   * confirmation UI (task 23.5) reads this before executing a generative op.
   */
  canConsumeCredits: boolean;
}

/**
 * The full context object exposed by {@link useVideoEditorContext}: the resolved
 * gate plus the workspace context and any attached source. Follow-up tasks
 * (23.4 conversational box, 23.5 credit-estimate UI) consume this seam.
 */
export interface VideoEditorContextValue {
  gate: VideoEditorGate;
  context: VideoEditorWorkspaceContext;
  attachedSource: VideoEditorAttachedSource | null;
}

/**
 * A `Video_Project` as surfaced to the client by the project CRUD endpoints
 * (`GET /api/video-editor/projects`). The editor operates against exactly one
 * active project; the conversational box, job panel, and version panel are all
 * scoped to it.
 */
export interface VideoEditorProject {
  projectId: string;
  userId: string;
  workspaceId: string;
  name: string;
  activeVersionId?: string;
  targetPlatform?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * An immutable `Video_Version` as returned by `GET .../versions`. Versions form
 * an append-only history; `parentVersionId` records lineage and `createdAt` is
 * an epoch-millis timestamp (Req 16.4–16.6).
 */
export interface VideoEditorVersion {
  versionId: string;
  parentVersionId: string | null;
  timelineId: string;
  createdAt: number;
  label?: string;
}

/** The `GET .../versions` response payload (inside the `data` envelope). */
export interface VideoEditorVersionsResponse {
  projectId: string;
  versions: VideoEditorVersion[];
  activeVersionId: string | null;
}
