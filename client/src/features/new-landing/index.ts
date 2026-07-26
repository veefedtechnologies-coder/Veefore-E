/**
 * New Landing Page Feature Module
 *
 * Public entry point for the brand-new Veefore marketing landing page served
 * only at `/landing`. This module is fully self-contained and does not modify
 * the existing landing feature (`client/src/features/landing/`).
 *
 * Re-exports the `NewLandingPage` orchestrator as both a named and default
 * export so the route can lazy-load it via either binding.
 *
 * Requirements: 1.1, 3.4
 */

export { NewLandingPage, default } from './NewLandingPage'
export { PublicPageLayout } from './PublicPageLayout'
