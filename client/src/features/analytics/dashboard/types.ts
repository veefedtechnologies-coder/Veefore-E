/**
 * Veefore Analytics — Dashboard Framework Types (Phase 4).
 *
 * Types for the standardized dashboard composition, responsive grid, and
 * drill-down navigation (03-design-system.md Ch 2, 9, 10; 06-dashboard-
 * specifications.md Ch 1, 13).
 */

import type { ReactNode } from 'react'

/** A 12-column grid span (1–12). */
export type GridSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

/**
 * The ordered content slots of a dashboard. The framework renders present slots
 * in the documented order and never changes it (CODING_RULES Rule 6;
 * 06-dashboard-specifications.md Ch 1):
 *
 *   Header → Filters → AI Summary → KPIs → Primary Charts → Secondary Charts →
 *   Tables → Recommendations → Alerts → Export/Actions.
 *
 * Any slot may be omitted; omitted slots render nothing.
 */
export interface DashboardSlots {
  /** Global filter bar (03-design-system.md Ch 3). */
  filters?: ReactNode
  /** AI executive summary (11-ai-intelligence-engine.md Ch 3). */
  aiSummary?: ReactNode
  /** KPI strip. */
  kpis?: ReactNode
  /** Primary interactive charts (2–4 large charts). */
  primaryCharts?: ReactNode
  /** Secondary/supporting insights. */
  secondaryCharts?: ReactNode
  /** Detailed tables. */
  tables?: ReactNode
  /** AI recommendations. */
  recommendations?: ReactNode
  /** Recent alerts. */
  alerts?: ReactNode
  /** Export / share / schedule actions row. */
  actions?: ReactNode
}

/**
 * A drill-down target. Progressive exploration should never hit a dead end
 * (03-design-system.md Ch 9). Targets are documented route paths; callers supply
 * them so no routes are invented by the framework.
 */
export interface DrillDownTarget {
  /** Absolute route path to navigate to. */
  path: string
  /** Optional human-readable label (for tooltips / aria). */
  label?: string
}
