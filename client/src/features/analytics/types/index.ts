/**
 * Veefore Analytics — Shared Types (Phase 1: Product Foundation)
 *
 * Type definitions for the Analytics workspace shell, navigation, and routing.
 * These are the single source of truth for the navigation model and are
 * consumed by the sidebar, breadcrumb, layout, and route resolver.
 *
 * Docs: analytics/01-product-foundation.md (Ch 4 Sidebar Navigation, Ch 6
 * Dashboard Hierarchy), analytics/IMPLEMENTATION_ORDER.md (Phase 1).
 */

import type { LucideIcon } from 'lucide-react'

/**
 * Availability of a navigation destination.
 * - `available`  — a dedicated page exists (rendered by its own component).
 * - `coming-soon` — foundation placeholder; the page scaffold renders an
 *   empty/"coming soon" state until the destination is implemented in a later
 *   phase. No fabricated data is ever shown (CODING_RULES Rule 7 & Rule 16).
 */
export type AnalyticsNavStatus = 'available' | 'coming-soon'

/**
 * A single navigation destination. May contain nested children (e.g.
 * `Audience → Growth`). Leaf items map to a route; parent items may also be
 * routable landing pages for their group.
 */
export interface AnalyticsNavItem {
  /** Stable, unique identifier used as a React key and for active detection. */
  id: string
  /** Human-readable label rendered in the sidebar and breadcrumb. */
  label: string
  /** Absolute route path, always under {@link ANALYTICS_BASE_PATH}. */
  path: string
  /** Optional icon (leaf items usually inherit their section icon). */
  icon?: LucideIcon
  /** Availability status controlling which page body renders. */
  status: AnalyticsNavStatus
  /** Short description surfaced in the page header and placeholder body. */
  description?: string
  /** Nested destinations, rendered as an expandable group in the sidebar. */
  children?: AnalyticsNavItem[]
}

/**
 * A logical grouping of navigation destinations, rendered as a labeled,
 * collapsible section in the analytics sidebar.
 */
export interface AnalyticsNavSection {
  /** Stable, unique identifier used as a React key. */
  id: string
  /** Section heading (e.g. "Audience", "Engagement"). */
  title: string
  /** Section icon shown next to the heading. */
  icon: LucideIcon
  /** Destinations belonging to this section. */
  items: AnalyticsNavItem[]
}

/**
 * A single entry in the breadcrumb trail. Entries without a `path` are the
 * current (non-clickable) location.
 */
export interface AnalyticsBreadcrumbEntry {
  label: string
  path?: string
}

/**
 * Resolved routing context for the currently active analytics location,
 * produced by the route resolver and consumed by the layout and pages.
 */
export interface AnalyticsRouteMatch {
  /** The matched leaf navigation item, if any. */
  item: AnalyticsNavItem | null
  /** The section the matched item belongs to, if any. */
  section: AnalyticsNavSection | null
  /** Breadcrumb trail from the analytics root to the current location. */
  breadcrumbs: AnalyticsBreadcrumbEntry[]
}
