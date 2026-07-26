/**
 * Veefore Analytics — Navigation Configuration.
 *
 * A lean, flat list of the analytics dashboards that are actually implemented
 * and backed by real metrics. We intentionally do NOT list aspirational sections
 * or features that already exist elsewhere in the app (Accounts, Social
 * Listening, Automation, etc.), and we avoid "coming soon" placeholder pages —
 * every entry here routes to a working dashboard (CODING_RULES Rule 16: don't
 * surface things that aren't real).
 *
 * Adding a new dashboard = add one entry here + its config + server spec.
 */

import { Home, LineChart, Users, Radar, Heart, FileText, CalendarDays, Sparkles, LayoutGrid, Clock, FileBarChart } from 'lucide-react'

import type { AnalyticsNavItem } from '../types'

/** Root path for the entire Analytics workspace. */
export const ANALYTICS_BASE_PATH = '/analytics'

/**
 * Build an absolute analytics path from segments, always rooted at
 * {@link ANALYTICS_BASE_PATH}. `buildPath()` returns the analytics home.
 */
export function buildPath(...segments: string[]): string {
  if (segments.length === 0) return ANALYTICS_BASE_PATH
  return [ANALYTICS_BASE_PATH, ...segments].join('/')
}

/**
 * The analytics navigation — a flat list of implemented dashboards, in display
 * order. Each item routes to a real dashboard backed by the metric engine.
 */
export const ANALYTICS_NAV_ITEMS: AnalyticsNavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    path: buildPath(),
    icon: Home,
    status: 'available',
    description: 'How is your business performing today?',
  },
  {
    id: 'executive',
    label: 'Executive',
    path: buildPath('executive'),
    icon: LineChart,
    status: 'available',
    description: 'High-level performance, growth, and publishing health.',
  },
  {
    id: 'audience',
    label: 'Audience',
    path: buildPath('audience'),
    icon: Users,
    status: 'available',
    description: 'Understand your audience: growth, churn, and retention.',
  },
  {
    id: 'reach',
    label: 'Reach',
    path: buildPath('reach'),
    icon: Radar,
    status: 'available',
    description: 'Organic, paid, and discovery reach and efficiency.',
  },
  {
    id: 'engagement',
    label: 'Engagement',
    path: buildPath('engagement'),
    icon: Heart,
    status: 'available',
    description: 'Interactions, shares, saves, and engagement quality.',
  },
  {
    id: 'insights',
    label: 'AI Insights',
    path: buildPath('insights'),
    icon: Sparkles,
    status: 'available',
    description: 'AI-generated summary, recommendations, and signals from your data.',
  },
  {
    id: 'content',
    label: 'Content',
    path: buildPath('content'),
    icon: FileText,
    status: 'available',
    description: 'Content performance across formats.',
  },
  {
    id: 'publishing',
    label: 'Publishing',
    path: buildPath('publishing'),
    icon: CalendarDays,
    status: 'available',
    description: 'Monitor publishing operations and health.',
  },
  {
    id: 'best-time',
    label: 'Best Time to Post',
    path: buildPath('best-time'),
    icon: Clock,
    status: 'available',
    description: 'Discover when your audience is most active.',
  },
  {
    id: 'builder',
    label: 'Dashboard Builder',
    path: buildPath('builder'),
    icon: LayoutGrid,
    status: 'available',
    description: 'Build your own dashboard — pick the KPIs and widgets you want to see.',
  },
  {
    id: 'reports',
    label: 'My Reports',
    path: buildPath('reports'),
    icon: FileBarChart,
    status: 'available',
    description: 'Create, customise, and export analytics reports as PDF, Excel, CSV, or PowerPoint.',
  },
]

/** The analytics home destination (Overview), used as the default landing. */
export const ANALYTICS_HOME_ITEM: AnalyticsNavItem = ANALYTICS_NAV_ITEMS[0]
