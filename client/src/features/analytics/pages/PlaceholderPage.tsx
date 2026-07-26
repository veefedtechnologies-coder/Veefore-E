/**
 * PlaceholderPage — generic foundation page for analytics destinations whose
 * data experience ships in a later phase.
 *
 * Renders the standard page scaffold (header + breadcrumb + workspace context)
 * with a "coming soon" body. Never fabricates analytics (CODING_RULES Rule 16).
 */

import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'

import { AnalyticsPageContainer } from '../components/AnalyticsPageContainer'
import { AnalyticsComingSoon, AnalyticsNoWorkspace } from '../components/AnalyticsStates'
import { useAnalyticsActiveRoute } from '../hooks/useAnalyticsActiveRoute'

export function PlaceholderPage() {
  const { item, breadcrumbs } = useAnalyticsActiveRoute()
  const { currentWorkspace, isLoading } = useCurrentWorkspace()

  const title = item?.label ?? 'Analytics'
  const description = item?.description

  return (
    <AnalyticsPageContainer
      title={title}
      description={description}
      breadcrumbs={breadcrumbs}
      workspaceName={currentWorkspace?.name}
    >
      {!isLoading && !currentWorkspace ? (
        <AnalyticsNoWorkspace />
      ) : (
        <AnalyticsComingSoon featureName={title} />
      )}
    </AnalyticsPageContainer>
  )
}
