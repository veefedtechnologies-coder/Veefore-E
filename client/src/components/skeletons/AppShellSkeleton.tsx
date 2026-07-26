import React from 'react'
import { SidebarSkeleton } from './SidebarSkeleton'
import { HeaderSkeleton } from './HeaderSkeleton'
import { getBootstrapChrome, type ShellChrome } from '@/lib/bootstrap'
import {
  DashboardSkeleton,
  PostsSkeleton,
  ScheduledPostsSkeleton,
  DraftsSkeleton,
  PublishedPostsSkeleton,
  CreatePostSkeleton,
  PlanSkeleton,
  AnalyticsSkeleton,
  PostAnalyticsSkeleton,
  VeeGPTSkeleton,
  AutomationSkeleton,
  VideoGeneratorSkeleton,
  ProfileSkeleton,
  SettingsSkeleton,
  SocialListeningSkeleton,
  SecurityDashboardSkeleton,
  TestFixturesSkeleton,
  EncryptionHealthSkeleton,
} from './pages'

/**
 * AppShellSkeleton — the full authenticated app shell rendered as a skeleton:
 * the icon-rail sidebar, the (route-appropriate) header bar, and the matching
 * per-route page skeleton.
 *
 * Unlike the per-page skeletons (which live inside the lazily-loaded
 * `AuthenticatedApp` bundle), this component is intentionally lightweight and
 * eagerly importable from `App.tsx`, so it can paint INSTANTLY:
 *   - while Firebase auth is still resolving for a (likely) logged-in user,
 *   - while onboarding status is being resolved,
 *   - while the lazy `AuthenticatedApp` JS chunk is still downloading.
 *
 * It is **route-aware**: given the current pathname it renders the same shell
 * variant and the same Page_Skeleton that `AuthenticatedApp.tsx` uses for that
 * route — so a deep-link to e.g. `/analytics` paints the analytics skeleton (not
 * the dashboard), with zero layout shift when the real layout mounts.
 *
 * Three shell variants mirror `AuthenticatedApp.tsx`:
 *   - `StandardShell`  — sidebar + header + `<main className="… p-6 …">`
 *     (most routes; `/settings` uses the unpadded content wrapper).
 *   - `NoHeaderShell`  — sidebar + content, no header (`/automation`,
 *     `/video-generator`).
 *   - `VeeGPTShell`    — sidebar + full-height VeeGPT canvas (`/veegpt`); the
 *     welcome-vs-chat layout + conversation sidebar are decided inside
 *     `VeeGPTSkeleton` from the page's persisted localStorage signals.
 *   - bare            — no shell (`/security-dashboard` renders its own page).
 *
 * Pure and presentational — no data, no effects, no interactivity.
 */

/** sidebar + header + scrollable main — matches `DashboardLayout` / the `/` route. */
function StandardShell({ children, padded = true, pathname, chrome }: { children: React.ReactNode; padded?: boolean; pathname?: string; chrome?: ShellChrome }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
      <div className="h-screen overflow-y-auto bg-white dark:bg-gray-800 transition-colors duration-300">
        <SidebarSkeleton pathname={pathname} />
      </div>
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <HeaderSkeleton chrome={chrome} />
        {padded ? (
          <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
            {children}
          </main>
        ) : (
          <div className="flex-1 overflow-y-auto">{children}</div>
        )}
      </div>
    </div>
  )
}

/** sidebar + content, NO header — matches `/automation`, `/video-generator`. */
function NoHeaderShell({ children, pathname }: { children: React.ReactNode; pathname?: string }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
      <div className="h-screen overflow-y-auto">
        <SidebarSkeleton pathname={pathname} />
      </div>
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
          {children}
        </main>
      </div>
    </div>
  )
}

/**
 * VeeGPT shell — sidebar icon-rail + the full-height VeeGPT canvas, mirroring
 * the `/veegpt` route EXACTLY (`h-screen` flex, no header, the content column is
 * `flex-1 h-screen overflow-hidden bg-gray-50 dark:bg-slate-900` with no extra
 * flex wrapper). The conditional welcome-vs-chat layout and whether the
 * conversation sidebar shows are decided inside `VeeGPTSkeleton` itself (it
 * reads the page's persisted `veegpt-state` / `veegpt-has-conversations`
 * signals), so we just hand it the matching slot.
 */
function VeeGPTShell({ pathname, chrome }: { pathname?: string; chrome?: ShellChrome }) {
  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden relative transition-colors duration-300">
      <div className="h-screen overflow-y-auto">
        <SidebarSkeleton pathname={pathname} />
      </div>
      <div className="flex-1 h-screen overflow-hidden bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
        <VeeGPTSkeleton chrome={chrome} />
      </div>
    </div>
  )
}

/**
 * Map the current pathname to the matching shell + Page_Skeleton, mirroring the
 * route table in `AuthenticatedApp.tsx`. Order matters: more specific prefixes
 * are checked before their parents.
 */
function resolveRouteSkeleton(pathname: string, chrome?: ShellChrome): React.ReactElement {
  const p = pathname || '/'

  // Bare — route renders its own full page, no app shell.
  if (p.startsWith('/security-dashboard')) return <SecurityDashboardSkeleton />

  // No-header shells.
  if (p.startsWith('/veegpt')) return <VeeGPTShell pathname={p} chrome={chrome} />
  if (p.startsWith('/video-generator')) return <NoHeaderShell pathname={p}><VideoGeneratorSkeleton /></NoHeaderShell>
  if (p.startsWith('/automation')) return <NoHeaderShell pathname={p}><AutomationSkeleton /></NoHeaderShell>

  // Standard shells (sidebar + header + main).
  if (p.startsWith('/settings')) return <StandardShell pathname={p} chrome={chrome} padded={false}><SettingsSkeleton /></StandardShell>
  if (p.startsWith('/plan')) return <StandardShell pathname={p} chrome={chrome}><PlanSkeleton /></StandardShell>
  if (p.startsWith('/posts/scheduled')) return <StandardShell pathname={p} chrome={chrome}><ScheduledPostsSkeleton /></StandardShell>
  if (p.startsWith('/posts/drafts')) return <StandardShell pathname={p} chrome={chrome}><DraftsSkeleton /></StandardShell>
  if (p.startsWith('/posts/published')) return <StandardShell pathname={p} chrome={chrome}><PublishedPostsSkeleton /></StandardShell>
  if (p.startsWith('/posts')) return <StandardShell pathname={p} chrome={chrome}><PostsSkeleton /></StandardShell>
  if (p.startsWith('/create')) return <StandardShell pathname={p} chrome={chrome}><CreatePostSkeleton /></StandardShell>
  if (p.startsWith('/analytics/post')) return <StandardShell pathname={p} chrome={chrome}><PostAnalyticsSkeleton /></StandardShell>
  if (p.startsWith('/analytics')) return <StandardShell pathname={p} chrome={chrome}><AnalyticsSkeleton /></StandardShell>
  if (p.startsWith('/profile')) return <StandardShell pathname={p} chrome={chrome}><ProfileSkeleton /></StandardShell>
  if (p.startsWith('/social-listening')) return <StandardShell pathname={p} chrome={chrome}><SocialListeningSkeleton /></StandardShell>
  // /best-time now redirects to /analytics/best-time (legacy standalone page removed;
  // superseded by the Analytics "Best Time to Post" Smart Pick tab).
  if (p.startsWith('/best-time')) return <StandardShell pathname={p} chrome={chrome}><AnalyticsSkeleton /></StandardShell>
  if (p.startsWith('/test-fixtures')) return <StandardShell pathname={p} chrome={chrome}><TestFixturesSkeleton /></StandardShell>
  if (p.startsWith('/encryption-health')) return <StandardShell pathname={p} chrome={chrome}><EncryptionHealthSkeleton /></StandardShell>

  // Default: home dashboard (`/`).
  return <StandardShell pathname={p} chrome={chrome}><DashboardSkeleton /></StandardShell>
}

function AppShellSkeletonImpl({ pathname, chrome }: { pathname?: string; chrome?: ShellChrome }) {
  const path =
    pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  // On the client, derive the header chrome from the injected bootstrap so the
  // loading shell matches the SSR shell (which is passed `chrome` explicitly).
  const resolvedChrome =
    chrome ?? (typeof window !== 'undefined' ? (getBootstrapChrome() ?? undefined) : undefined)
  return (
    <div data-testid="app-shell-skeleton" className="contents">
      {resolveRouteSkeleton(path, resolvedChrome)}
    </div>
  )
}

export const AppShellSkeleton = React.memo(AppShellSkeletonImpl)
AppShellSkeleton.displayName = 'AppShellSkeleton'

export default AppShellSkeleton
