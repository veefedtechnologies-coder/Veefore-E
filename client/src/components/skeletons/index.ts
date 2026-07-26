/**
 * Barrel for the shared Component_Skeleton library.
 *
 * Re-exports pure, memoized skeletons that compose the `Skeleton` primitive
 * (`@/components/ui/skeleton`) to mirror reusable data-dependent components.
 *
 * Spec: pixel-perfect-skeleton-loading.
 */

// Card / metric component skeletons (task 6.1)
export { KpiCardSkeleton } from './KpiCardSkeleton'
export { PerformanceScoreSkeleton } from './PerformanceScoreSkeleton'
export { SocialAccountCardSkeleton } from './SocialAccountCardSkeleton'
export { NotificationCardSkeleton } from './NotificationCardSkeleton'

// Form component skeleton (task 6.1)
export { FormSkeleton } from './FormSkeleton'
export type { FormSkeletonProps } from './FormSkeleton'

// Chart / table / list component skeletons (task 6.2)
export { ChartSkeleton } from './ChartSkeleton'
export { TableSkeleton } from './TableSkeleton'
export type { TableSkeletonProps } from './TableSkeleton'
export { ConversationListItemSkeleton } from './ConversationListItemSkeleton'
export { PostCardSkeleton } from './PostCardSkeleton'

// Conditional-rendering-parity widget skeleton (task 6.4) — mirrors the
// BestTimeWidget populated data-card variant only (R9.2).
export { BestTimeWidgetSkeleton } from './BestTimeWidgetSkeleton'

// Layout / chat component skeletons (task 6.3)
export { SidebarSkeleton } from './SidebarSkeleton'
export { HeaderSkeleton } from './HeaderSkeleton'
export { ChatBubbleSkeleton } from './ChatBubbleSkeleton'
export type { ChatBubbleSkeletonProps } from './ChatBubbleSkeleton'

// Full authenticated app-shell skeleton — eager, lightweight; painted instantly
// by `App.tsx` while auth resolves and the AuthenticatedApp chunk downloads.
export { AppShellSkeleton } from './AppShellSkeleton'
