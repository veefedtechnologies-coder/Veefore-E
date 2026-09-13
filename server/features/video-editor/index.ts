/**
 * Video Editor Feature Module — public API.
 *
 * The Veefore AI Video Editor backend, delivered as a first-class capability
 * inside VeeGPT. This module mirrors `server/features/storage/` and maps every
 * component onto existing Veefore infrastructure (credit metering, StorageService,
 * BullMQ queues, AIServiceManager, workspace/auth middleware) rather than building
 * parallel systems.
 *
 * Structure:
 *   config/    — single-source Platform_Preset + threshold configuration (Req 13.1)
 *   services/  — Intent_Router, Editing_Planner, Model_Router, editors, etc.
 *   api/       — Express routers mounted at /api/video-editor
 */

// Single-source configuration (the ONE place preset/threshold values live).
export * from './config';

// Services and API surfaces are re-exported as they are implemented.
export * from './services';
export * from './api';
