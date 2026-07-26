/**
 * Barrel for the per-route Page_Skeleton library.
 *
 * Re-exports pure, memoized page skeletons that compose the shared
 * Component_Skeletons (`@/components/skeletons`) + the `Skeleton` primitive
 * (`@/components/ui/skeleton`) to mirror full authenticated routes. Used as
 * React `Suspense` fallbacks in `AuthenticatedApp.tsx` (task 9.1).
 *
 * Spec: pixel-perfect-skeleton-loading.
 */

// Dashboard + best-time page skeletons (task 7.1)
export { DashboardSkeleton } from './DashboardSkeleton'
export { BestTimeSkeleton } from './BestTimeSkeleton'

// Posts-family + calendar page skeletons (task 7.2)
export { PostsSkeleton } from './PostsSkeleton'
export { ScheduledPostsSkeleton } from './ScheduledPostsSkeleton'
export { DraftsSkeleton } from './DraftsSkeleton'
export { PublishedPostsSkeleton } from './PublishedPostsSkeleton'
export { CreatePostSkeleton } from './CreatePostSkeleton'
export { PlanSkeleton } from './PlanSkeleton'

// Analytics + VeeGPT + automation page skeletons (task 7.3)
export { AnalyticsSkeleton } from './AnalyticsSkeleton'
export { PostAnalyticsSkeleton } from './PostAnalyticsSkeleton'
export { VeeGPTSkeleton } from './VeeGPTSkeleton'
export { AutomationSkeleton } from './AutomationSkeleton'

// Remaining authenticated-route page skeletons (task 7.4)
export { VideoGeneratorSkeleton } from './VideoGeneratorSkeleton'
export { ProfileSkeleton } from './ProfileSkeleton'
export { SettingsSkeleton } from './SettingsSkeleton'
export { SocialListeningSkeleton } from './SocialListeningSkeleton'
export { SecurityDashboardSkeleton } from './SecurityDashboardSkeleton'
export { AdminPanelSkeleton } from './AdminPanelSkeleton'
export { TestFixturesSkeleton } from './TestFixturesSkeleton'
export type { TestFixturesSkeletonProps } from './TestFixturesSkeleton'
export { EncryptionHealthSkeleton } from './EncryptionHealthSkeleton'
