/**
 * AnalyticsApp — the Analytics workspace entry point.
 *
 * Mounted once for the whole `/analytics/*` space (via a RegExp route in
 * AuthenticatedApp, which keeps wouter's location absolute so the primary app
 * sidebar keeps working). Resolves the current location to a page and renders
 * it inside the persistent {@link AnalyticsLayout} shell — so navigating between
 * analytics sections never remounts the sidebar (smooth client-side transitions,
 * 01-product-foundation.md Ch 5).
 *
 * Phase 1 (Product Foundation): Layout, Sidebar, Navigation, Workspace, Routing.
 */

import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import React from 'react'

import { AnalyticsLayout } from './components/AnalyticsLayout'
import { AnalyticsPageContainer } from './components/AnalyticsPageContainer'
import { AnalyticsEmptyState } from './components/AnalyticsStates'
import { useAnalyticsActiveRoute } from './hooks/useAnalyticsActiveRoute'
import { ANALYTICS_HOME_ITEM } from './config/navigation'
import { OverviewDashboard, DashboardPage, DashboardBuilderPage, DASHBOARD_CONFIG_BY_PATH } from './dashboards'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { BestTimePage } from './pages/BestTimePage'
import { MyReportsPage } from './pages/MyReportsPage'

/** Rendered for an unknown path under `/analytics`. */
function AnalyticsNotFound() {
  const { breadcrumbs } = useAnalyticsActiveRoute()
  const { currentWorkspace } = useCurrentWorkspace()
  return (
    <AnalyticsPageContainer
      title="Page not found"
      description="This analytics page does not exist."
      breadcrumbs={breadcrumbs}
      workspaceName={currentWorkspace?.name}
    >
      <AnalyticsEmptyState
        title="We couldn't find that page"
        message="The analytics page you're looking for doesn't exist or has moved. Use the navigation to find what you need."
      />
    </AnalyticsPageContainer>
  )
}

export function AnalyticsApp() {
  const { item } = useAnalyticsActiveRoute()

  // Scroll to top whenever the active analytics page changes.
  // Use a double-rAF to ensure the new page has fully rendered before scrolling.
  React.useEffect(() => {
    let raf1: number
    let raf2: number
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'instant' })
        // Also try scrolling the main content wrapper in case it's the scroll root
        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' })
        document.documentElement.scrollTop = 0
        document.body.scrollTop = 0
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [item?.id])

  let page: React.ReactNode
  if (item && item.id === ANALYTICS_HOME_ITEM.id) {
    page = <OverviewDashboard />
  } else if (item && item.id === 'builder') {
    page = <DashboardBuilderPage />
  } else if (item && item.id === 'best-time') {
    page = <BestTimePage />
  } else if (item && item.id === 'reports') {
    page = <MyReportsPage />
  } else if (item && DASHBOARD_CONFIG_BY_PATH[item.path]) {
    page = <DashboardPage config={DASHBOARD_CONFIG_BY_PATH[item.path]} />
  } else if (item) {
    page = <PlaceholderPage />
  } else {
    page = <AnalyticsNotFound />
  }

  return <AnalyticsLayout>{page}</AnalyticsLayout>
}

export default AnalyticsApp
