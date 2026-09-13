/**
 * Video Editor API — public surface.
 *
 * Express routers mounted at `/api/video-editor` (guarded by `requireAuth` then
 * `validateWorkspaceAccess` + per-project ownership) are exported here as they
 * are implemented. The router is mounted in `server/routes.ts` (task 5.3).
 */

// Shared error-envelope + secret-redaction helpers (task 21.1, Req 19.8, 21.6,
// 21.7, 23.4, 23.5) used by every router below.
export * from './error-envelope';

// Video_Project CRUD router (task 5.1, Req 21.1–21.3, 19.1, 19.2).
export * from './project.routes';

// Video_Artifact signed-URL router (task 5.3, Req 19.3, 19.4, 21.1).
export * from './artifact.routes';

// Conversational multi-turn editing router over the NDJSON transport
// (task 20.1, Req 16.1, 16.2, 18.4).
export * from './conversation.routes';
