// Production-only no-op stub for the agentation dev overlay.
//
// In development (vite.config.ts / vite.client.config.ts) the alias pointing
// here has been REMOVED — Vite resolves to the real installed package in
// `client/node_modules/agentation`, so `<Agentation />` renders the real
// overlay widget.
//
// This file is kept as a safety net in case a bundler path ever needs a
// fallback, but it should NOT be aliased in any active Vite config.

/** No-op stand-in — only used if this file is explicitly aliased. */
export const Agentation = (): null => null

export default {}
